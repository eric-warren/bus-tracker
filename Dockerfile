FROM node:25-alpine AS app
WORKDIR /usr/src/app
COPY package*.json tsconfig.json ./
RUN npm install
COPY src src
COPY sql sql

EXPOSE 3000
CMD ["npm", "start"]