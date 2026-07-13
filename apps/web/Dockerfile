FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json

RUN npm install --workspace @local-video-optimizer/web

COPY apps/web apps/web

WORKDIR /app/apps/web

EXPOSE 5173

CMD ["npm", "run", "dev"]
