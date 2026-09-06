FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium ca-certificates fonts-liberation \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./

ENV NODE_ENV=production \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    AULAFACIL_ROBOT_DATA_PATH=/data/whatsapp

RUN mkdir -p /data/whatsapp
EXPOSE 3000
CMD ["npm", "start"]
