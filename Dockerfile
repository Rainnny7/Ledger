# syntax=docker/dockerfile:1

# ---- build the web app ----
FROM oven/bun:1.3.14 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# ---- production dependencies + Chromium (used to sign in to TD EasyWeb) ----
FROM oven/bun:1.3.14 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# ---- runtime ----
FROM node:24-slim
ENV NODE_ENV=production \
    PORT=3001 \
    DATA_DIR=/data \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    LEDGER_INSTALL=docker
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
RUN npx --no-install playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*

COPY server ./server
COPY shared ./shared
COPY --from=build /app/dist ./dist

RUN mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME /data
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

CMD ["node", "server/index.ts"]
