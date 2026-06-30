# TableTap — Bring-Up Runbook (Git Clone → App Running)

Use this guide when bringing TableTap up from a fresh checkout. Work through the **golden path** first; if something fails, jump to the matching **phase** and find your error message.

Related docs: **[SETUP_GUIDE.md](./SETUP_GUIDE.md)** (full setup) · **[RESTAURANT_SETUP.md](./RESTAURANT_SETUP.md)** (config file)

---

## Golden path (copy-paste)

Run these in order. If any step fails, stop and use the error index below.

```bash
# 0. Prerequisites — Node 20+ required
node -v    # must be v20.x or v22.x
npm -v

# 1. Clone
git clone <repo-url> tabletap && cd tabletap

# 2. Install dependencies (runs prisma generate via postinstall)
npm install

# 3. Environment — auto-created on first dev run, or copy manually:
cp .env.example .env
# Edit .env if phones need LAN access:
#   NEXT_PUBLIC_APP_URL=http://YOUR_LAN_IP:3000

# 4. Restaurant config + database (one command)
npm run setup -- --start
# OR non-interactive demo:
# npm run setup -- --from restaurant.config.example.json --start

# 5. Verify
# Open http://localhost:3000
# Login: owner@varanasi.com / admin123  (demo config)
```

**Success criteria:**

- [ ] `npm run dev` starts without migration errors
- [ ] Staff login works at `/`
- [ ] Platform admin login works at `/platform/login`
- [ ] Guest can open a table QR (after staff opens the table)

---

## Error index (quick lookup)

| Symptom / error message | Phase | Jump to |
|-------------------------|-------|---------|
| `node: command not found` / wrong Node version | 0 | [§0 Prerequisites](#0-prerequisites) |
| `npm install` fails / `better-sqlite3` compile error | 1 | [§1 npm install](#1-npm-install) |
| No `.env` / missing env vars | 2 | [§2 Environment](#2-environment-env) |
| `No restaurant config found` | 3 | [§3 Restaurant config](#3-restaurant-config) |
| `Failed to parse restaurant config` / JSON error | 3 | [§3 Restaurant config](#3-restaurant-config) |
| `At least one owner is required` | 3 | [§3 Restaurant config](#3-restaurant-config) |
| `Migration failed` / Prisma migrate errors | 4 | [§4 Database & Prisma](#4-database--prisma) |
| `Database tables are missing after migration` | 4 | [§4 Database & Prisma](#4-database--prisma) |
| `Cannot find module '@/generated/prisma'` | 4 | [§4 Database & Prisma](#4-database--prisma) |
| Login fails / wrong password | 5 | [§5 Login & accounts](#5-login--accounts) |
| `Failed to ensure platform admin` | 5 | [§5 Login & accounts](#5-login--accounts) |
| Port 3000 already in use / `EADDRINUSE` | 6 | [§6 Dev server & build](#6-dev-server--build) |
| `next build` / TypeScript errors | 6 | [§6 Dev server & build](#6-dev-server--build) |
| QR opens wrong URL / phone can't connect | 7 | [§7 QR & guest access](#7-qr--guest-access) |
| Guest check-in blocked / can't order | 7 | [§7 QR & guest access](#7-qr--guest-access) |
| `FEATURE_DISABLED` / premium button missing | 8 | [§8 Premium features](#8-premium-features) |
| Docker postgres won't start / migrate fails | 9 | [§9 Docker](#9-docker) |
| `Restaurant not found` on webhook | 10 | [§10 Aggregators & webhooks](#10-aggregators--webhooks) |
| Presentation script fails | 11 | [§11 Presentation](#11-presentation-deck) |

---

## 0. Prerequisites

### Error: `node: command not found`

**Cause:** Node.js not installed or not on `PATH`.

**Fix:**

```bash
# Install Node 20+ (nvm example)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
nvm install 22
nvm use 22
```

Or use your OS package manager / [nodejs.org](https://nodejs.org).

---

### Error: `The engine "node" is incompatible` / unexpected syntax errors

**Cause:** Node version too old (need **20+**, 22 recommended).

**Fix:**

```bash
node -v   # upgrade if below v20
```

---

### Error: `git: command not found`

**Cause:** Git not installed.

**Fix:** Install git, then clone again.

---

### Error: `python3` / `make` / `g++` missing during native module build

**Cause:** `better-sqlite3` compiles native code on install.

**Fix (Linux):**

```bash
sudo apt-get update
sudo apt-get install -y python3 make g++ build-essential
npm install
```

**Fix (macOS):** Install Xcode Command Line Tools: `xcode-select --install`

---

## 1. npm install

### Error: `npm ERR! code EACCES` / permission denied

**Cause:** Global npm permissions or writing to protected directories.

**Fix:** Do not use `sudo npm install`. Fix npm prefix or use nvm:

```bash
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
# add ~/.npm-global/bin to PATH, then retry
npm install
```

---

### Error: `better-sqlite3` / `node-gyp` build failed

**Symptoms:**

```
Error: Could not locate the bindings file
gyp ERR! build error
```

**Cause:** Missing build tools or Node ABI mismatch after Node upgrade.

**Fix:**

```bash
# Install build tools (see §0), then:
rm -rf node_modules package-lock.json
npm install
npm rebuild better-sqlite3
```

If you upgraded Node recently:

```bash
rm -rf node_modules
npm install
```

---

### Error: `npm install` hangs or network timeout

**Fix:**

```bash
npm config set fetch-retries 5
npm config set fetch-retry-mintimeout 20000
npm install
```

Use a stable network or corporate npm mirror if applicable.

---

### Error: `prisma generate` fails during postinstall

**Symptoms:**

```
Error: Could not find Prisma Schema
Prisma schema validation
```

**Cause:** Corrupt checkout or wrong working directory.

**Fix:**

```bash
cd /path/to/tabletap   # repo root, must contain prisma/schema.prisma
npm install
npx prisma generate
```

---

## 2. Environment (.env)

### Error: App works on laptop but `.env` seems missing

**Cause:** `.env` is git-ignored; created automatically by `scripts/ensure-env.js` on first `npm run dev` or `init-db`.

**Fix:**

```bash
cp .env.example .env
# or just run:
npm run dev   # creates .env if absent
```

---

### Error: Sessions invalid after restart / login loops

**Cause:** `JWT_SECRET` or `TABLE_ACCESS_SECRET` changed between runs, invalidating cookies.

**Fix:** Clear browser cookies for the app URL, or set stable secrets in `.env`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# paste into JWT_SECRET and TABLE_ACCESS_SECRET in .env
```

Restart dev server after editing `.env`.

---

### Error: Production deploy — default secrets in use

**Symptoms:** Security risk; sessions predictable.

**Cause:** Still using placeholder values from `.env.example`.

**Fix:** Set before `npm run build`:

```bash
JWT_SECRET="<64-char-random>"
TABLE_ACCESS_SECRET="<64-char-random>"
TABLETAP_CREDENTIALS_KEY="<64-char-random>"   # if using Swiggy/Zomato
NEXT_PUBLIC_APP_URL="https://your-domain.com"
```

---

### Error: `dotenv` / env vars not picked up

**Cause:** Running commands from wrong directory or `.env` not at repo root.

**Fix:**

```bash
cd /path/to/tabletap
cat .env    # verify file exists
npm run dev
```

For one-off scripts:

```bash
export $(grep -v '^#' .env | xargs)   # Linux
npx tsx scripts/enable-premium-features.ts --slug varanasi --all
```

---

## 3. Restaurant config

### Error: `No restaurant config found. Create restaurant.config.json...`

**Cause:** No config file at expected paths.

**Fix (pick one):**

```bash
npm run setup                                    # interactive wizard
cp restaurant.config.example.json restaurant.config.json
npm run config:validate
npm run db:reset
```

Resolution order: `RESTAURANT_CONFIG` env → `restaurant.config.json` → `restaurant.config.example.json`

---

### Error: `Config not found: ...` (setup --from)

**Cause:** Wrong path passed to `--from`.

**Fix:**

```bash
npm run setup -- --from restaurant.config.example.json
# or
npm run setup -- --from examples/pistahouse.config.json
```

Path is relative to repo root.

---

### Error: `Failed to parse restaurant config at ...: Unexpected token`

**Cause:** Invalid JSON (trailing comma, bad quotes).

**Fix:**

```bash
npm run config:validate
# or validate JSON with:
node -e "JSON.parse(require('fs').readFileSync('restaurant.config.json'))"
```

Use a JSON linter; copy from `restaurant.config.example.json` and edit carefully.

---

### Error: `restaurant.slug ... is required`

**Cause:** Missing or empty `restaurant.name` / `restaurant.slug`.

**Fix:** Add to config:

```json
"restaurant": {
  "name": "My Restaurant",
  "slug": "my-restaurant"
}
```

Slug must be lowercase alphanumeric + hyphens.

---

### Error: `At least one owner is required in staff.owners`

**Cause:** Empty `staff.owners` array.

**Fix:**

```json
"staff": {
  "domain": "myrestaurant.com",
  "defaultPassword": "changeme123",
  "owners": [{ "name": "Owner Name", "email": "owner@myrestaurant.com", "password": "changeme123" }]
}
```

---

## 4. Database & Prisma

### Error: `Migration failed. Run: npm run db:reset`

**Symptoms:** During `npm run dev`, `init-db.js`, or `npm run db:setup`.

**Common causes & fixes:**

| Cause | Fix |
|-------|-----|
| Fresh clone, no DB yet | `npm run db:reset` |
| Corrupt SQLite file | `npm run db:reset` |
| Schema drift / old migrations | `npm run db:reset` (dev only) |
| Wrong schema for DATABASE_URL | See Postgres mismatch below |

**Dev reset (SQLite — deletes all data):**

```bash
npm run db:reset
```

---

### Error: `Database tables are missing after migration`

**Cause:** Migration ran but tables not created (wrong DB file, permissions, interrupted migrate).

**Fix:**

```bash
npm run db:reset
# If still failing:
rm -f dev.db dev.db-journal dev.db-wal dev.db-shm
npm run db:setup
```

---

### Error: `Cannot find module '@/generated/prisma'` or `@/generated/prisma/client`

**Cause:** Prisma client not generated.

**Fix:**

```bash
npx prisma generate
npm run dev
```

---

### Error: SQLite vs Postgres mismatch

**Symptoms:**

```
Error validating datasource `db`: the URL must start with the protocol `postgresql://`
Can't reach database server at `postgres:5432`
```

**Cause:** `DATABASE_URL` points to Postgres but `PRISMA_SCHEMA` still defaults to SQLite (or vice versa).

**Fix for local SQLite (default):**

```bash
# .env
DATABASE_URL="file:./dev.db"
# unset PRISMA_SCHEMA and PRISMA_MIGRATIONS
npm run db:reset
```

**Fix for Postgres:**

```bash
export DATABASE_URL="postgresql://user:pass@localhost:5432/tabletap"
export PRISMA_SCHEMA="prisma/schema.postgres.prisma"
export PRISMA_MIGRATIONS="prisma/migrations-postgres"
npx prisma migrate deploy
npx tsx prisma/seed.ts
```

---

### Error: Postgres `relation does not exist` / migration not applied

**Fix:**

```bash
export DATABASE_URL="postgresql://..."
export PRISMA_SCHEMA="prisma/schema.postgres.prisma"
export PRISMA_MIGRATIONS="prisma/migrations-postgres"
npx prisma migrate deploy
```

---

### Error: Seed runs but restaurant is wrong / stale data

**Cause:** Seed skipped because owner account already exists with different config password.

**Fix:**

```bash
npm run db:reset    # full wipe + re-seed from current restaurant.config.json
```

Or change owner password in config to match DB, or delete `dev.db` manually.

---

### Error: `Seed skipped; database already has restaurant data` (Docker)

**Cause:** `SEED_IF_EMPTY=true` and DB not empty.

**Fix (intentional — keeps prod data):** Mount updated `restaurant.config.json` and run seed manually only if needed.

**Fix (fresh Docker start):**

```bash
docker compose down -v
docker compose up --build
```

---

## 5. Login & accounts

### Error: Staff login returns "Invalid credentials"

**Checks:**

1. Use credentials from **your** `restaurant.config.json`, not docs defaults
2. Demo defaults (example config): `owner@varanasi.com` / `admin123`
3. Staff login is at `/` — **not** `/platform/login`

**Fix after config change:**

```bash
npm run db:reset
```

---

### Error: Platform admin login fails at `/platform/login`

**Checks:**

1. Use `platformAdmin.email` / `platformAdmin.password` from config
2. Demo: `admin@varanasi.com` / `admin@varanasi`
3. This is a **different** account from staff owner

**Fix:**

```bash
npx tsx scripts/ensure-platform-admin.ts
```

---

### Error: `Failed to ensure platform admin: ...`

**Cause:** DB not migrated, Prisma client missing, or config load failed.

**Fix:**

```bash
npm run db:setup
npx tsx scripts/ensure-platform-admin.ts
```

Fix underlying migration/config error first (see §3–§4).

---

### Error: Login works but dashboard empty / 401 on API calls

**Cause:** Cookie not set (wrong URL), HTTPS mismatch, or secret changed mid-session.

**Fix:**

- Use same host as `NEXT_PUBLIC_APP_URL` (don't mix `localhost` and `127.0.0.1`)
- Clear cookies and log in again
- In production, ensure HTTPS and `secure` cookies work

---

## 6. Dev server & build

### Error: `EADDRINUSE: address already in use :::3000`

**Cause:** Another process on port 3000.

**Fix:**

```bash
# Find and kill (Linux)
lsof -i :3000
kill -9 <PID>

# Or use another port
PORT=3001 npm run dev
# update NEXT_PUBLIC_APP_URL accordingly for QR testing
```

---

### Error: `next build` / TypeScript errors

**Fix:**

```bash
npx prisma generate
npm run build
```

Ensure Node 20+ and clean install:

```bash
rm -rf node_modules .next
npm install
npm run build
```

---

### Error: `Module not found: Can't resolve 'pg'`

**Cause:** Rare — Postgres adapter loaded but `pg` not installed.

**Fix:**

```bash
npm install pg @prisma/adapter-pg
```

(Normally bundled; only if using Postgres `DATABASE_URL`.)

---

### Error: Dev server starts but page is blank / 500

**Fix:**

```bash
DEBUG=1 npm run dev
# check terminal for stack trace
npm run db:reset
```

Check logs under `logs/` if crash handler wrote a dump.

---

## 7. QR & guest access

### Error: Phone can't open QR link / connection refused

**Cause:** `NEXT_PUBLIC_APP_URL` is `localhost` — phones can't reach your laptop's localhost.

**Fix:**

```bash
# Find LAN IP
hostname -I          # Linux
ipconfig getifaddr en0   # macOS

# .env
NEXT_PUBLIC_APP_URL=http://192.168.1.25:3000

# Restart dev server, re-print QR codes from admin
npm run dev
```

Phone must be on **same Wi-Fi**. Firewall must allow port 3000.

---

### Error: QR shows old/wrong URL after changing .env

**Cause:** QR codes embed URL at generation time; Next.js bakes `NEXT_PUBLIC_*` at build for production.

**Fix:**

- **Dev:** Restart `npm run dev`, regenerate/print QR from Admin → QR codes
- **Prod:** Set `NEXT_PUBLIC_APP_URL` **before** `npm run build`, redeploy, reprint QR

---

### Error: Guest sees check-in page but can't order

**Cause:** Staff hasn't **opened the table** yet (anti-misuse).

**Fix:**

1. Staff dashboard → select table → **Open ordering**
2. Guest scans QR again or refreshes

---

### Error: `Table not found` / invalid QR token

**Cause:** DB reset changed table tokens; old printed QR outdated.

**Fix:** Reprint QR codes from Admin → QR codes after `db:reset`.

---

### Error: Guest hit session limit

**Cause:** `defaultMaxSessions` exceeded for table.

**Fix:** Staff closes old sessions or increase limit in config + re-seed, or wait for table close.

---

## 8. Premium features

### Error: API returns `403` with `code: FEATURE_DISABLED`

**Cause:** Premium module not enabled for restaurant.

**Fix:**

```bash
npx tsx scripts/enable-premium-features.ts --slug YOUR_SLUG --all
# or specific:
npx tsx scripts/enable-premium-features.ts --slug YOUR_SLUG --features kds,aggregator_inbox
```

Or enable in `/platform/login` → Premium features tab.

Wait ~10 seconds for cache refresh.

---

### Error: `/kitchen` redirects to dashboard

**Cause:** `kds` premium flag off.

**Fix:** Enable `kds` (see above).

---

### Error: Integrations page 403 / not visible

**Cause:** `aggregator_inbox` not enabled.

**Fix:**

```bash
npx tsx scripts/enable-premium-features.ts --slug YOUR_SLUG --features aggregator_inbox
```

---

### Error: `Restaurant not found: varanasi` (CLI enable script)

**Cause:** Wrong slug or DB not seeded.

**Fix:**

```bash
# Check slug in restaurant.config.json → restaurant.slug
npm run db:reset
npx tsx scripts/enable-premium-features.ts --slug CORRECT_SLUG --all
```

---

## 9. Docker

### Error: `postgres` container unhealthy

**Fix:**

```bash
docker compose logs postgres
# Check POSTGRES_PASSWORD, disk space, port 5432 conflict
docker compose down -v
docker compose up --build
```

---

### Error: `migrate` container exits with error

**Symptoms:** `app` never starts; migrate logs show Prisma errors.

**Fix:**

```bash
docker compose logs migrate
# Common: restaurant.config.json missing in image — copy before build:
cp restaurant.config.example.json restaurant.config.json
docker compose up --build
```

Ensure `JWT_SECRET`, `TABLE_ACCESS_SECRET`, `NEXT_PUBLIC_APP_URL` exported before `docker compose up`.

---

### Error: Docker app up but login fails

**Cause:** Seed used different config than expected, or `SEED_IF_EMPTY` skipped seed.

**Fix:**

```bash
docker compose exec app npx tsx scripts/ensure-platform-admin.ts
# Full reset:
docker compose down -v && docker compose up --build
```

---

### Error: Phone can't reach Docker on `:3000`

**Cause:** Firewall or binding issue.

**Fix:** Compose binds `0.0.0.0:3000` by default. Use host LAN IP, not `localhost`, on phone. Open firewall port 3000.

---

## 10. Aggregators & webhooks

### Error: Webhook returns `401 Unauthorized`

**Cause:** Wrong bearer token.

**Fix:** Use webhook secret from Admin → Integrations (not API key). Header: `Authorization: Bearer <webhook-secret>`

---

### Error: Webhook returns `404 Restaurant not found`

**Cause:** Slug in URL doesn't match `restaurant.slug` in config/DB.

**Fix:** URL must be `/api/webhooks/swiggy/{slug}` where `{slug}` matches seeded restaurant.

---

### Error: `MENU_MAPPING_FAILED` / no items matched

**Cause:** Swiggy/Zomato item IDs don't match menu.

**Fix:** Set `swiggyItemId` / `zomatoItemId` on menu items or match names exactly.

---

### Error: Integrations shows `lastError` for menu sync / status push

**Cause:** Partner API not activated, wrong API key, or wrong endpoint paths.

**Fix:** Complete partner onboarding; override paths via env vars (see **AGGREGATOR_SETUP.md**).

---

## 11. Presentation deck

### Error: `ModuleNotFoundError: No module named 'pptx'`

**Fix:**

```bash
pip install python-pptx
python3 scripts/build-visual-pptx.py
```

---

### Error: `Cannot find module 'playwright'` (npm run presentation)

**Fix:**

```bash
npm i -D playwright
npx playwright install chromium
npm run dev    # must be running in another terminal
npm run presentation
```

---

### Error: Presentation screenshots blank / login timeout

**Cause:** Dev server not running or demo credentials don't match config.

**Fix:**

```bash
npm run db:reset
npm run dev
# Verify owner@varanasi.com / admin123 works in browser first
npm run presentation
```

---

## 12. Step-by-step recovery (nuclear option)

When multiple things are broken and you just want a **clean dev bring-up**:

```bash
cd /path/to/tabletap

# 1. Clean artifacts
rm -rf node_modules .next dev.db dev.db-journal dev.db-wal dev.db-shm

# 2. Reinstall
npm install

# 3. Env
cp .env.example .env
# edit NEXT_PUBLIC_APP_URL if needed

# 4. Config
cp restaurant.config.example.json restaurant.config.json

# 5. Database
npm run db:reset

# 6. Start
npm run dev
```

Open `http://localhost:3000` → `owner@varanasi.com` / `admin123`

---

## 13. Verification checklist (app fully up)

Run through this after bring-up:

| # | Check | How |
|---|-------|-----|
| 1 | Dependencies installed | `ls node_modules/.bin/next` exists |
| 2 | Prisma client generated | `ls src/generated/prisma` exists |
| 3 | `.env` present | `cat .env` shows DATABASE_URL, JWT_SECRET |
| 4 | Config valid | `npm run config:validate` |
| 5 | DB migrated | `npm run db:setup` exits 0 |
| 6 | Staff login | `/` with owner credentials |
| 7 | Platform admin | `/platform/login` with admin credentials |
| 8 | Open table | Staff dashboard → open Table 1 |
| 9 | Guest order | Scan QR → check-in → add item → place order |
| 10 | Kitchen sees order | Staff dashboard shows active order |
| 11 | (Optional) Premium | Enable KDS / integrations as needed |

---

## 14. Still stuck?

1. Run with debug: `DEBUG=1 npm run dev`
2. Check terminal output during `npm run db:reset`
3. Confirm versions: `node -v`, `npm -v`, `npx prisma -v`
4. Search this file for your exact error substring (Ctrl+F)
5. See **[SETUP_GUIDE.md](./SETUP_GUIDE.md)** §13 for runtime troubleshooting

Report new errors: add them to this doc under the matching phase so the next person finds them faster.
