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

ADD . /opt/viola-savepdf
WORKDIR /opt/viola-savepdf

RUN groupadd -r viola \
    && useradd -s /bin/bash -r -m -g viola -G audio,video viola \
    && mkdir -p /home/viola/Downloads \
    && chown -R viola:viola /home/viola \
    && chown -R viola:viola /opt/viola-savepdf

USER viola
RUN set -x \
    && yarn install

ENTRYPOINT [ "./bin/savepdf" ]
CMD []
