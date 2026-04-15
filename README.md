# Lazy Booker

Lazy Booker is a lightweight single-page hotel search app with a 3-step wizard and a Node.js backend that aggregates hotel results and ranks them by review score within a budget.

## Features

- **3-step wizard UI** (Location → Dates → Budget)
- **City autocomplete** powered by OpenStreetMap Nominatim
- **Date validation + live nights calculation**
- **Dual budget slider + currency selector**
- **Search results with loading skeletons**
- **Hotel cards include** stars, review score/count, sentiment badge, snippets, image, source badge, and view-deal CTA
- **Filter sidebar** for star ratings and sort mode (reviews/price)
- **Backend aggregation engine** with:
  - budget filtering
  - score normalization to 0–10
  - sort by review score + review count
  - fuzzy deduplication by name + address
  - graceful source-failure handling
  - 10-minute in-memory cache

## Project structure

```txt
/
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── backend/
│   ├── server.js
│   ├── scraper.js
│   ├── cache.js
│   └── package.json
├── .env.example
└── README.md
```

## Setup

### 1) Configure environment

```bash
cp .env.example .env
```

Set `SERPAPI_KEY` in `.env` for live internet hotel data. Without it, the app falls back to demo hotel records so the UI still works end-to-end.

### 2) Install backend dependencies

```bash
cd backend
npm install
```

### 3) Start backend API

```bash
npm run start
```

Backend runs at `http://localhost:3000`.

### 4) Start frontend static server

From project root:

```bash
python3 -m http.server 5173
```

Open `http://localhost:5173/frontend/`.

## API

### `POST /api/search`

Request body:

```json
{
  "location": "Barcelona, Spain",
  "checkin": "2026-05-10",
  "checkout": "2026-05-14",
  "minPrice": 80,
  "maxPrice": 250,
  "currency": "EUR"
}
```

Response:

```json
{
  "cache": "MISS",
  "results": [
    {
      "name": "Example Hotel",
      "stars": 4,
      "reviewScore": 8.9,
      "reviewCount": 1240,
      "pricePerNight": 180,
      "currency": "EUR",
      "address": "Downtown",
      "distanceFromCenter": "0.8 km from center",
      "image": "https://...",
      "url": "https://...",
      "source": "Booking.com",
      "reviewSnippets": ["...", "..."]
    }
  ]
}
```

## Notes

- API keys are only used on the backend (never exposed in browser code).
- CORS is enabled for local development.
- Hotel images use lazy loading (`loading="lazy"`) for faster page render.
