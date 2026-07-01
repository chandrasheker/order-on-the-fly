# TableTap — Testing & Validation Guide

Run these after `git pull` on branch `cursor/arch-restructure-6747`.

## 1. Install & database

```bash
npm install
npm run db:setup          # migrate + seed + tenant/branch/floor backfill
npm run config:validate:app
npm run build
```

Expected: migrations apply including `20260701180000_arch_restructure_hierarchy`, build succeeds.

## 2. Start services

Terminal 1:
```bash
npm run dev
```

Terminal 2 (optional worker + printer):
```bash
npm run worker
npm run printer:agent     # separate terminal if testing print ack
```

## 3. Hierarchy (Phase A)

```bash
curl -s http://localhost:3000/api/health | jq
```

Staff login → open `/admin/platform` or call (with session cookie):

```bash
curl -s http://localhost:3000/api/floors -b cookies.txt | jq
```

Validate:
- Response includes `hierarchy.tenantId`, `floors[]` with default `Ground Floor`
- SQLite: `sqlite3 dev.db 'SELECT name, slug FROM Floor;'`

## 4. Order state machine (Phase B)

1. Place order from staff dashboard (Remote orders → walk-in)
2. Kitchen/staff: mark item **Prepare** then **Ready**
3. Try invalid transition via API (should 409):

```bash
# After item is READY, attempting PREPARING again should fail
curl -X PATCH http://localhost:3000/api/orders/<ORDER_ID> \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"action":"prepare-item","itemId":"<ITEM_ID>"}'
```

Expected: `{ "code": "INVALID_TRANSITION" }` with HTTP 409.

## 5. Event bus (Phase C)

1. Place a new order
2. Check `PlatformEvent` table:

```bash
sqlite3 dev.db "SELECT type, entityId FROM PlatformEvent ORDER BY createdAt DESC LIMIT 5;"
```

Expected: `ORDER_CREATED` row; push notification if VAPID configured.

## 6. Offline sync (Phase F)

1. Staff dashboard → Remote orders
2. DevTools → Network → Offline
3. Load menu once online (caches to IndexedDB)
4. Go offline → place takeaway or walk-in order
5. Go online → banner shows sync; order appears in dashboard

Or inspect IndexedDB: Application → `tabletap-offline` → `pending_orders`

## 7. Printing ack (Phase F)

```bash
export PRINTER_AGENT_URL=http://localhost:8091
export PRINTER_AGENT_SECRET=dev-secret
npm run printer:agent
```

Place order → check print jobs:

```bash
sqlite3 dev.db "SELECT status, ackToken FROM PrintJob ORDER BY createdAt DESC LIMIT 3;"
```

Expected: status moves `PENDING` → `SENT` → `ACKED` when agent runs.

Manual ack:
```bash
curl -X POST http://localhost:3000/api/print/ack \
  -H "Content-Type: application/json" \
  -d '{"ackToken":"<TOKEN>"}'
```

## 8. Payment reconciliation (Phase F)

```bash
curl -X POST http://localhost:3000/api/payments/reconciliation \
  -H "Content-Type: application/json" \
  -b cookies.txt
```

Expected: `{ reconciliation: { expectedTotal, receivedTotal, variance, status } }`

## 9. Background worker (Phase F)

```bash
curl -X POST http://localhost:3000/api/jobs/process
curl -X POST http://localhost:3000/api/print/retry
```

With `npm run worker` running, pending jobs process automatically.

## 10. PostgreSQL (optional)

```bash
docker compose up -d postgres redis
export DATABASE_URL=postgresql://tabletap:tabletap@localhost:5432/tabletap
export PRISMA_SCHEMA=prisma/schema.postgres.prisma
export PRISMA_MIGRATIONS=prisma/migrations-postgres
npm run db:setup
```

## Quick smoke checklist

- [ ] `npm run build` passes
- [ ] `/api/health` returns 200
- [ ] `/api/floors` returns tenant + floors
- [ ] Order item transitions enforce rules (409 on invalid)
- [ ] Offline order queues and syncs
- [ ] Print job ack flow works with agent
- [ ] Reconciliation API returns daily row
- [ ] Worker processes jobs without errors
