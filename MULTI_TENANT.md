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

TableTap does **not** require separate domains per restaurant in v1. Routing is **path-based**:

| Actor | How restaurant is selected |
|-------|---------------------------|
| Guest | `restaurant.slug` in URL path |
| Staff | `user.restaurantId` from login session |
| Platform admin | Sees all tenants; filters in UI |

### Environment

| Variable | Controls |
|----------|----------|
| `NEXT_PUBLIC_APP_URL` / `app.url` in config | Base URL embedded in QR codes |
| `RESTAURANT_CONFIG` | Which tenant/restaurants to seed |
| `DATABASE_URL` | Shared database for all tenants |

### Future: custom domains (not implemented)

You could map `pistahouse.com` → slug `pistahouse` via reverse proxy + middleware. Today, use one app URL with slug paths.

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
