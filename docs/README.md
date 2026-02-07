# ShopSavvy Price Tracker

A web application that tracks product prices across Amazon and Mercado Libre, helping users find the best deals.

## 🚀 Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   - Copy `.env.example` to `.env`
   - Add your Apify API token
   - Add your Supabase credentials

3. **Start the server:**
   ```bash
   npm start
   ```

4. **Open browser:**
   ```
   http://localhost:3000
   ```

## 📚 Documentation

All documentation is organized in the `/docs/` folder:

### 🎯 Getting Started
- **[PROJECT.md](docs/PROJECT.md)** - Complete project overview
- **[SETUP_COMPLETE.md](docs/SETUP_COMPLETE.md)** - Initial setup guide
- **[SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md)** - Database setup

### 🏷️ Category System
- **[CATEGORY-AUTO-SCRAPING-CONFIRMATION.md](docs/CATEGORY-AUTO-SCRAPING-CONFIRMATION.md)** - Auto-scraping implementation
- **[QUICK-TEST-GUIDE.md](docs/QUICK-TEST-GUIDE.md)** - 2-minute test guide

### ⚡ Performance
- **[PERFORMANCE-OPTIMIZATIONS.md](docs/PERFORMANCE-OPTIMIZATIONS.md)** - Performance guide
- **[RESPONSIVE-DESIGN.md](docs/RESPONSIVE-DESIGN.md)** - Responsive design
- **[SEARCH-PERFORMANCE-OPTIMIZATIONS.md](docs/SEARCH-PERFORMANCE-OPTIMIZATIONS.md)** - Search optimization

### 🔧 Troubleshooting
- **[DEBUGGING-GUIDE.md](docs/DEBUGGING-GUIDE.md)** - Debug common issues
- **[SEARCH-NOT-WORKING-FIX.md](docs/SEARCH-NOT-WORKING-FIX.md)** - Search fixes
- **[PRODUCT-NOT-FOUND-FIX.md](docs/PRODUCT-NOT-FOUND-FIX.md)** - Product errors

### 📁 Organization
- **[FILE-ORGANIZATION.md](docs/FILE-ORGANIZATION.md)** - Project structure

## ✨ Key Features

- ✅ **Auto-Scraping Categories** - Click any category to load products automatically
- ✅ **Dual Source** - Scrapes Amazon & Mercado Libre simultaneously
- ✅ **Smart Caching** - Stale-while-revalidate for fast searches
- ✅ **1000+ Keywords** - Accurate product categorization
- ✅ **Responsive Design** - Mobile-first with fluid typography
- ✅ **Performance Optimized** - GPU-accelerated animations, passive listeners

## 🎯 Category System

The app includes 6 main categories with automatic product scraping:

| Category | Products | Auto-Keyword |
|----------|----------|--------------|
| 📱 Electronics | Phones, laptops, TVs, cameras | `iphone` |
| 💄 Beauty | Skincare, makeup, haircare | `moisturizer` |
| 👗 Fashion | Clothing, shoes, accessories | `shirt` |
| 🏠 Home & Kitchen | Appliances, furniture, tools | `vacuum` |
| ⚽ Sports & Outdoors | Equipment, fitness, outdoor | `soccer` |
| 🎮 Toys & Games | Lego, consoles, board games | `lego` |

## 🛠️ Tech Stack

- **Backend:** Node.js, Express
- **Database:** Supabase (PostgreSQL) + SQLite fallback
- **Web Scraping:** Apify
- **Frontend:** Vanilla JS, CSS
- **Authentication:** JWT, bcrypt

## 📊 Project Structure

```
ShopSavvy Price Tracker/
├── docs/               # All documentation
├── json/               # JSON configurations
├── src/
│   ├── backend/       # Express server, database, scraping
│   └── frontend/      # HTML, CSS, client-side JS
├── data/              # SQLite database
├── certs/             # SSL certificates
├── .env               # Environment variables
└── package.json       # Dependencies
```

## 🧪 Testing

```bash
# Test category auto-scraping
npm start
# Open http://localhost:3000
# Click any category link (e.g., "Electronics")
# Watch console for scraping activity
```

See [QUICK-TEST-GUIDE.md](docs/QUICK-TEST-GUIDE.md) for detailed testing instructions.

## 📝 License

MIT License - See LICENSE file for details

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📧 Support

For issues and questions, please check the [documentation](docs/) or open an issue.

---

**Last Updated:** February 6, 2026
