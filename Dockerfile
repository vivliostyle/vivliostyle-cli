FROM node:10-slim
LABEL maintainer "spring-raining <harusamex.com@gmail.com>"

# Revision number is referenced from puppeteer
# https://github.com/GoogleChrome/puppeteer/releases
ARG chromium_revision=564778

RUN set -x \
  && apt-get update \
  && apt-get install -y --no-install-recommends \
  libasound2-dev libgtk-3-0 libnss3-dev libx11-xcb-dev libxss-dev libxtst-dev \
  wget unzip \
  && cd /opt \
  && wget -q https://storage.googleapis.com/chromium-browser-snapshots/Linux_x64/${chromium_revision}/chrome-linux.zip \
  && unzip -q chrome-linux.zip \
  && chmod -R +rx chrome-linux \
  && ln -s /opt/chrome-linux/chrome /usr/local/bin/chromium-browser \
  && ln -s /opt/chrome-linux/chrome /usr/local/bin/chromium \
  && rm -rf /opt/chrome-linux.zip /var/lib/apt/lists/ /src/*.deb

ADD . /opt/vivliostyle-cli
WORKDIR /opt/vivliostyle-cli

RUN groupadd -r vivliostyle \
  && useradd -s /bin/bash -r -m -g vivliostyle -G audio,video vivliostyle \
  && mkdir -p /home/vivliostyle/Downloads \
  && chown -R vivliostyle:vivliostyle /home/vivliostyle \
  && chown -R vivliostyle:vivliostyle /opt/vivliostyle-cli

USER vivliostyle
RUN set -x \
  && yarn install \
  && yarn build

ENTRYPOINT [ "./dist/cli.js" ]
CMD []
