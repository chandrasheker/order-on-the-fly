# TableTap — Complete Setup Guide

Everything you need to install, configure, and launch TableTap for a restaurant — from first `npm install` through production deployment, premium modules, Swiggy/Zomato, and owner presentations.

---

## Documentation map

| Document | Purpose |
|----------|---------|
| **[SETUP_GUIDE.md](./SETUP_GUIDE.md)** (this file) | End-to-end setup — dev, prod, every feature |
| **[BRINGUP_TROUBLESHOOTING.md](./BRINGUP_TROUBLESHOOTING.md)** | Git clone → running — known errors & mitigations |
| **[RESTAURANT_SETUP.md](./RESTAURANT_SETUP.md)** | Restaurant config file & wizard |
| **[PREMIUM_FEATURES.md](./PREMIUM_FEATURES.md)** | Core vs premium modules & super admin |
| **[AGGREGATOR_SETUP.md](./AGGREGATOR_SETUP.md)** | Swiggy & Zomato automatic sync |
| **[RESTAURANT_ROADMAP.md](./RESTAURANT_ROADMAP.md)** | Product roadmap vs industry POS |
| **[presentation/README.md](./presentation/README.md)** | Owner pitch decks (PPTX) |

---

## 1. What you are deploying

TableTap is a **multi-tenant restaurant ordering SaaS**:

- **Guests** scan table QR codes and order from their phone (no app install)
- **Staff** run live kitchen operations from a dashboard
- **Owners** manage menu, QR codes, payments, reports
- **Super admin** (hidden) toggles premium modules per restaurant

```
┌─────────────┐     QR scan      ┌──────────────┐     webhooks      ┌─────────────┐
│   Guest     │ ───────────────► │   TableTap   │ ◄──────────────── │ Swiggy/Zomato│
│   phone     │                  │   Next.js    │ ────────────────► │  platforms  │
└─────────────┘                  └──────┬───────┘   status + menu   └─────────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    ▼                   ▼                   ▼
              Staff dashboard      Kitchen (KDS)      Admin / Reports
```

---

## 2. Prerequisites

| Requirement | Version / notes |
|-------------|-----------------|
| **Node.js** | 20+ (22 recommended; Docker uses 22) |
| **npm** | Comes with Node |
| **Git** | To clone the repo |
| **OS** | macOS, Linux, or Windows (WSL for deploy scripts) |

**Optional:**

| Tool | Used for |
|------|----------|
| **Docker + Docker Compose** | Production-style local or server deploy with PostgreSQL |
| **Python 3 + `python-pptx`** | Regenerate owner presentation decks |
| **Playwright** | Auto-capture screenshots for presentations (`npm i -D playwright`) |
| **Bluetooth ESC/POS printer** | Thermal receipts (Chrome/Edge on Android; Web Bluetooth) |

---

## 3. Quick start (local demo — ~5 minutes)

```bash
git clone <your-repo-url> tabletap
cd tabletap
npm install
npm run setup -- --start
```

This will:

1. Create `.env` from `.env.example` if missing
2. Run the interactive restaurant wizard (or use defaults)
3. Write `restaurant.config.json`
4. Initialize SQLite database + seed demo restaurant
5. Start the dev server at `http://localhost:3000`

**Demo logins** (from `restaurant.config.example.json`):

| Role | URL | Email | Password |
|------|-----|-------|----------|
| Owner | `/` → dashboard | `owner@dvadtech.com` | `admin123` |
| Platform admin | `/platform/login` | `admin@dvadtech.com` | `admin@dvadtech` |
| Customer | Scan Table 1 QR | — | no login |

**Phone testing on same Wi-Fi:**

```bash
# Find your LAN IP
hostname -I   # Linux
# or ipconfig getifaddr en0   # macOS

# Set in .env BEFORE npm run dev / build
NEXT_PUBLIC_APP_URL=http://192.168.1.25:3000
```

Restart the dev server after changing `NEXT_PUBLIC_APP_URL` — QR codes embed this URL.

---

## 4. Restaurant configuration

TableTap is **fully generic**. One config file drives branding, staff, menu, and tables.

### Option A — Interactive wizard

```bash
npm run setup
npm run setup -- --start          # wizard + start dev server
```

### Option B — Ready-made config

```bash
npm run setup -- --from examples/pistahouse.config.json --start
```

### Option C — Manual edit

```bash
cp restaurant.config.example.json restaurant.config.json
npm run config:validate
npm run db:reset
npm run dev
```

### Config file reference

File: `restaurant.config.json` (git-ignored per deployment)

| Section | Key fields | Notes |
|---------|------------|-------|
| `app.name` | App title in browser | e.g. `PistaHouse Ordering` |
| `app.url` | Public URL for QR codes | Must match `NEXT_PUBLIC_APP_URL` |
| `restaurant.name` | Display name | |
| `restaurant.slug` | URL id (lowercase) | Used in `/order/{slug}/...` and webhooks |
| `restaurant.logoUrl` | Logo path/URL | Optional; `/api/receipt/logo` proxies for printing |
| `restaurant.backgroundImageUrl` | Guest page background | Optional |
| `restaurant.tableCount` | Number of table QR codes | |
| `restaurant.defaultMaxSessions` | Phones per table | Anti-abuse limit |
| `restaurant.rewards.*` | Spin wheel thresholds | See example config |
| `platformAdmin.*` | Super admin account | `/platform/login` |
| `staff.domain` | Email domain for auto-generated staff | e.g. `pistahouse.com` |
| `staff.defaultPassword` | Default staff password | Change in production |
| `staff.owners[]` | At least one owner | `{ name, email?, password? }` |
| `staff.managers[]` | Managers | |
| `staff.cooks[]` | Cooks | Count = kitchen staff slots |
| `staff.servers[]` | Servers | |
| `menu[]` | Categories + items | Seeded on `db:reset` |

Point to a custom config path:

```bash
export RESTAURANT_CONFIG=/path/to/my-restaurant.config.json
npm run db:reset
```

Full field list: **[RESTAURANT_SETUP.md](./RESTAURANT_SETUP.md)**

---

## 5. Environment variables (complete reference)

Copy `.env.example` → `.env`. The app auto-creates `.env` on first `npm run dev` via `scripts/ensure-env.js`.

### Required for production

| Variable | Purpose | Example |
|----------|---------|---------|
| `DATABASE_URL` | SQLite or PostgreSQL connection | `postgresql://user:pass@host:5432/tabletap` |
| `JWT_SECRET` | Staff & platform session signing | 64-char random hex |
| `TABLE_ACCESS_SECRET` | Guest check-in cookie signing | 64-char random hex |
| `NEXT_PUBLIC_APP_URL` | Public base URL (QR, webhooks) | `https://order.myrestaurant.com` |

Generate secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Database switching

| Mode | `DATABASE_URL` | Schema | Migrations folder |
|------|----------------|--------|-------------------|
| **Local dev** | `file:./dev.db` | `prisma/schema.prisma` | `prisma/migrations` |
| **Docker / Postgres** | `postgresql://...` | `prisma/schema.postgres.prisma` | `prisma/migrations-postgres` |

Set for Postgres:

```bash
export DATABASE_URL="postgresql://tabletap:password@localhost:5432/tabletap"
export PRISMA_SCHEMA="prisma/schema.postgres.prisma"
export PRISMA_MIGRATIONS="prisma/migrations-postgres"
npx prisma migrate deploy
npx tsx prisma/seed.ts
```

### Aggregator / security (optional)

| Variable | Purpose |
|----------|---------|
| `TABLETAP_CREDENTIALS_KEY` | Encrypt Swiggy/Zomato API keys at rest |
| `TABLETAP_WEBHOOK_SECRET` | Optional global webhook auth fallback |
| `ZOMATO_API_BASE`, `ZOMATO_*_PATH` | Override Zomato API endpoints |
| `SWIGGY_API_BASE`, `SWIGGY_*_PATH` | Override Swiggy API endpoints |

See **[AGGREGATOR_SETUP.md](./AGGREGATOR_SETUP.md)** for all path overrides.

### Docker Compose

| Variable | Default | Purpose |
|----------|---------|---------|
| `POSTGRES_DB` | `tabletap` | Database name |
| `POSTGRES_USER` | `tabletap` | DB user |
| `POSTGRES_PASSWORD` | `tabletap_password` | **Change in production** |
| `SEED_IF_EMPTY` | `true` | Seed only when DB is empty |

---

## 6. Database commands

| Command | What it does |
|---------|--------------|
| `npm run dev` | Init DB (migrate if needed) + start Next.js dev |
| `npm run db:setup` | Run migrations + seed (via `init-db.js`) |
| `npm run db:reset` | **Delete SQLite file** + re-seed from config |
| `npm run db:migrate` | `prisma migrate deploy` |
| `npm run db:seed` | Re-run seed without deleting DB |
| `npm run db:reseed` | Alias for seed |

**Ensure platform admin exists** (if super admin login fails):

```bash
npx tsx scripts/ensure-platform-admin.ts
```

**Ensure service tables** (takeaway/delivery — tables 901–904):

```bash
npx tsx scripts/ensure-service-tables.ts
```

---

## 7. Staff roles & access

| Role | Login at `/` | Access |
|------|--------------|--------|
| **Owner** | ✓ | Full dashboard, admin menu, QR, reports, integrations |
| **Manager** | ✓ | Menu, payments, QR, integrations |
| **Cook** | ✓ → `/kitchen` if KDS enabled | Prepare items, mark unavailable |
| **Server** | ✓ + `/staff/floor` if floor plan | Tables, serve, payments |
| **Platform admin** | `/platform/login` only | Staff slots, premium toggles, exports |

Staff slot counts come from the number of entries in each `staff.*[]` array in config. Platform admin manages additional slots from `/platform`.

---

## 8. Core setup (every restaurant)

These features are **always on** — no premium toggle needed.

### 8.1 Table QR codes

1. Owner logs in → staff dashboard → **QR icon** (or `/admin/qr`)
2. Print QR codes for each table
3. Place QR on physical tables
4. Set `NEXT_PUBLIC_APP_URL` to the URL phones can reach **before** printing

### 8.2 Secure guest check-in

1. Server **opens table** when guests sit down (staff dashboard → table panel)
2. Guest scans QR → check-in page → ordering enabled
3. Server **closes table** when guests leave (blocks remote misuse)
4. Table auto-closes after full payment (configurable flow)

### 8.3 Menu management

1. `/admin/menu` — add items, set prices, toggle availability
2. **Today's Special** category — only one item active at a time
3. Owners can edit anytime; changes reflect on guest menu immediately

### 8.4 Payments (cash / UPI)

1. Guest orders → staff prepares → serves
2. Guest pays (cash or scans PhonePe QR on guest screen)
3. Staff marks **Paid** on dashboard → revenue counted
4. **Pending Payments** vs **Completed Orders** tabs

### 8.5 PhonePe static QR

1. Admin → **QR codes** (`/admin/qr`)
2. Upload PhonePe / UPI QR image
3. Guests see it when they tap Pay on their phone

### 8.6 Rewards spin wheel

Configured in `restaurant.config.json` → `restaurant.rewards`:

- Threshold amounts for tea / beverage rewards
- Labels shown on guest UI after order

### 8.7 Daily reports

1. Admin → **Daily Reports** (`/admin/reports`)
2. View revenue, orders, item breakdown
3. Download CSV

### 8.8 Table switch requests

Guests can request a table change; staff approve/deny from dashboard.

---

## 9. Premium features setup

Premium modules are **off by default**. Enable from super admin or CLI.

### 9.1 Enable premium (super admin)

1. Go to **`/platform/login`** (not linked from staff login)
2. Credentials: `platformAdmin` from `restaurant.config.json`
3. Open **Premium features** tab
4. Toggle modules → **Save**
5. Changes apply within ~10 seconds — **no restart**

### 9.2 Enable premium (CLI)

```bash
# All premium modules
npx tsx scripts/enable-premium-features.ts --slug dvadtech --all

# Specific modules
npx tsx scripts/enable-premium-features.ts --slug dvadtech \
  --features kds,floor_plan,split_bill,thermal_receipts,phone_orders,gst_receipts,aggregator_inbox,staff_performance
```

Full module list: **[PREMIUM_FEATURES.md](./PREMIUM_FEATURES.md)**

---

### 9.3 Kitchen Display System (`kds`)

**Enable:** `kds` premium flag

| Step | Action |
|------|--------|
| 1 | Enable `kds` in super admin |
| 2 | Cooks log in → auto-redirect to `/kitchen` |
| 3 | Stations: Hot Kitchen, Grill, Bar, Cold (routed by menu category) |
| 4 | Mark items preparing → ready from KDS |

### 9.4 Floor plan (`floor_plan`)

**Enable:** `floor_plan` premium flag

| Step | Action |
|------|--------|
| 1 | Enable `floor_plan` |
| 2 | Servers open `/staff/floor` |
| 3 | Visual table map, seat timers, server assignment, live bill |

### 9.5 Split bill & partial payments (`split_bill`)

**Enable:** `split_bill` premium flag

| Step | Action |
|------|--------|
| 1 | Enable `split_bill` |
| 2 | Staff dashboard → **Pending Payments** tab |
| 3 | Pay by item, split evenly, or partial amounts |

### 9.6 Remote orders — walk-in, takeaway, delivery (`phone_orders`)

**Enable:** `phone_orders` premium flag

| Step | Action |
|------|--------|
| 1 | Enable `phone_orders` |
| 2 | Staff dashboard → **Remote orders** button |
| 3 | Choose: Walk-in/table, **Takeaway**, or **Delivery** |
| 4 | Add items → send to kitchen |

Service tables 901–904 are created automatically for takeaway/delivery channels.

```bash
npx tsx scripts/ensure-service-tables.ts   # if missing
```

### 9.7 Thermal receipts & kitchen chits (`thermal_receipts`)

**Enable:** `thermal_receipts` premium flag

| Step | Action |
|------|--------|
| 1 | Enable `thermal_receipts` |
| 2 | Use **Chrome or Edge on Android** (Web Bluetooth) |
| 3 | Staff dashboard → printer icon → **Connect** Bluetooth printer |
| 4 | Toggle **Auto-print receipt** on full payment |
| 5 | Toggle **Auto-print kitchen chit** on new orders |
| 6 | **Reprint receipt** from Completed Orders tab |

**Logo on receipts:** set `restaurant.logoUrl` in config. TableTap proxies via `/api/receipt/logo` for reliable ESC/POS raster printing.

**Limitations (v1):** Android Bluetooth only; no iOS Web Bluetooth; no Wi‑Fi/USB printers yet.

### 9.8 GST receipts (`gst_receipts`)

**Enable:** `gst_receipts` premium flag

| Step | Action |
|------|--------|
| 1 | Enable `gst_receipts` |
| 2 | Admin → QR codes → **Receipt settings** |
| 3 | Enter GSTIN, tax rate, footer text |
| 4 | Printed on thermal receipts when `thermal_receipts` also enabled |

### 9.9 Staff performance (`staff_performance`)

**Enable:** `staff_performance` premium flag

| Step | Action |
|------|--------|
| 1 | Enable `staff_performance` |
| 2 | Admin → Daily Reports → **Team performance** section |
| 3 | Tracks prep, serve, and payment collection by staff member |

### 9.10 Swiggy & Zomato automatic sync (`aggregator_inbox`)

**Enable:** `aggregator_inbox` premium flag

Full guide: **[AGGREGATOR_SETUP.md](./AGGREGATOR_SETUP.md)**

| Step | Owner action | TableTap |
|------|--------------|----------|
| 1 | Get outlet ID + API key from partner dashboard | — |
| 2 | Admin → **Integrations** (`/admin/integrations`) | Save encrypted credentials |
| 3 | Copy webhook URL + secret to Swiggy/Zomato POC | Auto-generated |
| 4 | Partner activates webhook | Status → **CONNECTED** |
| 5 | Edit menu in TableTap | Auto menu sync (if enabled) |
| 6 | Mark orders ready/served on KDS | Status callbacks to platform |

**Menu item mapping:** set `swiggyItemId` / `zomatoItemId` on menu items (PATCH `/api/menu/manage`) or match by exact item name.

**Toggles in Integrations UI:**

- Auto sync menu to platform
- Push ready / picked up status
- **Sync menu now** (manual trigger)

---

## 10. Production deployment

### 10.1 Docker Compose (recommended for LAN / small prod)

```bash
# 1. Configure secrets and public URL
export NEXT_PUBLIC_APP_URL=http://192.168.1.25:3000   # or https://your-domain.com
export JWT_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
export TABLE_ACCESS_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
export POSTGRES_PASSWORD="strong-postgres-password"
export TABLETAP_CREDENTIALS_KEY="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"

# 2. Ensure restaurant.config.json exists (mount or bake into image)
cp restaurant.config.example.json restaurant.config.json
# edit branding, staff, menu...

# 3. Build and start
docker compose up --build -d

# 4. Open
# Computer: http://localhost:3000
# Phone (same Wi-Fi): http://YOUR_LAN_IP:3000
```

**Reset all Docker data:**

```bash
docker compose down -v
docker compose up --build
```

**Volumes:**

- `postgres_data` — PostgreSQL database
- `payment_uploads` — uploaded PhonePe QR images

### 10.2 Bare-metal / Ubuntu (Node + systemd + nginx)

Build locally or on server:

```bash
npm ci
export NEXT_PUBLIC_APP_URL=https://order.yourrestaurant.com
export DATABASE_URL="postgresql://..."
export PRISMA_SCHEMA="prisma/schema.postgres.prisma"
export PRISMA_MIGRATIONS="prisma/migrations-postgres"
npm run build
npx prisma migrate deploy
npx tsx scripts/ensure-platform-admin.ts
npx tsx prisma/seed.ts
```

Production start:

```bash
node scripts/start-server.js --pull --no-clean --prod
```

Deploy helper scripts in `scripts/deploy/`:

| Script | Purpose |
|--------|---------|
| `add-new-app.sh` | Interactive new app setup |
| `restart-app.sh` | Restart systemd service |
| `disable-app.sh` | Stop app + disable nginx |
| `reenable-app.sh` | Re-enable app + nginx |
| `remove-app.sh` | Remove systemd + nginx config |

### 10.3 Production checklist

- [ ] Change all default passwords in `restaurant.config.json`
- [ ] Set strong `JWT_SECRET`, `TABLE_ACCESS_SECRET`, `TABLETAP_CREDENTIALS_KEY`
- [ ] Set `NEXT_PUBLIC_APP_URL` to final HTTPS domain **before** `npm run build`
- [ ] Use PostgreSQL (not SQLite) for production
- [ ] Run `npx prisma migrate deploy`
- [ ] Enable only the premium modules the customer paid for
- [ ] Print QR codes after URL is final
- [ ] Complete Swiggy/Zomato partner onboarding if using aggregators
- [ ] Test guest flow on a real phone over Wi-Fi / mobile data

---

## 11. Owner presentation decks (PPTX)

Pre-built pitch decks for restaurant owner meetings live in `presentation/`:

| File | Slides | Best for |
|------|--------|----------|
| `TableTap-Restaurant-Owner-Visual-Deck.pptx` | ~18 | Live pitch — visual, minimal text |
| `TableTap-Restaurant-Owner-Detailed-Deck.pptx` | ~20 | Backup — more explanation |
| `TableTap-Restaurant-Owner-Deck.pptx` | Copy of visual deck | Compatibility alias |

### Regenerate with fresh screenshots

```bash
npm run dev                                    # terminal 1
npm i -D playwright && npx playwright install  # one-time
npm run presentation                           # captures screenshots + rebuilds PPTX
```

Requires Python 3 + `python-pptx`:

```bash
pip install python-pptx
```

### Regenerate design-only (no screenshots)

```bash
python3 scripts/build-visual-pptx.py
python3 scripts/build-pptx.py
```

See **[presentation/README.md](./presentation/README.md)**

---

## 12. API & webhook reference (operators)

| Endpoint | Purpose |
|----------|---------|
| `POST /api/webhooks/zomato/{slug}` | Zomato order ingest |
| `POST /api/webhooks/swiggy/{slug}` | Swiggy order ingest |
| `POST /api/webhooks/orders/{slug}` | Generic order webhook |
| `GET /api/integrations/aggregators` | Connection status (manager auth) |
| `PATCH /api/integrations/aggregators` | Save credentials + toggles |
| `POST /api/integrations/aggregators` | Test connection or `action: sync-menu` |

Webhook auth: `Authorization: Bearer <webhook-secret-from-admin-ui>`

---

## 13. Troubleshooting

**Full bring-up runbook (git clone → app running, every known error):** **[BRINGUP_TROUBLESHOOTING.md](./BRINGUP_TROUBLESHOOTING.md)**

Quick fixes:

| Problem | Fix |
|---------|-----|
| QR opens wrong URL / phone can't connect | Set `NEXT_PUBLIC_APP_URL` to LAN IP or domain; rebuild; reprint QR |
| Super admin login fails | Run `npx tsx scripts/ensure-platform-admin.ts`; check `platformAdmin` in config |
| Premium feature visible but 403 | Enable flag in `/platform` or CLI; wait ~10s for cache |
| Swiggy/Zomato orders not appearing | Check Integrations status; verify webhook registered with partner; check `lastError` |
| Menu items not matching aggregator orders | Set `swiggyItemId`/`zomatoItemId` or match names exactly |
| Thermal printer won't connect | Use Chrome/Edge on Android; pair printer in Bluetooth settings first |
| Docker seed didn't run | `SEED_IF_EMPTY=true` only seeds empty DB; use `docker compose down -v` to reset |
| Migration errors on Postgres | Set `PRISMA_SCHEMA` + `PRISMA_MIGRATIONS`; run `npx prisma migrate deploy` |
| Guest check-in blocked | Staff must open table first; check session limit (`defaultMaxSessions`) |

Enable debug logging:

```bash
DEBUG=1 npm run dev
```

---

## 14. Post-launch checklist (restaurant owner)

- [ ] Print and place table QR codes
- [ ] Train staff: open table → guest scans → kitchen flow → mark paid
- [ ] Upload PhonePe QR if using guest self-pay
- [ ] Set today's menu and mark out-of-stock items
- [ ] Configure receipt footer / GST if applicable
- [ ] Connect Bluetooth printer if using thermal receipts
- [ ] Save Swiggy/Zomato credentials and share webhook with partner team
- [ ] Run a test order from phone and from aggregator (when live)

---

## 15. Quick command reference

```bash
npm install                          # Install dependencies
npm run setup -- --start             # Wizard + seed + dev
npm run dev                          # Local dev (SQLite)
npm run build && npm start           # Production mode locally
npm run db:reset                     # Wipe SQLite + re-seed
npm run config:validate              # Validate restaurant.config.json
npx tsx scripts/enable-premium-features.ts --slug SLUG --all
docker compose up --build            # Docker + Postgres
python3 scripts/build-visual-pptx.py # Rebuild pitch deck
npm run presentation                 # Screenshots + pitch deck
```

---

*TableTap — Scan. Order. Serve faster.*
