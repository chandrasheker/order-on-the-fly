# Multi-tenant & multi-restaurant guide

One TableTap **application instance** + **one database** can serve many restaurants grouped under tenants.

## Hierarchy

```
Tenant (billing, subscription)
  └── Restaurant (brand, menu, staff, slug)
        └── Branch (location)
              └── Floor
                    └── Table (QR token)
```

## Config-driven bringup

Set `RESTAURANT_CONFIG` to an example file (or copy into `restaurant.config.json`):

| Config | Restaurants | Command |
|--------|-------------|---------|
| 1 | `examples/tenant-single.config.json` | `npm run db:setup:single` |
| 2 | `examples/tenant-dual.config.json` | `npm run db:setup:dual` |
| 3 | `examples/tenant-triple.config.json` | `npm run db:setup:triple` |
| 4 | `examples/tenant-quad.config.json` | `npm run db:setup:quad` |

Or manually:

```bash
RESTAURANT_CONFIG=examples/tenant-dual.config.json npm run db:reset
npm run dev
```

### Config formats

**Legacy single** (still supported):

```json
{
  "restaurant": { "name": "...", "slug": "..." },
  "staff": { ... },
  "menu": [ ... ]
}
```

**Multi-tenant bundle** (recommended):

```json
{
  "tenant": { "name": "Food Group", "slug": "foodgroup", "plan": "PRO", "billingEmail": "..." },
  "platformAdmin": { "email": "admin@foodgroup.com", "password": "..." },
  "restaurants": [
    {
      "name": "Location A",
      "slug": "location-a",
      "tableCount": 10,
      "staff": { ... },
      "menu": [ ... ],
      "branches": [{ "name": "Main", "slug": "main", "floors": [{ "name": "Ground Floor", "slug": "ground" }] }]
    }
  ]
}
```

Seed creates **one tenant** and **all restaurants** with branches, floors, tables, staff, and menu.

Regenerate examples: `node scripts/generate-example-configs.mjs`

## Who controls what

### 1. Platform super admin (`/platform/login`)

Global control across **all tenants**:

| Page | URL | Purpose |
|------|-----|---------|
| Staff & features | `/platform` | Per-restaurant staff slots, premium toggles |
| Tenants | `/platform/tenants` | Cross-restaurant overview, add restaurant/branch |
| Billing | `/platform/billing` | Plan upgrades, subscription history |

APIs: `GET/POST /api/platform/tenants`, `GET /api/platform/tenants/[id]/overview`, `GET/POST /api/platform/billing`

### 2. Tenant self-signup (`/tenant/signup`)

Public wizard creates:

- Tenant + trial subscription
- First restaurant + Main branch + Ground floor
- Owner staff account + tables

API: `POST /api/tenant/signup`

### 3. Restaurant staff (`/` login)

Each staff user belongs to **one restaurant** (`user.restaurantId`). Login email determines which restaurant dashboard they see.

There is no staff-side restaurant switcher yet — use separate owner accounts per restaurant (e.g. `owner@pistahouse-dt.local` vs `owner@pistahouse-ap.local` in dual config).

### 4. Guest / customer (no login)

Guests never pick a tenant. They use **restaurant slug** in the URL:

```
{APP_URL}/order/{restaurant-slug}/{table-qr-token}/check-in
{APP_URL}/order/{restaurant-slug}/{table-qr-token}
```

Each restaurant has unique slugs and QR tokens (`{slug}-table-1`, etc.).

## Domain & URL control

One Next.js deployment + one database. Restaurant **slug** is the subdomain:

```
abc.dvadtech.in  →  Restaurant.slug = abc
xyz.oof.dvadtech.in  →  Restaurant.slug = xyz
xyz.dvadtech.in      →  same slug (legacy compatibility host)
```

The hostname is an **authoritative security boundary**. A request on `abc.oof.dvadtech.in` cannot read or operate on `xyz` data, even with a copied JWT or a valid XYZ QR/order id. Canonical and legacy hosts for the **same slug** resolve the same restaurant.

| Actor | How restaurant is selected |
|-------|---------------------------|
| Guest / staff on `{slug}.oof.{TENANT_BASE_DOMAIN}` (canonical) or `{slug}.{TENANT_BASE_DOMAIN}` (legacy) | Hostname slug (path slug must match) |
| Guest on reserved host (`localhost`, apex) | Path `/order/{slug}/...` (legacy / local) |
| Staff on reserved host | Session `restaurantId` (local `npm run dev`) |
| Platform admin | Cross-tenant data on the exact apex host only (`https://dvadtech.in/oof/platform`). Restaurant hosts return opaque 404 for `/oof/platform`, `/platform`, and `/api/platform/**`. |

### Production

See `docs/oof-domain-migration.md` for DNS/TLS/Nginx and the legacy-host transition.

1. DNS: `dvadtech.in`, `oof.dvadtech.in`, `*.oof.dvadtech.in`, and (temporarily) `*.dvadtech.in` → the same app host
2. TLS: SANs must include `oof.dvadtech.in` and `*.oof.dvadtech.in` (a `*.dvadtech.in` wildcard does not cover them)
3. Reverse proxy: one Caddy/Nginx site, **preserve `Host`** — see `scripts/deploy/nginx-wildcard-subdomain.conf`
4. Env: `TENANT_BASE_DOMAIN=dvadtech.in` (required — production startup fails closed without it)
5. Env: `OOF_BASE_DOMAIN=oof.dvadtech.in` (or omit to derive `oof.${TENANT_BASE_DOMAIN}`)
6. Env: a strong `JWT_SECRET` (production rejects missing, placeholder, and weak values)
7. Optional: `TENANT_APEX_RESTAURANT=1` if this install must keep staff login and path/QR on the apex hostname (single public host, no restaurant DNS yet). Default is off.

Do **not** trust `X-Forwarded-Host` unless the proxy overwrites it and the Node port is not public (`TRUST_FORWARDED_HOST=1`).

Unknown / disabled / malformed restaurant hosts fail closed (`404 Not found`). There is no default restaurant fallback. `abc.oof.dvadtech.in` / `abc.dvadtech.in` only work if a restaurant with slug `abc` exists and has a tenant. `GET /api/health` reports the current Host classification (`UNKNOWN_SUBDOMAIN`, `INVALID_HIERARCHY`, …). `npm run hosts:list` prints canonical and legacy hosts. Production raw IPs and hosts that are not OOF or legacy restaurant forms are not a restaurant path/session bypass.

Production apex `GET /` is the DVADTech company landing. `/oof` is the Order-on-the-Fly product page. Platform UI is `/oof/platform` (legacy `/platform` redirects there). `/api/platform/**` stays on the apex only (and on bare localhost in development). Restaurant hosts 404 `/oof`, `/oof/platform`, `/platform`, and `/api/platform` even with a copied platform-admin cookie. `www` permanently redirects to the apex. `oof.dvadtech.in` redirects to `https://dvadtech.in/oof`. Cookies stay host-only. Nginx must preserve `Host` (`proxy_set_header Host $host`). The Nginx sample includes a default catch-all that rejects unknown hosts instead of forwarding them to the app.

### Local development

| Host | Behavior |
|------|----------|
| `abc.localhost:3000` | Strict restaurant host for slug `abc` (add `127.0.0.1 abc.localhost` to `/etc/hosts` if needed) |
| `localhost:3000` | Reserved — existing path-based QR and session login still work |
| `127.0.0.1:3000` | Reserved |

Production validation is not relaxed for localhost. `{slug}.localhost` is as strict as `{slug}.dvadtech.in`.

### Environment

| Variable | Controls |
|----------|----------|
| `NEXT_PUBLIC_APP_URL` / `APP_URL` / `app.url` in config | Public browser hostname (also treated as an apex) and QR fallback |
| `TENANT_BASE_DOMAIN` | Company apex (e.g. `dvadtech.in`) |
| `OOF_BASE_DOMAIN` | Canonical restaurant/tenant suffix (e.g. `oof.dvadtech.in`); derived if unset |
| `TENANT_APEX_RESTAURANT` | `1` to allow path/session restaurant scoping on that apex only |
| `TENANT_PUBLIC_PROTOCOL` / `TENANT_PUBLIC_PORT` | QR URL scheme/port (local: `http` + `3000`) |
| `TRUST_FORWARDED_HOST` | `1` to read a single `X-Forwarded-Host` (proxy-only) |
| `RESTAURANT_CONFIG` | Which tenant/restaurants to seed |
| `DATABASE_URL` | Shared database for all tenants |
| `MENU_MEDIA_STORAGE` | `local` or `s3` for M6 menu-item food photos |
| `MENU_MEDIA_LOCAL_DIR` | Persistent local media directory (default `.data/menu-media`) |
| `MENU_MEDIA_S3_*` | Bucket/region/keys/optional endpoint for S3-compatible storage |

Menu photos are served at `/api/menu/media/{menuItemId}?v={revision}` and are hostname-scoped: `abc.dvadtech.in` cannot read XYZ’s images. Uploads stay on the restaurant host and use the existing OWNER/MANAGER menu permission. Cleanup: `npm run menu-media:cleanup` (dry-run) or `-- --apply`. JPEG/PNG/WebP, 5 MiB max.

Existing slugs that are not valid DNS labels are **not** auto-renamed. Run `npm run slugs:check` and migrate those restaurants explicitly.

QR codes use `https://{slug}.{OOF_BASE_DOMAIN}/order/{slug}/{token}/check-in` when the operational domain is set. Legacy printed QRs on `{slug}.{TENANT_BASE_DOMAIN}` still resolve. Path `/order/{slug}/...` is unchanged.

## Billing

- Plans: `STARTER`, `PRO`, `ENTERPRISE` on `Tenant`
- Trial on signup; platform admin upgrades via `/platform/billing`
- History in `TenantSubscription` table

## Quick validation (dual restaurant)

```bash
RESTAURANT_CONFIG=examples/tenant-dual.config.json npm run db:reset
npm run dev
```

Logins (from generated config):

- Platform admin: `admin@twineats.com` / `admin123`
- Restaurant 1 owner: `owner@pistahouse-dt.local` / `admin123`
- Restaurant 2 owner: `owner@pistahouse-ap.local` / `admin123`

Guest URLs:

- `/order/pistahouse-dt/pistahouse-dt-table-1/check-in`
- `/order/pistahouse-ap/pistahouse-ap-table-1/check-in`

Platform admin → **Tenants** → see both under **Twin Eats Group**.
