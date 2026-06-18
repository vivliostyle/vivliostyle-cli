# References:
# - https://github.com/gotenberg/gotenberg/blob/main/build/Dockerfile
# - https://github.com/microsoft/playwright/blob/main/utils/docker/Dockerfile.noble

FROM debian:13-slim AS base

ARG DEBIAN_FRONTEND=noninteractive
ARG TZ=Asia/Tokyo
ARG USER_GID=1000
ARG USER_UID=1000

ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8

RUN set -x \
  && groupadd --gid $USER_GID vivliostyle \
  && useradd --uid $USER_UID --gid vivliostyle --shell /bin/bash --home /home/vivliostyle --no-create-home vivliostyle \
  && mkdir -p /home/vivliostyle \
  && chown vivliostyle: /home/vivliostyle

RUN set -x \
  && apt-get update -qq \
  && apt-get upgrade -yqq \
  && apt-get install -y -qq --no-install-recommends \
    ca-certificates curl gnupg tini \
    # Feature-parity with node.js base images
    git openssh-client \
    # dependencies for press-ready
    ghostscript poppler-utils \
    # for Puppeteer Firefox installation
    xz-utils \
    # for @puppeteer/browsers v3+ Chrome zip extraction
    unzip \
    # Small image size is paramount for a container, so the set of bundled fonts is
    # limited. Implicit fallback from generic font specifications should fail
    # "loudly", via a bitmap font that is inadequate for print. See #832.
    fonts-unifont \
  && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* `npm config get cache`/_npx \
  && rm /usr/share/fonts/opentype/unifont/unifont_sample.otf \
        /usr/share/fonts/opentype/unifont/unifont_jp_sample.otf \
        /usr/share/fonts/opentype/unifont/unifont_upper_sample.otf

# Install Node.js
RUN set -x \
  && apt-get update -qq \
  && apt-get upgrade -yqq \
  && curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
  && apt-get install -y nodejs \
  && node -v \
  && npm -v \
  && npm install -g pnpm \
  && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Install Chromium (for arm64 build, use the official Debian package)
RUN set -x \
  && if [ "$(dpkg --print-architecture)" = "amd64" ]; then \
    echo "Skipping Chromium installation on amd64 architecture"; \
  else \
    apt-get update -qq \
    && apt-get upgrade -yqq \
    && apt-get install -y -qq --no-install-recommends chromium \
    && chromium --version \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*; \
  fi

RUN set -x \
  && mkdir -p /opt \
  && mkdir -p /data \
  && chown -R vivliostyle: /data \
  && chown -R vivliostyle: /opt

USER vivliostyle
WORKDIR /opt/vivliostyle-cli

# Build stage
FROM base AS builder
COPY --chown=vivliostyle:vivliostyle . /opt/vivliostyle-cli
RUN pnpm install && pnpm build

# Runtime stage
FROM base AS runtime
ARG BROWSER
RUN test $BROWSER
ARG VS_CLI_VERSION
RUN test $VS_CLI_VERSION
COPY --chown=vivliostyle:vivliostyle . /opt/vivliostyle-cli
RUN pnpm install --prod --ignore-scripts \
  && echo $VS_CLI_VERSION > .vs-cli-version
COPY --from=builder --chown=vivliostyle:vivliostyle /opt/vivliostyle-cli/dist/ /opt/vivliostyle-cli/dist/
ENV PATH="/opt/vivliostyle-cli/node_modules/.bin:${PATH}"

# Install Puppeteer browsers (for amd64 build, use the @puppeteer/browsers locked by Vivliostyle CLI)
USER root
RUN set -x \
  && if [ "$(dpkg --print-architecture)" = "arm64" ]; then \
    echo "Skipping Puppeteer browser installation on arm64 architecture"; \
  else \
    apt-get update -qq \
    && apt-get upgrade -yqq \
    && mkdir -p /opt/puppeteer \
    && /opt/vivliostyle-cli/node_modules/.bin/browsers install "$BROWSER" \
      --path /opt/puppeteer --install-deps \
    && chown -R vivliostyle: /opt/puppeteer \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*; \
  fi

RUN ln -s /opt/vivliostyle-cli/dist/cli.js /usr/local/bin/vivliostyle \
  && ln -s /opt/vivliostyle-cli/dist/cli.js /usr/local/bin/vs

USER vivliostyle
WORKDIR /data
ENTRYPOINT [ "vivliostyle" ]
