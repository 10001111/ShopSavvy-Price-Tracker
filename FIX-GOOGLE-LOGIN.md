# 🔧 Fix Google Login - Step by Step

Your "Sign in with Google" isn't working. Here's how to fix it:

---

## 🎯 Quick Diagnosis

Visit this URL to check your configuration:
```
https://localhost:3000/debug/supabase-config
```

This will tell you if Supabase is configured correctly.

---

## 🚨 Common Issues & Solutions

### **Issue 1: Button Says "Google Login Not Configured"**

**Problem**: Supabase credentials not added to `.env` file

**Solution**:

1. **Find your `.env` file** in the project root (create one if it doesn't exist)

2. **Add these lines** (replace with your actual values from Supabase):
   ```env
   SUPABASE_URL=https://rcetefvuniellfuneejg.supabase.co
   SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...your_actual_key_here
   ```

3. **Get your credentials from Supabase**:
   - Go to: https://supabase.com/dashboard
   - Click your project
   - Go to **Settings** → **API**
   - Copy:
     - **Project URL** (starts with `https://`)
     - **anon/public key** (long string starting with `eyJ`)

4. **Restart the server**:
   ```bash
   # Press Ctrl+C to stop, then:
   npm run dev
   ```

---

### **Issue 2: Port 3000 Already in Use**

**Problem**: Old Node.js process still running

**Solution**:

Open a NEW terminal and run:

```powershell
# Find and kill Node processes
taskkill /F /IM node.exe
```

Then restart:
```bash
npm run dev
```

---

### **Issue 3: Button Appears But Nothing Happens When Clicked**

**Problem**: JavaScript error or Supabase connection issue

**Solution**:

1. **Open browser console** (F12 → Console tab)
2. **Look for errors** when you click the button
3. Common errors:
   - `"Failed to sign in with Google"` → Google provider not enabled in Supabase
   - `"Redirect URI mismatch"` → Callback URL not configured
   - `"createClient is not a function"` → Supabase JS library not loading

**Fix**:
- Go to Supabase dashboard
- **Authentication** → **Providers**
- Make sure **Google** is toggled ON
- Save changes

---

### **Issue 4: Redirects to Google But Then Shows Error**

**Problem**: Callback URL mismatch

**Solution**:

1. In Supabase dashboard:
   - **Authentication** → **URL Configuration**
   - **Site URL**: `https://localhost:3000`
   - **Redirect URLs**: Add `https://localhost:3000/auth/supabase-callback`

2. If using production domain, update URLs accordingly

---

### **Issue 5: "Your connection is not private" (HTTPS Error)**

**Problem**: Self-signed certificate

**Solution**:

1. **In browser**, click "Advanced"
2. Click "Proceed to localhost (unsafe)"
3. This is normal for local development

---

## ✅ Step-by-Step Setup (From Scratch)

If nothing is working, follow these steps in order:

### **1. Stop All Node Processes**
```powershell
taskkill /F /IM node.exe
```

### **2. Get Supabase Credentials**
- Go to https://supabase.com/dashboard
- Click your project (`rcetefvuniellfuneejg`)
- Settings → API
- Copy:
  - Project URL
  - anon public key

### **3. Create/Update `.env` File**

In your project root (`C:\Users\lll\Desktop\protfolio\ShopSavvy Price Tracker\`), create/edit `.env`:

```env
PORT=3000
JWT_SECRET=dev-secret
APP_BASE_URL=https://localhost:3000

# Supabase for Google Login
SUPABASE_URL=https://rcetefvuniellfuneejg.supabase.co
SUPABASE_ANON_KEY=paste_your_actual_anon_key_here
```

### **4. Enable Google Provider in Supabase**
- Supabase dashboard
- Authentication → Providers
- Find **Google**
- Toggle it ON
- Save

### **5. Start Server**
```bash
npm run dev
```

### **6. Test**
- Visit: `https://localhost:3000/login`
- You should see "Continue with Google" button
- Click it
- Should redirect to Google login

---

## 🔍 Verify It's Working

### **Check 1: Configuration**
Visit: `https://localhost:3000/debug/supabase-config`

Should show:
- ✅ SUPABASE_URL: Configured
- ✅ SUPABASE_ANON_KEY: Configured

### **Check 2: Button Appearance**
On `/login` page, button should:
- Show Google logo
- Say "Continue with Google" (not "Google Login Not Configured")
- Not be disabled

### **Check 3: Click Test**
- Click button
- Should open Google login popup/redirect
- After logging in, should come back to ShopSavvy
- Should see your profile page

---

## 🐛 Still Not Working?

### **Method 1: Check Browser Console**
1. Press F12
2. Go to Console tab
3. Click the Google button
4. Look for RED error messages
5. Share the error message

### **Method 2: Check Server Logs**
Look at your terminal where `npm run dev` is running
- Look for errors when you click the button
- Share any error messages

### **Method 3: Manual Test**

Try this test URL (replace with your actual Supabase URL):
```
https://rcetefvuniellfuneejg.supabase.co/auth/v1/health
```

Should return JSON with Supabase health status. If you get an error, your Supabase URL might be wrong.

---

## 📋 Complete `.env` Example

Here's what your `.env` file should look like:

```env
# Server
PORT=3000
JWT_SECRET=your-secret-key-change-this-in-production
APP_BASE_URL=https://localhost:3000

# Supabase (Required for Google Login)
SUPABASE_URL=https://rcetefvuniellfuneejg.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJjZXRlZnZ1bmllbGxmdW5lZWpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDg3MDg4MDAsImV4cCI6MjAyNDI4NDgwMH0.REPLACE_WITH_YOUR_ACTUAL_KEY

# Optional (for product search)
BESTBUY_API_KEY=
```

---

## 💡 Tips

✅ **Always restart server** after changing `.env`  
✅ **Check Supabase dashboard** - make sure project is active  
✅ **Use browser incognito** - avoids cache issues  
✅ **Check you're on the right project** in Supabase (rcetefvuniellfuneejg)  

---

## 🎯 Quick Commands Reference

```powershell
# Kill Node processes
taskkill /F /IM node.exe

# Start server
npm run dev

# Check configuration
# Visit: https://localhost:3000/debug/supabase-config

# Test login
# Visit: https://localhost:3000/login
```

---

Need more help? Share:
1. What does the button say? ("Continue with Google" or "Google Login Not Configured"?)
2. What happens when you click it?
3. Any error messages in browser console (F12)?
