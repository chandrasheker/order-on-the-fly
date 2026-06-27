# TableTap — Smart Restaurant Ordering SaaS

QR-powered table ordering platform for restaurants. Customers scan, order, and play games while waiting. Staff get real-time alerts, prep timers, and daily reports.

## Features

- **QR Table Ordering** — Unique QR codes per table (10 default, scalable)
- **Smart Prep Timers** — Auto timers per item type (water 1min, tea 5min, biryani 20min)
- **Staff Dashboard** — Live order board for owner/manager/cook/server roles
- **Overdue Alerts** — Automatic alerts when orders miss their timeline
- **Customer Alarm** — Ring-for-service button when wait time expires
- **Wait Games** — Spin wheel, trivia, memory match, jokes while customers wait
- **Menu Management** — Toggle availability, adjust prep times
- **Daily Reports** — Download CSV reports with order details

## Quick Start

```bash
npm install
npm run dev          # auto-migrates and seeds the database on first run
```

Or run setup explicitly:

```bash
npm run db:setup
npm run dev
```

If you see **"table does not exist"** errors, reset the database:

```bash
npm run db:reset
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Demo Credentials

| Role    | Email                    | Password  |
|---------|--------------------------|-----------|
| Owner   | owner@spicegarden.com    | admin123  |
| Manager | manager@spicegarden.com  | admin123  |
| Cook    | cook@spicegarden.com     | admin123  |
| Server  | server@spicegarden.com   | admin123  |

## Demo Flow

1. **Staff Login** → `/staff/login` → Dashboard with live orders
2. **Print QR Codes** → Admin → QR Codes → Print All
3. **Customer Order** → Scan QR or visit `/order/spice-garden/demo`
4. **Reports** → Admin → Reports → Download CSV

## Tech Stack

- Next.js 16 · React 19 · TypeScript
- Prisma · SQLite
- Tailwind CSS · Framer Motion
- JWT Auth · QR Code generation

## Environment

```env
DATABASE_URL="file:./dev.db"
JWT_SECRET="your-secret-key"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```
