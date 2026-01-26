# 🔐 OAuth Callback Setup Guide

## What is an OAuth Callback URL?

An **OAuth Callback URL** (also called Redirect URI) is where external services like Mercado Libre, Google, or Facebook send users back to your app after they log in.

### The OAuth Flow:

```
1. User clicks "Login with Mercado Libre" on your app
         ↓
2. User is redirected to Mercado Libre's login page
         ↓
3. User logs in and approves your app
         ↓
4. Mercado Libre redirects back to YOUR CALLBACK URL
         ↓
5. Your server receives an authorization code
         ↓
6. Your server exchanges code for access token
         ↓
7. User is logged in to your app!
```

---

## 🎯 Your Callback URLs

Your ShopSavvy app has TWO callback endpoints:

### **Primary Callback:**
```
https://localhost:3000/auth/callback
```

### **Alternative Callback:**
```
https://localhost:3000/callback
```

Both work! Use whichever one the OAuth provider requires.

---

## 📝 How to Register Your Callback URL

### For Mercado Libre:

1. **Go to**: [Mercado Libre Developers](https://developers.mercadolibre.com/)
2. **Create an application**
3. **Set Redirect URI to**: `https://localhost:3000/auth/callback`
4. **Copy your Client ID and Client Secret**
5. **Add to your `.env` file**:
   ```env
   MERCADO_LIBRE_CLIENT_ID=your_client_id_here
   MERCADO_LIBRE_CLIENT_SECRET=your_client_secret_here
   ```

### For Google OAuth:

1. **Go to**: [Google Cloud Console](https://console.cloud.google.com/)
2. **Create a project**
3. **Enable Google+ API**
4. **Create OAuth 2.0 credentials**
5. **Add authorized redirect URI**: `https://localhost:3000/auth/callback`
6. **Add to `.env`**:
   ```env
   GOOGLE_CLIENT_ID=your_client_id_here
   GOOGLE_CLIENT_SECRET=your_client_secret_here
   ```

---

## 🧪 Testing Your Callback

### Method 1: Manual Test

1. **Start your server**: `npm run dev`
2. **Visit**: `https://localhost:3000/auth/callback?code=test123&state=abc`
3. **You should see**: "OAuth Callback Received!" page with the code

### Method 2: Real OAuth Flow

Once you've registered your app with Mercado Libre:

1. **Redirect user to Mercado Libre**:
   ```
   https://auth.mercadolibre.com/authorization?response_type=code&client_id=YOUR_CLIENT_ID&redirect_uri=https://localhost:3000/auth/callback
   ```

2. **User logs in at Mercado Libre**

3. **Mercado Libre redirects to**:
   ```
   https://localhost:3000/auth/callback?code=AUTHORIZATION_CODE
   ```

4. **Your server receives the code** and can exchange it for an access token

---

## 🔧 What the Callback Does

When a user is redirected to your callback URL, your server:

1. ✅ **Receives the authorization code** from the URL query parameter
2. ✅ **Validates the request** (checks for errors)
3. ⏳ **Exchanges code for access token** (you need to implement this)
4. ✅ **Gets user info** from the OAuth provider
5. ✅ **Creates/logs in user** in your database
6. ✅ **Redirects to your app** (logged in)

---

## 📋 Current Implementation Status

### ✅ What's Already Done:
- Callback endpoint created at `/auth/callback`
- Alternative endpoint at `/callback`
- Error handling for OAuth failures
- Logs authorization codes to console
- Shows success page with received data

### ⏳ What You Need to Add:
- Exchange authorization code for access token
- Fetch user profile from OAuth provider
- Create or update user in your database
- Set JWT cookie for authenticated session
- Redirect to profile or dashboard

---

## 🚀 Next Steps to Complete OAuth

### Step 1: Install HTTP Client (if needed)
```bash
npm install axios
```

### Step 2: Add Environment Variables
Create/update `.env`:
```env
MERCADO_LIBRE_CLIENT_ID=your_app_id
MERCADO_LIBRE_CLIENT_SECRET=your_secret
APP_BASE_URL=https://localhost:3000
```

### Step 3: Implement Token Exchange
The callback endpoint has a TODO comment showing where to add this code.

---

## 🔒 Security Notes

✅ **Always use HTTPS** in production (you already have this!)  
✅ **Never expose client secrets** (keep them in `.env`)  
✅ **Validate the state parameter** (prevents CSRF attacks)  
✅ **Check redirect_uri matches exactly** what you registered  
✅ **Store tokens securely** (never in localStorage, use httpOnly cookies)  

---

## 📚 OAuth Providers Documentation

- **Mercado Libre**: https://developers.mercadolibre.com/en_us/authentication-and-authorization
- **Google**: https://developers.google.com/identity/protocols/oauth2
- **Facebook**: https://developers.facebook.com/docs/facebook-login
- **GitHub**: https://docs.github.com/en/developers/apps/building-oauth-apps

---

## 💡 Common Issues

### "Redirect URI mismatch"
- Make sure the URL in your OAuth app settings EXACTLY matches `https://localhost:3000/auth/callback`
- Include the protocol (https://)
- Don't add trailing slashes

### "The callback URL is invalid"
- Your server must be running when you test
- Use HTTPS, not HTTP
- The endpoint must exist (it does now!)

### "Authorization code already used"
- Codes can only be used once
- Generate a new authorization request to get a new code

---

## 🎓 Want to Learn More?

Check out the `/docs` folder for information about JavaScript callbacks (different concept!) and how async operations work in Node.js.

---

Your ShopSavvy app is now ready for OAuth integration! 🎉
