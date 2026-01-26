# ShopSavvy Price Tracker

## Introduction

This is the introduction to this new project that I'm going to be making.

🎯 PHASE 1: Foundation - "The Working Demo"  
Duration: Weeks 1-2 (35 hours)  
Goal: Build a functional product search app with authentication  
Deployable: Yes - basic but complete application  
Status: ⬜ Not Started

### What You'll Build

A working web application where users can:

- [ ] Register and log in
- [ ] Search for products across 3 retailers
- [ ] View product details
- [ ] See current prices

NO price tracking, NO wishlists, NO alerts yet - just the foundation.

## Milestone 1.1 - User Authentication (10 hours)

- [ ] User registration with email/password
- [ ] Email verification (simple, no fancy templates)
- [ ] Login with JWT tokens
- [ ] Logout functionality
- [ ] Basic profile page showing user email
- [ ] Protected routes (redirect to login if not authenticated)

## Run Locally

1. Install dependencies: `npm install`
2. (Optional) Set up HTTPS: `npm run setup:https`
   - Generates self-signed certificates for `https://localhost:3000`
   - Certificates are stored in `./certs/` (auto-detected by the server)
   - Your browser will show a security warning (click "Advanced" → "Proceed to localhost")
3. (Optional) Set environment variables in `.env` file:
   - `PORT` (default: 3000)
   - `JWT_SECRET` (default: `dev-secret`)
   - `APP_BASE_URL` (default: auto-detected based on HTTPS setup)
   - `BESTBUY_API_KEY` (optional - for real product search)
   - **`SUPABASE_URL`** (required for Google login - see SUPABASE-SETUP.md)
   - **`SUPABASE_ANON_KEY`** (required for Google login - see SUPABASE-SETUP.md)
   - `MERCADO_LIBRE_CLIENT_ID` (optional - for Mercado Libre login)
   - `MERCADO_LIBRE_CLIENT_SECRET` (optional - for Mercado Libre login)
4. Start the server: `npm run dev`
   - Opens at `https://localhost:3000` if certs exist
   - Falls back to `http://localhost:3000` if not

The verification link prints to the server console in development.

## Google Login Setup

To enable "Login with Google" button:

1. **Get Supabase credentials** from your Supabase dashboard:
   - Project URL (e.g., `https://xxxxx.supabase.co`)
   - Anon/Public Key

2. **Add to `.env` file**:
   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-anon-key-here
   ```

3. **Restart server**: `npm run dev`

4. **Test**: Visit `/login` and click "Continue with Google"

📖 **Full setup guide**: See `SUPABASE-SETUP.md` for detailed instructions

## Features

✅ User authentication (register, login, logout)  
✅ **Google OAuth login via Supabase** 🆕  
✅ Email verification  
✅ Password reset functionality  
✅ OAuth callback endpoint (ready for Mercado Libre, Google, etc.)  
✅ Product search with Best Buy API integration  
✅ Secure HTTPS with self-signed certificates  
✅ SQLite database  
✅ JWT token-based sessions  

## API Endpoints

Your server includes these API endpoints:

- `GET /api/health` - Health check
- `GET /api/products` - Get all demo products
- `GET /api/products/search?q=laptop` - Search products
- `GET /api/products/:sku` - Get single product by SKU
- `GET /api/me` - Get current user (requires authentication)

## Learning Resources

If you want to learn more about how this project works, check the `/docs` folder for tutorials and explanations about callbacks, APIs, and HTTPS.
