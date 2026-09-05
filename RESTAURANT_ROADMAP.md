# TableTap — Restaurant Platform Roadmap

This document compares TableTap with leading restaurant software (Toast, TouchBistro, Lightspeed, SpotOn, Table Needs) and maps **real problems** to features — what exists today, what was just added, and what to build next.

## Platform milestones

| Milestone | Status | What it is |
|-----------|--------|------------|
| M0 | Shipped | Hostname tenancy |
| M1 | Shipped | Financial core |
| M2 | Shipped | Razorpay receipts |
| M3 | Shipped | Production print reliability |
| M4 | Shipped | Forensic audit |
| M5 | Shipped | Platform command center |
| **M6** | **This release** | **Menu Media & Assisted Menu Onboarding** — food-image upload plus PDF/JPG existing-menu import, reviewable draft, explicit/idempotent Apply, tenant isolation, M4 forensic evidence. Extraction is advisory; the restaurant remains authoritative. |

---

## What TableTap already solves (today)

| Problem | TableTap feature |
|--------|-------------------|
| Guests ordering without waiters | QR scan + secure rotating check-in codes |
| Remote QR misuse | Table open/close gate + session limits |
| Kitchen chaos | Live order board, prep timers, overdue alerts |
| Phone / walk-in orders | Staff **Phone orders** tab with table picker + notes |
| Payment collection | PhonePe QR, mark-paid flow, payment block until settled |
| Staff accountability (new) | **Who served, prepared, ready, placed, and collected payment** — per item and per order |
| Owner visibility (new) | **Team performance** in Daily Reports (items served, tables, revenue collected) |
| Thermal receipts | ESC/POS Bluetooth auto-print on mark paid, GST optional |
| Kitchen Display (KDS) | Full-screen `/kitchen` with station routing (Hot Kitchen, Grill, Bar, Cold) |
| Floor plan & table timers | `/staff/floor` — visual map, server assignment, live bill, seat/clear |
| Split bill / partial pay | Pay by item or split evenly; multiple `Payment` records per order |
| Table changes | Customer request + staff approval with order migration |
| Loyalty | Reward spins, feedback |
| Multi-restaurant deploy | Config-driven setup (`npm run setup`) |

---

## Staff performance tracking (implemented)

Every staff action is now logged:

| Action | Stored on |
|--------|-----------|
| Phone/offline order placed | `Order.placedByUserId` / `placedByName` |
| Cook starts item | `OrderItem.preparedByUserId` / `preparedByName` |
| Cook marks ready | `OrderItem.readyByUserId` / `readyByName` |
| Server serves item | `OrderItem.servedByUserId` / `servedByName` |
| Payment collected | `Payment` record per collection (split-aware) + `Order.paidByUserId` when fully settled |

**Owner view:** Admin → **Daily Reports** → **Team performance** + **Table service log** (which server served which table/order).

**API:** `GET /api/staff/performance?date=YYYY-MM-DD&tables=1`

---

## High-priority features (recommended next)

These appear in almost every modern full-service POS and solve daily pain points TableTap does not fully cover yet.

### 1. Inventory & 86 (out of stock) workflow
**Problem:** Item runs out mid-service; staff forget to mark unavailable.  
**Solution:** Ingredient-level or item-level stock counts, auto-86 when zero, “86 alert” to menu instantly.  
**Why:** Lightspeed’s strength; reduces wasted prep and angry guests.

### 2. Shift / labor clock-in
**Problem:** Owner cannot tie performance to shifts or calculate labor cost %.  
**Solution:** PIN clock-in/out, shift report linking sales to hours worked (SPLH — sales per labor hour).  
**Why:** Boss It / industry KPI guides cite SPLH as the #1 labor metric.

### 3. Reservations & waitlist
**Problem:** Phone calls for tables, no queue visibility.  
**Solution:** Waitlist with SMS when table ready, optional reservation slots.  
**Why:** Reduces walkaways during peak hours.

### 4. Online ordering & delivery aggregator hooks
**Problem:** Swiggy/Zomato orders live outside the kitchen board.  
**Solution:** Unified order inbox (dine-in + takeaway + aggregator) with same KDS pipeline.  
**Why:** Single source of truth for kitchen — standard in 2025–2026 POS suites.

### 5. Tip pooling & payout reports
**Problem:** Servers dispute tip splits; cash vs UPI tips untracked.  
**Solution:** Configurable tip pool rules, per-server tip ledger, export for payroll.  
**Why:** Toast/SpotOn market this heavily for US; India equivalents growing for service charge.

### 6. Customer CRM & repeat guest recognition
**Problem:** Regulars are anonymous phone numbers on orders.  
**Solution:** Optional phone on check-in, visit count, favorite items, targeted rewards.  
**Why:** Increases repeat revenue; complements existing reward spin.

### 10. Audit log & void/comp controls
**Problem:** Manager cannot see who discounted or voided an item.  
**Solution:** Immutable activity log (void, comp, price override) with role permissions.  
**Why:** Table Needs “role-based permissions” — fraud and waste control.

---

## Medium-priority enhancements

| Feature | Problem solved |
|---------|----------------|
| **Course firing** (starters → mains) | Kitchen fires mains too early |
| **Mandatory service charge** for large parties | Manual calculation errors |
| **Multi-location dashboard** | Franchise owners need consolidated view |
| **WhatsApp bill / receipt** | Guest without printer wants digital copy |
| **Demand forecasting** | Over/under staffing on predictable days |
| **Allergen flags on menu** | Compliance + guest safety |
| **Table assignment** (“Server Maria → Tables 1–5”) | Clear ownership on floor |
| **Customer wait time display** | Transparency reduces complaints |

---

## Metrics owners should watch (industry standard)

TableTap can surface these in reports as you build out tracking:

| Metric | Formula / meaning |
|--------|-------------------|
| Items served per server | Already in Team performance |
| Revenue collected per server | Already in Team performance |
| Table turnover | Seatings per table per day |
| Ticket time | Order created → all items served |
| Prep SLA hit rate | Items served before `expectedReadyAt` |
| Order error rate | UNAVAILABLE items / total items |
| Average check size | Revenue / paid orders |
| SPLH | Revenue / labor hours (needs clock-in) |

---

## Suggested build order (technical)

1. ✅ Staff attribution + performance reports  
2. ✅ Table → server assignment on floor open  
3. ✅ Dedicated KDS route for cooks  
4. ✅ Split payments  
5. Inventory + auto-86  
6. Shift clock-in + SPLH  
7. Reservations / waitlist  
8. Aggregator / takeaway inbox  

---

## Competitive positioning

TableTap’s differentiators vs generic POS:

- **Security-first QR** (rotating codes, table gates) — most cheap QR menus lack this  
- **Zero app install for guests** — web-only ordering  
- **Fast deploy** for independent restaurants (`npm run setup`)  
- **India-ready** — INR, PhonePe QR, GST on thermal receipts  

To match Toast/TouchBistro for **full-service dine-in**, prioritize **KDS + floor plan + split bill + staff metrics** (metrics now started).

---

*Last updated: staff performance tracking release*
