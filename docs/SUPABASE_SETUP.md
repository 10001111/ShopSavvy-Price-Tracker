# ShopSavvy Price Tracker - Supabase Setup Guide

This guide will help you set up **real data analysis** for the ShopSavvy Price Tracker by integrating Supabase for cloud database and automated price tracking.

## 🎯 What This Enables

Once configured, your application will:
- **Track real product prices** from Mercado Libre API over time
- **Analyze price history** to detect best prices and good deals
- **Calculate real statistics** for Highlighted Deals, Popular Products, Top Price Drops
- **Show dynamic discounts** by category based on actual data
- **Run background workers** that automatically check prices every hour

---

## 📋 Prerequisites

1. **Node.js 18+** installed
2. **Redis** installed and running (for background jobs)
3. **Supabase account** (free tier is sufficient)

---

## 🚀 Step 1: Create Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Click **"New Project"**
3. Choose your organization (or create one)
4. Fill in project details:
   - **Name**: ShopSavvy Price Tracker
   - **Database Password**: Save this securely!
   - **Region**: Choose closest to your users (e.g., South America)
5. Click **"Create new project"**
6. Wait 2-3 minutes for project to provision

---

## 🗄️ Step 2: Run Database Migration

1. In your Supabase dashboard, go to **SQL Editor** (left sidebar)
2. Click **"New Query"**
3. Open the file `supabase-migration.sql` from your project root
4. Copy all the SQL code and paste it into the Supabase SQL Editor
5. Click **"Run"** (or press Ctrl/Cmd + Enter)
6. You should see: `Success. No rows returned`

**This creates all required tables:**
- `users` - User accounts
- `login_history` - Authentication audit log
- `user_sessions` - Active sessions
- `tracked_products` - Products being monitored
- `price_history` - Historical price data

---

## 🔑 Step 3: Get API Credentials

1. In Supabase dashboard, go to **Settings** → **API**
2. Copy the following values:

### Project URL
```
https://xxxxxxxxxxxxx.supabase.co
```

### API Keys
- **anon (public)** - Used for client-side requests
- **service_role (secret)** - Used for server-side operations ⚠️ **Keep this secret!**

---

## ⚙️ Step 4: Configure Environment Variables

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and add your Supabase credentials:

```env
# ============================================
# DATABASE CONFIGURATION
# ============================================
USE_SUPABASE=true

SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# ============================================
# REDIS CONFIGURATION
# ============================================
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# ============================================
# BACKGROUND WORKER
# ============================================
ENABLE_PRICE_WORKER=true
PRICE_CHECK_INTERVAL_MINUTES=60
PRICE_CHECK_CONCURRENCY=5
PRICE_CHECK_MAX_RETRIES=3

# ============================================
# JWT SECRET (change this!)
# ============================================
JWT_SECRET=change-this-to-a-random-secure-string
```

---

## 📦 Step 5: Install Redis (if not already installed)

### Windows (using Chocolatey):
```bash
choco install redis-64
```

### macOS:
```bash
brew install redis
brew services start redis
```

### Linux (Ubuntu/Debian):
```bash
sudo apt update
sudo apt install redis-server
sudo systemctl start redis
```

### Docker:
```bash
docker run -d -p 6379:6379 redis:alpine
```

**Verify Redis is running:**
```bash
redis-cli ping
# Should return: PONG
```

---

## 🌱 Step 6: Seed Database with Real Products

This script fetches real products from Mercado Libre and adds them to your database:

```bash
npm run seed
```

**What it does:**
1. Creates a demo user (email: `demo@shopsavvy.com`, password: `demo1234`)
2. Fetches ~50 real products from Mercado Libre across 6 categories:
   - Electronics (iPhone, Samsung, MacBook, etc.)
   - Home & Kitchen (Dyson, Ninja, etc.)
   - Toys (PlayStation, Xbox, Nintendo Switch)
   - Fashion (Nike, Adidas, Ray-Ban)
   - Sports & Outdoors (Treadmill, Yoga Mat)
   - Beauty (L'Oréal, Olay, Gillette)
3. Adds them to `tracked_products` table
4. Creates initial price history entries

**Output should look like:**
```
============================================================
ShopSavvy - Seeding Database with Real Products
============================================================

✓ Supabase connected
✓ All required tables exist
✓ Found existing demo user: demo@shopsavvy.com

📦 Seeding electronics...
  Fetching: iphone 15...
  ✓ Added: iPhone 15 Pro Max 256GB Titanio Natural... ($28999)
  ✓ Added: iPhone 15 128GB Azul... ($18999)
  ...

============================================================
✓ Seeding complete! Added 47 products
============================================================
```

---

## 🤖 Step 7: Start the Application

```bash
npm start
```

**The application will:**
1. Connect to Supabase
2. Verify all tables exist
3. Initialize the background price checker worker
4. Start checking prices every 60 minutes

**You should see:**
```
[Config] Database: Supabase (cloud)
[Supabase] Client initialized (using service_role key)
[Supabase] ✓ All required tables accessible
[Worker] ✓ Price checker worker initialized
[PriceChecker] Starting price checker worker...
[PriceChecker] Scheduled 47 price checks
[PriceChecker] Will check prices every 60 minutes
HTTP server running at http://localhost:3000
```

---

## 📊 Step 8: Wait for Data to Accumulate

**Initial State (Day 0):**
- You'll see the tracked products
- But data analysis sections (Highlighted Deals, Popular Products) will still show demo data
- This is because there's only 1 price point per product (no history yet)

**After 24 Hours:**
- The worker will have checked prices ~24 times
- Price history table will have multiple data points
- Real data analysis will start working:
  - Average prices calculated
  - Best prices detected
  - Good deals identified
  - Price drops tracked

**After 7 Days:**
- Full statistical analysis available
- Accurate trend detection
- Reliable discount calculations

---

## 🔍 Verify Everything is Working

### 1. Check Supabase Dashboard

Go to **Database** → **Table Editor** in Supabase:

- **tracked_products**: Should show ~47 products
- **price_history**: Should grow over time (check `recorded_at` timestamps)

### 2. Check Logs

Watch the console for price checker activity:
```
[PriceChecker] Checking price for MLM123456789 (source: mercadolibre)
[PriceChecker] ✓ Updated price for MLM123456789: $24999
[PriceChecker] Job abc-123 completed: success MLM123456789 24999
```

### 3. Test the API Endpoints

```bash
# Get highlighted deals
curl http://localhost:3000/api/deals/highlighted

# Get popular products
curl http://localhost:3000/api/deals/popular

# Get price drops
curl http://localhost:3000/api/deals/price-drops
```

---

## 🐛 Troubleshooting

### "Supabase tables not found"
- Make sure you ran the migration SQL in Supabase SQL Editor
- Check that you're using the `service_role` key (not just `anon` key)
- Verify in Supabase Dashboard → Database → Tables that tables exist

### "Redis connection error"
- Make sure Redis is running: `redis-cli ping`
- Check Redis connection settings in `.env`
- On Windows, ensure Redis service is started

### "Price checker not starting"
- Check that `ENABLE_PRICE_WORKER=true` in `.env`
- Verify `USE_SUPABASE=true` in `.env`
- Check console for error messages

### "No products found"
- Run the seed script: `npm run seed`
- Check Supabase → tracked_products table has data
- Verify demo user exists in users table

### "Still showing demo data"
- This is normal on day 1 (not enough price history)
- Wait 24-48 hours for price history to accumulate
- Check price_history table is being populated

---

## 🎨 Customization

### Change Price Check Frequency

Edit `.env`:
```env
PRICE_CHECK_INTERVAL_MINUTES=30  # Check every 30 minutes
```

### Add More Products

Edit `src/backend/scripts/seed-products.js` and modify `SEED_CATEGORIES`:
```javascript
{
  category: "electronics",
  queries: [
    "iphone 15",
    "samsung galaxy s24",
    // Add more queries here
    "sony headphones wh-1000xm5",
    "bose quietcomfort",
  ],
  limit: 5, // Products per query
}
```

Then run: `npm run seed`

### Track Specific Products

Use the dashboard or API to add products manually:
```bash
curl -X POST http://localhost:3000/api/products/track \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "MLM123456789",
    "productTitle": "My Product",
    "productUrl": "https://...",
    "source": "mercadolibre",
    "currentPrice": 999.99
  }'
```

---

## 📈 Monitoring Price History

### View Price History in Supabase

1. Go to **Database** → **Table Editor** → **price_history**
2. You'll see entries like:

| id | tracked_product_id | price | recorded_at |
|----|-------------------|-------|-------------|
| 1  | abc-123          | 24999 | 2024-01-15 10:00:00 |
| 2  | abc-123          | 24899 | 2024-01-15 11:00:00 |
| 3  | abc-123          | 24999 | 2024-01-15 12:00:00 |

### Query Price Statistics

Use the SQL functions created in the migration:

```sql
-- Get 30-day average price for a product
SELECT get_average_price('product-uuid-here', 30);

-- Get minimum price
SELECT get_min_price('product-uuid-here', 30);

-- Get maximum price
SELECT get_max_price('product-uuid-here', 30);
```

### View Highlighted Deals

```sql
-- Use the pre-built view
SELECT * FROM v_highlighted_deals;
```

---

## 🎉 Success Checklist

- ✅ Supabase project created
- ✅ Database tables created via migration
- ✅ API credentials added to `.env`
- ✅ Redis installed and running
- ✅ Database seeded with real products
- ✅ Application started successfully
- ✅ Price checker worker running
- ✅ Price history accumulating over time

---

## 🆘 Need Help?

- Check the [GitHub Issues](https://github.com/yourusername/shopsavvy/issues)
- Review Supabase logs in Dashboard → Logs
- Check application logs in the console
- Verify Redis is working: `redis-cli monitor`

---

## 📚 Next Steps

1. **Wait 24-48 hours** for meaningful price history
2. **Monitor the dashboard** to see real deals appear
3. **Add email notifications** (optional, requires SMTP setup)
4. **Deploy to production** (Render.com or similar)
5. **Set up monitoring** (Sentry, LogRocket, etc.)

---

**Congratulations! 🎉**

You now have a fully functional price tracking system with real data analysis powered by Supabase and automated background workers.
