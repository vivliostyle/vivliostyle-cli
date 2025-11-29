# References:
# - https://github.com/gotenberg/gotenberg/blob/main/build/Dockerfile
# - https://github.com/microsoft/playwright/blob/main/utils/docker/Dockerfile.noble

FROM debian:13-slim AS base
ARG BROWSER
RUN test $BROWSER

ARG DEBIAN_FRONTEND=noninteractive
ARG TZ=Asia/Tokyo
ARG USER_GID=1001
ARG USER_UID=1001

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
  && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* `npm config get cache`/_npx

# Install fonts
RUN set -x \
  && apt-get update -qq \
  && apt-get upgrade -yqq \
  # remove poor quality fonts
  && apt-get purge -y ttf-unifont fonts-ipafont-gothic fonts-wqy-zenhei \
  # install all Noto fonts
  && apt-get install -y fonts-noto \
  && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

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

# Install Puppeteer browsers (for amd64 build, use Puppeteer's installation script))
RUN set -x \
  && if [ "$(dpkg --print-architecture)" = "arm64" ]; then \
    echo "Skipping Puppeteer browser installation on arm64 architecture"; \
  else \
    apt-get update -qq \
    && apt-get upgrade -yqq \
    && mkdir -p /opt/puppeteer \
    && chown vivliostyle: /opt/puppeteer \
    && PUPPETEER_CACHE_DIR=/opt/puppeteer npx puppeteer browsers install --install-deps $BROWSER \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* `npm config get cache`/_npx; \
  fi

# Font aliases for Noto CJK fonts
COPY build/fonts.conf /etc/fonts/local.conf

RUN set -x \
  && mkdir -p /opt \
  && mkdir -p /data \
  && chown -R vivliostyle: /data \
  && chown -R vivliostyle: /opt

USER vivliostyle
WORKDIR /opt/vivliostyle-cli

# Build stage
FROM base AS builder
COPY package.json .npmrc pnpm-lock.yaml pnpm-workspace.yaml /opt/vivliostyle-cli/
RUN pnpm install
COPY . /opt/vivliostyle-cli
RUN pnpm build

# Runtime stage
FROM base AS runtime
ARG VS_CLI_VERSION
RUN test $VS_CLI_VERSION
COPY . /opt/vivliostyle-cli
RUN pnpm install --prod --ignore-scripts \
  && echo $VS_CLI_VERSION > .vs-cli-version
COPY --from=builder /opt/vivliostyle-cli/dist/ /opt/vivliostyle-cli/dist/

USER root
RUN ln -s /opt/vivliostyle-cli/dist/cli.js /usr/local/bin/vivliostyle \
  && ln -s /opt/vivliostyle-cli/dist/cli.js /usr/local/bin/vs \
  && ln -s /opt/vivliostyle-cli/node_modules/.bin/press-ready /usr/local/bin/press-ready \
  && ln -s /opt/vivliostyle-cli/node_modules/.bin/vfm /usr/local/bin/vfm

USER vivliostyle
WORKDIR /data
ENTRYPOINT [ "vivliostyle" ]
