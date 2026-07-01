# TableTap Restaurant OS — Architecture

TableTap is a **Restaurant Operating System**: customer ordering, waiter workflow, kitchen, billing, printing, inventory, analytics, staff, and integrations — unified under a tenant hierarchy.

## Hierarchy (foundational)

Every operational entity is scoped to:

```
Tenant (billing, subscription, plan)
  └── Restaurant (brand, menu, feature flags, slug)
        └── Branch (physical location — timezone, address)
              └── Floor (Ground, First, Patio, …)
                    └── Table (QR, layout coordinates, ordering)
```

| Layer | Model | Notes |
|-------|--------|--------|
| Tenant | `Tenant` | SaaS billing; one tenant may own many restaurants |
| Restaurant | `Restaurant` | Menu, staff slots, integrations |
| Branch | `Branch` | Default `Main` branch auto-created |
| Floor | `Floor` | Default `Ground Floor` per branch |
| Table | `Table` | `positionX/Y`, `section` for floor-plan UI |

**Resolution:** `src/platform/tenant-context.ts` + `src/platform/hierarchy.ts`  
**Backfill:** `scripts/backfill-tenant-branches.ts` → `scripts/backfill-hierarchy.ts` (runs on `npm run db:setup`)

## Domain modules (Phase D)

Business capabilities live under `src/domains/`:

| Module | Path | Owns |
|--------|------|------|
| orders | `domains/orders/` | State machine, transitions |
| tables | `domains/tables/` | Floor hierarchy, floor plan |
| payments | `domains/payments/` | Reconciliation |
| kitchen | `domains/kitchen/` | KDS tickets, capacity |
| menu | `domains/menu/` | Modifiers, promotions |
| staff | `domains/staff/` | Permissions, performance |
| customers | `domains/customers/` | CRM, guest requests |
| analytics | `domains/analytics/` | Events, forecasts |
| printing | `domains/printing/` | Print jobs, ack/retry |
| aggregators | `domains/aggregators/` | Swiggy/Zomato |

API routes in `src/app/api/*` delegate to domain services. Legacy `src/lib/*` re-exports remain for compatibility.

## Order state machine (Phase B)

Explicit item transitions in `domains/orders/state-machine.ts`:

```
PENDING → PREPARING → READY → SERVED
         ↘ UNAVAILABLE ↗
```

Aggregate order status is derived from items. Invalid transitions return HTTP 409.  
Lifecycle mapping: `PENDING`≈CREATED, `PREPARING`≈COOKING, `READY`, `SERVED`, `paidAt`≈PAID.

## Event bus (Phase C)

Pub/sub in `src/platform/event-bus/`:

1. `publishPlatformEvent()` persists to `PlatformEvent`
2. Subscribers handle side effects independently:
   - `subscribers/notifications.ts` — push/SMS
   - `subscribers/printing.ts` — kitchen chit print queue
   - `subscribers/analytics.ts` — logging / future rollups

Set `EVENT_BUS_INLINE=1` for synchronous dispatch (dev/tests).

## Configuration (Phase E)

| Config | Location |
|--------|----------|
| Runtime env | `src/config/app-config.ts` (Zod validation) |
| Restaurant bootstrap | `restaurant.config.json` via `scripts/restaurant-config.js` |
| Validate | `npm run config:validate:app` |

Startup validation runs in `src/instrumentation.node.ts` (strict in production).

## Offline sync (Phase F)

| Feature | Implementation |
|---------|----------------|
| Order queue | IndexedDB `tabletap-offline` v2 |
| Menu cache | 24h staff menu in IndexedDB |
| Modes | Walk-in, takeaway, delivery |
| Sync API | `POST /api/offline/sync` with `clientId` dedup |

## Printing (Phase F)

| Feature | Implementation |
|---------|----------------|
| Print jobs | `PrintJob` model with `ackToken` |
| Agent | `services/printer-agent/` |
| Ack | `POST /api/print/ack` |
| Retry | `POST /api/print/retry` + `npm run worker` |

## Payments reconciliation (Phase F)

- `POST /api/payments/reconciliation` — run daily reconcile
- `GET /api/payments/reconciliation` — history
- Model: `PaymentReconciliation` (expected vs received vs variance)

## Background workers (Phase F)

| Component | Command |
|-----------|---------|
| Job queue | DB-backed `BackgroundJob`; inline or cron |
| Worker process | `npm run worker` |
| Process jobs | `POST /api/jobs/process` |

## PostgreSQL production

```bash
export DATABASE_URL="postgresql://..."
export PRISMA_SCHEMA=prisma/schema.postgres.prisma
export PRISMA_MIGRATIONS=prisma/migrations-postgres
npm run db:setup
```

Docker: `docker compose up` (Postgres + Redis).

## Health & monitoring

`GET /api/health` — DB, Redis, migrations, optional job processing.

## Key scripts

| Script | Purpose |
|--------|---------|
| `npm run db:setup` | Migrate + seed + hierarchy backfill |
| `npm run worker` | Background job + print retry loop |
| `npm run printer:agent` | Local ESC/POS relay |
| `npm run config:validate:app` | Validate env config |
| `npm run presentation` | Owner PPT + screenshots |

## Testing & validation

See [TESTING.md](./TESTING.md) for step-by-step validation commands.

See [MULTI_TENANT.md](./MULTI_TENANT.md) for multi-restaurant configs, tenant admin, domains, and billing.
