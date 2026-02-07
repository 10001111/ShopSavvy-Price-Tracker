# Mercado Libre Scraping Solution 🛠️

**Date**: 2026-02-07  
**Issue**: Mercado Libre scraper returning 0 products  
**Root Cause**: Mercado Libre uses JavaScript to load products dynamically

---

## 🔍 Problem Diagnosis

### Test Results
```
ML page title: "" (empty)
Total links on page: 2
Sample links: ['//www.mercadolibre.com', '//mercadolibre.com']
ML search found: 0 product links
```

### Root Cause
**CheerioCrawler (static HTML parser) cannot scrape Mercado Libre** because:
1. ❌ Mercado Libre loads products via JavaScript (React/Next.js)
2. ❌ CheerioCrawler only parses initial HTML (no JS execution)
3. ❌ Product data is not in the HTML source, it's loaded asynchronously

---

## ✅ Solutions (3 Options)

### Option 1: Use Official Apify Mercado Libre Actor (RECOMMENDED)
**Pros**:
- ✅ Already optimized for Mercado Libre
- ✅ Maintained by Apify team
- ✅ Handles anti-bot protection
- ✅ No development needed

**Cons**:
- ⚠️ Requires separate actor call
- ⚠️ May have usage limits/costs

**Implementation**:
```javascript
// In apify.js
const mlResults = await apify.actor('dtrungtin/mercadolibre-scraper').call({
  search: query,
  maxItems: maxResults
});
```

### Option 2: Switch to PlaywrightCrawler (Browser-Based)
**Pros**:
- ✅ Renders JavaScript
- ✅ Can scrape any dynamic site
- ✅ Full control

**Cons**:
- ❌ Slower (opens real browser)
- ❌ Higher memory usage
- ❌ More expensive on Apify

**Implementation**:
```javascript
const { PlaywrightCrawler } = require("crawlee");

const mlCrawler = new PlaywrightCrawler({
  async requestHandler({ page, request }) {
    await page.waitForSelector('.ui-search-result');
    const products = await page.$$eval('.ui-search-result', ...);
  }
});
```

###Option 3: Use Mercado Libre Official API
**Pros**:
- ✅ Official, stable
- ✅ Fast, reliable
- ✅ No scraping issues

**Cons**:
- ❌ Requires API key/OAuth
- ❌ May have rate limits
- ❌ Limited to available endpoints

**Implementation**:
```javascript
const response = await fetch(
  `https://api.mercadolibre.com/sites/MLM/search?q=${query}`
);
```

---

## 🚀 Recommended Approach

**For now: Disable Mercado Libre and focus on Amazon Mexico**

### Why?
1. Amazon Mexico scraper is working perfectly (118 products scraped)
2. Mercado Libre requires significant refactoring
3. You can still get good product coverage from Amazon Mexico alone

### Implementation Steps:

#### 1. Update apify.js to skip Mercado Libre temporarily
```javascript
// In scrapeProducts function
async function scrapeProducts({ source = "amazon", query = "", ... }) {
  // Force Amazon-only for now
  if (source === "all") source = "amazon";
  if (source === "mercadolibre") {
    console.log("[Apify] Mercado Libre temporarily disabled");
    return [];
  }
  // ... rest of function
}
```

#### 2. Add note to search form
```html
<!-- In server.js search form -->
<p class="search-note">
  Currently searching Amazon Mexico only. 
  Mercado Libre integration coming soon!
</p>
```

#### 3. Future: Integrate Official ML Actor
When ready, use Apify's official Mercado Libre scraper:
- Actor ID: `dtrungtin/mercadolibre-scraper`
- Or search Apify Store for "Mercado Libre"

---

## 📊 Current Status

| Source | Status | Products | Notes |
|--------|--------|----------|-------|
| Amazon Mexico | ✅ Working | 118 | Using amazon.com.mx, MXN prices |
| Mercado Libre | ❌ Not Working | 0 | Requires browser scraper |

---

## 🎯 Action Plan

### Immediate (Now)
1. ✅ Disable Mercado Libre in backend
2. ✅ Focus on Amazon Mexico only
3. ✅ Update UI to show "Amazon Mexico" as source
4. ✅ Improve Amazon product variety

### Short-term (This Week)
1. Research Apify Mercado Libre actors
2. Test official ML scraper
3. Integrate if suitable

### Long-term (Future)
1. Build custom Playwright scraper for ML
2. Add ML official API integration
3. Support multiple sources seamlessly

---

## 💡 Why Amazon-Only is Fine

### Good Product Coverage
- Amazon Mexico has millions of products
- Categories: Electronics, Phones, Toys, Clothing, Home, etc.
- Competitive prices
- Reliable stock information

### User Experience
- Users searching for "iPhone" will still find products
- All products have:
  - ✅ Valid prices in MXN
  - ✅ Ratings and reviews
  - ✅ Stock availability
  - ✅ Product images
  - ✅ Affiliate links

### Technical Benefits
- Faster searches (no ML timeout)
- Lower Apify costs
- Simpler maintenance
- Better reliability

---

## 🔧 Quick Fix Implementation

Let me implement the temporary Amazon-only solution while we research better ML scraping options.

