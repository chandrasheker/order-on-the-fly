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
xyz.dvadtech.in  →  Restaurant.slug = xyz
```

The hostname is an **authoritative security boundary**. A request on `abc.dvadtech.in` cannot read or operate on `xyz` data, even with a copied JWT or a valid XYZ QR/order id.

| Actor | How restaurant is selected |
|-------|---------------------------|
| Guest / staff on `{slug}.{TENANT_BASE_DOMAIN}` | Hostname slug (path slug must match) |
| Guest on reserved host (`localhost`, apex) | Path `/order/{slug}/...` (legacy / local) |
| Staff on reserved host | Session `restaurantId` (local `npm run dev`) |
| Platform admin | Cross-tenant; `/platform` on apex/`www`/`platform` |

### Production

1. DNS: `*.dvadtech.in` → the same app host
2. TLS: wildcard (or SAN) certificate
3. Reverse proxy: one Caddy/Nginx site, **preserve `Host`** — see `scripts/deploy/nginx-wildcard-subdomain.conf`
4. Env: `TENANT_BASE_DOMAIN=dvadtech.in` (required — production startup fails closed without it)
5. Env: a strong `JWT_SECRET` (production rejects missing, placeholder, and weak values)
6. Optional: `TENANT_APEX_RESTAURANT=1` if this install must keep staff login and path/QR on the apex hostname (single public host, no restaurant DNS yet). Default is off.

Do **not** trust `X-Forwarded-Host` unless the proxy overwrites it and the Node port is not public (`TRUST_FORWARDED_HOST=1`).

Unknown / disabled / malformed restaurant hosts fail closed (`404 Not found`). There is no default restaurant fallback. Production raw IPs and hosts that are not `{slug}.{TENANT_BASE_DOMAIN}` are not a restaurant path/session bypass.

The configured apex (`TENANT_BASE_DOMAIN` and `www.{domain}`) serves a directory page at `/` so the marketing host is not a raw 404. Staff login and restaurant APIs stay off that apex unless `TENANT_APEX_RESTAURANT=1`. The Nginx sample includes a default catch-all that rejects unknown hosts instead of forwarding them to the app.

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
| `NEXT_PUBLIC_APP_URL` / `app.url` in config | Fallback base URL when `TENANT_BASE_DOMAIN` is unset |
| `TENANT_BASE_DOMAIN` | Apex used for `{slug}.{domain}` (e.g. `dvadtech.in`) |
| `TENANT_APEX_RESTAURANT` | `1` to allow path/session restaurant scoping on that apex only |
| `TENANT_PUBLIC_PROTOCOL` / `TENANT_PUBLIC_PORT` | QR URL scheme/port (local: `http` + `3000`) |
| `TRUST_FORWARDED_HOST` | `1` to read a single `X-Forwarded-Host` (proxy-only) |
| `RESTAURANT_CONFIG` | Which tenant/restaurants to seed |
| `DATABASE_URL` | Shared database for all tenants |

Existing slugs that are not valid DNS labels are **not** auto-renamed. Run `npm run slugs:check` and migrate those restaurants explicitly.

QR codes use `https://{slug}.{TENANT_BASE_DOMAIN}/order/{slug}/{token}/check-in` when the base domain is set. Path `/order/{slug}/...` is unchanged.

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
