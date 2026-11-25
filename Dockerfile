# syntax=docker/dockerfile:1

# ---- build the web app ----
# Base images pinned by digest (multi-arch index); Dependabot keeps the pins current.
FROM oven/bun:1.3.14@sha256:e10577f0db68676a7024391c6e5cb4b879ebd17188ab750cf10024a6d700e5c4 AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# ---- production dependencies + Chromium (used to sign in to TD EasyWeb) ----
FROM oven/bun:1.3.14@sha256:e10577f0db68676a7024391c6e5cb4b879ebd17188ab750cf10024a6d700e5c4 AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile --production

# ---- runtime ----
FROM oven/bun:1.3.14@sha256:e10577f0db68676a7024391c6e5cb4b879ebd17188ab750cf10024a6d700e5c4
ENV NODE_ENV=production \
    PORT=3001 \
    DATA_DIR=/data \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    LEDGER_INSTALL=docker
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
RUN bunx playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*

COPY apps/api ./apps/api
COPY packages/shared ./packages/shared
COPY --from=build /app/apps/web/dist ./apps/web/dist

RUN mkdir -p /data && chown -R bun:bun /data /app
USER bun
VOLUME /data
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD bun -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

WORKDIR /app/apps/api
CMD ["bun", "src/index.ts"]
