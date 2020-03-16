FROM node:12.13.0

WORKDIR /usr/src/app

# Copy both package.json and package-lock.json
COPY package*.json ./

RUN yarn install

# Bundle app source
COPY . .

EXPOSE 3007
ENTRYPOINT [ "yarn", "start" ]