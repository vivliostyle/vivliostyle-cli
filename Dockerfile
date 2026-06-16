# syntax=docker/dockerfile:1

# Inherit debian:13-slim's include/exclude configuration
FROM debian:13-slim AS dpkg-excludes
RUN sed 's/^\(path-\(include\|exclude\)\) /\1=/' /etc/dpkg/dpkg.cfg.d/docker > /tmp/debian-13-slim.conf

FROM debian:13 AS builder

# BuildKit automatic platform ARGs
ARG TARGETARCH

ARG DEBIAN_FRONTEND=noninteractive
ARG TZ=Asia/Tokyo
ARG USER_GID=1000
ARG USER_UID=1000

ARG BROWSER
RUN test -n "$BROWSER"
ARG VS_CLI_VERSION
RUN test -n "$VS_CLI_VERSION"

RUN apt-get update \
 && apt-get install --yes --no-install-recommends \
      # to download the NodeSource setup script
      ca-certificates \
      curl \
      # to let @puppeteer/browsers extract browser archives
      unzip \
      xz-utils \
      # to assemble the rootfs
      mmdebstrap \
      # to read browser DT_NEEDED entries in build/audit.ts
      binutils \
 && curl --fail --location https://deb.nodesource.com/setup_24.x --output /tmp/nodesource_setup.sh \
 && bash /tmp/nodesource_setup.sh \
 && apt-get install --yes --no-install-recommends \
      nodejs \
 && npm install --global pnpm

COPY <<'EOF' /tmp/scripts/package.json
{ "type": "module", "dependencies": { "npm-install-checks": "9.0.0" } }
EOF
COPY <<'EOF' /tmp/scripts/prune-foreign.js
import { readFileSync } from 'node:fs';
import { checkPlatform } from 'npm-install-checks';

try {
  const manifest = JSON.parse(readFileSync(process.argv[3], 'utf8'));
  checkPlatform(manifest, false, {
    os: 'linux',
    cpu: process.argv[2] === 'arm64' ? 'arm64' : 'x64',
    libc: 'glibc',
  });
  process.exit(1);
} catch (e) {
  process.exit(e?.code === 'EBADPLATFORM' ? 0 : 1);
}
EOF
RUN npm install --prefix /tmp/scripts

COPY . /tmp/vs-src

# Install Vivliostyle CLI
# 1. Static resources
RUN mkdir /tmp/vivliostyle-cli \
 && cd /tmp/vivliostyle-cli \
 && echo "${VS_CLI_VERSION}" > .vs-cli-version \
 && cp --archive /tmp/vs-src/package.json /tmp/vs-src/types .
# 2. Artifacts
RUN cp --archive /tmp/vs-src /tmp/vs-build \
 && cd /tmp/vs-build \
 && pnpm install \
 && pnpm build \
 && cp --archive dist /tmp/vivliostyle-cli/
# 3. Runtime dependencies pruned of foreign-platform packages
RUN cp --archive /tmp/vs-src /tmp/vs-deps \
 && cd /tmp/vs-deps \
 && pnpm install --prod --ignore-scripts \
 && find node_modules/.pnpm -name package.json -type f -exec node /tmp/scripts/prune-foreign.js "${TARGETARCH}" {} \; -printf '%h\n' > /tmp/prune-foreign.txt \
 && while IFS= read -r dir; do \
      if [ -d "${dir}" ]; then rm --recursive --force "${dir}" && echo "prune-foreign: removed ${dir}"; fi; \
    done < /tmp/prune-foreign.txt \
 && cp --archive node_modules /tmp/vivliostyle-cli/

# Download the browser and resolve its dependency-package list
RUN mkdir /tmp/puppeteer \
 && if [ "${TARGETARCH}" = "amd64" ]; then \
      /tmp/vivliostyle-cli/node_modules/.bin/browsers install "${BROWSER}" --path /tmp/puppeteer; \
    else \
      echo "Skipping Puppeteer browser installation on arm64 architecture"; \
    fi \
 && if [ "${BROWSER%%@*}" = chrome ]; then \
      # These components ship only with branded Chrome and are unneeded at least for Vivliostyle
      rm --recursive --force \
        # WidevineCdm (DRM)
        # see https://chromium.googlesource.com/chromium/src/+/149.0.7827.22/third_party/widevine/cdm/widevine.gni#57
        /tmp/puppeteer/chrome/linux-*/chrome-*/WidevineCdm \
        # MEIPreload (autoplay data)
        # see https://chromium.googlesource.com/chromium/src/+/149.0.7827.22/chrome/browser/component_updater/mei_preload_component_installer.cc#109
        /tmp/puppeteer/chrome/linux-*/chrome-*/MEIPreload \
        # PrivacySandboxAttestationsPreloaded (ad-privacy)
        # see https://chromium.googlesource.com/chromium/src/+/149.0.7827.22/chrome/browser/component_updater/privacy_sandbox_attestations_component_installer.cc#38
        /tmp/puppeteer/chrome/linux-*/chrome-*/PrivacySandboxAttestationsPreloaded \
      # UI translation files are separable, as Alpine's packaging shows.
      # see https://gitlab.alpinelinux.org/alpine/aports/-/blob/v3.23.4/community/chromium/APKBUILD#L983-984
     && { find /tmp/puppeteer/chrome/linux-*/chrome-*/locales -name '*.pak' ! -name 'en-US*.pak' -delete || true; }; \
    fi

COPY --from=dpkg-excludes /tmp/debian-13-slim.conf /tmp/debian-13-slim.conf

# Assemble the rootfs with mmdebstrap
# BuildKit can only grant the needed privilege at the coarse granularity of
# `--allow-insecure-entitlement security.insecure`; the minimal equivalent in
# `docker run` terms is `--cap-add=SYS_ADMIN --security-opt apparmor=unconfined`.
# mmdebstrap bind-mounts /proc, /sys and /dev into the chroot for the package
# maintainer scripts. Those mounts need CAP_SYS_ADMIN, and docker's default
# AppArmor profile (docker-default) also blocks mounting sysfs and devpts.
RUN --security=insecure \
    ESSENTIAL="$(sed -e '/^[[:space:]]*#/d' -e '/^[[:space:]]*$/d' /tmp/vs-src/build/essential-packages.txt)" \
 && PURGE="$(sed -e '/^[[:space:]]*#/d' -e '/^[[:space:]]*$/d' /tmp/vs-src/build/purge-packages.txt | tr '\n' ' ')" \
 && PURGE_LATE="$(sed -e '/^[[:space:]]*#/d' -e '/^[[:space:]]*$/d' /tmp/vs-src/build/purge-packages-late.txt | tr '\n' ' ')" \
 && mmdebstrap \
      --format=dir \
      --variant=custom \
      --dpkgopt=/tmp/debian-13-slim.conf \
      # NodeSource ships headers for native module compilation
      --dpkgopt='path-exclude=/usr/include/*' \
      # adduser's postinst expects /run/adduser as its lockfile location
      --setup-hook='mkdir "$1/run"' \
      # Set up the NodeSource apt repo
      # see https://github.com/nodesource/distributions/blob/c6e581b0d24e5d043476ddb947d70e6fe10e83c9/scripts/deb/setup_24.x
      --setup-hook=' \
        mkdir --parents "$1/usr/share/keyrings" "$1/etc/apt/sources.list.d" "$1/etc/apt/preferences.d" \
     && cp /usr/share/keyrings/nodesource.gpg "$1/usr/share/keyrings/" \
     && cp /etc/apt/sources.list.d/nodesource.sources "$1/etc/apt/sources.list.d/" \
     && cp /etc/apt/preferences.d/nodejs "$1/etc/apt/preferences.d/"' \
      --include="$ESSENTIAL \
        # groupadd/useradd for the user-creation hook below.
        passwd \
        # recovery point for derived images
        apt \
        # ---
        nodejs \
        # The dist_package_versions.json that Puppeteer references for the system
        # packages Chrome depends on was last updated on 2024-07-08
        # (b0ddd10a3084cbcae30f677e029f4ebeef5db702) and only lists up to Debian 12,
        # so it does not look well maintained. For Firefox it points at a Mozilla
        # page, but that does not pin down the concrete Debian package names.
        # see https://github.com/puppeteer/puppeteer/blob/puppeteer-v25.1.0/docs/guides/system-requirements.md
        # Puppeteer's `--install-deps` is a feature specific to the `deb.deps` file
        # bundled with Chrome for Testing; Puppeteer does not manage the dependency
        # packages itself.
        # see https://github.com/puppeteer/puppeteer/blob/browsers-v3.0.4/packages/browsers/src/install.ts#L306-L345
        $(curl --fail --location https://raw.githubusercontent.com/microsoft/playwright/v1.60.0/packages/playwright-core/src/server/registry/nativeDeps.ts --output /tmp/nativeDeps.ts \
          && node --input-type=module --eval 'const{deps}=await import("/tmp/nativeDeps.ts");const e=deps["debian13-x64"];console.log([...new Set([...e.chromium, ...e.firefox])].join(" "))') \
        # Chrome for Testing has no linux-arm64 build, so arm64 also needs the chromium package
        $([ "${TARGETARCH}" = arm64 ] && echo chromium) \
        # press-ready requirements
        ghostscript \
        poppler-utils \
        # @puppeteer/browsers requirements
        unzip \
        xz-utils \
        # TODO: should such a large font set be bundled into the image?
        # see https://github.com/vivliostyle/vivliostyle-cli/blob/v11.0.2/Dockerfile#L42-L43
        $(apt-cache show fonts-noto | sed -nE 's/^(Depends|Recommends): //p')" \
      --customize-hook='mkdir --parents "$1/opt" "$1/data" "$1/usr/lib/node_modules" "$1/usr/local/bin" "$1/etc/fonts"' \
      --customize-hook=" \
        chroot \"\$1\" groupadd --gid ${USER_GID} vivliostyle \
     && chroot \"\$1\" useradd --uid ${USER_UID} --gid vivliostyle --home /home/vivliostyle --no-create-home vivliostyle \
     && mkdir \"\$1/home/vivliostyle\"" \
      --customize-hook='copy-in /tmp/vivliostyle-cli /opt/' \
      --customize-hook='copy-in /usr/lib/node_modules/pnpm /usr/lib/node_modules/' \
      # Rename fonts.conf -> local.conf during the copy. copy-in can't do this:
      # it takes the source basename and treats the second arg as a directory.
      --customize-hook='cp /tmp/vs-src/build/fonts.conf "$1/etc/fonts/local.conf"' \
      --customize-hook='ln --symbolic --force /opt/vivliostyle-cli/dist/cli.js "$1/usr/local/bin/vivliostyle"' \
      --customize-hook='ln --symbolic --force /opt/vivliostyle-cli/dist/cli.js "$1/usr/local/bin/vs"' \
      # 'npm install -g' leaves these .cjs files at 644. Normally an npm-generated
      # wrapper supplies the +x; we ship the raw files, so set the bit ourselves.
      --customize-hook='chmod +x "$1/usr/lib/node_modules/pnpm/bin/pnpm.cjs" "$1/usr/lib/node_modules/pnpm/bin/pnpx.cjs"' \
      --customize-hook='ln --symbolic --force /usr/lib/node_modules/pnpm/bin/pnpm.cjs "$1/usr/bin/pnpm"' \
      --customize-hook='ln --symbolic --force /usr/lib/node_modules/pnpm/bin/pnpx.cjs "$1/usr/bin/pnpx"' \
      --customize-hook="chown --recursive ${USER_UID}:${USER_GID} \"\$1/data\" \"\$1/opt/vivliostyle-cli\" \"\$1/home/vivliostyle\"" \
      --customize-hook='copy-in /tmp/puppeteer /opt/' \
      --customize-hook="chown --recursive ${USER_UID}:${USER_GID} \"\$1/opt/puppeteer\"" \
      # ---- install-time-only package purge ---------------------------------
      # The audit hook fails the build unless every purgable package is
      # classified in build/{keep,purge,purge-packages-late}-packages.txt, where
      # the per-package rationale lives. The purge then runs in two passes: the
      # second holds back tools (debconf/perl-base/mawk, libpython3*) that the
      # first pass's postrm scripts still call.
      --customize-hook='node /tmp/vs-src/build/audit.ts "$1"' \
      --customize-hook="chroot \"\$1\" dpkg --purge --force-depends --force-remove-essential --force-remove-protected $PURGE" \
      --customize-hook="chroot \"\$1\" dpkg --purge --force-depends --force-remove-essential --force-remove-protected $PURGE_LATE" \
      trixie /rootfs

FROM scratch
COPY --from=builder /rootfs/ /
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8
ENV PATH=/opt/vivliostyle-cli/node_modules/.bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
USER vivliostyle
WORKDIR /data
ENTRYPOINT [ "vivliostyle" ]
