# syntax=docker/dockerfile:1.7
FROM node:25-alpine
WORKDIR /auth
COPY package*.json ./
COPY api/package*.json ./api/
COPY core/package*.json ./core/
COPY db/package*.json ./db/
COPY core/src ./core/src
COPY db/src ./db/src
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm install
RUN npm link
RUN npm link @olegpolyakov/auth --workspace=api
COPY . .
CMD ["npm", "run", "start", "--workspace", "api"]