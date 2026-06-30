# Set up TableTap for your restaurant

TableTap is fully generic. To launch it for **any** restaurant (e.g. PistaHouse),
you only fill **one config file** and run **one command** — no code changes.

---

## Option A — One command (interactive wizard)

```bash
npm install
npm run setup
```

The wizard asks for everything below, writes `restaurant.config.json`, seeds the
database, and tells you how to start. Add `-- --start` to launch immediately:

```bash
npm run setup -- --start
```

## Option B — Use a ready-made config (e.g. PistaHouse)

```bash
npm install
npm run setup -- --from examples/pistahouse.config.json --start
```

## Option C — Edit the config by hand

```bash
cp restaurant.config.example.json restaurant.config.json
# edit restaurant.config.json
npm run config:validate    # check it
npm run db:reset           # seed this restaurant
npm run dev                # start
```

---

## The details you need to provide

All of this lives in `restaurant.config.json`:

### 1. App
| Field | Meaning | Example |
|-------|---------|---------|
| `app.name` | App title | `PistaHouse Ordering` |
| `app.url` | Public URL in QR codes. Use your computer's LAN IP for phone testing | `http://192.168.1.20:3000` |

### 2. Restaurant / branding
| Field | Meaning | Example |
|-------|---------|---------|
| `restaurant.name` | Display name | `PistaHouse` |
| `restaurant.slug` | URL id (lowercase) | `pistahouse` |
| `restaurant.logoUrl` | Logo path/URL (optional) | `/restaurants/pistahouse-logo.png` |
| `restaurant.backgroundImageUrl` | Customer page background (optional) | `null` |
| `restaurant.tableCount` | How many table QR codes to create | `12` |
| `restaurant.defaultMaxSessions` | Phones allowed per table at once | `3` |
| `restaurant.rewards.*` | Spin-wheel reward thresholds & labels | see example |

### 3. Platform admin (manages staff + passwords)
| Field | Example |
|-------|---------|
| `platformAdmin.name` | `PistaHouse Admin` |
| `platformAdmin.email` | `admin@pistahouse.com` |
| `platformAdmin.password` | a strong password |

### 4. Staff (owner / managers / cooks / servers)
| Field | Meaning |
|-------|---------|
| `staff.domain` | Auto-builds emails for staff with no email (e.g. `cook2@pistahouse.com`) |
| `staff.defaultPassword` | Used for any staff without their own password |
| `staff.owners[]` | At least one owner `{ name, email?, password? }` |
| `staff.managers[]` | Manager accounts |
| `staff.cooks[]` | Cook accounts |
| `staff.servers[]` | Server accounts |

- The number of accounts in each array becomes the staff-slot count for that role.
- `email` and `password` are optional per member — they are auto-filled from
  `staff.domain` and `staff.defaultPassword`.

### 5. Menu
`menu[]` is a list of categories, each with items:

```json
{
  "name": "Biryani",
  "icon": "🍗",
  "items": [
    { "name": "Chicken Dum Biryani", "description": "Signature", "price": 280,
      "prepTimeMinutes": 20, "isVeg": false, "isSpicy": true }
  ]
}
```

Owners can also add/edit menu items later from the in-app admin menu screen.

---

## After it starts

| Who | Where | Login |
|-----|-------|-------|
| Owner / staff | `/` | the owner email + password from your config |
| Platform admin | `/platform/login` | the admin email + password from your config |
| Customers | scan a table QR | no login |

Print QR codes from the staff dashboard (QR icon) → **Table QR Codes**.

---

## Notes

- `restaurant.config.json` is git-ignored, so each restaurant/deployment keeps
  its own config.
- `restaurant.config.example.json` is the committed template (a demo restaurant).
- Set `RESTAURANT_CONFIG=/path/to/file.json` to point at a specific config.
