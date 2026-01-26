# ⚡ Quick Start: Enable Google Login

Your ShopSavvy app now has a **"Login with Google"** button! 🎉

Just follow these 3 steps to make it work:

---

## 📋 What You Need

From your Supabase dashboard, get:
1. **Project URL** (e.g., `https://rcetefvuniellfuneejg.supabase.co`)
2. **Anon Key** (long string starting with `eyJ...`)

---

## 🚀 3-Step Setup

### **Step 1: Add Credentials to `.env` File**

Open your `.env` file (or create one) and add:

```env
SUPABASE_URL=https://rcetefvuniellfuneejg.supabase.co
SUPABASE_ANON_KEY=your_actual_anon_key_here
```

Replace `your_actual_anon_key_here` with your real anon key from Supabase.

---

### **Step 2: Restart Your Server**

In your terminal:
```bash
# Press Ctrl+C to stop the server
# Then restart:
npm run dev
```

---

### **Step 3: Test It!**

1. Visit: `https://localhost:3000/login`
2. You should see:
   - Regular login form
   - **"Or continue with"** divider
   - **"Continue with Google"** button (with Google logo!)

3. Click the button → Sign in with Google → Done! ✅

---

## ✅ What's Working

- ✅ "Login with Google" button added to `/login` page
- ✅ Google OAuth flow via Supabase
- ✅ Automatic user creation (new Google users)
- ✅ Automatic login (existing users)
- ✅ Auto-verified email for OAuth users
- ✅ JWT cookie set for session
- ✅ Redirects to `/profile` after login

---

## 🎯 What Happens When User Logs In

1. User clicks "Continue with Google"
2. Redirected to Google login
3. Signs in with Google account
4. Supabase processes OAuth
5. Redirected back to your app
6. User info extracted (email, name)
7. **New user?** → Creates account in your SQLite database
8. **Existing user?** → Logs them in
9. Sets JWT cookie
10. Redirects to profile page

---

## 🔍 Verify It's Working

### **Check the button appears:**
- Button should show Google logo
- Should not be disabled
- Should say "Continue with Google"

### **Test the flow:**
- Click button
- Should redirect to Google
- After login, should go to `/profile`
- Should see your Google email in profile

### **Check database (optional):**
```bash
sqlite3 shopsavvy.db "SELECT id, email, verified FROM users WHERE email = 'your-google-email@gmail.com';"
```

---

## 💡 Troubleshooting

### **Button says "Google Login Not Configured"**
→ Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` to `.env` file and restart server

### **Button doesn't appear at all**
→ Make sure server restarted after code changes

### **Error: "Failed to sign in with Google"**
→ Check that Google provider is enabled in Supabase dashboard

### **Redirects but shows error**
→ Check that callback URL `https://localhost:3000/auth/supabase-callback` is allowed in Supabase

---

## 📚 Need More Help?

See `SUPABASE-SETUP.md` for detailed instructions and troubleshooting.

---

That's it! Your Google login is ready to use! 🎉🔐
