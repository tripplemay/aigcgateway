FROM node:22-slim AS base

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
COPY prisma ./prisma/
RUN npm ci --production=false && npx prisma generate

# Build
COPY . .
RUN mkdir -p public && npm run build

# Production image (minimal)
FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=base /app/.next/standalone ./
COPY --from=base /app/.next/static ./.next/static
COPY --from=base /app/public ./public
COPY --from=base /app/prisma ./prisma
COPY --from=base /app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 3000
CMD ["node", "server.js"]

# Migrate image (full node_modules + prisma CLI + migrations for `prisma migrate deploy`)
# 供 docker-compose.prod.yml 的一次性 migrate 服务使用。FROM base 保证 node_modules/.bin/prisma 存在。
FROM base AS migrate
WORKDIR /app
ENV NODE_ENV=production
# schema + migrations 已随 base 的 `COPY . .` 进入 /app/prisma；命令由 compose 覆盖为 prisma migrate deploy。
CMD ["npx", "prisma", "migrate", "deploy"]

# Test image (full node_modules for migrate + seed)
FROM node:22-slim AS test
WORKDIR /app

ENV NODE_ENV=test

COPY --from=base /app/.next/standalone ./
COPY --from=base /app/.next/static ./.next/static
COPY --from=base /app/public ./public
COPY --from=base /app/prisma ./prisma
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/package.json ./package.json

EXPOSE 3099
CMD ["node", "server.js"]
