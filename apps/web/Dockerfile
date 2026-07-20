FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/video-core/package.json packages/video-core/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json

RUN npm ci

COPY packages/contracts packages/contracts
COPY packages/video-core packages/video-core
COPY apps/web apps/web

RUN npm run build:packages

WORKDIR /app/apps/web

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
