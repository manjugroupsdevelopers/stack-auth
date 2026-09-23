FROM node:20-alpine

WORKDIR /app

# Install prebuilt sandbox dependencies
COPY package.json /opt/sandbox-deps/package.json
RUN cd /opt/sandbox-deps && npm install --omit=dev --ignore-scripts --no-audit --no-fund

# Install server dependencies
RUN npm install express

# Copy server
COPY server.mjs /app/server.mjs

EXPOSE 8080
CMD ["node", "/app/server.mjs"]
