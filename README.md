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

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Development (pnpm)](#local-development-pnpm)
3. [Local Development (Docker)](#local-development-docker)
4. [Deploy to a Server — Ubuntu Guide](#deploy-to-a-server--ubuntu-guide)
   - [What you need](#what-you-need)
   - [Step 1 — Point your domain to the server](#step-1--point-your-domain-to-the-server)
   - [Step 2 — Prepare the Ubuntu server](#step-2--prepare-the-ubuntu-server)
   - [Step 3 — Install Docker](#step-3--install-docker)
   - [Step 4 — Install Nginx and Certbot](#step-4--install-nginx-and-certbot)
   - [Step 5 — Clone the app and configure](#step-5--clone-the-app-and-configure)
   - [Step 6 — Build and start with Docker Compose](#step-6--build-and-start-with-docker-compose)
   - [Step 7 — Configure Nginx (HTTP first)](#step-7--configure-nginx-http-first)
   - [Step 8 — Get a free SSL certificate](#step-8--get-a-free-ssl-certificate)
   - [Step 9 — Verify everything](#step-9--verify-everything)
   - [Maintenance](#maintenance)
5. [Useful Scripts](#useful-scripts)
6. [Adding a New Game](#adding-a-new-game)

---

## Prerequisites

### For local development (pnpm)

| Tool | Version | Notes |
|------|---------|-------|
| **Node.js** | **≥ 22.5** | The server uses the built-in `node:sqlite` module (`DatabaseSync`), available from Node 22.5+. Node 24 LTS is recommended. |
| **pnpm** | **≥ 9** | Install with `npm i -g pnpm` or `corepack enable`. |

### For Docker deployment

| Tool | Notes |
|------|-------|
| **Docker Engine** | 24+ with the Compose plugin (`docker compose`). |
| No Node.js needed | The entire build happens inside Docker. |

This is a **pnpm workspace monorepo** with TypeScript project references:

```
packages/shared   → game engines + shared types/protocol  (@varagh/shared)
apps/server       → Socket.IO game server                 (@varagh/server)
apps/web          → React PWA client                      (@varagh/web)
```

---

## Local Development (pnpm)

### 1. Install dependencies

```bash
pnpm install
```

### 2. Run everything

```bash
pnpm dev
```

This starts both apps concurrently:

| App | URL | Notes |
|-----|-----|-------|
| **Web** | http://localhost:5173 | Vite dev server with HMR |
| **Server** | http://localhost:3001 | Socket.IO + SQLite (`apps/server/data/varagh.db`) |

The Vite dev server proxies `/socket.io` to the server automatically — no extra
config needed. Open **http://localhost:5173** and play.

### Run one app at a time

```bash
pnpm --filter @varagh/server dev   # server only (tsx watch, auto-reload)
pnpm --filter @varagh/web   dev    # web only
```

### Server environment variables (optional in dev)

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3001` | Port the Socket.IO/HTTP server listens on. |
| `HOST` | `0.0.0.0` | Interface to bind (use `127.0.0.1` to restrict to localhost). |
| `DATABASE_URL` | `data/varagh.db` | SQLite database file path (created automatically). |
| `WEB_ORIGIN` | `*` | Allowed CORS origin for browser connections. |

Example:

```bash
PORT=4000 DATABASE_URL=./tmp/dev.db pnpm --filter @varagh/server dev
```

### LAN play (test from your phone / another device)

The Vite dev server and Node server both bind to `0.0.0.0`. Find your machine's
local IP (`ipconfig` on Windows / `ip a` on Linux), then set `VITE_SERVER_URL` in
`apps/web/.env` to point the socket client at the server:

```env
# apps/web/.env
VITE_SERVER_URL=http://192.168.1.x:3001
```

Open `http://192.168.1.x:5173` on any device on the same network.

---

## Local Development (Docker)

Run the full production stack locally with a single command — no Node.js
installation needed.

```bash
docker compose up --build
```

This builds both images and starts:

| Service | Accessible at |
|---------|--------------|
| **Web (Nginx)** | http://localhost |
| **Server (Node.js)** | internal only (proxied by Nginx) |

Stop with `Ctrl+C`, or run detached and stop later:

```bash
docker compose up --build -d   # start in background
docker compose down             # stop (data is preserved)
docker compose down -v          # stop + wipe the database volume
```

### Run on a different port locally

```bash
PORT=8080 docker compose up --build -d
# → http://localhost:8080
```

---

## Deploy to a Server — Ubuntu Guide

This guide sets up Varagh on a fresh **Ubuntu 22.04 / 24.04** VPS with:
- Docker Compose running the app containers
- Nginx on the host terminating HTTPS and proxying to Docker
- A free SSL certificate from Let's Encrypt

### What you need

| Item | Notes |
|------|-------|
| A VPS / cloud server | Ubuntu 22.04 or 24.04 LTS. Minimum 1 vCPU, 1 GB RAM, 20 GB disk. |
| A domain or subdomain | e.g. `varagh.example.com` or `play.example.com`. You need access to its DNS settings. |
| SSH access to the server | You'll run all commands as a non-root user with `sudo`. |

---

### Step 1 — Point your domain to the server

1. Log in to your **domain registrar** (Namecheap, GoDaddy, Cloudflare, etc.) and
   open the **DNS settings** for your domain.

2. Create an **A record**:

   | Field | Value |
   |-------|-------|
   | **Host / Name** | `@` for the root domain (`example.com`), or `play` for a subdomain (`play.example.com`) |
   | **Value / Points to** | Your server's **public IP address** (e.g. `185.x.x.x`) |
   | **TTL** | `300` (5 minutes — lets you change it quickly if needed) |

3. Save. DNS propagation usually takes **5–30 minutes** (up to 48 hours in rare
   cases). You can check progress with:

   ```bash
   # From any machine:
   nslookup varagh.example.com
   # or
   dig +short varagh.example.com
   ```

   When it returns your server's IP, you are ready to continue.

> **Using a subdomain on a domain managed by Cloudflare?**
> Keep the orange proxy cloud **disabled** (grey cloud / DNS only) while you
> get the SSL certificate. You can enable it again afterward if you want
> Cloudflare's CDN.

---

### Step 2 — Prepare the Ubuntu server

SSH into the server, then run:

```bash
# Update all packages
sudo apt update && sudo apt upgrade -y

# Install basic tools
sudo apt install -y git curl ufw

# Configure the firewall
sudo ufw allow 22    # SSH — keep this or you'll lock yourself out!
sudo ufw allow 80    # HTTP (needed for SSL verification)
sudo ufw allow 443   # HTTPS
sudo ufw --force enable

# Verify firewall status
sudo ufw status
```

---

### Step 3 — Install Docker

```bash
# Official Docker install script (installs Engine + Compose plugin)
curl -fsSL https://get.docker.com | sudo sh

# Allow your user to run Docker without sudo
sudo usermod -aG docker $USER

# Apply the group change without logging out
newgrp docker

# Verify
docker --version
docker compose version
```

---

### Step 4 — Install Nginx and Certbot

```bash
sudo apt install -y nginx certbot python3-certbot-nginx

# Start Nginx and enable it on boot
sudo systemctl enable --now nginx
```

---

### Step 5 — Clone the app and configure

```bash
# Clone the repository
sudo git clone https://github.com/YOUR_USERNAME/varagh.git /srv/varagh
sudo chown -R $USER:$USER /srv/varagh
cd /srv/varagh
```

Create a **root-level `.env`** file that Docker Compose will read:

```bash
cat > /srv/varagh/.env << 'EOF'
# Port Docker's Nginx listens on (host Nginx will proxy here)
PORT=8080

# CORS origin — set to your actual domain once DNS is live
WEB_ORIGIN=https://varagh.example.com
EOF
```

> Replace `varagh.example.com` with your real domain throughout this guide.

---

### Step 6 — Build and start with Docker Compose

```bash
cd /srv/varagh
docker compose up --build -d
```

The first build takes **3–8 minutes** (it compiles TypeScript and the Vite PWA
inside Docker). Subsequent deploys are much faster thanks to layer caching.

Check that both containers are running:

```bash
docker compose ps
```

You should see `server` (healthy) and `web` (running). If something is wrong:

```bash
docker compose logs --tail=50
```

At this point the app is reachable on port **8080** but only via HTTP and without
a domain. The next steps add HTTPS through the real domain.

---

### Step 7 — Configure Nginx (HTTP first)

Create a new Nginx site configuration:

```bash
sudo nano /etc/nginx/sites-available/varagh
```

Paste the following — **replace `varagh.example.com` with your domain**:

```nginx
# /etc/nginx/sites-available/varagh

map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 80;
    server_name varagh.example.com;

    location / {
        proxy_pass         http://localhost:8080;
        proxy_http_version 1.1;

        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host       $host;

        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

Enable the site and reload Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/varagh /etc/nginx/sites-enabled/
sudo nginx -t          # should say "syntax is ok"
sudo systemctl reload nginx
```

Test that it works over plain HTTP:

```bash
curl -I http://varagh.example.com
# Should return HTTP/1.1 200 OK
```

---

### Step 8 — Get a free SSL certificate

Run Certbot — it reads your Nginx config, verifies domain ownership over HTTP,
issues the certificate, and **automatically rewrites your Nginx config** for
HTTPS:

```bash
sudo certbot --nginx -d varagh.example.com
```

Follow the prompts:
- Enter your email address (for renewal reminders)
- Agree to the Terms of Service
- Choose whether to share your email with EFF (optional)
- When asked about HTTP→HTTPS redirect, choose **option 2 (redirect)** ✓

Certbot will:
1. Obtain a certificate from Let's Encrypt
2. Update `/etc/nginx/sites-available/varagh` to add `listen 443 ssl`
3. Add an HTTP→HTTPS redirect block
4. Install a cron job that auto-renews the certificate before it expires

Reload Nginx one more time:

```bash
sudo systemctl reload nginx
```

---

### Step 9 — Verify everything

```bash
# Check containers are healthy
docker compose -f /srv/varagh/docker-compose.yml ps

# Check Nginx is happy
sudo nginx -t
sudo systemctl status nginx

# Check the app is reachable over HTTPS
curl -I https://varagh.example.com
# Should return HTTP/2 200

# Test SSL certificate
echo | openssl s_client -connect varagh.example.com:443 2>/dev/null | openssl x509 -noout -dates
```

Open `https://varagh.example.com` in a browser. You should see the Varagh app
over HTTPS with a valid certificate. The app can also be **installed as a PWA**
from the browser's install prompt.

---

### Maintenance

#### View logs

```bash
cd /srv/varagh

docker compose logs -f              # live logs from all containers
docker compose logs -f server       # server only
docker compose logs -f web          # nginx only
```

#### Update the app

```bash
cd /srv/varagh
git pull
docker compose up --build -d
```

Docker rebuilds only the layers that changed, so updates are fast.

#### Restart without rebuilding

```bash
docker compose restart
```

#### Stop the app

```bash
docker compose down          # containers stop, data (SQLite DB) survives
docker compose down -v       # also wipes the database volume ⚠️
```

The containers are configured with `restart: unless-stopped`, so they start
automatically if the server reboots.

#### Back up the database

```bash
# Copy the SQLite file out of the Docker volume to the host
docker run --rm \
  -v varagh_db_data:/data \
  -v $(pwd):/backup \
  alpine cp /data/varagh.db /backup/varagh-backup-$(date +%Y%m%d).db
```

#### Renew SSL (automatic, but test it)

```bash
sudo certbot renew --dry-run
```

Certbot installs a systemd timer that auto-renews certificates. This command
just verifies the process would work.

---

## Useful Scripts

Run from the repository root:

| Command | What it does |
|---------|--------------|
| `pnpm dev` | Run server + web with live reload (requires Node 22.5+). |
| `pnpm build` | Build all packages in order: `shared` → `server` → `web`. |
| `pnpm test` | Run the full test suite (Vitest) across all packages. |
| `pnpm typecheck` | Type-check every package with no emit. |
| `docker compose up --build -d` | Build images and start in background. |
| `docker compose logs -f` | Tail live logs from all containers. |
| `docker compose down` | Stop containers (data persists). |

Always run `pnpm test` before declaring a task complete — the game engines have
thorough unit tests (follow-suit, kot scoring, determinism, etc.).

---

## Adding a New Game

Adding a game must **never** require changing core server, lobby, or auth code.
A game is one self-contained module under `packages/shared/src/games/<game>/`
that implements the `GameDefinition` contract, plus a single registry line in
`packages/shared/src/games/index.ts`. If you find yourself special-casing a game
in the server or web, fix the abstraction instead. See [CLAUDE.md](./CLAUDE.md).
