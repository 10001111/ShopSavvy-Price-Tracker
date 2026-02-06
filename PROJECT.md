# ShopSavvy Price Tracker — Project Documentation

## What is this site for?

ShopSavvy (branded as **OfertaRadar** on the front end) is a price-tracking tool built for shoppers in Mexico who already know what product they want but don't want to sit at their computer for days waiting for the price to drop.

The problem it solves: you find a laptop, phone, or gaming console on Mercado Libre or Amazon Mexico at a price that looks okay — but you have no idea whether that price is actually good or whether it dropped last week and will drop again next week. Checking manually every few hours wastes time and you'll still miss the dip.

ShopSavvy automates that. You search for a product, hit "Track", and the site watches the price in the background. Your personal dashboard shows you a chart of every price change over the last 7 or 30 days, flags whether the current price is a deal compared to the average, and surfaces the best-priced products across the whole catalogue so you can browse deals without hunting.

The target user: someone on a budget who is product-hunting — maybe comparing three laptops or waiting for a specific TV to come down — and wants the site to do the waiting for them. The wide category coverage (electronics, fashion, home, sports, toys, beauty, books, automotive) means you can track multiple products across completely different categories in one place.

---

## Technology Stack

### Backend

| Technology | Role in this project |
|---|---|
| **Node.js + Express** | The entire backend is a single Express application (`src/backend/server.js`). It serves HTML pages (server-side rendered), exposes a REST API, and runs background workers — all in one process. No separate frontend build step or bundler needed. |
| **Supabase (PostgreSQL)** | Cloud database. Stores users, tracked products, price history, login records, and sessions. The app connects via `@supabase/supabase-js` using a service-role key so it bypasses row-level security on the server side. Migrations live in `supabase/migrations/` and are pushed with `supabase db push`. SQLite is kept as a local fallback but Supabase is the primary store. |
| **Redis (via ioredis)** | Two jobs: (1) backs the Bull job queue so price-check jobs can be queued and processed reliably with retries, and (2) acts as a short-lived cache (30-minute TTL) for Apify scrape results so repeated searches don't burn Actor credits. |
| **Bull** | A Redis-backed job queue library. The `price-checker` worker queues batches of products for re-checking. Each batch is one Apify Actor run. Bull handles retries (3 attempts, exponential backoff) and keeps a history of completed/failed jobs that the admin status endpoint reads. |
| **Apify + apify-client** | Apify is a cloud platform that runs web-scraping programs called Actors. ShopSavvy has its own Actor (`ShopSavvy-Price-Tracker`, built with Crawlee's `CheerioCrawler`) that scrapes product pages on Amazon.com and Mercado Libre Mexico. The backend calls this Actor via the `apify-client` SDK: once when a user clicks "Scrape with Apify" on the search page, and again on a recurring schedule to refresh prices for every tracked product. |
| **JWT (jsonwebtoken)** | Stateless authentication. On login the server signs a token with the user's ID and sets it as an HttpOnly cookie. Every subsequent request the server verifies the cookie — no session database round-trip needed. |
| **bcryptjs** | Hashes passwords before they hit the database. Uses a cost factor of 10. |
| **dotenv** | Loads environment variables from `.env` at startup. All secrets (DB keys, API tokens, Redis URLs) live there. |

### Frontend

There is no separate frontend framework — React, Vue, Angular, etc. are not used. The HTML, CSS, and JavaScript are all generated server-side inside `server.js` template literals and sent as a single HTML response. This keeps the project simple to deploy (one `npm start`) and fast to load (no JS bundle to parse before the page renders).

| Technology | Role |
|---|---|
| **Vanilla HTML + CSS** | All page layout and styling. The main stylesheet is `src/frontend/styles.css` (~4 000 lines). It includes a full light/dark theme system driven by a CSS custom-property scheme that flips on a `data-theme="dark"` attribute. |
| **Vanilla JavaScript (inline)** | Small, focused scripts embedded in each page's `<script>` block. Handles: the price-range sliders on the search form, the "Scrape with Apify" button's fetch-and-reload flow, carousel navigation on the deals sections, scroll-reveal animations via `IntersectionObserver`, and the Chart.js price-history graphs on the dashboard. |
| **Chart.js** | Loaded from a CDN on the dashboard page. Draws the 7-day and 30-day price history line charts for each tracked product. |

### Apify Actor (runs in Apify cloud, not locally)

The Actor source lives in `src/backend/actor/` but it runs inside an Apify-managed Docker container, not on your local machine.

| File | Purpose |
|---|---|
| `main.js` | Entry point. Uses Crawlee's `CheerioCrawler` to scrape Amazon search/product pages and Mercado Libre Mexico search/product pages. Outputs structured JSON (title, price, images, seller, rating, etc.) to an Apify dataset. |
| `package.json` | Declares `apify` and `crawlee` as dependencies. Includes a `start` script because the Apify base image runs `npm start`. |
| `input_schema.json` | Tells the Apify UI what inputs the Actor accepts: `source` (amazon / mercadolibre / all), `query`, `productUrls` (for price re-checks), and `maxResults`. |
| `Dockerfile` | Explicit build instructions: base image `apify/actor-node:20`, `npm install`, then `CMD ["npm", "start"]`. |

---

## How the pieces connect — data flow

```
User types query + clicks "Scrape with Apify"
        │
        ▼
POST /api/scrape  (Express route, auth required)
        │
        ▼
apify.js → ApifyClient.actor().call()   ──►  Apify cloud runs the Actor
        │                                         │  scrapes Amazon / ML
        ◄─────────── dataset items ───────────────┘
        │
        ▼
upsertScrapedProduct()  →  Supabase tracked_products + price_history
        │
        ▼
Page reloads with ?q=...
        │
        ▼
fetchAllProducts()  merges:
   • Live Mercado Libre API results
   • Already-scraped products from Supabase  ◄── deduped by product ID
        │
        ▼
Product cards rendered server-side, sent to browser
```

**Background price re-checks** run on a separate loop:

```
price-checker.js  (started on server boot if ENABLE_PRICE_WORKER=true)
        │  every 60 min: fetch all tracked products
        │  filter to ones not checked in 30 min
        │  chunk into batches of 20
        ▼
Bull queue "price-check"  →  one job per batch
        │
        ▼
recheckPrices(urls)  →  Apify Actor run (no cache, always fresh)
        │
        ▼
updateTrackedProductPrice() + addPriceHistory()  →  Supabase
```

---

## Key features

### Product search
- Search across Mercado Libre Mexico (live API) and products already scraped via Apify (stored in Supabase). Results are merged and deduplicated.
- Filter by price range (sliders), sort by price ascending or descending, filter by source (All / Mercado Libre / Amazon).
- Category browsing: Electronics, Fashion, Home & Kitchen, Sports, Beauty, Toys, Books, Automotive. Products are auto-categorised by keyword matching on the title.

### Apify scraping
- Logged-in users see a "Scrape with Apify" button next to the normal search button. This triggers the cloud Actor which scrapes the selected source(s), stores every result in Supabase, then reloads the page so the new products appear immediately.
- The Actor scrapes titles, prices, images, seller names, ratings, and conditions. All fields are persisted once migration 004 is applied.
- Results are cached in Redis for 30 minutes so identical searches don't re-run the Actor.

### Price tracking & history
- Any logged-in user can click "Track Price" on a product detail page. This creates a row in `tracked_products` and records the first price in `price_history`.
- The dashboard shows every tracked product with a Chart.js line graph. You can toggle between 7-day and 30-day views.
- Price statistics are calculated on the fly: current price, min, max, average, and whether the current price qualifies as a "good deal" (5 %+ below the period average).

### Automatic price monitoring
- When the server starts with `ENABLE_PRICE_WORKER=true`, `price-checker.js` boots a background loop. Every 60 minutes it finds all tracked products that haven't been checked in 30 minutes, sends them to Apify in batches of 20, and writes every new price into `price_history`. No manual action needed after the initial track.

### Deals & discovery (logged-in home page)
- **Highlighted Deals** — products currently at or below their historical minimum.
- **Popular Products** — most-tracked products across all users, with their savings percentages.
- **Top Price Drops** — products with the biggest price decrease in the last 48 hours.
- **Category Discounts** — each category's best discount percentage and the product driving it.
- All sections fall back to curated demo data if Supabase has no real data yet, so the page never looks empty.

### Authentication & profiles
- Email + password registration with bcrypt hashing. Passwords are never stored in plain text.
- JWT cookie-based sessions — HttpOnly, so client JS can't read the token.
- Google OAuth callback route is stubbed and ready to wire.
- Profile page: set a username, upload or link an avatar image.
- Login history is recorded per-user (timestamp, IP, success/failure).

### Internationalisation
- The entire UI is bilingual: English and Spanish. Language is stored in a cookie and switched via `/set-lang/en` or `/set-lang/es`.
- Every user-facing string goes through a `t(lang, key)` translation function.

### Light / dark theme
- A single CSS custom-property theme system. A toggle in the nav bar flips `data-theme` between `light` and `dark`. The preference is persisted in `localStorage`.

---

## Database tables (Supabase)

| Table | What it stores |
|---|---|
| `users` | Registered accounts: email, password hash, verification status, auth provider, profile pic, username |
| `login_history` | Every login attempt with timestamp, IP, success flag |
| `user_sessions` | Active JWT session records |
| `tracked_products` | Every product a user is tracking: source, product ID, title, URL, current price, thumbnail, images, seller, rating, and more (migration 004 columns) |
| `price_history` | One row per price observation: which tracked product, what price, when |

Migrations are in `supabase/migrations/`. Push them with:
```
supabase link --project-ref <your-ref>
supabase db push --include-all
```

---

## Environment variables (`.env`)

| Variable | Required | Purpose |
|---|---|---|
| `SUPABASE_URL` | Yes | Cloud database URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Bypasses RLS for server-side writes |
| `SUPABASE_ANON_KEY` | Fallback | Used if service role key is missing |
| `JWT_SECRET` | Yes | Signs authentication tokens |
| `REDIS_URL` | Yes | Bull queue + cache connection |
| `Apify_Token` | Yes | Authenticates Actor runs and dataset reads |
| `MERCADO_LIBRE_App_ID` | Yes | ML public API access |
| `MERCADO_LIBRE_CLIENT_SECRET` | Yes | ML authenticated search fallback |
| `ENABLE_PRICE_WORKER` | Yes | Set to `true` to start background price checks |
| `PRICE_CHECK_INTERVAL_MINUTES` | No | How often the checker loop runs (default 60) |
| `PORT` | No | HTTP port (default 3000) |

---

## Running locally

```bash
npm install
# Make sure .env is populated (see above)
npm start          # starts the Express server on PORT (default 3000)
npm run worker     # optional: starts price-checker in a separate terminal
```

The price-checker worker starts automatically inside the main process when `ENABLE_PRICE_WORKER=true`, so the separate `npm run worker` command is only needed if you want to run it standalone for debugging.
