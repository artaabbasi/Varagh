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

## One-time host setup

```bash
# 1. Node 22+ and nginx
sudo apt install -y nginx
# install Node 22 via nodesource or nvm…

# 2. Install dir owned by the service user
sudo mkdir -p /opt/varagh/web /opt/varagh/data
sudo chown -R www-data:www-data /opt/varagh

# 3. systemd unit (edit WEB_ORIGIN inside first)
sudo cp deploy/varagh.service /etc/systemd/system/varagh.service
sudo systemctl daemon-reload
sudo systemctl enable varagh

# 4. nginx site (edit server_name inside first)
sudo cp deploy/nginx-varagh.conf /etc/nginx/sites-available/varagh
sudo ln -sf /etc/nginx/sites-available/varagh /etc/nginx/sites-enabled/varagh
sudo nginx -t && sudo systemctl reload nginx
```

Give the deploying SSH user write access to `/opt/varagh` and passwordless
`sudo systemctl restart varagh` (or set `DEPLOY_SERVICE=""` and restart by hand).

## Deploy (from your dev machine)

```bash
DEPLOY_TARGET=user@your-host pnpm deploy
```

This builds the web bundle + `server.cjs`, then SCPs them into `/opt/varagh`
and restarts the service.

### Options

| Env var           | Default        | Meaning                                  |
|-------------------|----------------|------------------------------------------|
| `DEPLOY_TARGET`   | —              | `user@host` (or pass as the first arg)   |
| `DEPLOY_DIR`      | `/opt/varagh`  | remote install directory                 |
| `DEPLOY_SSH_PORT` | `22`           | SSH port                                 |
| `DEPLOY_SERVICE`  | `varagh`       | systemd unit to restart (`""` to skip)   |

## Build artifacts only (no upload)

```bash
pnpm build:server   # → apps/server/dist/server.cjs
pnpm --filter @varagh/web build   # → apps/web/dist/
```
