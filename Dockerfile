# syntax=docker/dockerfile:1

# References:
# - https://github.com/gotenberg/gotenberg/blob/main/build/Dockerfile
# - https://github.com/microsoft/playwright/blob/main/utils/docker/Dockerfile.noble

FROM debian:13-slim AS builder

ARG DEBIAN_FRONTEND=noninteractive
ARG TZ=Asia/Tokyo
ARG USER_GID=1000
ARG USER_UID=1000

RUN set -x \
  && apt-get update -qq \
  && apt-get upgrade -yqq \
  && apt-get install -y -qq --no-install-recommends \
    ca-certificates curl \
    # to assemble the rootfs
    mmdebstrap \
    # for Puppeteer Firefox installation
    xz-utils \
    # for @puppeteer/browsers v3+ Chrome zip extraction
    unzip \
    # to strip the NodeSource node binary
    binutils \
  && curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
  && apt-get install -y nodejs \
  && node -v \
  && npm -v \
  && npm install -g pnpm \
  # an unreferenced duplicate of dist/
  && rm -rf /usr/lib/node_modules/pnpm/artifacts \
  && rm -rf /usr/lib/node_modules/pnpm/dist/node_modules/@reflink/reflink-darwin-* \
    /usr/lib/node_modules/pnpm/dist/node_modules/@reflink/reflink-win32-* \
  && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

ARG BROWSER
RUN test $BROWSER
ARG VS_CLI_VERSION
RUN test $VS_CLI_VERSION
COPY . /tmp/vs-src
RUN cp --archive /tmp/vs-src /tmp/vs-build \
  && cd /tmp/vs-build \
  && pnpm install && pnpm build \
  && cp --archive /tmp/vs-src /tmp/vs-deps \
  && cd /tmp/vs-deps \
  && pnpm install --prod --ignore-scripts \
  && mkdir /opt/vivliostyle-cli \
  && cd /opt/vivliostyle-cli \
  && cp --archive /tmp/vs-src/package.json /tmp/vs-build/dist /tmp/vs-deps/node_modules . \
  # Keep only runtime JavaScript and license terms
  && find dist node_modules -type f \
    \( -name '*.map' -o -name '*.ts' -o -name '*.d.mts' -o -name '*.d.cts' \
    -o -name '*.tsbuildinfo' \
    # served in place of the sibling file (Content-Encoding: br)
    -o -name '*.br' \
    # Flow type annotations
    -o -name '*.flow' \
    -o \( \( -name '*.md' -o -name '*.markdown' \) ! -iname 'licen[cs]e*' \) \) \
    -delete \
  && find node_modules -type d \( -name 'test' -o -name 'tests' -o -name '__tests__' \) \
    -prune -exec rm -rf {} + \
  # nothing loads the protocol JSON at run time
  && rm -rf node_modules/.pnpm/devtools-protocol@*/node_modules/devtools-protocol/json \
  && echo $VS_CLI_VERSION > .vs-cli-version

# Install Puppeteer browsers (for amd64 build, use the @puppeteer/browsers locked by Vivliostyle CLI)
RUN set -x \
  && mkdir /opt/puppeteer \
  && if [ "$(dpkg --print-architecture)" = "arm64" ]; then \
    echo "Skipping Puppeteer browser installation on arm64 architecture"; \
  else \
    /opt/vivliostyle-cli/node_modules/.bin/browsers install "$BROWSER" \
      --path /opt/puppeteer \
    && if [ "${BROWSER%%@*}" = chrome ]; then \
      # These components ship only with branded Chrome and are unneeded at least for Vivliostyle
      rm --recursive \
        # WidevineCdm (DRM)
        # see https://chromium.googlesource.com/chromium/src/+/150.0.7871.24/third_party/widevine/cdm/widevine.gni#55
        /opt/puppeteer/chrome/linux-*/chrome-*/WidevineCdm \
        # MEIPreload (autoplay data)
        # see https://chromium.googlesource.com/chromium/src/+/150.0.7871.24/chrome/browser/component_updater/mei_preload_component_installer.cc#109
        /opt/puppeteer/chrome/linux-*/chrome-*/MEIPreload \
        # PrivacySandboxAttestationsPreloaded (ad-privacy)
        # see https://chromium.googlesource.com/chromium/src/+/150.0.7871.24/chrome/browser/component_updater/privacy_sandbox_attestations_component_installer.cc#38
        /opt/puppeteer/chrome/linux-*/chrome-*/PrivacySandboxAttestationsPreloaded \
      # UI translation files are separable, as Alpine's packaging shows.
      # see https://gitlab.alpinelinux.org/alpine/aports/-/blob/v3.24.1/community/chromium/APKBUILD#L982-983
      && find /opt/puppeteer/chrome/linux-*/chrome-*/locales -name '*.pak' ! -name 'en-US*.pak' -delete; \
    fi; \
  fi

# Assemble the rootfs with mmdebstrap
# BuildKit can only grant the needed privilege at the coarse granularity of
# `--allow-insecure-entitlement security.insecure`; the minimal equivalent in
# `docker run` terms is `--cap-add=SYS_ADMIN --security-opt apparmor=unconfined`.
# mmdebstrap bind-mounts /proc, /sys and /dev into the chroot for the package
# maintainer scripts. Those mounts need CAP_SYS_ADMIN, and docker's default
# AppArmor profile (docker-default) also blocks mounting sysfs and devpts.
ARG BUNDLE_NOTO=1
RUN --security=insecure \
  # mmdebstrap interprets dpkg rules with its own logic, which requires
  # normalizing them to the '=' form.
  # see https://gitlab.mister-muffin.de/josch/mmdebstrap/src/tag/1.5.7/mmdebstrap#L3625
  cat /etc/dpkg/dpkg.cfg \
    $(ls /etc/dpkg/dpkg.cfg.d | grep -E '^[0-9a-zA-Z_-]+$' | sort | sed 's,^,/etc/dpkg/dpkg.cfg.d/,') \
    | sed -nE 's/^[[:space:]]*(path-(include|exclude))[[:space:]]*=?[[:space:]]*(.+)$/\1=\3/p' \
    > /tmp/debian-13-slim.conf \
  && mmdebstrap \
    --format=dir \
    --variant=custom \
    --dpkgopt=/tmp/debian-13-slim.conf \
    # adduser's postinst expects /run/adduser as its lockfile location
    --setup-hook='mkdir "$1/run"' \
    # Set up the NodeSource apt repo
    # see https://github.com/nodesource/distributions/blob/c6e581b0d24e5d043476ddb947d70e6fe10e83c9/scripts/deb/setup_24.x
    --setup-hook=' \
      mkdir --parents "$1/usr/share/keyrings" "$1/etc/apt/sources.list.d" "$1/etc/apt/preferences.d" \
        && cp /usr/share/keyrings/nodesource.gpg "$1/usr/share/keyrings/" \
        && cp /etc/apt/sources.list.d/nodesource.sources "$1/etc/apt/sources.list.d/" \
        && cp /etc/apt/preferences.d/nodejs "$1/etc/apt/preferences.d/"' \
    --include=" \
      # With mmdebstrap --variant=custom the rootfs starts empty, so anything a
      # maintainer script expects in PATH must be listed explicitly. Debian policy
      # allows essential packages to be used without being declared as dependencies,
      # so they cannot be derived automatically. To re-create this list, empty it
      # once and use the build errors as clues to discover the required packages.
      # see https://salsa.debian.org/dbnpolicy/policy/-/blob/debian/4.7.4.1/policy/ch-binary.rst#L330-337
      #
      #   $ docker run --rm --env DEBIAN_FRONTEND=noninteractive debian:13-slim \
      #       sh -c 'apt-get --quiet=2 update >/dev/null \
      #                && apt-get --quiet=2 install apt-file >/dev/null \
      #                && apt-file --option quiet=2 update >/dev/null \
      #                && apt-file search <path>'
      #
      coreutils \
      dash \
      diffutils \
      findutils \
      grep \
      init-system-helpers \
      libc-bin \
      perl-base \
      sed \
      # ---
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
      #
      #   $(curl --fail --location https://raw.githubusercontent.com/microsoft/playwright/v1.61.1/packages/playwright-core/src/server/registry/nativeDeps.ts --output /tmp/nativeDeps.ts \
      #     && node --input-type=module --eval 'const{deps:{"debian13-x64":{chromium,firefox}}}=await import("/tmp/nativeDeps.ts");console.log([...new Set([...chromium, ...firefox])].sort().join("\n"))') \
      #
      libasound2 \
      libasound2t64 \
      libatk-bridge2.0-0t64 \
      libatk1.0-0t64 \
      libatspi2.0-0t64 \
      libavcodec61 \
      libcairo-gobject2 \
      libcairo2 \
      libcups2t64 \
      libdbus-1-3 \
      libdbus-glib-1-2 \
      libdrm2 \
      libfontconfig1 \
      libfreetype6 \
      libgbm1 \
      libgdk-pixbuf-2.0-0 \
      libglib2.0-0t64 \
      libgtk-3-0t64 \
      libharfbuzz0b \
      libnspr4 \
      libnss3 \
      libpango-1.0-0 \
      libpangocairo-1.0-0 \
      libx11-6 \
      libx11-xcb1 \
      libxcb-shm0 \
      libxcb1 \
      libxcomposite1 \
      libxcursor1 \
      libxdamage1 \
      libxext6 \
      libxfixes3 \
      libxi6 \
      libxkbcommon0 \
      libxrandr2 \
      libxrender1 \
      libxtst6 \
      # Chrome for Testing has no linux-arm64 build, so arm64 also needs the chromium package
      $([ "$(dpkg --print-architecture)" = arm64 ] && echo chromium) \
      # press-ready requirements
      ghostscript \
      poppler-utils \
      # @puppeteer/browsers requirements
      unzip \
      xz-utils \
      $([ "$BUNDLE_NOTO" = 1 ] && echo fonts-noto fonts-noto-cjk fonts-noto-cjk-extra fonts-noto-color-emoji fonts-noto-core fonts-noto-extra fonts-noto-mono fonts-noto-ui-core fonts-noto-ui-extra fonts-noto-unhinted)" \
    # Local removals in dpkg's view; a derived image restores them by
    # reinstalling the owning package.
    --customize-hook='rm --recursive \
      # glibc's legacy-charset converters
      "$1"/usr/lib/*/gconv/* \
      # NodeSource ships headers for native module compilation
      "$1"/usr/include/* \
      # corepack downloads package managers at run time; pnpm is installed directly
      "$1"/usr/bin/corepack \
      "$1"/usr/lib/node_modules/corepack \
      # npm ships its docs and man pages outside /usr/share
      "$1"/usr/lib/node_modules/npm/docs/* \
      "$1"/usr/lib/node_modules/npm/man/* \
      # node-gyp needs python and a compiler, neither of which is installed
      "$1"/usr/lib/node_modules/npm/node_modules/node-gyp' \
    # NodeSource ships node unstripped
    --customize-hook='strip --strip-all "$1/usr/bin/node"' \
    --customize-hook='mkdir --parents "$1/opt" "$1/data" "$1/usr/lib/node_modules" "$1/usr/local/bin" "$1/usr/share/fonts/opentype/adobe-notdef" "$1/usr/share/doc/adobe-notdef"' \
    --customize-hook=" \
      chroot \"\$1\" groupadd --gid ${USER_GID} vivliostyle \
        && chroot \"\$1\" useradd --uid ${USER_UID} --gid vivliostyle --home /home/vivliostyle --no-create-home vivliostyle \
        && mkdir \"\$1/home/vivliostyle\"" \
    --customize-hook='copy-in /opt/vivliostyle-cli /opt/' \
    --customize-hook='copy-in /usr/lib/node_modules/pnpm /usr/lib/node_modules/' \
    # Tofu fallback (#832)
    # https://github.com/adobe-fonts/adobe-notdef/releases/tag/1.001
    --customize-hook='copy-in /tmp/vs-src/build/adobe-notdef/AND-Regular.otf /usr/share/fonts/opentype/adobe-notdef' \
    --customize-hook='copy-in /tmp/vs-src/build/adobe-notdef/LICENSE.md /usr/share/doc/adobe-notdef' \
    --customize-hook='ln --symbolic --force /opt/vivliostyle-cli/dist/cli.js "$1/usr/local/bin/vivliostyle"' \
    --customize-hook='ln --symbolic --force /opt/vivliostyle-cli/dist/cli.js "$1/usr/local/bin/vs"' \
    --customize-hook='ln --symbolic --force /usr/lib/node_modules/pnpm/bin/pnpm.mjs "$1/usr/bin/pnpm"' \
    --customize-hook='ln --symbolic --force /usr/lib/node_modules/pnpm/bin/pnpx.mjs "$1/usr/bin/pnpx"' \
    --customize-hook="chown --recursive ${USER_UID}:${USER_GID} \"\$1/data\" \"\$1/opt/vivliostyle-cli\" \"\$1/home/vivliostyle\"" \
    --customize-hook='copy-in /opt/puppeteer /opt/' \
    --customize-hook="chown --recursive ${USER_UID}:${USER_GID} \"\$1/opt/puppeteer\"" \
    # Let arbitrary UIDs (e.g. `docker run --user`) write build-ids.json and
    # download browsers here. build-ids.json sits at the cache root; each
    # browser installs under its own dir (chrome/<buildId>/...).
    --customize-hook='find "$1/opt/puppeteer" -maxdepth 1 -type d -exec chmod 1777 {} +' \
    # Disable font hinting (#866)
    --customize-hook='cp "$1/usr/share/fontconfig/conf.avail/10-hinting-none.conf" /tmp/' \
    # PURGE = installed - (RUNTIME_DEPS + PURGE_TOOLS).
    # To re-derive them, empty both RUNTIME_DEPS and PURGE_TOOLS (the tools the
    # purged packages' maintainer scripts call) and rebuild, then feed the
    # failures back: a purge failure during the image build names a PURGE_TOOLS
    # entry, a docker-image.test.ts failure names a RUNTIME_DEPS entry. When a
    # use case triggers an error, add that usage to docker-image.test.ts so
    # later re-derivations do not regress it.
    --customize-hook=' \
      RUNTIME_DEPS=" \
        apt \
        base-files \
        ca-certificates \
        coreutils \
        dash \
        debian-archive-keyring \
        diffutils \
        dpkg \
        ghostscript \
        grep \
        libacl1 \
        libapt-pkg7.0 \
        libasound2t64 \
        libassuan9 \
        libatk-bridge2.0-0t64 \
        libatk1.0-0t64 \
        libatomic1 \
        libatspi2.0-0t64 \
        libattr1 \
        libavahi-client3 \
        libavahi-common3 \
        libblkid1 \
        libbrotli1 \
        libbz2-1.0 \
        libc-bin \
        libc6 \
        libcairo2 \
        libcap2 \
        libcom-err2 \
        libcrypt1 \
        libcups2t64 \
        libcurl3t64-gnutls \
        libdatrie1 \
        libdbus-1-3 \
        libdeflate0 \
        libdrm2 \
        libexpat1 \
        libffi8 \
        libfontconfig1 \
        libfreetype6 \
        libfribidi0 \
        libgbm1 \
        libgcc-s1 \
        libglib2.0-0t64 \
        libgmp10 \
        libgnutls30t64 \
        libgpg-error0 \
        libgpgme11t64 \
        libgpgmepp6t64 \
        libgraphite2-3 \
        libgs-common \
        libgs10 \
        libgs10-common \
        libgssapi-krb5-2 \
        libgtk-3-0t64 \
        libharfbuzz0b \
        libhogweed6t64 \
        libice6 \
        libidn12 \
        libidn2-0 \
        libijs-0.35 \
        libjbig0 \
        libjbig2dec0 \
        libjpeg62-turbo \
        libk5crypto3 \
        libkeyutils1 \
        libkrb5-3 \
        libkrb5support0 \
        liblcms2-2 \
        libldap2 \
        liblerc4 \
        liblz4-1 \
        liblzma5 \
        libmd0 \
        libmount1 \
        libnettle8t64 \
        libnghttp2-14 \
        libnghttp3-9 \
        libngtcp2-16 \
        libngtcp2-crypto-gnutls8 \
        libnspr4 \
        libnss3 \
        libopenjp2-7 \
        libp11-kit0 \
        libpango-1.0-0 \
        libpaper2 \
        libpcre2-8-0 \
        libpixman-1-0 \
        libpng16-16t64 \
        libpoppler147 \
        libpsl5t64 \
        librtmp1 \
        libsasl2-2 \
        libseccomp2 \
        libselinux1 \
        libsharpyuv0 \
        libsm6 \
        libsqlite3-0 \
        libssh2-1t64 \
        libssl3t64 \
        libstdc++6 \
        libsystemd0 \
        libtasn1-6 \
        libthai0 \
        libtiff6 \
        libudev1 \
        libunistring5 \
        libuuid1 \
        libwebp7 \
        libx11-6 \
        libxau6 \
        libxcb-render0 \
        libxcb-shm0 \
        libxcb1 \
        libxcomposite1 \
        libxdamage1 \
        libxdmcp6 \
        libxext6 \
        libxfixes3 \
        libxi6 \
        libxkbcommon0 \
        libxrandr2 \
        libxrender1 \
        libxt6t64 \
        libxxhash0 \
        libzstd1 \
        nodejs \
        poppler-utils \
        sed \
        sqv \
        tar \
        unzip \
        xz-utils \
        zlib1g \
        # arm64 ships the system chromium (no Chrome for Testing build); keep it
        # and the runtime libs it needs. Same arch gate as the install above, so
        # amd64 (which uses Chrome for Testing) keeps purging these.
        $([ "$(dpkg --print-architecture)" = arm64 ] && echo chromium chromium-common libasyncns0 libdav1d7 libdouble-conversion3 libflac14 libharfbuzz-subset0 libminizip1t64 libmp3lame0 libmpg123-0t64 libogg0 libopenh264-8 libopus0 libpulse0 libsndfile1 libvorbis0a libvorbisenc2 libxnvctrl0) \
        # firefox-only
        libcairo-gobject2 \
        libcloudproviders0 \
        libepoxy0 \
        libgdk-pixbuf-2.0-0 \
        libpangocairo-1.0-0 \
        libpangoft2-1.0-0 \
        libwayland-client0 \
        libwayland-cursor0 \
        libwayland-egl1 \
        libxcursor1 \
        # firefox needs libxinerama1 -> libx11-xcb1; libx11-xcb1 also becomes
        # required by chrome's X11 preview once libxinerama1 is present.
        libx11-xcb1 \
        libxinerama1 \
        # Noto fonts; a no-op when not installed
        fonts-noto \
        fonts-noto-cjk \
        fonts-noto-cjk-extra \
        fonts-noto-color-emoji \
        fonts-noto-core \
        fonts-noto-extra \
        fonts-noto-mono \
        fonts-noto-ui-core \
        fonts-noto-ui-extra \
        fonts-noto-unhinted \
      "; \
      PURGE_TOOLS=" \
        debconf \
        findutils \
        init-system-helpers \
        mawk \
        perl-base \
      "; \
      PURGE=$(chroot "$1" dpkg-query --show --showformat='\''${db:Status-Abbrev} ${Package}\n'\'' \
        | sed -n '\''s/^ii  *//p'\'' \
        | grep -vxF "$(printf '\''%s\n'\'' $RUNTIME_DEPS $PURGE_TOOLS)"); \
      [ -z "$PURGE" ] || chroot "$1" dpkg --purge --force-all $PURGE; \
      [ -z "$PURGE_TOOLS" ] || chroot "$1" dpkg --purge --force-all $PURGE_TOOLS; \
    ' \
    # fontconfig-config's postrm removes well-known conf.d names on purge,
    # so these run after the purge hook.
    --customize-hook='mkdir --parents "$1/etc/fonts/conf.d"' \
    --customize-hook='copy-in /tmp/10-hinting-none.conf /etc/fonts/conf.d' \
    --customize-hook='[ "$BUNDLE_NOTO" != 1 ] || cp /tmp/vs-src/build/fonts.conf "$1/etc/fonts/local.conf"' \
    trixie /rootfs

FROM scratch
COPY --from=builder /rootfs/ /
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8
ENV PATH=/opt/vivliostyle-cli/node_modules/.bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
USER vivliostyle
WORKDIR /data
ENTRYPOINT [ "vivliostyle" ]
