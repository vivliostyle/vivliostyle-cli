FROM node:16-slim AS base
LABEL maintainer "spring_raining <harusamex.com@gmail.com>"

RUN set -x \
  && apt-get update \
  && apt-get install -y wget gnupg \
  && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
  && sh -c 'echo "deb http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
  && apt-get update \
  && apt-get install -y --no-install-recommends \
    # dependencies for puppeteer
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
    # dependencies for press-ready
    ghostscript poppler-utils
WORKDIR /opt/vivliostyle-cli

# Build stage
FROM base AS builder
ARG VS_CLI_VERSION
RUN test $VS_CLI_VERSION

COPY package.json yarn.lock /opt/vivliostyle-cli/
RUN yarn install --frozen-lockfile
COPY . /opt/vivliostyle-cli
RUN yarn build \
  && echo $VS_CLI_VERSION > .vs-cli-version

# Runtime stage
FROM base AS runtime
COPY --from=builder \
  /opt/vivliostyle-cli/package.json \
  /opt/vivliostyle-cli/yarn.lock \
  /opt/vivliostyle-cli/.vs-cli-version \
  /opt/vivliostyle-cli/
COPY --from=builder \
  /opt/vivliostyle-cli/dist/ \
  /opt/vivliostyle-cli/dist/
COPY --from=builder \
  /opt/vivliostyle-cli/scripts/ \
  /opt/vivliostyle-cli/scripts/
RUN yarn install --frozen-lockfile --production \
  && npx zx scripts/installBrowserForDocker.mjs \
  && rm -rf \
    /var/lib/apt/lists/* \
    `npm config get cache`/_npx \
  && yarn link \
  && ln -s /opt/vivliostyle-cli/node_modules/.bin/press-ready /usr/local/bin/press-ready \
  && ln -s /opt/vivliostyle-cli/node_modules/.bin/vfm /usr/local/bin/vfm
RUN usermod -a -G audio,video node \
  && mkdir -p /home/node/Downloads \
  && chown -R node:node /home/node

USER node
WORKDIR /data
ENTRYPOINT [ "vivliostyle" ]
