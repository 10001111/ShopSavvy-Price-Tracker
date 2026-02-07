# Quick Reference - Debug Console Messages

## 🎯 How to Read Console Output

All debug messages use emoji prefixes for easy scanning:

| Emoji | Meaning | Example |
|-------|---------|---------|
| 🕷️ | Apify scraping | `🕷️ [APIFY] Starting scraping...` |
| 💾 | Database storage | `💾 [CACHE] Storing product...` |
| 🏷️ | Category access | `🏷️ [CATEGORY] User clicked category` |
| 📦 | Product data | `📦 [PRODUCT] Found 10 products` |
| ✅ | Success | `✅ [CACHE] Successfully stored!` |
| ❌ | Error | `❌ [CACHE] Failed to store` |
| ⚠️ | Warning | `⚠️ [APIFY] Cache miss` |
| 💡 | Solution hint | `💡 [CACHE] SOLUTION: Run migration` |
| 🚀 | Action started | `🚀 [CATEGORY] Triggering scraping` |
| ⏳ | Waiting | `⏳ [CATEGORY] Background scraping...` |
| 🔍 | Debug info | `🔍 [DEBUG] Checking database...` |

---

## 📋 Common Console Patterns

### ✅ Normal Operation (Everything Working)

```
🏷️  [CATEGORY] ========== CATEGORY PAGE ==========
🏷️  [CATEGORY] User accessed: "electronics"
🚀 [CATEGORY] Triggering Apify scraping
⏳ [CATEGORY] Background scraping initiated (5 searches)
📦 [CATEGORY] Found 12 cached products

🕷️  [APIFY] ========== SCRAPING REQUEST ==========
🕷️  [APIFY] Query: "smartphone"
✅ [APIFY] Successfully scraped 10 products
💾 [APIFY] Cached 10 products

💾 [CACHE] ========== STORING PRODUCT ==========
💾 [CACHE] Title: "Apple iPhone 15 Pro..."
✅ [CACHE] Successfully stored product!
✅ [CACHE] Price: USD 1199.99
✅ [CACHE] Stock: 25
```

### ❌ Database Error (Migration Not Run)

```
💾 [CACHE] ========== STORING PRODUCT ==========
❌ [CACHE] ========== DATABASE ERROR ==========
❌ [CACHE] Error code: PGRST204
❌ [CACHE] Error message: Could not find 'sold_quantity' column

💡 [CACHE] SOLUTION: Column not found in database schema
💡 [CACHE] ACTION REQUIRED: Run migration 008
💡 [CACHE]   1. Go to Supabase Dashboard > SQL Editor
💡 [CACHE]   2. Run: migrations/008_add_product_quantity_fields.sql
💡 [CACHE]   3. Restart the server
```

**FIX**: Run Migration 008 (see MIGRATION-008-INSTRUCTIONS.md)

### ❌ Apify Failure

```
🕷️  [APIFY] ========== SCRAPING REQUEST ==========
❌ [APIFY] Actor run FAILED with status: ABORTED

💡 Possible causes:
  - Apify token invalid
  - Actor quota exceeded
  - Network timeout
```

**FIX**: Check `.env` for `Apify_Token`, verify Apify dashboard

---

## 🔍 How to Debug Issues

### Issue: Products showing $0.00

**Look for**:
```
❌ [CACHE] Failed to store product
❌ [CACHE] Error code: PGRST204
```

**Solution**: Run Migration 008

### Issue: Categories not scraping

**Look for**:
```
🚀 [CATEGORY] Triggering Apify scraping ← Should see this
🕷️  [APIFY] Starting scraping...        ← Should see this
```

**If missing**: Check Apify credentials in `.env`

### Issue: "Out of Stock" for all products

**Look for**:
```
✅ [CACHE] Stock: 0        ← Wrong
✅ [CACHE] Stock: 15       ← Correct
```

**Solution**: Run Migration 008, restart server

---

## 🚀 Migration 008 - Quick Steps

**If you see PGRST204 errors**, run this immediately:

1. **Go to**: https://supabase.com/dashboard
2. **Click**: SQL Editor
3. **Copy**: `migrations/008_add_product_quantity_fields.sql`
4. **Paste** and click **Run**
5. **Verify**:
   ```sql
   SELECT column_name FROM information_schema.columns
   WHERE table_name = 'product_cache'
   AND column_name IN ('sold_quantity', 'available_quantity');
   ```
   Should return 2 rows
6. **Restart** server: `npm start`

---

## 📊 What to Monitor

### On Server Start
```
✅ Should see:
[Supabase] Client initialized
[Supabase] ✓ All required tables accessible
[Server] Listening on port 3000
```

### On Search
```
✅ Should see:
🕷️  [APIFY] Successfully scraped X products
💾 [CACHE] Successfully stored product!
```

### On Category Click
```
✅ Should see:
🏷️  [CATEGORY] User accessed: "electronics"
🚀 [CATEGORY] Triggering Apify scraping
🕷️  [CATEGORY] Scraping keyword 1/5: "smartphone"
```

---

## ⚡ Common Commands

### Restart Server
```bash
Ctrl+C
npm start
```

### Check Database Connection
```bash
# In Supabase SQL Editor:
SELECT COUNT(*) FROM product_cache;
```

### Clear Redis Cache (if installed)
```bash
# In terminal:
redis-cli FLUSHDB
```

### View Recent Logs
```bash
# Last 50 lines:
npm start | tail -50
```

---

## 🎨 Console Message Format

All messages follow this pattern:

```
[EMOJI] [MODULE] [Action/Status] [Details]
```

Examples:
- `✅ [CACHE] Successfully stored: B0CM5JV268`
- `❌ [APIFY] Actor run FAILED with status: TIMEOUT`
- `🚀 [CATEGORY] Triggering scraping for: electronics`
- `💡 [CACHE] SOLUTION: Run migration 008`

---

## 📈 Success Indicators

After fixing everything, you should see:

✅ No `❌` errors in console  
✅ Products show prices > $0.00  
✅ Stock shows real numbers  
✅ Categories trigger scraping  
✅ Deal sections populated  
✅ Apify runs complete successfully  

---

## 🆘 Emergency Checklist

If nothing works:

1. ✅ Run Migration 008
2. ✅ Restart server completely
3. ✅ Clear browser cache
4. ✅ Check `.env` has all credentials:
   ```
   SUPABASE_URL=...
   SUPABASE_SERVICE_ROLE_KEY=...
   Apify_Token=...
   ```
5. ✅ Check Supabase dashboard (tables exist)
6. ✅ Check Apify dashboard (actor runs)
7. ✅ Review console for `❌` errors
8. ✅ Read `💡 SOLUTION` messages

---

## 📚 Documentation Files

Quick reference to all docs:

- **QUICK-REFERENCE.md** (this file) - Console message guide
- **FIX-SUMMARY.md** - Overall fix summary
- **MIGRATION-008-INSTRUCTIONS.md** - Migration step-by-step
- **DATABASE-AND-CATEGORY-FIX.md** - Technical details
- **migrations/008_add_product_quantity_fields.sql** - SQL migration

---

**Remember**: The console output will guide you! Look for emoji indicators and read the `💡 SOLUTION` messages.
