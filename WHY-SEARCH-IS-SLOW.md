# Why Search Takes a Long Time - Explanation

## What You're Seeing

- Search for "tv" shows loading state
- Products appear but button stays as "Discovering..."
- Takes 1-2 minutes to complete
- Message: "Discovered 14 products. Reloading results..."

## Root Cause: Apify Actor Real-Time Scraping

### How Search Currently Works:

```
User searches "tv"
    ↓
Check product_cache table
    ↓
[CACHE HIT] ─────────────→ Show results instantly (< 1 second) ✅
    ↓
[CACHE MISS] 
    ↓
Run Apify Actor (scrapes Amazon + Mercado Libre)
    ↓
Wait 1-2 minutes ⏳ ← YOU ARE HERE
    ↓
Store in product_cache
    ↓
Show results
```

### Why It's Slow:

**The first search for any term is ALWAYS slow** because:

1. **Apify Actor must scrape in real-time**:
   - Visits Amazon.com product pages
   - Visits Mercado Libre product pages
   - Extracts product data (title, price, image, etc.)
   - This is REAL web scraping - can't be faster

2. **Configured wait time**: `waitSecs: 300` (5 minutes max)
   - The system waits for Apify to finish
   - Typical scrape: 1-2 minutes
   - Maximum wait: 5 minutes

3. **Synchronous execution**:
   - The request blocks until scraping completes
   - User must wait for results

### Why Button Stays "Discovering...":

Looking at your screenshot, the button is stuck because:

1. **"Discover New Products" button** triggers a SEPARATE scrape via `/api/scrape`
2. **The normal search** ALREADY triggered a scrape via `fetchAllProducts()`
3. **Two scrapes might be running simultaneously** or the button never got reset

## Current Search Behavior

### First Search (Cache Miss):
- **Speed**: 1-2 minutes
- **User sees**: Loading spinner, then products appear
- **What happens**: Apify scrapes Amazon + Mercado Libre

### Second Search (Cache Hit):
- **Speed**: < 1 second (instant)
- **User sees**: Products appear immediately
- **What happens**: Reads from product_cache table

### Cache Duration:
- **Redis cache**: 30 minutes (for Apify results)
- **Database cache**: Indefinite (product_cache table)

## The "Discover New Products" Button Issue

### What This Button Does:

```javascript
async function triggerScrape() {
  // 1. Disable button, show "Discovering..."
  btn.disabled = true;
  btn.textContent = 'Discovering…';
  
  // 2. Call /api/scrape endpoint
  const res = await fetch('/api/scrape', {
    method: 'POST',
    body: JSON.stringify({ source: 'all', query, maxResults: 20 })
  });
  
  // 3. Wait for response (1-2 minutes)
  const data = await res.json();
  
  // 4. Show success message
  statusEl.textContent = 'Discovered 14 products. Reloading results…';
  
  // 5. Reload page after 1.2 seconds
  setTimeout(() => {
    window.location.href = url.toString();
  }, 1200);
}
```

### The Problem:

**When you just search normally**, the system already:
1. Checks cache
2. Runs Apify scrape if needed
3. Shows results

**When you click "Discover New Products"**:
1. Triggers ANOTHER Apify scrape
2. Button shows "Discovering..."
3. Waits 1-2 minutes
4. Reloads page

**This creates a confusing UX where the button seems stuck.**

## Solutions to Consider

### Option 1: Show Better Loading State (Quick Fix)

Instead of blocking, show products as they come in:

```javascript
// Show immediate feedback
statusEl.textContent = 'Searching cache...';

// Check cache first
const cached = await searchCache(query);

if (cached.length > 0) {
  // Show cached results immediately
  displayResults(cached);
  statusEl.textContent = 'Refreshing in background...';
  // Trigger background refresh
} else {
  statusEl.textContent = 'No cache found. Scraping Amazon + Mercado Libre (1-2 min)...';
  // Show scraping progress
}
```

### Option 2: Make "Discover New Products" Actually Useful

Currently it's redundant. Make it:

**Option A**: Force a fresh scrape (ignore cache)
- Button text: "🔄 Refresh Results"
- Only show when there ARE cached results
- Forces new scrape to get latest prices

**Option B**: Remove the button entirely
- Normal search already scrapes when needed
- Less confusing for users

### Option 3: Use Background Jobs (Advanced)

Move scraping to background queue:

```javascript
// User searches
POST /api/search?q=tv

// Returns immediately
{ 
  status: "scraping",
  jobId: "abc123",
  message: "Searching... Check back in 1-2 minutes"
}

// Poll for results
GET /api/search/status/abc123

// When ready
{ 
  status: "complete",
  products: [...]
}
```

### Option 4: Populate Cache in Advance (Best UX)

Run background jobs to pre-scrape popular searches:

```javascript
// Cron job every hour
popularSearches = ['tv', 'laptop', 'phone', 'headphones', ...]

for (query of popularSearches) {
  await scrapeProducts({ query });
  // Cache results
}
```

**Result**: Most searches instant because already cached

## Why It Works This Way

### Design Decision: Accuracy Over Speed

The current implementation prioritizes:
- ✅ **Real-time data**: Always scrapes for fresh prices
- ✅ **Comprehensive results**: Searches both Amazon + Mercado Libre
- ✅ **Accurate pricing**: No stale data
- ❌ **Slow first search**: 1-2 minute wait

Alternative would be:
- ✅ **Fast searches**: Instant results
- ❌ **Stale data**: May show old prices
- ❌ **Manual refresh needed**: Users must click "refresh" for new data

## Immediate Actionable Fixes

### Fix 1: Add Better Progress Messaging

Change the search experience to show what's happening:

```
Searching for "tv"...
✓ Checking cache... (0 results)
⏳ Scraping Amazon.com... (this takes 1-2 minutes)
⏳ Scraping Mercado Libre...
✓ Found 14 products!
```

### Fix 2: Hide/Fix the "Discover New Products" Button

Since normal search already scrapes, this button is redundant and confusing.

**Option A**: Remove it entirely
**Option B**: Only show it when cache is old (> 24 hours)
**Option C**: Change to "Force Refresh" and make it clear it will take 1-2 min

### Fix 3: Cache Popular Searches

Add a seed script to pre-cache common searches:
- tv
- laptop
- phone
- headphones
- etc.

Run it once a day so these searches are always instant.

## Technical Details

### Apify Actor Configuration:

```javascript
const run = await apify.actor(ACTOR_ID).call(
  { source, query, productUrls, maxResults },
  {
    waitSecs: 300,  // Max 5 minutes
    memory: 512,    // 512 MB RAM
  }
);
```

### Search Flow in Code:

**File**: `src/backend/server.js` → `fetchAllProducts()` (line 1176)

```javascript
// Check cache
const existing = await supabaseDb.searchProductCache(query);

if (existing.length > 0) {
  // Cache hit: serve immediately, refresh in background
  return existing;
} else {
  // Cache miss: scrape synchronously (SLOW)
  await runScrapeAndStore();  // ← 1-2 minutes here
  const fresh = await supabaseDb.searchProductCache(query);
  return fresh;
}
```

## Summary

**Why it's slow**: First search for any term requires real-time web scraping of Amazon + Mercado Libre, which takes 1-2 minutes.

**Why button is stuck**: The "Discover New Products" button triggers a redundant scrape and stays in loading state.

**How to fix**:
1. Add better progress messaging
2. Remove or fix the "Discover New Products" button
3. Pre-cache popular searches
4. Consider background job queue for better UX

**What's working correctly**:
- ✅ Products ARE being found (14 products for "tv")
- ✅ Results ARE being cached for future searches
- ✅ Second search for "tv" will be instant (< 1 second)

The system is working as designed, but the UX could be improved to better communicate what's happening and why it takes time.
