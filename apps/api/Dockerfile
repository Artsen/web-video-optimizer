FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/video-core/package.json packages/video-core/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

RUN npm ci

COPY packages/contracts packages/contracts
COPY packages/video-core packages/video-core
COPY apps/api apps/api

RUN npm run build:packages

WORKDIR /app/apps/api

EXPOSE 4000

CMD ["npm", "run", "dev"]
