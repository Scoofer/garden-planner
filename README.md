# 🌱 Garden Planner

A free, private, offline-first Progressive Web App (PWA) for planning and maintaining a garden.

## Features
- **Track plants** — name, location/bed, planted date, sunlight, notes
- **Watering schedule** — each plant shows when it's next due ("Water today", "in 3 days", "2d overdue")
- **Water now** — one tap logs a watering and resets the schedule
- **Edit / delete** plants
- **Export / Import** your data as a JSON backup file (no cloud involved)
- **Installable** — add to your phone's home screen; works offline

## Privacy
All data is stored **locally in your browser** (`localStorage`). Nothing is uploaded to any server — there are no accounts, no tracking, and no cloud database. Each device keeps its own separate copy of your garden.

## Run locally
Serve the folder with any static server, e.g.:

```bash
python -m http.server 8000
```

Then open http://localhost:8000 and, on iOS Safari, use **Share → Add to Home Screen**.

## Deploy
This is a static site — host it free on GitHub Pages, Netlify, Vercel, or Cloudflare Pages.

## Files
| File | Purpose |
|------|---------|
| `index.html` | Markup / layout |
| `styles.css` | Styling |
| `app.js` | App logic + localStorage persistence |
| `manifest.webmanifest` | PWA metadata |
| `sw.js` | Service worker (offline cache) |
| `icon.svg`, `icon-*.png` | App icons |
| `make_icons.py` | Icon generator (build helper) |

## License
MIT — do whatever you like.
