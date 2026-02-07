# Product Variety Improvements 🛍️

**Date**: 2026-02-07  
**Current Status**: 118 Amazon products, 0 Mercado Libre products

---

## 🔍 Current Issues Identified

### 1. **No Mercado Libre Products** ❌
- **Cause**: Mercado Libre uses JavaScript to load products dynamically
- **Impact**: Missing out on competitive prices and product variety
- **Solution**: Temporarily disabled ML scraper (requires browser-based scraping)

### 2. **All Products Uncategorized** ❌
- **Cause**: Products aren't being assigned categories during scraping
- **Impact**: Categories appear empty on website
- **Solution**: Need to implement category detection in scraper

### 3. **Limited Product Variety** ⚠️
- **Cause**: Only 118 products from single source
- **Impact**: Users see limited options in each category
- **Solution**: Run diverse searches to populate database

---

## ✅ Solutions Implemented

### 1. Amazon-Only Mode (Temporary)
```javascript
// In apify.js
if (source === "all") {
  console.log(`[APIFY] Converting "all" to "amazon"`);
  source = "amazon";
}
if (source === "mercadolibre") {
  console.log(`[APIFY] Mercado Libre temporarily disabled`);
  return [];
}
```

**Benefits**:
- ✅ Focus on working scraper
- ✅ Amazon Mexico has millions of products
- ✅ Reliable prices in MXN
- ✅ Fast, consistent results

---

## 🎯 Recommendations to Improve Product Variety

### Immediate Actions (Do Now)

#### 1. **Run Diverse Searches**
Visit your website and search for these terms to populate each category:

**Electronics**:
- `Samsung TV 4K`
- `Sony headphones wireless`
- `iPad Pro`
- `Nintendo Switch OLED`
- `GoPro camera`

**Phones**:
- `iPhone 15 Pro`
- `Samsung Galaxy S24 Ultra`
- `Google Pixel 8`
- `Motorola edge 50`
- `OnePlus 12`

**Computers**:
- `MacBook Air M3`
- `Dell XPS laptop`
- `gaming laptop ASUS`
- `HP LaserJet printer`
- `Logitech mouse`

**Toys**:
- `LEGO Star Wars Millennium Falcon`
- `Hot Wheels track`
- `Barbie Dreamhouse`
- `Funko Pop Marvel Avengers`
- `Nerf blaster`

**Clothing**:
- `Nike Air Force 1`
- `Adidas Ultraboost`
- `Levi 501 jeans`
- `North Face jacket`
- `Under Armour shirt`

**Home & Kitchen**:
- `KitchenAid mixer`
- `Instant Pot Duo`
- `Dyson V15 vacuum`
- `Ninja blender`
- `Cuisinart toaster`

**Beauty**:
- `Maybelline mascara`
- `CeraVe moisturizer`
- `Neutrogena sunscreen`
- `L'Oreal shampoo`
- `Dove body wash`

#### 2. **Enable Category Auto-Detection**
Update the actor to automatically detect categories based on product titles:

```javascript
// Add to actor main.js
function detectCategory(title) {
  const titleLower = title.toLowerCase();
  
  if (titleLower.match(/iphone|samsung galaxy|google pixel|motorola/))
    return 'phones';
  if (titleLower.match(/laptop|macbook|pc|printer|mouse|keyboard/))
    return 'computers';
  if (titleLower.match(/tv|television|headphones|camera|gopro|switch/))
    return 'electronics';
  if (titleLower.match(/lego|hot wheels|barbie|funko|nerf|toy/))
    return 'toys';
  if (titleLower.match(/shoes|nike|adidas|jeans|jacket|shirt/))
    return 'clothing';
  if (titleLower.match(/kitchen|mixer|vacuum|blender|pot|toaster/))
    return 'home-kitchen';
  if (titleLower.match(/mascara|moisturizer|sunscreen|shampoo|beauty/))
    return 'beauty';
    
  return 'uncategorized';
}

// Then in the data save:
await dataset.pushData({
  ...existingData,
  category: detectCategory(title)
});
```

#### 3. **Add maxResults Parameter**
Allow users to control how many results they want:

```javascript
// In search form
<select name="maxResults">
  <option value="20">20 results</option>
  <option value="50">50 results</option>
  <option value="100">100 results</option>
</select>
```

---

## 📊 Expected Results After Improvements

### Before:
```
Total Products: 118
Categories: 1 (uncategorized)
Sources: Amazon only
Variety: Low
```

### After (Running Searches):
```
Total Products: 500+
Categories: 7 (all populated)
Sources: Amazon Mexico
Variety: High (multiple brands per category)
```

### After (Adding Mercado Libre):
```
Total Products: 1000+
Categories: 7
Sources: Amazon + Mercado Libre
Variety: Very High (competitive pricing)
```

---

## 🚀 Long-Term Improvements

### 1. **Implement Playwright Scraper for Mercado Libre**
```javascript
// Create new actor or update existing
const { PlaywrightCrawler } = require('crawlee');

const mlCrawler = new PlaywrightCrawler({
  async requestHandler({ page }) {
    await page.waitForSelector('.ui-search-result');
    const products = await page.$$eval('.ui-search-result', els => {
      return els.map(el => ({
        title: el.querySelector('.ui-search-item__title').textContent,
        price: el.querySelector('.price-tag-amount').textContent,
        url: el.querySelector('a').href
      }));
    });
    // ... save products
  }
});
```

**Estimated Cost**: Higher memory usage (1024MB vs 512MB)  
**Estimated Time**: 2-3x slower than Cheerio  
**Benefit**: Access to Mercado Libre's millions of products

### 2. **Use Apify's Official Mercado Libre Actor**
Search Apify Store for pre-built ML scrapers:
- `dtrungtin/mercadolibre-scraper`
- `trudax/ml-scraper`

**Benefits**:
- ✅ Already optimized
- ✅ Handles anti-bot protection
- ✅ No development needed

### 3. **Scheduled Background Scraping**
Set up cron jobs to auto-populate popular searches:

```javascript
// Every 6 hours, scrape trending products
const trendingSearches = [
  'iPhone', 'Samsung', 'PlayStation 5',
  'AirPods', 'Nintendo Switch', 'iPad'
];

for (const query of trendingSearches) {
  await scrapeProducts({ source: 'amazon', query, maxResults: 20 });
}
```

### 4. **Smart Category Detection with AI**
Use OpenAI/Claude to categorize products accurately:

```javascript
const response = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'x-api-key': process.env.CLAUDE_API_KEY,
    'content-type': 'application/json'
  },
  body: JSON.stringify({
    model: 'claude-3-haiku-20240307',
    messages: [{
      role: 'user',
      content: `Categorize this product: "${productTitle}". 
                Return one of: electronics, phones, computers, toys, clothing, home-kitchen, beauty`
    }]
  })
});
```

---

## 💡 Quick Wins (Do These First)

1. ✅ **Run 5-10 searches per category** (30 minutes)
   - Populates database immediately
   - Shows variety to users
   - No code changes needed

2. ✅ **Add category detection to actor** (1 hour)
   - Products auto-categorize
   - Categories populate correctly
   - Better user experience

3. ✅ **Increase maxResults from 20 to 50** (5 minutes)
   - More products per search
   - Faster database population
   - Minimal cost increase

---

## 🎯 Success Metrics

| Metric | Current | Target | Strategy |
|--------|---------|--------|----------|
| Total Products | 118 | 500+ | Run diverse searches |
| Categories Populated | 0/7 | 7/7 | Add category detection |
| Sources Active | 1/2 | 2/2 | Fix ML scraper |
| Avg Products/Category | 0 | 50+ | Targeted searches |
| Duplicates | Unknown | <5% | Implement dedup |

---

## ✅ Action Plan

### This Week
- [ ] Run 5 searches per category (35 searches total)
- [ ] Add category detection to actor
- [ ] Test category pages on website
- [ ] Verify all categories have products

### Next Week
- [ ] Research Playwright for Mercado Libre
- [ ] Test official ML actor from Apify Store
- [ ] Implement duplicate detection
- [ ] Add more granular categories

### This Month
- [ ] Launch Mercado Libre scraper
- [ ] Set up scheduled background scraping
- [ ] Optimize search performance
- [ ] Add product recommendations

---

## 🎉 Summary

**Current State**: 118 Amazon products, all uncategorized  
**Root Cause**: Limited searches, no category detection, ML scraper broken  
**Quick Fix**: Run diverse searches + add category detection  
**Long-term**: Fix ML scraper with Playwright or use official actor  

**Bottom Line**: You can have a fully populated store with 500+ products across all categories by simply running searches and adding basic category detection!
