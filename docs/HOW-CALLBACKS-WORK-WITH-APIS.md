# 🌐 How Callbacks Work with HTTPS URLs and APIs

## The Connection: Callbacks + APIs + HTTPS

When you create an API for your website, callbacks are EVERYWHERE. Here's why:

### 🔄 The API Request Cycle

```
1. Browser → Makes HTTPS request to your server
2. Server → Receives request (callback is triggered)
3. Server → Processes data (may call database with callback)
4. Server → Sends response back
5. Browser → Receives response (callback is triggered)
```

---

## Real Example from Your OfertaRadar Project

### Before: Without Understanding Callbacks

You might think APIs just "return" data:

```javascript
// ❌ This won't work for APIs
const products = getProducts();
console.log(products); // Nothing here yet!
```

### After: With Callbacks

APIs are **asynchronous** - they take time. You NEED callbacks:

```javascript
// ✅ This works!
fetch('https://localhost:3000/api/products')
  .then(function(response) {  // ← Callback #1
    return response.json();
  })
  .then(function(products) {  // ← Callback #2
    console.log(products);    // Now you have data!
  });
```

---

## Your OfertaRadar Project: Where Callbacks Are Used

### 1. **Express Routes** (Server-Side Callbacks)

Every route in Express uses a callback:

```javascript
// The function(req, res) IS A CALLBACK!
app.get('/api/products', function(req, res) {
  // This callback runs when someone visits the URL
  res.json({ products: [] });
});
```

**Why it's a callback:**
- Express calls this function WHEN a request arrives
- You don't call it yourself
- It's executed "later" (when request comes in)

### 2. **Database Queries** (Callbacks)

```javascript
// The function(error, user) IS A CALLBACK!
db.get("SELECT * FROM users WHERE email = ?", email, function(error, user) {
  if (error) {
    console.log("Error:", error);
  } else {
    console.log("Found user:", user);
  }
});
```

### 3. **HTTPS Requests** (fetch uses callbacks)

```javascript
// Making an HTTPS request to external API
fetch('https://api.bestbuy.com/products')
  .then(function(response) {  // ← Callback when response arrives
    return response.json();
  })
  .then(function(data) {      // ← Callback when JSON is parsed
    console.log(data);
  })
  .catch(function(error) {    // ← Callback if error occurs
    console.log(error);
  });
```

---

## Practical Example: Creating an API for Your Website

Let's create a product search API with callbacks:

### Server Side (`server.js`):

```javascript
// API ENDPOINT - Uses callback pattern
app.get('/api/search', function(req, res) {  // ← req, res callback
  const query = req.query.q;
  
  // Search database with callback
  searchProducts(query, 
    function(products) {  // ← Success callback
      res.json({
        success: true,
        data: products
      });
    },
    function(error) {     // ← Error callback
      res.json({
        success: false,
        error: error
      });
    }
  );
});
```

### Client Side (Browser JavaScript):

```javascript
// CALLING YOUR API - Uses callback pattern
function searchProducts(query) {
  fetch('https://localhost:3000/api/search?q=' + query)
    .then(function(response) {  // ← Callback #1: Response received
      return response.json();
    })
    .then(function(data) {      // ← Callback #2: Data parsed
      if (data.success) {
        displayProducts(data.data);
      } else {
        showError(data.error);
      }
    })
    .catch(function(error) {    // ← Callback #3: Error occurred
      console.log('Network error:', error);
    });
}
```

---

## Why HTTPS + APIs NEED Callbacks

### The Problem:

```javascript
// ❌ THIS DOESN'T WORK!
const response = fetch('https://localhost:3000/api/products');
console.log(response); // Just a Promise, not the data!
```

**Why?** Network requests take time:
- 🌐 Request travels over internet
- ⏳ Server processes request
- 🌐 Response travels back
- ⏳ Browser parses response

All of this takes milliseconds to seconds!

### The Solution: Callbacks

```javascript
// ✅ THIS WORKS!
fetch('https://localhost:3000/api/products')
  .then(function(response) {      // Wait for response
    return response.json();       // Parse JSON
  })
  .then(function(products) {      // Wait for parsing
    console.log(products);        // NOW you have data!
  });
```

---

## Complete Example: Building a Search API

### Step 1: Create the API Endpoint (Server)

```javascript
// server.js

// Helper function with callbacks
function searchProductsDB(query, onSuccess, onError) {
  const sql = "SELECT * FROM products WHERE name LIKE ?";
  
  db.all(sql, [`%${query}%`], function(error, rows) {
    if (error) {
      onError(error);
    } else {
      onSuccess(rows);
    }
  });
}

// API route (uses callbacks)
app.get('/api/search', function(req, res) {
  const query = req.query.q;
  
  if (!query) {
    return res.json({ error: 'Query required' });
  }
  
  searchProductsDB(
    query,
    // Success callback
    function(products) {
      res.json({
        success: true,
        count: products.length,
        products: products
      });
    },
    // Error callback
    function(error) {
      res.json({
        success: false,
        error: error.message
      });
    }
  );
});
```

### Step 2: Call the API (Client)

```html
<!DOCTYPE html>
<html>
<head>
  <title>Product Search</title>
</head>
<body>
  <input type="text" id="searchBox" placeholder="Search products...">
  <button onclick="search()">Search</button>
  <div id="results"></div>

  <script>
    function search() {
      const query = document.getElementById('searchBox').value;
      const resultsDiv = document.getElementById('results');
      
      // Call the API with fetch (uses callbacks)
      fetch(`https://localhost:3000/api/search?q=${query}`)
        .then(function(response) {         // Callback #1
          return response.json();
        })
        .then(function(data) {             // Callback #2
          if (data.success) {
            let html = '<h3>Found ' + data.count + ' products:</h3>';
            data.products.forEach(function(product) {  // Callback #3
              html += `<div>${product.name} - $${product.price}</div>`;
            });
            resultsDiv.innerHTML = html;
          } else {
            resultsDiv.innerHTML = '<p>Error: ' + data.error + '</p>';
          }
        })
        .catch(function(error) {           // Callback #4 (error)
          resultsDiv.innerHTML = '<p>Network error: ' + error + '</p>';
        });
    }
  </script>
</body>
</html>
```

---

## Key Points

✅ **Every Express route is a callback** - `app.get('/path', callback)`  
✅ **Database queries use callbacks** - `db.get(sql, callback)`  
✅ **HTTPS requests use callbacks** - `fetch(url).then(callback)`  
✅ **Event listeners are callbacks** - `button.onclick = callback`  
✅ **Timers are callbacks** - `setTimeout(callback, 1000)`  

---

## Modern Alternative: Async/Await

Instead of callback hell, use async/await:

```javascript
// Old way (callbacks)
fetch(url)
  .then(function(res) {
    return res.json();
  })
  .then(function(data) {
    console.log(data);
  });

// New way (async/await) - Much cleaner!
async function getData() {
  const response = await fetch(url);
  const data = await response.json();
  console.log(data);
}
```

---

## Try It Yourself

1. **Run your server**: `npm run dev`
2. **Open browser**: `https://localhost:3000`
3. **Open DevTools**: Press F12
4. **Try the API**:
   ```javascript
   fetch('https://localhost:3000/api/me')
     .then(res => res.json())
     .then(data => console.log(data));
   ```

You just used callbacks with HTTPS! 🎉

---

## Common Questions

**Q: Do I always need callbacks for APIs?**  
A: When using asynchronous operations (which APIs always are), yes. But you can use async/await instead of raw callbacks.

**Q: Why can't I just return the data?**  
A: Because network requests take time. JavaScript doesn't wait - it needs callbacks to handle data when it arrives.

**Q: What's the difference between callback and Promise?**  
A: Promises are a newer way to handle callbacks. They're cleaner and easier to read.

---

Ready to add more APIs to your OfertaRadar project? Let me know!
