# 🔐 Supabase Google Authentication Setup

This guide shows you how to add "Login with Google" to your OfertaRadar app using Supabase.

---

## ✅ What's Already Done

Your OfertaRadar app now has:

✅ "Login with Google" button on the login page  
✅ Supabase client integration  
✅ Automatic user creation/login for OAuth users  
✅ JWT token management for authenticated sessions  
✅ Callback endpoint at `/auth/supabase-callback`  

---

## 🚀 Setup Instructions

### **Step 1: Get Your Supabase Credentials**

1. **Go to your Supabase project**: [https://supabase.com/dashboard](https://supabase.com/dashboard)

2. **Find your project URL and anon key**:
   - Click on your project
   - Go to **Settings** (gear icon) → **API**
   - Copy these two values:
     - **Project URL** (looks like: `https://xxxxx.supabase.co`)
     - **Anon/Public Key** (long string starting with `eyJ...`)

3. **Verify Google provider is enabled**:
   - Go to **Authentication** → **Providers**
   - Make sure **Google** is enabled
   - Your redirect URL should be: `https://rcetefvuniellfuneejg.supabase.co/auth/v1/callback`

---

### **Step 2: Add Credentials to Your App**

1. **Open your `.env` file** (or create one if it doesn't exist)

2. **Add these two lines**:
   ```env
   SUPABASE_URL=https://rcetefvuniellfuneejg.supabase.co
   SUPABASE_ANON_KEY=your_anon_key_here
   ```

3. **Replace the values** with your actual Supabase credentials

Example `.env` file:
```env
PORT=3000
JWT_SECRET=dev-secret
APP_BASE_URL=https://localhost:3000

# Supabase Configuration
SUPABASE_URL=https://rcetefvuniellfuneejg.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJjZXRlZnZ1bmllbGxmdW5lZWpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDg3MDg4MDAsImV4cCI6MjAyNDI4NDgwMH0.EXAMPLE_KEY_REPLACE_WITH_YOURS
```

---

### **Step 3: Restart Your Server**

```bash
# Stop the current server (Ctrl+C in terminal)
# Then restart:
npm run dev
```

---

### **Step 4: Test Google Login**

1. **Visit**: `https://localhost:3000/login`

2. **You should see**:
   - Your regular email/password login form
   - **"Or continue with"** divider
   - **"Continue with Google"** button with Google logo

3. **Click "Continue with Google"**:
   - You'll be redirected to Google login
   - Sign in with your Google account
   - Supabase processes the OAuth
   - You're redirected back to OfertaRadar
   - **Automatically logged in!** 🎉

---

## 🔧 How It Works

### **The OAuth Flow:**

```
1. User clicks "Continue with Google"
         ↓
2. Supabase redirects to Google login
         ↓
3. User signs in and approves
         ↓
4. Google sends back to Supabase
         ↓
5. Supabase redirects to: /auth/supabase-callback
         ↓
6. Your app extracts user info (email, name)
         ↓
7. Check if user exists in your database
         ↓
8. Create new user OR login existing user
         ↓
9. Set JWT cookie
         ↓
10. Redirect to /profile ✅
```

### **What Happens in Your Database:**

- **New Google user**: Creates account in SQLite with auto-verified email
- **Existing user**: Logs them in (auto-verifies if not verified)
- **Password**: A random secure password is generated (user can't use it, OAuth only)

---

## 🎯 Testing Checklist

### **Before Testing:**
- [ ] Supabase URL and key added to `.env`
- [ ] Google provider enabled in Supabase dashboard
- [ ] Server restarted
- [ ] Can access `https://localhost:3000/login`

### **During Testing:**
- [ ] "Continue with Google" button appears
- [ ] Button is not disabled
- [ ] Clicking redirects to Google login
- [ ] After Google login, redirects back to your app
- [ ] Successfully logs in and goes to `/profile`
- [ ] Can see your email in profile

### **Verify in Database:**
```bash
# Check if user was created
sqlite3 data/app.db "SELECT id, email, verified FROM users;"
```

---

## 🔒 Security Notes

✅ **Your anon key is safe to expose** - it's meant for client-side use  
✅ **Supabase handles all OAuth security** - you don't store Google tokens  
✅ **JWT tokens expire after 7 days** - users need to re-login  
✅ **Auto-verified users** - OAuth users are automatically verified  

---

## 💡 Troubleshooting

### **Button says "Google Login Not Configured"**

**Problem**: Supabase credentials not in `.env` file

**Solution**: 
1. Check your `.env` file has both `SUPABASE_URL` and `SUPABASE_ANON_KEY`
2. Restart your server

---

### **"Failed to sign in with Google"**

**Problem**: Google provider not enabled in Supabase

**Solution**:
1. Go to Supabase dashboard
2. **Authentication** → **Providers**
3. Enable **Google**
4. Save changes

---

### **Redirects to Google but then shows error**

**Problem**: Redirect URL mismatch

**Solution**:
1. In Supabase dashboard, check **Authentication** → **URL Configuration**
2. Make sure redirect URLs include: `https://localhost:3000/auth/supabase-callback`
3. Or use Supabase's default callback URL (which should work automatically)

---

### **User created but not logged in**

**Problem**: Cookie not being set

**Solution**:
1. Check browser console for errors
2. Make sure `APP_BASE_URL` in `.env` matches your actual URL
3. Try clearing cookies and logging in again

---

## 🎨 Customization

### **Change Button Style**

Edit the button in `src/server.js` around line 660:

```javascript
<button 
  id="google-login-btn" 
  style="width: 100%; padding: 10px; background: #4285F4; color: white; ..."
>
```

### **Add More OAuth Providers**

To add Facebook, GitHub, etc.:

1. **Enable provider in Supabase dashboard**
2. **Copy the Google login button code**
3. **Change provider**:
   ```javascript
   provider: 'facebook'  // or 'github', 'twitter', etc.
   ```

---

## 📚 Additional Resources

- **Supabase Auth Docs**: https://supabase.com/docs/guides/auth
- **Google OAuth Setup**: https://supabase.com/docs/guides/auth/social-login/auth-google
- **Supabase JavaScript Client**: https://supabase.com/docs/reference/javascript/introduction

---

## ✅ Next Steps

Now that you have Google authentication:

1. **Deploy your app** to a real domain (Vercel, Netlify, Railway)
2. **Update Supabase redirect URLs** to match your production domain
3. **Add more OAuth providers** (Facebook, GitHub, Microsoft)
4. **Customize the user profile page** to show Google avatar
5. **Add email notifications** for new OAuth sign-ups

---

Your OfertaRadar app now supports Google login!
