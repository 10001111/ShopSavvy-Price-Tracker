# 🛒 OfertaRadar

**[Live Demo](https://shopsavvy-price-tracker.onrender.com)** | **Bilingual EN/ES** | **Real-time Price Tracking**

> AI-powered price tracker for Mexico — find the best deals across Amazon and Mercado Libre with intelligent hashtag-based filtering.

OfertaRadar is a full-stack web application that aggregates real-time product listings from Amazon Mexico and Mercado Libre using Apify's web scraping API, tracks price history with visual charts, and alerts users when prices drop on items they follow. The platform features intelligent hashtag-based category filtering, bilingual support (English/Spanish), currency conversion (USD/MXN), and a modern responsive UI with light/dark themes.

---

## 📸 Screenshots

> _Homepage with highlighted deals and category navigation_
> ![OfertaRadar Homepage](docs/screenshot.png)

---

## ✨ Key Features

### 🔍 Smart Search & Discovery
- **Apify-Powered Scraping**: Real-time product data from Amazon Mexico and Mercado Libre via Apify's web scraping actors
- **Hashtag-Based Filtering**: Intelligent categorization system using hashtags (`#phone`, `#toys`, `#gaming`) with exclusion rules to prevent accessories from appearing in wrong categories
- **9 Product Categories**: Electronics, Phones, Laptops, Gaming, Toys, Clothing, Home & Kitchen, Sports, Beauty
- **Advanced Search**: Title-based fuzzy search with Redis caching (30-min TTL) for instant results
- **Product Details**: Full specs extraction (RAM, Storage, Screen Size, OS, 5G support), stock status, seller info, ratings, and image galleries

### 💰 Deals & Price Intelligence
- **Highlighted Deals Carousel**: Curated deals with high discounts displayed in a responsive horizontal carousel
- **Top Price Drops**: Real-time tracking of biggest price reductions across all tracked products
- **Popular Products**: Personalized recommendations based on user search history and trending items
- **Price History Charts**: Interactive Chart.js visualizations showing price trends over time
- **Smart Price Tracking**: Users can track any product and receive notifications when prices drop below target thresholds

### 🌍 User Experience
- **Dual Currency Support**: Toggle between USD and MXN with automatic conversion (persists in `localStorage`)
- **Bilingual Interface**: Full English and Spanish support, switchable at runtime via language cookie
- **Theme Toggle**: Light and dark mode with system preference detection and `localStorage` persistence
- **Responsive Design**: Mobile-first design with optimized layouts for all screen sizes
- **Real-time Updates**: Stale-while-revalidate pattern ensures fresh data without blocking UI

### 🔐 Authentication & User Accounts
- **JWT Authentication**: Secure httpOnly cookies with bcryptjs password hashing (cost factor 10)
- **Email Verification**: User email verification flow with token-based confirmation
- **Google OAuth**: Social login via Supabase Auth integration
- **Password Recovery**: Forgot password and reset password flows with secure token validation
- **User Profiles**: Custom avatars, username settings, and personalized dashboards
- **Admin Dashboard**: Job queue monitoring, Supabase configuration debug panel, user management

### ⚡ Technical Highlights
- **Redis Caching**: 30-minute TTL for Apify scrape results, reducing API costs and improving response times
- **Bull Job Queue**: Background workers for price-checking tracked products (runs every 6 hours)
- **Supabase PostgreSQL**: Production database with Row Level Security (RLS) policies
- **SQLite Fallback**: Local development database with automatic schema migrations
- **Hashtag System**: PostgreSQL array columns with GIN indexes for fast category filtering
- **Server-Side Rendering**: HTML templates generated in Node.js for optimal SEO and performance
- **Apify Actor Integration**: Custom actor (`f5pjkmpD15S3cqunX`) for scraping Amazon and Mercado Libre

---

## 🏗️ Architecture Overview

### Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Runtime** | Node.js v18+ | JavaScript runtime environment |
| **Framework** | Express.js | Web server and routing |
| **Database (Production)** | Supabase (PostgreSQL) | Cloud database with real-time subscriptions |
| **Database (Local)** | SQLite | Development fallback with automatic migrations |
| **Web Scraping** | Apify API | Automated data extraction from e-commerce sites |
| **Caching** | Redis | In-memory cache for scrape results (30-min TTL) |
| **Job Queue** | Bull | Background task processing for price checks |
| **Authentication** | JWT + bcryptjs | Secure token-based auth with password hashing |
| **OAuth Provider** | Google (via Supabase) | Social login integration |
| **Charts** | Chart.js | Interactive price history visualizations |
| **Deployment** | Render.com | Cloud hosting with auto-deploy from GitHub |
| **Language** | JavaScript (CommonJS) | Server-side logic and HTML templating |
| **Styling** | CSS3 (Single file) | Custom responsive styles with CSS variables |

### System Architecture

```
┌─────────────┐
│   Client    │ (Browser)
│  HTML + JS  │
└──────┬──────┘
       │ HTTP/HTTPS
       ▼
┌─────────────────────────────────────┐
│         Express Server              │
│  (server.js - 9400+ lines)          │
│  • Routes & HTML rendering          │
│  • Category filtering (hashtags)    │
│  • JWT auth middleware              │
│  • Apify scraper integration        │
└──┬────────┬────────┬────────┬───────┘
   │        │        │        │
   │        │        │        │
   ▼        ▼        ▼        ▼
┌──────┐ ┌─────┐ ┌─────┐ ┌──────────┐
│ Redis│ │Apify│ │Bull │ │ Supabase │
│Cache │ │ API │ │Queue│ │PostgreSQL│
└──────┘ └─────┘ └─────┘ └──────────┘
                    │
                    ▼
              ┌──────────────┐
              │Price Checker │
              │    Worker    │
              └──────────────┘
```

---

## 📁 Project Structure

```
oferta-radar/
├── Docs/                                    # Documentation
│   ├── GLOBAL-CURRENCY-SYSTEM.md           # Currency toggle implementation
│   ├── HASHTAG-FILTERING-SYSTEM.md         # Hashtag system architecture
│   ├── HASHTAG-SETUP-GUIDE.md              # Migration setup guide
│   └── PRODUCT-PAGE-UPDATE.txt             # Multi-source product page notes
│
├── src/
│   ├── backend/
│   │   ├── server.js                       # Main Express server (9400+ lines)
│   │   │                                   # Routes, HTML rendering, auth, categories
│   │   ├── db.js                           # SQLite schema and helpers
│   │   ├── supabase-db.js                  # All Supabase operations
│   │   │                                   # User CRUD, product cache, price history
│   │   ├── apify.js                        # Apify actor calls (f5pjkmpD15S3cqunX)
│   │   ├── product-spec-extractor.js       # Extract RAM, Storage, Screen, etc.
│   │   ├── config/
│   │   │   └── redis.js                    # Redis client configuration
│   │   ├── queue/
│   │   │   └── index.js                    # Bull queue setup
│   │   └── workers/
│   │       └── price-checker.js            # Background price-check worker
│   │
│   └── frontend/
│       ├── styles.css                      # Single global stylesheet (CSS variables)
│       └── images/                         # Static assets
│
├── sql/
│   └── migrations/                         # Database migration SQL files
│
├── supabase/
│   └── migrations/                         # Supabase-specific migrations
│       ├── 001_create_tables.sql
│       ├── 007_create_product_cache.sql
│       ├── 012_add_hashtags_column.sql     # Hashtag system (NEW)
│       └── 013_backfill_hashtags.sql       # Generate hashtags for existing products
│
├── render.yaml                             # Render.com deployment config
├── package.json                            # Node.js dependencies and scripts
├── rulebook.md                             # Development rules and standards
└── README.md                               # This file
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** v18 or higher
- **npm** v9 or higher
- **Supabase** account (or use SQLite fallback for local dev)
- **Apify** account and API token ([sign up](https://apify.com))
- **Redis** instance (local or cloud: Redis Cloud, Upstash, etc.)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/oferta-radar.git
cd oferta-radar

# Install dependencies
npm install
```

### Environment Variables

Create a `.env` file in the project root:

```env
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# Authentication
JWT_SECRET=a-long-random-secret-string-min-32-chars

# Apify Web Scraping
Apify_Token=your-apify-api-token

# Redis Cache
REDIS_URL=redis://localhost:6379

# Server Configuration
PORT=3000
NODE_ENV=development
```

**Environment Variable Reference:**

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Production | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Production | Supabase anonymous/public API key |
| `SUPABASE_SERVICE_ROLE_KEY` | Production | Supabase service role key (bypasses RLS) |
| `JWT_SECRET` | Yes | Secret for signing JWT tokens (min 32 chars) |
| `Apify_Token` | Yes | Apify API token for web scraping |
| `REDIS_URL` | Optional | Redis connection URL (caching disabled if omitted) |
| `PORT` | Optional | Server port (default: 3000, Render sets this automatically) |

### Running Locally

```bash
# Development server with auto-reload (nodemon)
npm run dev

# Production server
npm start

# Background price-checker worker (separate terminal)
npm run worker

# Seed database with demo data
npm run seed
```

Open `http://localhost:3000` in your browser.

### Database Setup

#### Option 1: Supabase (Recommended for Production)

1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Run migrations in **Supabase Dashboard** → **SQL Editor**:
   ```sql
   -- Run each migration file in order:
   -- supabase/migrations/001_create_tables.sql
   -- supabase/migrations/007_create_product_cache.sql
   -- supabase/migrations/012_add_hashtags_column.sql
   -- supabase/migrations/013_backfill_hashtags.sql
   ```
3. Copy API keys to `.env`

#### Option 2: SQLite (Local Development)

If `SUPABASE_URL` is not set, the app automatically uses SQLite:
- Database file: `src/data/app.db` (auto-created)
- Schema: `src/backend/db.js`
- No migration needed (tables created on first run)

---

## 🔌 API Endpoints

### Public Routes

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/` | Homepage with deals, categories, and popular products |
| `GET` | `/?q={query}` | Search results or category filter (e.g., `/?q=phone`) |
| `GET` | `/product/:id` | Product detail page with specs, images, price history |
| `GET` | `/login` | User login page |
| `GET` | `/register` | User registration page |
| `GET` | `/verify` | Email verification endpoint |
| `GET` | `/forgot-password` | Password reset request page |
| `GET` | `/reset-password` | Password reset confirmation page |
| `GET` | `/set-lang/:lang` | Switch language (`en` or `es`) |

### Protected Routes (Requires Auth)

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `GET` | `/dashboard` | User | Price tracking dashboard with Chart.js graphs |
| `GET` | `/profile` | User | User profile page |
| `GET` | `/profile/settings` | User | Avatar upload and username settings |
| `POST` | `/api/track` | User | Track or untrack a product |
| `POST` | `/api/scrape` | User | Trigger Apify scrape for a product |
| `GET` | `/api/deals/popular` | No | Fetch popular products (cached) |
| `GET` | `/api/deals/price-drops` | No | Fetch top price drops |
| `GET` | `/debug/supabase-config` | Admin | Debug Supabase configuration |

---

## 🤖 Apify Integration

### How It Works

OfertaRadar uses **Apify's web scraping platform** to extract real-time product data from Amazon and Mercado Libre.

**Actor ID**: `f5pjkmpD15S3cqunX` (Custom actor for e-commerce scraping)

**Flow:**
1. User searches for "laptop" or clicks a category
2. Server checks Redis cache (30-min TTL)
3. If cache miss, server calls Apify API with search query
4. Apify actor scrapes Amazon/Mercado Libre product listings
5. Results are cached in Redis and stored in Supabase `product_cache` table
6. Hashtags are auto-generated based on product titles (exclusion rules applied)
7. Results returned to user (typically < 3 seconds)

**Code Location**: `src/backend/apify.js`

```javascript
// Example: Scrape products for "iPhone 15"
const results = await scrapeProducts({
  source: 'amazon',      // 'amazon' | 'mercadolibre' | 'all'
  query: 'iPhone 15',
  maxResults: 20
});
```

**Apify Benefits:**
- ✅ Handles anti-bot detection and CAPTCHA solving
- ✅ Scales automatically (no server-side scraping overhead)
- ✅ Returns structured JSON data
- ✅ Supports pagination and filtering
- ✅ Respects rate limits and robots.txt

---

## 🏷️ Hashtag Filtering System

### Overview

OfertaRadar uses a **hashtag-based categorization system** to ensure products appear in the correct categories with high accuracy.

**Problem Solved:**
- ❌ Before: "iPhone charger" appeared in Phones category (wrong!)
- ✅ After: "iPhone charger" excluded from `#phone` tag via exclusion rules

### How Hashtags Work

1. **Generation**: When products are scraped, `generateHashtags()` analyzes the title:
   ```javascript
   // "iPhone 15 Pro Max" → ["phone", "electronics"]
   // "iPhone charger cable" → ["electronics"] (excluded from "phone")
   ```

2. **Exclusion Rules**: Keywords that disqualify products from hashtags:
   - `#phone` excludes: case, cover, charger, cable, holder, mount
   - `#laptop` excludes: case, bag, mousepad, sticker
   - `#electronics` excludes: toy, replica, poster

3. **Database Storage**: PostgreSQL array column with GIN index:
   ```sql
   ALTER TABLE product_cache ADD COLUMN hashtags TEXT[];
   CREATE INDEX idx_product_cache_hashtags ON product_cache USING GIN (hashtags);
   ```

4. **Fast Queries**: Array containment operator (`@>`) for instant filtering:
   ```sql
   SELECT * FROM product_cache WHERE hashtags @> ARRAY['phone'];
   ```

**Valid Hashtags**: `electronics`, `phone`, `laptop`, `gaming`, `toys`, `clothing`, `home`, `sports`, `beauty`

**Documentation**: See `Docs/HASHTAG-FILTERING-SYSTEM.md` for full details.

---

## 📊 Price Tracking System

### Features

- **Track Any Product**: Users can add products to their tracking list from search results or product pages
- **Price History**: Automatic price checks every 6 hours via Bull job queue
- **Visual Charts**: Chart.js line graphs showing price trends over time
- **Price Drop Alerts**: Notifications when tracked products drop below target price (future feature)
- **Dashboard**: Personal dashboard showing all tracked products with current vs. historical prices

### How It Works

1. User clicks "Track Product" on any item
2. Product saved to `tracked_products` table with current price
3. Background worker (`price-checker.js`) runs every 6 hours
4. Worker scrapes latest price from Apify
5. New price saved to `price_history` table
6. Chart.js visualizes price changes on user dashboard

**Code Locations:**
- Track/untrack: `server.js` → `POST /api/track`
- Background worker: `src/backend/workers/price-checker.js`
- Price history query: `supabase-db.js` → `getPriceHistory()`

---

## 🌐 Deployment

### Render.com (Production)

OfertaRadar is configured for one-click deployment on Render.com via `render.yaml`.

**Steps:**

1. Fork this repository to your GitHub account
2. Create a Render account at [render.com](https://render.com)
3. Click **New** → **Blueprint** and connect your repository
4. Render auto-detects `render.yaml` and creates:
   - Web Service (Express server)
   - Background Worker (price checker)
5. Add environment variables in Render dashboard:
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `JWT_SECRET`, `Apify_Token`, `REDIS_URL`
6. Deploy 🚀

**Live Demo**: [shopsavvy-price-tracker.onrender.com](https://shopsavvy-price-tracker.onrender.com)

### Manual Deployment (Any Node.js Host)

```bash
# Install dependencies
npm install --production

# Run database migrations (Supabase SQL Editor)

# Start server
npm start

# Start worker (separate process)
npm run worker
```

**Requirements:**
- Node.js 18+ runtime
- PostgreSQL database (Supabase recommended)
- Redis instance (optional but recommended)
- Environment variables configured

---

## 🧪 Testing

### Manual Testing Checklist

- [ ] Search for products (e.g., "laptop")
- [ ] Click category tabs (Phones, Toys, etc.)
- [ ] Verify products have correct hashtags (no accessories in wrong categories)
- [ ] Register new user account
- [ ] Track a product
- [ ] View price history chart on dashboard
- [ ] Switch language (EN ↔ ES)
- [ ] Toggle currency (USD ↔ MXN)
- [ ] Switch theme (Light ↔ Dark)
- [ ] Test on mobile device

### Server Logs

Monitor these logs to verify functionality:

```
[Hashtag] Filtering by hashtag: #phone
[Hashtag Filter] Found 25 products with #phone
[CACHE] Successfully stored product! Product ID: B0C12345
[Apify] Scraping 20 products from amazon for query: "gaming headset"
[Redis] Cache hit for key: scrape:amazon:laptop
```

---

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:

1. **Fork** the repository
2. **Create a feature branch**: `git checkout -b feature/your-feature-name`
3. **Follow the rulebook**: See `rulebook.md` for coding standards
4. **Test thoroughly**: Ensure no breaking changes
5. **Commit**: `git commit -m 'Add feature: your feature description'`
6. **Push**: `git push origin feature/your-feature-name`
7. **Open a Pull Request** targeting the `main` branch

### Development Rules

- ✅ Never create new files when editing existing ones works
- ✅ All styles go in `src/frontend/styles.css` (single file)
- ✅ All documentation goes in `Docs/` folder
- ✅ Follow existing code structure (CommonJS, no ESM)
- ✅ No hardcoded secrets (use `.env`)
- ✅ Test with both SQLite (local) and Supabase (production)

---

## 📄 License

This project is licensed under the **MIT License**.

See [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

- **Apify** for web scraping infrastructure
- **Supabase** for managed PostgreSQL and Auth
- **Render.com** for free hosting
- **Chart.js** for beautiful price history visualizations
- **Bull** for reliable job queue processing

---

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/your-username/oferta-radar/issues)
- **Documentation**: See `Docs/` folder for detailed guides
- **Live Demo**: [shopsavvy-price-tracker.onrender.com](https://shopsavvy-price-tracker.onrender.com)

---

**Built with ❤️ for deal hunters in Mexico** 🇲🇽
