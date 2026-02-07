# SQL Utility Scripts

This folder contains **maintenance and utility scripts** for managing your Supabase database.

⚠️ **These are NOT migrations** - Migrations are in `supabase/migrations/`

## Scripts

### Database Verification
- **`check-migrations.sql`** - Verify all migrations (001-010) have been applied to your database
- **`check-product-data.sql`** - Query to inspect product_cache table data

### Data Cleanup
- **`cleanup-all-tracked-products.sql`** - Remove all tracked products from database
- **`cleanup-auto-tracked-products.sql`** - Remove auto-tracked products only
- **`cleanup-tracked-products.sql`** - Selective cleanup of tracked products
- **`cleanup-quick.sql`** - Quick cleanup script
- **`clear-zero-price-products.sql`** - Remove products with $0.00 prices

## Usage

1. Open Supabase Dashboard
2. Go to SQL Editor
3. Copy and paste the script you need
4. Review the query before running
5. Click "Run" to execute

## Important Notes

- ⚠️ Cleanup scripts will **delete data** - use with caution
- ✅ Always backup or export data before running cleanup scripts
- 💡 Use `check-migrations.sql` to verify your database is up to date
- 🔍 Use `check-product-data.sql` to inspect data before cleanup

## Folder Structure

```
sql/                                    ← Utility scripts (run manually)
└── *.sql                              ← Maintenance & verification scripts

supabase/migrations/                   ← Database schema (version controlled)
└── 001-010_*.sql                     ← Schema definitions (run once)
```
