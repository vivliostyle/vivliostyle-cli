FROM node:16-slim
LABEL maintainer "spring_raining <harusamex.com@gmail.com>"

ENV VS_CLI_VERSION 3.5.2

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

WORKDIR /opt/vivliostyle-cli
COPY package.json yarn.lock /opt/vivliostyle-cli/
RUN yarn install --frozen-lockfile
COPY . /opt/vivliostyle-cli
RUN yarn build \
  && yarn link \
  && echo $VS_CLI_VERSION > .vs-cli-version
RUN usermod -a -G audio,video node \
  && mkdir -p /home/node/Downloads \
  && chown -R node:node /home/node

USER node
CMD [ "vivliostyle" ]
