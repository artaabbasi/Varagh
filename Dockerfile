# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────────────────────
# base — Node 24 Alpine with pnpm enabled via corepack
# ─────────────────────────────────────────────────────────────────────────────
FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate

# ─────────────────────────────────────────────────────────────────────────────
# deps — install all workspace dependencies
#   Only package manifests and the lock file are copied here so this layer is
#   cached and rebuilt only when dependencies actually change.
# ─────────────────────────────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json  ./packages/shared/
COPY apps/server/package.json      ./apps/server/
COPY apps/web/package.json         ./apps/web/

RUN pnpm install --frozen-lockfile

# ─────────────────────────────────────────────────────────────────────────────
# builder — compile everything
#   shared  → tsc  → packages/shared/dist/
#   server  → tsc  → apps/server/dist/
#   web     → vite → apps/web/dist/
#
#   VITE_SERVER_URL is deliberately empty so the production bundle uses a
#   relative path for Socket.IO — nginx proxies /socket.io/ to the server.
# ─────────────────────────────────────────────────────────────────────────────
FROM deps AS builder
WORKDIR /repo

COPY . .

RUN VITE_SERVER_URL="" pnpm build

# ─────────────────────────────────────────────────────────────────────────────
# server-bundle — create a self-contained server deployment with pnpm deploy
#
#   @varagh/shared exports ./src/index.ts (TypeScript source) which is fine for
#   dev/bundler tools but Node.js can't execute TypeScript at runtime.  Before
#   running pnpm deploy we patch the exports field to point at the compiled
#   dist/index.js that tsc produced in the builder stage.  This patch only
#   affects this layer; the original source file is unchanged everywhere else.
# ─────────────────────────────────────────────────────────────────────────────
FROM builder AS server-bundle
WORKDIR /repo

RUN node -e "\
  const fs = require('fs'); \
  const p  = JSON.parse(fs.readFileSync('./packages/shared/package.json', 'utf8')); \
  p.exports = { '.': './dist/index.js' }; \
  p.main    = './dist/index.js'; \
  fs.writeFileSync('./packages/shared/package.json', JSON.stringify(p, null, 2)); \
"

RUN pnpm --filter @varagh/server deploy --prod /srv/server

# ─────────────────────────────────────────────────────────────────────────────
# server — lean production Node image
# ─────────────────────────────────────────────────────────────────────────────
FROM node:24-alpine AS server
WORKDIR /app

ENV NODE_ENV=production

COPY --from=server-bundle /srv/server ./

EXPOSE 3001
CMD ["node", "dist/index.js"]

# ─────────────────────────────────────────────────────────────────────────────
# web — Nginx serving the Vite PWA and proxying Socket.IO to the server
# ─────────────────────────────────────────────────────────────────────────────
FROM nginx:stable-alpine AS web

COPY --from=builder /repo/apps/web/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
