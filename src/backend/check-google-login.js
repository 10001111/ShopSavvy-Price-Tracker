/**
 * Diagnostic Script for Google Login
 * Run this to check if everything is configured correctly
 * 
 * Usage: node check-google-login.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

console.log('\n🔍 Checking Google Login Configuration...\n');
console.log('='.repeat(50));

// Check 1: .env file exists
const envPath = path.join(__dirname, '.env');
const envExists = fs.existsSync(envPath);

console.log('\n1. .env File:');
if (envExists) {
  console.log('   ✅ .env file exists');
} else {
  console.log('   ❌ .env file NOT FOUND');
  console.log('   → Create a .env file in your project root');
}

// Check 2: Supabase URL
console.log('\n2. SUPABASE_URL:');
if (process.env.SUPABASE_URL) {
  console.log('   ✅ Configured');
  console.log('   → ' + process.env.SUPABASE_URL);
  
  // Validate format
  if (process.env.SUPABASE_URL.startsWith('https://') && process.env.SUPABASE_URL.includes('.supabase.co')) {
    console.log('   ✅ Format looks correct');
  } else {
    console.log('   ⚠️  Format might be incorrect');
    console.log('   → Should be: https://xxxxx.supabase.co');
  }
} else {
  console.log('   ❌ NOT CONFIGURED');
  console.log('   → Add SUPABASE_URL=https://xxxxx.supabase.co to .env');
}

// Check 3: Supabase Anon Key
console.log('\n3. SUPABASE_ANON_KEY:');
if (process.env.SUPABASE_ANON_KEY) {
  console.log('   ✅ Configured');
  console.log('   → ' + process.env.SUPABASE_ANON_KEY.substring(0, 30) + '...');
  
  // Validate format
  if (process.env.SUPABASE_ANON_KEY.startsWith('eyJ')) {
    console.log('   ✅ Format looks correct (JWT token)');
  } else {
    console.log('   ⚠️  Format might be incorrect');
    console.log('   → Should start with: eyJ');
  }
  
  if (process.env.SUPABASE_ANON_KEY.length > 100) {
    console.log('   ✅ Length looks reasonable');
  } else {
    console.log('   ⚠️  Key seems too short');
  }
} else {
  console.log('   ❌ NOT CONFIGURED');
  console.log('   → Add SUPABASE_ANON_KEY=your_key_here to .env');
}

// Check 4: Supabase module
console.log('\n4. Supabase Package:');
try {
  require('@supabase/supabase-js');
  console.log('   ✅ @supabase/supabase-js is installed');
} catch (e) {
  console.log('   ❌ @supabase/supabase-js NOT INSTALLED');
  console.log('   → Run: npm install @supabase/supabase-js');
}

// Check 5: Port availability
console.log('\n5. Port 3000:');
const net = require('net');
const testPort = (port) => {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
};

testPort(3000).then(available => {
  if (available) {
    console.log('   ✅ Port 3000 is available');
  } else {
    console.log('   ⚠️  Port 3000 is already in use');
    console.log('   → Run: taskkill /F /IM node.exe');
  }
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('\n📊 Summary:\n');
  
  const hasEnv = envExists;
  const hasUrl = Boolean(process.env.SUPABASE_URL);
  const hasKey = Boolean(process.env.SUPABASE_ANON_KEY);
  
  if (hasUrl && hasKey) {
    console.log('✅ Google Login is CONFIGURED!');
    console.log('\nNext steps:');
    console.log('1. Make sure Google provider is enabled in Supabase dashboard');
    console.log('2. Restart your server: npm run dev');
    console.log('3. Visit: https://localhost:3000/login');
    console.log('4. Click "Continue with Google" button');
  } else {
    console.log('❌ Google Login is NOT configured\n');
    console.log('What you need to do:');
    
    if (!hasEnv) {
      console.log('→ Create a .env file in your project root');
    }
    if (!hasUrl) {
      console.log('→ Add SUPABASE_URL to .env file');
      console.log('  Get it from: Supabase Dashboard → Settings → API');
    }
    if (!hasKey) {
      console.log('→ Add SUPABASE_ANON_KEY to .env file');
      console.log('  Get it from: Supabase Dashboard → Settings → API');
    }
    
    console.log('\nExample .env file:');
    console.log('─'.repeat(50));
    console.log('SUPABASE_URL=https://rcetefvuniellfuneejg.supabase.co');
    console.log('SUPABASE_ANON_KEY=eyJhbGciOiJI...your_actual_key');
    console.log('─'.repeat(50));
  }
  
  console.log('\n📖 For more help, see: FIX-GOOGLE-LOGIN.md\n');
});
