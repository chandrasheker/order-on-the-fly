# TableTap — Smart Restaurant Ordering SaaS

QR-powered table ordering for restaurants. Customers scan, order, and play games while waiting. Staff manage orders with live timers and alerts. **Full-service:** kitchen KDS, floor plan, takeaway, Swiggy/Zomato sync, thermal receipts, and premium feature toggles.

TableTap is **fully generic** — launch it for any restaurant by editing one config file.

## Documentation (start here)

| Guide | What's inside |
|-------|-----------------|
| **[SETUP_GUIDE.md](./SETUP_GUIDE.md)** | **Complete setup** — dev, Docker, prod, env vars, every feature |
| [RESTAURANT_SETUP.md](./RESTAURANT_SETUP.md) | Restaurant config wizard & `restaurant.config.json` |
| [PREMIUM_FEATURES.md](./PREMIUM_FEATURES.md) | Core vs premium modules & super admin |
| [AGGREGATOR_SETUP.md](./AGGREGATOR_SETUP.md) | Swiggy & Zomato automatic sync |
| [presentation/README.md](./presentation/README.md) | Owner pitch decks (PPTX) |

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
- **Cooks** — redirect to `/kitchen` when KDS premium is enabled; otherwise staff dashboard
- **Servers** — dashboard + `/staff/floor` when floor-plan premium is enabled
- **Super admin (hidden)** — `/platform/login` — toggle premium features per restaurant (not linked from staff login). See **[PREMIUM_FEATURES.md](./PREMIUM_FEATURES.md)**
- **Customers** — scan table QR code to order (no login needed)

## Full feature set (this branch)

| Area | Tier | What you get |
|------|------|----------------|
| **Deploy** | Core | `npm run setup`, `restaurant.config.json`, Postgres/SQLite |
| **Guest ordering** | Core | QR + rotating check-in codes, session limits, table open/close |
| **Staff dashboard** | Core | Live orders, prep timers, overdue alerts, payment pending |
| **Kitchen (KDS)** | Premium | `/kitchen` — station-routed tickets |
| **Floor plan** | Premium | `/staff/floor` — table map, timers, server assignment |
| **Split bill** | Premium | Pay by item, split evenly, partial payments |
| **Phone orders** | Premium | Staff places walk-in/delivery orders |
| **Thermal receipts** | Premium | ESC/POS Bluetooth print on full payment |
| **Staff tracking** | Premium | Team performance in Daily Reports |
| **GST receipts** | Premium | GSTIN and tax on printed receipts |

| **Swiggy / Zomato sync** | Premium | Admin → **Integrations** — auto orders, menu sync, status callbacks |
| **Takeaway & delivery** | Premium | Staff dashboard → **Remote orders** |
| **Thermal receipts** | Premium | Bluetooth ESC/POS + kitchen chits + reprint |

Full core vs premium list: **[PREMIUM_FEATURES.md](./PREMIUM_FEATURES.md)** · Complete setup: **[SETUP_GUIDE.md](./SETUP_GUIDE.md)**

## Full-service routes

| Feature | Route / location |
|---------|------------------|
| Kitchen Display (KDS) | `/kitchen` — Hot Kitchen, Grill, Bar, Cold stations |
| Floor plan & table timers | `/staff/floor` — seat tables, assign servers, live bill |
| Split bill / partial pay | Staff dashboard → **Pending** tab — pay by item or split evenly |
| Phone / offline orders | Staff dashboard → **Remote orders** (walk-in, takeaway, delivery) |
| Swiggy / Zomato | Admin → **Integrations** — automatic webhook sync |
| Team performance | Admin → **Daily Reports** |
| Receipt & QR settings | Admin → **QR codes** |

## Owner Features

- Add menu items with name and price in any category
- Set **Today's Special** — one active special shown to customers
- Toggle item availability, print QR codes, download daily reports
- **Team performance** — track which staff served each table, orders served, payments collected (see **[RESTAURANT_ROADMAP.md](./RESTAURANT_ROADMAP.md)** for the full feature roadmap vs. industry POS systems)

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

### 3. Logins

The owner and platform-admin logins come from your `restaurant.config.json`
(or the demo `restaurant.config.example.json`). See
[RESTAURANT_SETUP.md](./RESTAURANT_SETUP.md).

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
- The seeded restaurant/staff/menu come from `restaurant.config.json` (or the example). Mount or copy your config before building the image.

**Full production checklist:** see **[SETUP_GUIDE.md](./SETUP_GUIDE.md)** §10.
