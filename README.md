# OfertaRadar

**[Live Demo](https://shopsavvy-price-tracker.onrender.com)**

> Price tracker for Mexico — find the best deals across Amazon and Mercado Libre.

OfertaRadar is a full-stack web application that aggregates real-time product listings from Amazon Mexico and Mercado Libre, tracks price history, and alerts users when prices drop on items they follow. The UI is fully bilingual (English / Spanish) and supports both light and dark themes.

---

## Screenshot

> _Add a screenshot of the homepage or dashboard here._
> `![OfertaRadar Homepage](docs/screenshot.png)`

---

## Features

### Search & Discovery
- Real-time product search across Amazon Mexico and Mercado Libre via Apify web scraping
- 8 product categories: Electronics, Phones, Computers, Clothing, Home & Kitchen, Sports, Toys, Beauty
- Category browse pages with filtered results
- Product detail pages with image gallery, full specs (RAM, Storage, Screen, OS, 5G), stock status, and sold count

### Deals & Price Tracking
- Highlighted Deals section — curated outstanding deals displayed in a horizontal carousel
- Top Price Drops — products with the biggest recent price reductions
- Popular Products — personalised recommendations based on user search history
- Price tracking — users can track any product and receive notifications when the price drops
- Price history charts (Chart.js) on the personal tracking dashboard

### User Experience
- Currency toggle: USD / MXN with `localStorage` persistence
- Light / Dark theme toggle with `localStorage` persistence
- Bilingual UI: English and Spanish, switchable at runtime via language cookie
- Responsive, mobile-first design

### Auth & Accounts
- User registration, login, and email verification
- JWT authentication with httpOnly cookies
- Google OAuth via Supabase
- Forgot password / reset password flow
- User profile with avatar upload and username settings
- Admin dashboard with job queue status monitoring

### Technical
- Redis caching for scrape results (30-minute TTL)
- Bull job queue for background price-checking workers
- Supabase (PostgreSQL) in production; SQLite local fallback for development
- Deployed on Render.com with `render.yaml` configuration

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Framework | Express |
| Database (production) | Supabase (PostgreSQL) |
| Database (local fallback) | SQLite |
| Scraping | Apify |
| Caching | Redis |
| Job Queue | Bull |
| Authentication | JWT (httpOnly cookies), bcryptjs |
| OAuth | Google via Supabase |
| Charts | Chart.js |
| Deployment | Render.com |
| Language | JavaScript (bilingual EN / ES UI) |

---

## Project Structure

```
oferta-radar/
├── Docs/                          # Project documentation
├── src/
│   ├── backend/
│   │   ├── server.js              # Main Express server (routes + HTML rendering)
│   │   ├── db.js                  # SQLite schema (local fallback)
│   │   ├── supabase-db.js         # Supabase database operations
│   │   ├── apify.js               # Apify scraper integration
│   │   ├── product-spec-extractor.js
│   │   ├── config/
│   │   │   └── redis.js           # Redis client configuration
│   │   ├── queue/
│   │   │   └── index.js           # Bull queue setup
│   │   └── workers/
│   │       └── price-checker.js   # Background price-checking worker
│   └── frontend/
│       ├── styles.css             # Single global stylesheet
│       └── images/
├── sql/
│   └── migrations/                # Database migration files
├── supabase/                      # Supabase project configuration
├── render.yaml                    # Render.com deployment configuration
└── package.json
```

---

## Getting Started

### Prerequisites

- **Node.js** v18 or higher
- **npm** v9 or higher
- A [Supabase](https://supabase.com) project (or use the SQLite fallback for local dev)
- An [Apify](https://apify.com) account and API token
- A Redis instance (local or hosted — e.g. Redis Cloud, Upstash)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/oferta-radar.git
cd oferta-radar

# Install dependencies
npm install
```

### Environment Variables

Create a `.env` file in the project root with the following variables:

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anonymous/public API key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) |
| `JWT_SECRET` | Secret string used to sign JWT tokens |
| `Apify_Token` | Apify API token for web scraping |
| `REDIS_URL` | Redis connection URL |
| `PORT` | Port the Express server listens on (default: `3000`) |

Example `.env`:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
JWT_SECRET=a-long-random-secret-string
Apify_Token=your-apify-token
REDIS_URL=redis://localhost:6379
PORT=3000
```

### Running Locally

```bash
# Start the development server (with auto-reload)
npm run dev

# Start the production server
npm start

# Start the background price-checker worker (separate process)
npm run worker

# Seed the database with initial product data
npm run seed
```

The application will be available at `http://localhost:3000`.

---

## Deployment

OfertaRadar is configured for deployment on [Render.com](https://render.com) using the included `render.yaml`.

**Steps:**

1. Fork or push this repository to GitHub.
2. Create a new Render **Web Service** and connect your repository.
3. Render will detect `render.yaml` automatically and apply the configuration.
4. Add all required environment variables in the Render dashboard under **Environment**.
5. Deploy. The price-checker worker can be deployed as a separate Render **Background Worker** pointing to `npm run worker`.

The live deployment is available at: **https://shopsavvy-price-tracker.onrender.com**

---

## API Endpoints

| Method | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/` | No | Homepage — deals, popular products, price drops |
| `GET` | `/category/:key` | No | Browse products by category |
| `GET` | `/product/:id` | No | Product detail page |
| `GET` | `/dashboard` | Yes | User price tracking dashboard with charts |
| `GET` | `/profile` | Yes | User profile page |
| `GET` | `/profile/settings` | Yes | Avatar upload and username settings |
| `GET` | `/login` | No | Login page |
| `GET` | `/register` | No | Registration page |
| `GET` | `/verify` | No | Email verification |
| `GET` | `/forgot-password` | No | Forgot password page |
| `GET` | `/reset-password` | No | Reset password page |
| `POST` | `/api/scrape` | Yes | Trigger a product scrape from Apify |
| `POST` | `/api/track` | Yes | Track or untrack a product |
| `GET` | `/api/deals/popular` | No | Fetch popular product data |
| `GET` | `/api/deals/price-drops` | No | Fetch top price drop data |
| `GET` | `/set-lang/:lang` | No | Set UI language cookie (`en` or `es`) |

---

## Contributing

Contributions, issues, and feature requests are welcome. Please open an issue first to discuss what you would like to change. Pull requests should target the `main` branch.

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Commit your changes: `git commit -m 'Add your feature'`
4. Push to the branch: `git push origin feature/your-feature-name`
5. Open a pull request

---

## License

This project is licensed under the **MIT License**.

See [LICENSE](LICENSE) for details.
