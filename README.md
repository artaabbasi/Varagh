# Varagh (ورق) — Persian Card Games

Varagh is a multiplayer Persian card-games platform, shipped as an installable
PWA. The launch game is **Hokm** (حکم) with 2-, 3-, and 4-player variants. The
server is authoritative; clients only ever receive a redacted view of the game
state.

- **Web** — React 18 + TypeScript + Vite (PWA), bilingual fa/en, RTL-first.
- **Server** — Node.js + TypeScript + Socket.IO, SQLite for persistence.
- **Shared** — game engines and the `GameDefinition` contract used by both.

See [CLAUDE.md](./CLAUDE.md) for the architecture and house rules in depth.

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| **Node.js** | **≥ 22.5** | The server uses the built-in `node:sqlite` module (`DatabaseSync`), which is only available on Node 22.5+. Node 24 LTS is recommended. |
| **pnpm** | **≥ 9** | Package manager for the workspace. Install with `npm i -g pnpm` or `corepack enable`. |

This is a **pnpm workspace monorepo** with TypeScript project references:

```
packages/shared   → game engines + shared types/protocol (@varagh/shared)
apps/server       → Socket.IO game server          (@varagh/server)
apps/web          → React PWA client               (@varagh/web)
```

---

## Local development

### 1. Install dependencies

```bash
pnpm install
```

### 2. Run everything

```bash
pnpm dev
```

This runs both apps concurrently:

- **Server** on **http://localhost:3001** (Socket.IO + SQLite at `apps/server/data/varagh.db`)
- **Web** on **http://localhost:5173** (Vite dev server)

The Vite dev server proxies `/socket.io` to the server (see
[`apps/web/vite.config.ts`](./apps/web/vite.config.ts)), so the web app talks to
the backend on the same origin — no extra config needed. Open
**http://localhost:5173** and play.

### Run one app at a time

```bash
pnpm --filter @varagh/server dev   # server only (tsx watch, auto-reload)
pnpm --filter @varagh/web dev      # web only
```

### Server environment variables (optional in dev)

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3001` | Port the Socket.IO/HTTP server listens on. |
| `DATABASE_URL` | `data/varagh.db` | SQLite database file path (created automatically). |
| `WEB_ORIGIN` | `http://localhost:5173` | Allowed CORS origin for browser connections. |

Example:

```bash
PORT=4000 DATABASE_URL=./tmp/dev.db pnpm --filter @varagh/server dev
```

---

## Useful scripts

Run from the repository root:

| Command | What it does |
|---------|--------------|
| `pnpm dev` | Run server + web together with live reload. |
| `pnpm build` | Build all packages in order: `shared` → `server` → `web`. |
| `pnpm test` | Run the full test suite (Vitest) across all packages. |
| `pnpm typecheck` | Type-check every package with no emit. |

Always run `pnpm test` before declaring a task complete — the game engines have
thorough unit tests (follow-suit, kot scoring, determinism, etc.).

---

## Production

### 1. Build

```bash
pnpm install --frozen-lockfile
pnpm build
```

Outputs:

- **Server** → `apps/server/dist/` (compiled JS)
- **Web** → `apps/web/dist/` (static PWA assets)

### 2. Run the server

```bash
# from the repo root
NODE_ENV=production \
PORT=3001 \
DATABASE_URL=/var/lib/varagh/varagh.db \
WEB_ORIGIN=https://varagh.example.com \
pnpm --filter @varagh/server start
```

`start` runs `node apps/server/dist/index.js`. Keep it alive with a process
manager (systemd, pm2, or a container). Persist the directory that holds
`DATABASE_URL` so user accounts and match history survive restarts.

### 3. Serve the web client (same origin as the server)

The web client connects to Socket.IO on **its own origin** (`io()` with no URL —
see [`apps/web/src/app/socket.ts`](./apps/web/src/app/socket.ts)). In production
the static `apps/web/dist` files and the `/socket.io` endpoint must therefore be
reachable on **one public origin**. The simplest setup is a reverse proxy that:

1. serves `apps/web/dist` as static files, and
2. forwards `/socket.io` (HTTP **and** WebSocket upgrades) to the Node server.

Set `WEB_ORIGIN` to that public origin so CORS allows the browser.

#### Example: nginx

```nginx
server {
    listen 443 ssl http2;
    server_name varagh.example.com;

    # ... ssl_certificate / ssl_certificate_key ...

    root /srv/varagh/web;          # contents of apps/web/dist
    index index.html;

    # SPA fallback — let the client router handle routes
    location / {
        try_files $uri /index.html;
    }

    # Socket.IO (WebSocket-aware) → Node server on :3001
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Serve over **HTTPS** — installable PWAs and service workers require a secure
context.

> Running web and server on **different** origins also works, but then you must
> point the client at the server URL (`io("https://api.example.com")` in
> `socket.ts`) and set `WEB_ORIGIN` to the web origin for CORS.

---

## Adding a new game

Adding a game must **never** require changing core server, lobby, or auth code.
A game is one self-contained module under `packages/shared/src/games/<game>/`
that implements the `GameDefinition` contract, plus a single registry line in
`packages/shared/src/games/index.ts`. If you find yourself special-casing a game
in the server or web, fix the abstraction instead. See [CLAUDE.md](./CLAUDE.md).
