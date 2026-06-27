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
