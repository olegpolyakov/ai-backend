FROM node:24-slim

WORKDIR /code

COPY .npmrc package*.json ./

RUN --mount=type=secret,id=GHP_TOKEN,env=GHP_TOKEN \
    --mount=type=cache,target=/root/.npm \
    npm config set //npm.pkg.github.com/:_authToken=$GHP_TOKEN && \
    npm ci --include=dev --prefer-offline --no-audit --no-fund

COPY . .

EXPOSE $PORT

CMD ["npm", "start"]