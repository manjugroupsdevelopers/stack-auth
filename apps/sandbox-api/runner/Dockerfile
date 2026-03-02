FROM node:20-alpine

WORKDIR /app

COPY index.mjs /app/index.mjs

RUN addgroup -S sandbox && adduser -S sandbox -G sandbox
USER 10001

ENTRYPOINT ["node", "/app/index.mjs"]
