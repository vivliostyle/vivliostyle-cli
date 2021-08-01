FROM node:16-slim
LABEL maintainer "spring_raining <harusamex.com@gmail.com>"

RUN set -x \
  && apt-get update \
  && apt-get install -y wget gnupg \
  && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
  && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
  && apt-get update \
  && apt-get install -y --no-install-recommends \
    # dependencies for puppeteergconf-service
    google-chrome-stable fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
    # dependencies for press-ready
    ghostscript poppler-utils \
  && rm -rf /var/lib/apt/lists/*

ARG VS_CLI_VERSION
RUN test $VS_CLI_VERSION

WORKDIR /opt/vivliostyle-cli
COPY package.json yarn.lock /opt/vivliostyle-cli/
RUN yarn install --frozen-lockfile
COPY . /opt/vivliostyle-cli
RUN yarn build \
  && yarn link \
  && ln -s /opt/vivliostyle-cli/node_modules/.bin/press-ready /usr/local/bin/press-ready \
  && ln -s /opt/vivliostyle-cli/node_modules/.bin/vfm /usr/local/bin/vfm \
  && echo $VS_CLI_VERSION > .vs-cli-version
RUN usermod -a -G audio,video node \
  && mkdir -p /home/node/Downloads \
  && chown -R node:node /home/node

USER node
ENTRYPOINT [ "vivliostyle" ]
