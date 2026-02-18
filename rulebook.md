# OfertaRadar — Developer Rulebook (v2026.1)

> This rulebook governs all development on the OfertaRadar project.
> Every rule here must be followed when writing or reviewing code.

---

## Section 1: Core Architecture and Clean Code

**Separation of Concerns** Keep the Express route handler thin. Move business logic into
helper functions or service modules, not inline in the route callback.

**Naming Conventions** Use descriptive names. A function should be named
fetchUserSessionById, not getUser. Route handlers follow REST conventions.

**DRY vs. AHA** Avoid repeating code, but do not abstract until the pattern appears in
at least three places.

**Error Handling** Never return a raw error to the frontend. All backend errors must be
caught and returned as structured JSON: { success: false, error: message, code: 400 }.
API routes use res.status(500).json({ error: message }). Page routes use
res.status(500).send(renderPage(...)).

**Async/Await** All async route handlers are wrapped in try/catch. Never let an
unhandled promise rejection crash the server.

---

## Section 2: File and Folder Rules

**Never create new files when you can edit existing ones.** File bloat is a known
problem in this project. Prefer editing over creating.

**No backup files.** Do not create *.bak, *.old, or *.copy files. Use git instead.

**CSS — single file only.** All styles live in src/frontend/styles.css.
No second stylesheet, no inline style blocks in HTML template strings.

**Documentation lives in Docs/.** All .md and .txt documentation files belong in Docs/.
The project root only contains: rulebook.md, package.json, render.yaml,
package-lock.json, and tooling/config files.

**No nul / NUL files.** These are Windows command-redirection artifacts. Delete on sight.

**HTML rendering** All HTML is rendered as template strings inside server.js route
handlers. Use the shared renderPage(title, body, options) helper for every page.

---

## Section 3: AI Development Protocol

**Plan before execution.** Before writing code, outline the files to change and the
logic flow. Do not start editing until the plan is clear.

**Self-correction.** If a bug is introduced, explain the root cause before fixing it.

**No new dependencies without explicit approval.** Do not add npm packages unless asked.
Use Node.js built-ins and existing dependencies first.

**Documentation.** Every function over 10 lines must have a JSDoc comment explaining
its purpose, parameters, and return type.

---

## Section 4: Security

**Zero-trust backend.** Never trust frontend validation. Always re-validate and sanitize
inputs on the server.

**Secret management.** Never hardcode API keys or secrets. All secrets go in .env
(gitignored). The render.yaml marks all secrets as sync: false.

**Passwords** Hashed with bcryptjs at cost factor 10. Never store plaintext.

**JWT tokens** Set as httpOnly cookies only. Never expose them in response bodies or
JavaScript-accessible storage.

**Protected routes** All protected pages use the authRequired middleware.
Admin endpoints use requireAdmin.

**No debug endpoints in production.** The /debug/supabase-config route must be guarded
with requireAdmin — it exposes partial Supabase credentials.

**No debug HTML in rendered pages.** Never render a block containing raw user data
(user ID, email, DB fields) inside a page response.

**SUPABASE_SERVICE_ROLE_KEY must be set in production.** The anon key has limited
server-side permissions.

---

## Section 5: Production Checklist

Before every deploy to Render:

- [ ] No debug HTML blocks in any rendered page
- [ ] /debug/supabase-config guarded with requireAdmin
- [ ] No console.log calls that print full user objects (PII)
- [ ] JWT_SECRET set on Render (not the hardcoded dev fallback)
- [ ] SUPABASE_URL set on Render
- [ ] SUPABASE_ANON_KEY set on Render
- [ ] SUPABASE_SERVICE_ROLE_KEY set on Render
- [ ] Apify_Token set on Render
- [ ] No nul files in the repo
- [ ] No .bak / .old / backup files in the repo
- [ ] All documentation files inside Docs/
- [ ] src/data/app.db is gitignored
- [ ] certs/ is gitignored
- [ ] node_modules/ is gitignored

---

## Section 6: Database

**Supabase (production)** Primary store for users, sessions, tracked products,
price history, and product cache. Use the service role key server-side.
All operations go through src/backend/supabase-db.js.

**SQLite (local fallback)** Used only when SUPABASE_URL / SUPABASE_ANON_KEY are not set.
Schema in src/backend/db.js via CREATE TABLE IF NOT EXISTS.
File lives at src/data/app.db and is gitignored.

**Migrations** Schema changes go in sql/migrations/ as numbered .sql files.
Additive column additions also added to db.js via ALTER TABLE ... ADD COLUMN
inside a try/catch.

---

## Section 7: Scraping

All scraping goes through src/backend/apify.js (Apify actor f5pjkmpD15S3cqunX).
Results are cached in Redis at 30-minute TTL when Redis is configured.
Mercado Libre scraper is temporarily disabled; use amazon or all.
The /api/scrape endpoint requires authentication.
maxResults defaults to 20 per source.

---

## Section 8: Deployment (Render)

Service defined in render.yaml. Service name: ofertaradar.
Node.js >= 18. Build: npm install. Start: npm start.
All secrets are set manually on Render (sync: false).
PORT is injected by Render automatically — do not hardcode it.

---

## Section 9: Bilingual Support

English (en) and Spanish (es) are both supported.
Language is stored in a cookie named lang, toggled via /set-lang/:lang.
All user-facing strings must have en and es variants in the translations object.
Default language for new visitors: English.
Currency defaults: USD for English sessions, MXN for Spanish sessions.

---

## Section 10: Currency System

Exchange rates: MXN_TO_USD = 0.049, USD_TO_MXN = 1 / MXN_TO_USD.
Every product card must carry data-price (raw number) and data-currency (MXN or USD).
updateAllPriceDisplays() converts all visible prices on currency toggle.
Preference is persisted in localStorage.preferredCurrency.
Price slider ranges: MXN 0-50000 step 500 | USD 0-2500 step 25.
See Docs/GLOBAL-CURRENCY-SYSTEM.md for full implementation details.

---

## Section 11: Git Workflow

Main branch: main. All work commits directly to main.
Release commits: v{version} - short description.
Fix commits: plain imperative verb (e.g. Fix profile avatar upload).
Do not commit: .env, app.db, certs/, node_modules/, backup files.
One logical change per commit.