# TableTap Platform Architecture (Phases 1–4)

This document describes the production architecture implemented across roadmap phases.

## Hierarchy (Phase 2)

```
Tenant (billing, subscription)
  └── Restaurant (brand, feature flags)
        └── Branch (physical location — tables, KDS, staff scope)
              └── Tables, orders, kitchen stations
```

Existing single-restaurant deployments auto-migrate: each restaurant gets a 1:1 `Tenant` and a default `Main` branch via `scripts/backfill-tenant-branches.ts`.

## Phase 1 — Production foundation

| Component | Location | Notes |
|-----------|----------|-------|
| Health check | `GET /api/health` | DB, Redis, migration version |
| Rate limiting | `src/middleware.ts` | Login + guest order POST |
| Security headers | Middleware | X-Frame-Options, nosniff, etc. |
| Job queue | `src/lib/job-queue.ts` | DB-backed; inline or cron via `/api/jobs/process` |
| Event bus | `src/lib/event-bus.ts` | `PlatformEvent` + async handlers |
| Printer agent | `services/printer-agent/` | Local ESC/POS relay — `npm run printer:agent` |
| Offline staff orders | `useOfflineOrderSync` + `/api/offline/sync` | IndexedDB queue when network drops |

## Phase 2 — SaaS & scale

| Component | Location |
|-----------|----------|
| Tenant / Branch models | `prisma/schema*.prisma` |
| Branch API | `GET/POST /api/branches` |
| Redis (optional) | `REDIS_URL`, `src/lib/redis.ts`, Docker `redis` service |
| Subscriptions stub | `TenantSubscription` model |

## Phase 3 — Operations depth

| Component | Location |
|-----------|----------|
| Recipe / BOM engine | `src/lib/recipe-service.ts`, `/api/recipes` |
| Enhanced audit log | `oldValue` / `newValue` on `AuditLog` |
| Analytics events | `PlatformEvent`, `/api/analytics` |
| Public API | `/api/v1/orders`, `/api/v1/menu` with API keys |

## Phase 4 — Forecasting & AI prep

| Component | Location |
|-----------|----------|
| Demand forecasts | `src/lib/forecast-service.ts`, `/api/forecasts` |
| Model | v1 simple moving average (28-day lookback) |
| Insights | Rush items, slow items, prep recommendations |

## Job types

- `push_notification`, `sms_notification`, `print_job`, `analytics`, `recipe_deduct`

## Environment

See `.env.example` for `REDIS_URL`, `PRINTER_AGENT_URL`, `JOB_CRON_SECRET`, `SMS_WEBHOOK_URL`, VAPID keys.

## Postgres production

Set `DATABASE_URL` to PostgreSQL, `PRISMA_SCHEMA=prisma/schema.postgres.prisma`, `PRISMA_MIGRATIONS=prisma/migrations-postgres`. Use `docker compose up` for full stack with Postgres + Redis.
