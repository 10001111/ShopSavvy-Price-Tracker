# Supabase Folder

## Purpose
This folder contains database migration files that define the schema for the Supabase cloud database.

## Usage

### Migrations
The `migrations/` folder contains 10 SQL files that define the database structure:
- 001 through 007: Core tables and features
- 008 through 010: Product tracking and categorization features

**Important**: These migrations are NOT automatically applied from code. They are documentation and must be run manually in the Supabase dashboard SQL editor.

### How to Apply Migrations
1. Go to Supabase Dashboard > SQL Editor
2. Copy the SQL from each migration file (in order: 001 → 010)
3. Run each one in the SQL editor
4. Verify tables are created using the "Table Editor" tab

### Connection
The app connects to Supabase using:
- `@supabase/supabase-js` client library
- Environment variables: `SUPABASE_URL` and `SUPABASE_ANON_KEY`
- Connection logic in: `src/backend/supabase-db.js`

## Folder Structure
```
supabase/
├── migrations/          <- Database schema definitions (10 files)
├── .temp/              <- CLI cache (auto-generated, ignored by git)
└── config.toml         <- CLI config (not used in production)
```
