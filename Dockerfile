ARG PLAYWRIGHT_TAG
FROM mcr.microsoft.com/playwright:$PLAYWRIGHT_TAG AS base
LABEL maintainer "spring_raining <harusamex.com@gmail.com>"

RUN set -x \
  && apt-get update \
  && apt-get install -y --no-install-recommends \
    # dependencies for press-ready
    ghostscript poppler-utils
RUN echo ttf-mscorefonts-installer msttcorefonts/accepted-mscorefonts-eula select true | debconf-set-selections \
  && apt-get install -y ttf-mscorefonts-installer fonts-ipafont-mincho fonts-ipaexfont \
  # lower priority for wqy-zenhei over IPA fonts
  && mv /etc/fonts/conf.d/64-wqy-zenhei.conf /etc/fonts/conf.d/68-wqy-zenhei.conf \
  && echo '<?xml version="1.0"?>\
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\
<fontconfig>\
  <alias><family>Hiragino Mincho ProN</family><prefer><family>IPAexMincho</family></prefer></alias>\
  <alias><family>Hiragino Mincho Pro</family><prefer><family>IPAexMincho</family></prefer></alias>\
  <alias><family>YuMincho</family><prefer><family>IPAexMincho</family></prefer></alias>\
  <alias><family>Yu Mincho</family><prefer><family>IPAexMincho</family></prefer></alias>\
  <alias><family>MS Mincho</family><prefer><family>IPAMincho</family></prefer></alias>\
  <alias><family>MS PMincho</family><prefer><family>IPAPMincho</family></prefer></alias>\
  <alias><family>Hiragino Sans</family><prefer><family>IPAexGothic</family></prefer></alias>\
  <alias><family>Hiragino Kaku Gothic ProN</family><prefer><family>IPAexGothic</family></prefer></alias>\
  <alias><family>Hiragino Kaku Gothic Pro</family><prefer><family>IPAexGothic</family></prefer></alias>\
  <alias><family>YuGothic</family><prefer><family>IPAexGothic</family></prefer></alias>\
  <alias><family>Yu Gothic</family><prefer><family>IPAexGothic</family></prefer></alias>\
  <alias><family>Meiryo</family><prefer><family>IPAexGothic</family></prefer></alias>\
  <alias><family>MS Gothic</family><prefer><family>IPAGothic</family></prefer></alias>\
  <alias><family>MS PGothic</family><prefer><family>IPAPGothic</family></prefer></alias>\
</fontconfig>' > /etc/fonts/local.conf
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
  && rm -rf \
    /var/lib/apt/lists/* \
    `npm config get cache`/_npx \
  && yarn link \
  && ln -s /opt/vivliostyle-cli/node_modules/.bin/press-ready /usr/local/bin/press-ready \
  && ln -s /opt/vivliostyle-cli/node_modules/.bin/vfm /usr/local/bin/vfm
COPY --from=builder /opt/vivliostyle-cli/dist/ /opt/vivliostyle-cli/dist/

WORKDIR /data
ENTRYPOINT [ "vivliostyle" ]
