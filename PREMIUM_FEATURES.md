# TableTap — Core vs Premium Features

TableTap ships with **core features always on** and **premium modules hidden** until you enable them from the super-admin console. Restaurant owners never see premium UI or APIs when a module is off.

## Super admin (hidden from restaurant owners)

| What | Detail |
|------|--------|
| **URL** | `/platform/login` — not linked from the staff login page |
| **Credentials** | Set in `restaurant.config.json` → `platformAdmin` (created on `npm run setup` / seed) |
| **Console** | `/platform` → **Premium features** tab → toggle per restaurant → **Save** |
| **Downtime** | **None.** Flags are read from the database with a ~10s cache. Toggles apply on the next request — no restart. |

### Default super-admin credentials (demo config)

After `npm run setup` with the bundled config:

- **Email:** value of `platformAdmin.email` in `restaurant.config.json` (default `chandra@varanasi.com`)
- **Password:** value of `platformAdmin.password` (default `admin123`)

Change these in production. Run `npx tsx scripts/ensure-platform-admin.ts` if the account is missing.

### Enable all premium for a restaurant (CLI)

```bash
npx tsx scripts/enable-premium-features.ts --slug varanasi --all
```

Enable specific modules:

```bash
npx tsx scripts/enable-premium-features.ts --slug varanasi --features kds,split_bill,floor_plan
```

---

## Core features (always included)

These are **on by default** for every restaurant. Owners use them without extra payment.

| Feature key | What it solves |
|-------------|----------------|
| `qr_ordering` | Guests scan table QR and order without a waiter |
| `staff_dashboard` | Live orders, prep timers, overdue alerts |
| `menu_admin` | Owner edits menu, prices, today's special |
| `table_qr` | Printable QR codes + secure check-in |
| `payments` | Mark paid / collect cash or UPI after service |
| `phonepe_qr` | Upload static PhonePe/UPI QR for guest self-pay |
| `table_sessions` | Rotating check-in codes + session limits (anti-abuse) |
| `table_switch` | Guest table-change requests with staff approval |
| `rewards` | Threshold reward spins for repeat visits |
| `feedback` | Post-meal satisfaction capture |
| `basic_reports` | Daily sales CSV (orders, revenue, item/table breakdown) |
| `alerts_timers` | Prep countdowns and overdue notifications |

---

## Premium features (toggle in super admin)

These are **off by default**. Enable when the customer pays for the add-on.

| Feature key | What it solves | Route / location |
|-------------|----------------|------------------|
| `kds` | Station-routed kitchen display — ends paper chits and shouting | `/kitchen` |
| `floor_plan` | Visual table map, seat timers, server assignment, live bill | `/staff/floor` |
| `split_bill` | Pay by item or split evenly; partial payments | Staff dashboard → Pending |
| `staff_performance` | Who prepped, served, collected — shift accountability | Admin → Daily Reports → Team performance |
| `thermal_receipts` | Bluetooth ESC/POS receipts + kitchen chits + reprint | Staff dashboard printer menu |
| `phone_orders` | Walk-in, **takeaway**, and **delivery** orders | Staff dashboard → **Remote orders** |
| `gst_receipts` | GSTIN, tax rate, compliant receipt footer | Admin → QR codes → receipt settings |
| `aggregator_inbox` | **Swiggy / Zomato automatic sync** (credentials + webhook) | Admin → **Integrations** |

See **[AGGREGATOR_SETUP.md](./AGGREGATOR_SETUP.md)** for what owners need from Swiggy/Zomato partner teams.

### Remote orders

| Mode | Premium flag | Notes |
|------|--------------|-------|
| Walk-in / table | `phone_orders` | Pick table, send to kitchen |
| Takeaway | `phone_orders` | No table — pack and hand over |
| Delivery | `phone_orders` | Phone + address notes |
| Swiggy | `aggregator_inbox` | Order ID + items; webhook supported |
| Zomato | `aggregator_inbox` | Order ID + items; webhook supported |

**Webhook:** `POST /api/webhooks/orders/{slug}` with `Authorization: Bearer <secret>`. Managers get URL + secret from `GET /api/orders/aggregator`.

### Printing (`thermal_receipts`)

- Auto-print customer receipt when bill fully paid
- **Auto-print kitchen chit** when any order is sent (toggle in printer menu)
- **Reprint receipt** on completed orders tab

---

## Roadmap features (early-access toggles)

Toggleable in super admin for future billing; **UI/API stubs only** until built.

| Feature key | Problem solved |
|-------------|----------------|
| `inventory_86` | Auto-86 when stock hits zero — menu updates instantly |
| `labor_clock` | Shift clock-in/out + sales per labor hour (SPLH) |
| `reservations` | Waitlist + SMS when table ready |
| `tip_pooling` | Fair tip splits with payroll export |
| `guest_crm` | Repeat guest recognition by phone |
| `audit_log` | Manager approval trail for voids and comps |

See **[RESTAURANT_ROADMAP.md](./RESTAURANT_ROADMAP.md)** for full product direction.

---

## How toggling works (technical)

1. Super admin saves toggles → `Restaurant.featureFlags` JSON in SQLite/Postgres.
2. Server reads flags via `getRestaurantFeatureFlags()` (10s in-memory cache per restaurant).
3. Disabled premium APIs return `403` with `code: FEATURE_DISABLED`.
4. Staff UI hides buttons/routes for disabled modules.
5. Cache invalidates immediately on save — effective within one cache window, no deploy.

---

## Monetization suggestion

| Tier | Includes |
|------|----------|
| **Starter** | All core features |
| **Pro** | Pick 2–3 premium modules (e.g. KDS + floor plan) |
| **Enterprise** | All premium + roadmap early access |

You control what each restaurant gets from `/platform` → **Premium features**.
