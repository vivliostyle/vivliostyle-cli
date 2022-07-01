FROM ubuntu:focal AS base
ARG PLAYWRIGHT_VERSION
LABEL maintainer "spring_raining <harusamex.com@gmail.com>"

# Playwright's Dockerfile:
# https://github.com/microsoft/playwright/blob/main/utils/docker/Dockerfile.focal
# How to reduce size of Docker image for Playwright:
# https://github.com/microsoft/playwright/issues/10168
ARG DEBIAN_FRONTEND=noninteractive
ARG TZ=Asia/Tokyo
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN set -x \
  && apt-get update \
  && apt-get install -y curl wget \
  && curl -sL https://deb.nodesource.com/setup_16.x | bash - \
  && apt-get install -y nodejs \
  && apt-get install -y --no-install-recommends git openssh-client \
  && npm install -g yarn \
  && mkdir /ms-playwright \
  && npx playwright@${PLAYWRIGHT_VERSION} install --with-deps chromium \
  && chmod -R 777 /ms-playwright \
  # remove poor quality fonts
  && apt-get purge -y ttf-unifont fonts-ipafont-gothic fonts-wqy-zenhei \
  # install Microsoft TrueType core fonts
  && echo ttf-mscorefonts-installer msttcorefonts/accepted-mscorefonts-eula select true | debconf-set-selections \
  && apt-get install -y --no-install-recommends ttf-mscorefonts-installer \
  # install all Noto fonts
  && apt-get install -y fonts-noto \
  # font aliases for Noto CJK fonts
  && echo '<?xml version="1.0"?>\
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\
<fontconfig>\
  <alias><family>Source Han Serif</family><prefer><family>Noto Serif CJK JP</family></prefer></alias>\
  <alias><family>Hiragino Mincho ProN</family><prefer><family>Noto Serif CJK JP</family></prefer></alias>\
  <alias><family>Hiragino Mincho Pro</family><prefer><family>Noto Serif CJK JP</family></prefer></alias>\
  <alias><family>YuMincho</family><prefer><family>Noto Serif CJK JP</family></prefer></alias>\
  <alias><family>Yu Mincho</family><prefer><family>Noto Serif CJK JP</family></prefer></alias>\
  <alias><family>MS Mincho</family><prefer><family>Noto Serif CJK JP</family></prefer></alias>\
  <alias><family>MS PMincho</family><prefer><family>Noto Serif CJK JP</family></prefer></alias>\
  <alias><family>Source Han Sans</family><prefer><family>Noto Sans CJK JP</family></prefer></alias>\
  <alias><family>Hiragino Sans</family><prefer><family>Noto Sans CJK JP</family></prefer></alias>\
  <alias><family>Hiragino Kaku Gothic ProN</family><prefer><family>Noto Sans CJK JP</family></prefer></alias>\
  <alias><family>Hiragino Kaku Gothic Pro</family><prefer><family>Noto Sans CJK JP</family></prefer></alias>\
  <alias><family>YuGothic</family><prefer><family>Noto Sans CJK JP</family></prefer></alias>\
  <alias><family>Yu Gothic</family><prefer><family>Noto Sans CJK JP</family></prefer></alias>\
  <alias><family>Meiryo</family><prefer><family>Noto Sans CJK JP</family></prefer></alias>\
  <alias><family>MS Gothic</family><prefer><family>Noto Sans CJK JP</family></prefer></alias>\
  <alias><family>MS PGothic</family><prefer><family>Noto Sans CJK JP</family></prefer></alias>\
</fontconfig>' > /etc/fonts/local.conf \
  && apt-get install -y --no-install-recommends \
    # dependencies for press-ready
    ghostscript poppler-utils \
  # clean cache
  && rm -rf \
    /var/lib/apt/lists/* \
    `npm config get cache`/_npx
WORKDIR /opt/vivliostyle-cli

# Build stage
FROM base AS builder
COPY package.json yarn.lock /opt/vivliostyle-cli/
RUN yarn install --frozen-lockfile
COPY . /opt/vivliostyle-cli
RUN yarn build

# Runtime stage
FROM base AS runtime
ARG VS_CLI_VERSION
RUN test $VS_CLI_VERSION
COPY . /opt/vivliostyle-cli
RUN yarn install --frozen-lockfile --production \
  && echo $VS_CLI_VERSION > .vs-cli-version \
  && yarn link \
  && ln -s /opt/vivliostyle-cli/node_modules/.bin/press-ready /usr/local/bin/press-ready \
  && ln -s /opt/vivliostyle-cli/node_modules/.bin/vfm /usr/local/bin/vfm
COPY --from=builder /opt/vivliostyle-cli/dist/ /opt/vivliostyle-cli/dist/

WORKDIR /data
ENTRYPOINT [ "vivliostyle" ]
