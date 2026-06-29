# TableTap — Smart Restaurant Ordering SaaS

QR-powered table ordering for restaurants. Customers scan, order, and play games while waiting. Staff manage orders with live timers and alerts.

## Quick Start

```bash
npm install
npm run dev
```

Open **https://varanasihotel.duckdns.org** (or `http://localhost:3000` when running locally) and sign in with your staff credentials.

Set `NEXT_PUBLIC_APP_URL` in `.env` to your public domain so QR codes point to the correct URL.

## Access

- **Staff/Owner** — login at `/` to access dashboard, menu, QR codes, and reports
- **Platform admin** — login at `/platform/login` to manage staff names, emails, passwords, and roles
- **Customers** — scan table QR code to order (no login needed)

## Owner Features

- Add menu items with name and price in any category
- Set **Today's Special** — one active special shown to customers
- Toggle item availability, print QR codes, download daily reports

## Reset Database

```bash
npm run db:reset
npm run dev
```

## Production deployment (Ubuntu)

Server helper scripts live in `scripts/deploy/` (systemd + nginx):

| Script | Purpose |
|--------|---------|
| `add-new-app.sh` | Interactive setup for a new app (install, build, systemd, nginx, certbot) |
| `restart-app.sh` | Restart a systemd service |
| `disable-app.sh` | Stop app and disable nginx site |
| `reenable-app.sh` | Re-enable app and nginx site |
| `remove-app.sh` | Remove systemd unit and nginx config |

Run on the server from the repo root, e.g. `bash scripts/deploy/restart-app.sh`.

Set `NEXT_PUBLIC_APP_URL` to your public domain (e.g. `https://varanasihotel.duckdns.org`) before building. Production start: `node scripts/start-server.js --pull --no-clean --prod`.

## Docker production setup (PostgreSQL)

This repo includes a production-oriented Docker setup that runs:

- PostgreSQL
- Prisma migrations
- Seed data (only when the database is empty)
- Next.js app on port `3000`

### 1. Configure local-network URL

Find your computer's LAN IP address, then export it before starting Compose:

```bash
# macOS/Linux examples:
hostname -I
# or
ipconfig getifaddr en0

export NEXT_PUBLIC_APP_URL=http://YOUR_LAN_IP:3000
export JWT_SECRET="replace-with-a-long-random-secret"
export TABLE_ACCESS_SECRET="replace-with-another-long-random-secret"
```

Example:

```bash
export NEXT_PUBLIC_APP_URL=http://192.168.1.25:3000
```

This makes printed/table QR codes point to an address your phone can open on the same Wi-Fi.

### 2. Start

```bash
docker compose up --build
```

Open from your computer:

```text
http://localhost:3000
```

Open from your phone on the same Wi-Fi:

```text
http://YOUR_LAN_IP:3000
```

### 3. Default demo logins

| Area | Email | Password |
|------|-------|----------|
| Staff / Owner | `owner@varanasi.com` | `admin123` |
| Platform admin | `admin@varanasi.com` | `admin@varanasi` |

### 4. Data persistence

Compose uses named volumes:

- `postgres_data` for the PostgreSQL database
- `payment_uploads` for uploaded PhonePe QR images

To fully reset Docker data:

```bash
docker compose down -v
docker compose up --build
```

### Notes

- Existing local development remains SQLite-based (`npm run dev`, `npm run db:reset`).
- Docker uses `prisma/schema.postgres.prisma` and `prisma/migrations-postgres`.
- Seed data is idempotent in Docker via `SEED_IF_EMPTY=true`, so container restarts do not wipe production data.
