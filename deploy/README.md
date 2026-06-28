# Bare-metal deploy (`/opt/varagh`)

Deploys Varagh to a Linux host as two artifacts:

```
/opt/varagh/
├── web/         static PWA  → served by nginx
├── server.cjs   bundled Node server → run by systemd
└── data/        SQLite db (created on first run)
```

The server is bundled into a single `server.cjs` with esbuild, so the host
needs **only Node.js ≥ 22** (no `node_modules`, no pnpm). Node 22+ is required
for the built-in `node:sqlite` module.

## Origins

The web app and the Socket.IO server run on **separate subdomains**:

| Component | URL                                | Served by                          |
|-----------|------------------------------------|------------------------------------|
| Web (PWA) | `https://varagh.artanova.top`        | nginx, root `/opt/varagh/web`      |
| Server    | `https://varagh-server.artanova.top` | nginx → `127.0.0.1:3001`           |

Because this is cross-origin:

- the web bundle is built with `VITE_SERVER_URL=https://varagh-server.artanova.top`
  (baked in by `scripts/deploy.sh`), and
- the server's `WEB_ORIGIN=https://varagh.artanova.top` (in `varagh.service`)
  allows that origin through CORS.

## One-time host setup

```bash
# 1. Node 22+ (at /usr/local/bin/node) and nginx
sudo apt install -y nginx

# 2. Service user + install dir
sudo useradd --system --home /opt/varagh varagh
sudo mkdir -p /opt/varagh/web /opt/varagh/data
sudo chown -R varagh:varagh /opt/varagh

# 3. TLS certs at /etc/ssl/varagh/{fullchain,privkey}.pem
#    (e.g. via certbot, then copy/symlink into /etc/ssl/varagh)

# 4. systemd unit
sudo cp deploy/varagh.service /etc/systemd/system/varagh.service
sudo systemctl daemon-reload
sudo systemctl enable --now varagh

# 5. nginx site
sudo cp deploy/nginx-varagh.conf /etc/nginx/sites-available/varagh
sudo ln -sf /etc/nginx/sites-available/varagh /etc/nginx/sites-enabled/varagh
sudo nginx -t && sudo systemctl reload nginx
```

Give the deploying SSH user write access to `/opt/varagh` and passwordless
`sudo systemctl restart varagh` (or set `DEPLOY_SERVICE=""` and restart by hand).

## Deploy (from your dev machine)

```bash
DEPLOY_TARGET=root@your-host pnpm deploy
```

Builds the web bundle (pointed at the server subdomain) + `server.cjs`, SCPs
them into `/opt/varagh` (`web/` + `server.cjs`), then restarts `varagh`.

### Options

| Env var           | Default                                | Meaning                               |
|-------------------|----------------------------------------|---------------------------------------|
| `DEPLOY_TARGET`   | —                                      | `user@host` (or pass as first arg)    |
| `DEPLOY_DIR`      | `/opt/varagh`                          | remote install directory              |
| `DEPLOY_SSH_PORT` | `22`                                   | SSH port                              |
| `DEPLOY_SERVICE`  | `varagh`                               | systemd unit to restart (`""` = skip) |
| `VITE_SERVER_URL` | `https://varagh-server.artanova.top`   | Socket.IO origin baked into the build |

## Build artifacts only (no upload)

```bash
pnpm build:server                                              # → apps/server/dist/server.cjs
VITE_SERVER_URL=https://varagh-server.artanova.top \
  pnpm --filter @varagh/web build                              # → apps/web/dist/
```
