# TableTap — Owner Presentation Decks

Professional pitch decks for restaurant owner meetings. Dark premium theme, minimal text, full platform story including KDS, takeaway, Swiggy/Zomato, and premium tiers.

## Download the PPTX files

| File | Slides | Best for |
|------|--------|----------|
| **[TableTap-Restaurant-Owner-Visual-Deck.pptx](./TableTap-Restaurant-Owner-Visual-Deck.pptx)** | 18 | **Live pitch** — big visuals, fast flow |
| **[TableTap-Restaurant-Owner-Detailed-Deck.pptx](./TableTap-Restaurant-Owner-Detailed-Deck.pptx)** | 18 | **Backup Q&A** — more explanation per slide |
| [TableTap-Restaurant-Owner-Deck.pptx](./TableTap-Restaurant-Owner-Deck.pptx) | 18 | Compatibility copy of visual deck |

Screenshots (when captured) live in [`screenshots/`](./screenshots/).

## What's in the deck

1. Hero — complete restaurant platform
2. Owner pain points
3. Platform overview (QR + KDS + aggregators)
4. Guest experience (check-in, menu, rewards)
5. Security (anti remote misuse)
6. Staff dashboard
7. Kitchen Display System (KDS)
8. Floor plan
9. Payments & split bill
10. Takeaway & delivery
11. Swiggy & Zomato automatic sync
12. Owner admin tools
13. Reports & team performance
14. Core vs Premium pricing tiers
15. Role-based permissions
16. Go-live setup steps
17. Business benefits
18. Live demo CTA

## Regenerate decks

### Design-only (no app running)

```bash
pip install python-pptx
python3 scripts/build-visual-pptx.py   # Visual pitch deck
python3 scripts/build-pptx.py          # Detailed backup deck
```

### With fresh app screenshots (best quality)

```bash
npm run dev                                    # terminal 1 — app must be running
npm i -D playwright && npx playwright install  # one-time
npm run presentation                           # captures screenshots + rebuilds visual deck
```

The presentation script:

1. Logs in as demo owner
2. Captures customer check-in, menu, staff dashboard, admin pages
3. Runs `build-visual-pptx.py` to embed screenshots

## Presenting live

| Role | Credentials |
|------|-------------|
| Staff demo | `owner@varanasi.com` / `admin123` |
| Super admin | `admin@varanasi.com` / `admin@varanasi` → `/platform/login` |
| Customer demo | Open Table 1 in Staff Dashboard → scan Table 1 QR |

**Talking points:**

- Emphasize **one platform** for dine-in, takeaway, Swiggy, and Zomato
- Show **Integrations** page if owner uses aggregators
- Demo **open table → scan → order** for the wow moment
- Mention **SETUP_GUIDE.md** for their IT team / deployment partner

## Setup documentation for owners

Hand off these guides after the meeting:

- [SETUP_GUIDE.md](../SETUP_GUIDE.md) — complete technical setup
- [RESTAURANT_SETUP.md](../RESTAURANT_SETUP.md) — config file & wizard
- [AGGREGATOR_SETUP.md](../AGGREGATOR_SETUP.md) — Swiggy/Zomato onboarding
