FROM node:20-alpine

WORKDIR /usr/src/app/backend

COPY backend/package*.json ./
RUN npm install --omit=dev

COPY backend ./backend-src
COPY app ../app

RUN cp -R ./backend-src/. ./ && rm -rf ./backend-src

EXPOSE 3000

CMD ["node", "server.js"]
