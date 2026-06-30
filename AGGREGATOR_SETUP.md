# Swiggy & Zomato — Automatic Order Integration

TableTap is built as a **POS partner** — restaurants enter credentials once, register a webhook with Swiggy/Zomato, and orders flow **automatically** to the kitchen board. No manual order ID entry.

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

### Webhook endpoints (per restaurant)

```
POST /api/webhooks/zomato/{restaurant-slug}
POST /api/webhooks/swiggy/{restaurant-slug}
Authorization: Bearer <webhook-secret-from-admin-ui>
```

TableTap parses standard Zomato/Swiggy order relay payloads, maps items to your menu (by platform item ID or name), deduplicates by external order ID, and creates a kitchen ticket.

---

## Menu mapping (important)

For reliable automatic item matching, set on each menu item (future admin UI) or ensure names match exactly:

- `swiggyItemId` — Swiggy catalogue item ID
- `zomatoItemId` — Zomato dish ID

Fallback: match by **item name** in your TableTap menu.

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

## What is NOT automatic (yet)

- **Partner approval** — Zomato/Swiggy must whitelist your outlet (industry standard; 24–72h)
- **Menu sync outbound** — pushing menu changes to aggregators (roadmap)
- **Status callbacks** — mark ready/picked up back to platform (partial — confirm on ingest)

---

## For TableTap operators (you)

1. Enable premium: `aggregator_inbox`
2. Owner completes Admin → Integrations
3. Support owner through Swiggy/Zomato partner onboarding
4. First live webhook → status flips to **CONNECTED**

```bash
npx tsx scripts/enable-premium-features.ts --slug varanasi --features aggregator_inbox
```
