FROM node:25-alpine

WORKDIR /code

COPY .npmrc package*.json ./

RUN --mount=type=secret,id=GHP_TOKEN,env=GHP_TOKEN \
    npm config set //npm.pkg.github.com/:_authToken=$GHP_TOKEN && \
    npm ci --include=dev

COPY . .

EXPOSE $PORT

CMD ["npm", "start"]