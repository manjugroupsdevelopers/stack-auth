FROM node:20-alpine

WORKDIR /app

COPY package.json /app/package.json
COPY tsconfig.json /app/tsconfig.json
COPY src /app/src

RUN npm install -g pnpm && pnpm install --prod

EXPOSE 8080
CMD ["node", "--import", "tsx", "src/index.ts"]
