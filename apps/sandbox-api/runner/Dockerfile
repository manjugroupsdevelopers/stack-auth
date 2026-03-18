FROM node:20-alpine

WORKDIR /app

COPY package.json /opt/sandbox-deps/package.json
COPY package-lock.json /opt/sandbox-deps/package-lock.json
RUN cd /opt/sandbox-deps && npm ci --omit=dev --ignore-scripts --no-audit --no-fund

COPY index.mjs /app/index.mjs

RUN addgroup -S sandbox && adduser -S sandbox -G sandbox
USER 10001

ENTRYPOINT ["node", "/app/index.mjs"]
