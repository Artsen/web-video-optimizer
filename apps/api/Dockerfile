FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

RUN npm install --workspace @local-video-optimizer/api

COPY apps/api apps/api

WORKDIR /app/apps/api

EXPOSE 4000

CMD ["npm", "run", "dev"]
