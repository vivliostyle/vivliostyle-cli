# syntax=docker/dockerfile:1
# Oracle: apply a candidate purge set to the cached pre-purge base image, then
# ship the result as a scratch image with the same config as the production final
# stage, so image-contract.sh judges exactly this purge.
#
# Maintainer scripts are deleted first and dpkg --purge --force-all is the LAST
# command, so a candidate set may remove its own tooling (coreutils, dpkg, ...)
# without breaking this RUN; whether the resulting image still works is then
# decided by the contract, not here. The production build purges the accepted list
# the same way, so this is faithful.
ARG BASE
FROM ${BASE} AS purged
USER root
COPY purgeset.txt /purgeset.txt
RUN PURGE="$(grep -vE '^[[:space:]]*#|^[[:space:]]*$' /purgeset.txt | tr '\n' ' ')" \
 && find /var/lib/dpkg/info \
      \( -name '*.prerm' -o -name '*.postrm' -o -name '*.preinst' -o -name '*.postinst' \) \
      -delete \
 && rm -f /purgeset.txt \
 && dpkg --purge --force-all $PURGE >/dev/null 2>&1 || true

FROM scratch
COPY --from=purged / /
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8
ENV PATH=/opt/vivliostyle-cli/node_modules/.bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
USER vivliostyle
WORKDIR /data
ENTRYPOINT [ "vivliostyle" ]
