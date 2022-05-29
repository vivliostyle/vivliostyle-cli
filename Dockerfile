ARG PLAYWRIGHT_TAG
FROM mcr.microsoft.com/playwright:$PLAYWRIGHT_TAG AS base
LABEL maintainer "spring_raining <harusamex.com@gmail.com>"

RUN set -x \
  && apt-get update \
  && apt-get install -y --no-install-recommends \
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
RUN yarn install --frozen-lockfile --production \
  && rm -rf \
    /var/lib/apt/lists/* \
    `npm config get cache`/_npx \
  && yarn link \
  && ln -s /opt/vivliostyle-cli/node_modules/.bin/press-ready /usr/local/bin/press-ready \
  && ln -s /opt/vivliostyle-cli/node_modules/.bin/vfm /usr/local/bin/vfm

WORKDIR /data
ENTRYPOINT [ "vivliostyle" ]
