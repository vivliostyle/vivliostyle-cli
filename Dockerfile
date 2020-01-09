FROM node:12-slim
LABEL maintainer "Vivliostyle Foundation <mail@vivliostyle.org>"

RUN set -x \
  && apt-get update \
  && apt-get install -y --no-install-recommends \
  libasound2-dev libgtk-3-0 libnss3-dev libx11-xcb-dev libxss-dev libxtst-dev \
  ghostscript poppler-utils

WORKDIR /opt/vivliostyle-cli
COPY package.json yarn.lock /opt/vivliostyle-cli/
RUN yarn install
COPY . /opt/vivliostyle-cli
RUN yarn build && yarn link

ENTRYPOINT [ "vivliostyle" ]
