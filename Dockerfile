FROM node:12.3-alpine
RUN apk update && apk upgrade && mkdir /opt/project
WORKDIR /opt/project
COPY package.json package.json
RUN npm install
COPY src src
COPY tsconfig.json tsconfig.json
COPY tslint.json tslint.json
COPY index.js index.js

ENTRYPOINT ["node", "--max-http-header-size  80000", "index"]


