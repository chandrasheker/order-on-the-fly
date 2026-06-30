# Swiggy & Zomato — Automatic Order Integration

TableTap is built as a **POS partner** — restaurants enter credentials once, register a webhook with Swiggy/Zomato, and orders flow **automatically** to the kitchen board. No manual order ID entry.

> **Complete app setup:** **[SETUP_GUIDE.md](./SETUP_GUIDE.md)** · **Bring-up errors:** **[BRINGUP_TROUBLESHOOTING.md](./BRINGUP_TROUBLESHOOTING.md)** · **Premium enable:** **[PREMIUM_FEATURES.md](./PREMIUM_FEATURES.md)**

---

## What the restaurant owner needs

### From Zomato
1. Join **Zomato POS Integration** program: https://www.zomato.com/developer/integration/
2. Complete vendor onboarding form (webhook URL, API headers)
3. From partner dashboard collect:
   - **Outlet ID**
   - **API key** (for confirming orders back to Zomato)
4. Share TableTap webhook URL + secret (shown in **Admin → Integrations**) with your Zomato POC

### From Swiggy
1. Contact **Swiggy partner / POS integration** team for API access (restaurant-level)
2. Collect:
   - **Outlet / restaurant ID**
   - **API key** (+ secret if provided)
3. Register TableTap webhook URL with Swiggy support (same as Zomato flow)

---

## What TableTap provides (ready mode)

| Step | Owner action | TableTap |
|------|--------------|----------|
| 1 | Enable `aggregator_inbox` premium (super admin) | Feature gate |
| 2 | Admin → **Integrations** → enter outlet ID + API key | Encrypted storage |
| 3 | Copy webhook URL + secret to Swiggy/Zomato | Auto-generated per outlet |
| 4 | Partner team activates webhook | — |
| 5 | Customer orders on app | **Webhook → kitchen board → optional auto-confirm** |
| 6 | Edit menu in TableTap | **Auto menu sync** to Swiggy/Zomato (when enabled) |
| 7 | Mark order ready / served on KDS | **Status callbacks** to platform (when enabled) |

### Webhook endpoints (per restaurant)

```
POST /api/webhooks/zomato/{restaurant-slug}
POST /api/webhooks/swiggy/{restaurant-slug}
Authorization: Bearer <webhook-secret-from-admin-ui>
```

TableTap parses standard Zomato/Swiggy order relay payloads, maps items to your menu (by platform item ID or name), deduplicates by external order ID, and creates a kitchen ticket.

---

## Menu mapping (important)

For reliable automatic item matching, set on each menu item (via menu manage API) or ensure names match exactly:

- `swiggyItemId` — Swiggy catalogue item ID
- `zomatoItemId` — Zomato dish ID

Fallback: match by **item name** in your TableTap menu.

---

## Outbound menu sync

When **Auto sync menu** is enabled (default), TableTap pushes your full menu to Swiggy/Zomato:

- After menu create / update / delete
- After saving aggregator credentials (when API key present)
- On demand via **Sync menu now** in Admin → Integrations

Uses configurable API paths (defaults below):

| Platform | Default path | Env override |
|----------|--------------|--------------|
| Zomato | `POST /online-ordering/v1/menu/sync` | `ZOMATO_MENU_SYNC_PATH` |
| Swiggy | `POST /api/v1/menu/sync` | `SWIGGY_MENU_SYNC_PATH` |

Individual item stock updates use:

- Zomato: `POST /online-ordering/v1/menu/item/stock` (`ZOMATO_ITEM_STOCK_PATH`)
- Swiggy: `POST /api/v1/menu/item/stock` (`SWIGGY_ITEM_STOCK_PATH`)

---

## Status callbacks (ready / picked up / delivered)

When **Push ready / picked up status** is enabled (default), TableTap notifies the platform as kitchen staff work orders:

| Kitchen action | Platform call |
|----------------|---------------|
| Order becomes **READY** (all items ready or mark ready) | `POST .../order/ready` |
| Order becomes **SERVED** (picked up / handed to rider) | `POST .../order/pickedup` then `POST .../order/delivered` |

Default paths:

| Platform | Ready | Picked up | Delivered |
|----------|-------|-----------|-----------|
| Zomato | `/online-ordering/v1/order/ready` | `/online-ordering/v1/order/pickedup` | `/online-ordering/v1/order/delivered` |
| Swiggy | `/api/v1/order/ready` | `/api/v1/order/pickedup` | `/api/v1/order/delivered` |

Override via env: `ZOMATO_ORDER_READY_PATH`, `ZOMATO_ORDER_PICKEDUP_PATH`, `ZOMATO_ORDER_DELIVERED_PATH`, `SWIGGY_ORDER_*_PATH`.

---

## Auto-confirm

When enabled (default), TableTap calls the platform confirm API after ingesting an order so the aggregator knows the restaurant accepted it.

Requires valid API key. Uses:

- Zomato: `POST /online-ordering/v1/order/confirm`
- Swiggy: `POST /api/v1/order/confirm` (configurable via `SWIGGY_API_BASE`)

Sandbox URLs: set `ZOMATO_API_BASE` / `SWIGGY_API_BASE` in `.env`.

---

## Security

- API keys stored **AES-256-GCM encrypted** (`TABLETAP_CREDENTIALS_KEY` env)
- Webhook protected by per-restaurant secret
- Outlet ID validated on incoming payloads

---

## What is NOT automatic (industry-side)

- **Partner approval** — Zomato/Swiggy must whitelist your outlet (typically 24–72h)
- Exact API paths may differ per partner contract — override via env vars above

---

## For TableTap operators (you)

1. Enable premium: `aggregator_inbox`
2. Owner completes Admin → Integrations
3. Support owner through Swiggy/Zomato partner onboarding
4. First live webhook → status flips to **CONNECTED**
5. Verify menu sync + status callbacks with partner sandbox if available

```bash
npx tsx scripts/enable-premium-features.ts --slug varanasi --features aggregator_inbox
```
