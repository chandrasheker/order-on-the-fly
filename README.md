# TableTap — Smart Restaurant Ordering SaaS

QR-powered table ordering for restaurants. Customers scan, order, and play games while waiting. Staff manage orders with live timers and alerts.

TableTap is **fully generic** — launch it for any restaurant by editing one
config file. Nothing is hard-coded to a specific brand.

## Quick Start (demo restaurant)

```bash
npm install
npm run dev
```

Open `http://localhost:3000` and sign in with the demo staff credentials.

## Make it your own restaurant (e.g. PistaHouse)

One command sets up branding, staff, tables, and menu:

```bash
npm run setup                # interactive wizard
# or use a ready-made config:
npm run setup -- --from examples/pistahouse.config.json --start
```

See **[RESTAURANT_SETUP.md](./RESTAURANT_SETUP.md)** for the full list of inputs
(name, logo, owner/manager/staff, menu, tables, rewards) and all setup options.
The active config lives in `restaurant.config.json` (copy from
`restaurant.config.example.json`).

Set `NEXT_PUBLIC_APP_URL` in `.env` (or `app.url` in the config) to your public
domain / LAN IP so QR codes point to the correct URL.

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

Set `NEXT_PUBLIC_APP_URL` to your public domain (or set `app.url` in `restaurant.config.json`) before building. Production start: `node scripts/start-server.js --pull --no-clean --prod`.
