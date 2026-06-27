# TableTap — Smart Restaurant Ordering SaaS

QR-powered table ordering for restaurants. Customers scan, order, and play games while waiting. Staff manage orders with live timers and alerts.

## Quick Start

```bash
npm install
npm run dev
```

Open **http://localhost:3000** and sign in.

## Login

| Role    | Email               | Password  |
|---------|---------------------|-----------|
| Owner   | owner@varanasi.com  | admin123  |
| Manager | manager@varanasi.com| admin123  |
| Cook    | cook@varanasi.com   | admin123  |
| Server  | server@varanasi.com | admin123  |

## Access

- **Staff/Owner** — login at `/` to access dashboard, menu, QR codes, and reports
- **Customers** — scan table QR code to order (no login needed)

## Owner Features

- Add menu items with name and price in any category
- Set **Today's Special** — one active special shown to customers
- Toggle item availability, print QR codes, download daily reports

## Reset Database

```bash
npm run db:reset
npm run dev
```
