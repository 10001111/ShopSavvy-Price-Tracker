const express = require("express");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const dotenv = require("dotenv");
const { initDb } = require("./db");

dotenv.config();

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${PORT}`;
const BESTBUY_API_KEY = process.env.BESTBUY_API_KEY || "";

function renderPage(title, body, extraHead = "") {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 40px; max-width: 700px; }
      form { display: grid; gap: 12px; max-width: 360px; }
      input { padding: 8px; font-size: 14px; }
      button { padding: 8px 12px; font-size: 14px; }
      .muted { color: #666; }
      .error { color: #b00020; }
      .success { color: #0a7a2f; }
      .search-wrapper { max-width: 900px; }
      .search-form { max-width: 900px; grid-template-columns: 1fr 1fr; }
      .search-form .full { grid-column: 1 / -1; }
      .filters { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
      .range-row { display: grid; gap: 8px; }
      .results { margin-top: 24px; }
      .grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
      .card { border: 1px solid #ddd; padding: 12px; border-radius: 8px; display: grid; gap: 8px; }
      .card img { width: 100%; height: 180px; object-fit: contain; background: #fafafa; border-radius: 6px; }
      .card-title { font-weight: 600; }
      .card-meta { font-size: 13px; color: #555; }
      .pagination { display: flex; gap: 12px; align-items: center; margin-top: 16px; }
      .pagination a { text-decoration: none; }
      .notice { background: #fff7e6; border: 1px solid #ffd591; padding: 12px; border-radius: 8px; }
    </style>
    ${extraHead}
  </head>
  <body>
    ${body}
  </body>
</html>`;
}

function createToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function setAuthCookie(res, token) {
  res.cookie("token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24 * 7,
  });
}

function clearAuthCookie(res) {
  res.clearCookie("token");
}

function authRequired(req, res, next) {
  const token = req.cookies.token;
  if (!token) {
    return res.redirect("/login");
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    return next();
  } catch (error) {
    clearAuthCookie(res);
    return res.redirect("/login");
  }
}

function sendVerificationEmail(email, verificationLink) {
  console.log(`\n[Verification Email] To: ${email}`);
  console.log(`Verify your account: ${verificationLink}\n`);
}

function formatPrice(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "N/A";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function buildSearchParams(baseUrl, params) {
  const url = new URL(baseUrl);
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }
    url.searchParams.set(key, String(value));
  });
  return url.toString();
}

function parseNumber(value, fallback) {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return fallback;
}

function getMockProducts() {
  return [
    {
      sku: "demo-1",
      name: "Apple AirPods Pro (2nd Generation)",
      salePrice: 199.99,
      image: "https://via.placeholder.com/300x200?text=AirPods+Pro",
      url: "https://www.bestbuy.com/",
    },
    {
      sku: "demo-2",
      name: "Samsung 55\" 4K Smart TV",
      salePrice: 429.99,
      image: "https://via.placeholder.com/300x200?text=Samsung+TV",
      url: "https://www.bestbuy.com/",
    },
    {
      sku: "demo-3",
      name: "Sony WH-1000XM5 Headphones",
      salePrice: 349.0,
      image: "https://via.placeholder.com/300x200?text=Sony+Headphones",
      url: "https://www.bestbuy.com/",
    },
    {
      sku: "demo-4",
      name: "Nintendo Switch OLED Console",
      salePrice: 349.99,
      image: "https://via.placeholder.com/300x200?text=Switch+OLED",
      url: "https://www.bestbuy.com/",
    },
    {
      sku: "demo-5",
      name: "HP Pavilion 15\" Laptop",
      salePrice: 599.99,
      image: "https://via.placeholder.com/300x200?text=HP+Laptop",
      url: "https://www.bestbuy.com/",
    },
    {
      sku: "demo-6",
      name: "Instant Pot Duo 7-in-1",
      salePrice: 89.99,
      image: "https://via.placeholder.com/300x200?text=Instant+Pot",
      url: "https://www.bestbuy.com/",
    },
    {
      sku: "demo-7",
      name: "GoPro HERO12 Action Camera",
      salePrice: 399.99,
      image: "https://via.placeholder.com/300x200?text=GoPro+HERO12",
      url: "https://www.bestbuy.com/",
    },
    {
      sku: "demo-8",
      name: "Logitech MX Master 3S Mouse",
      salePrice: 99.99,
      image: "https://via.placeholder.com/300x200?text=MX+Master+3S",
      url: "https://www.bestbuy.com/",
    },
    {
      sku: "demo-9",
      name: "Bose Smart Soundbar 600",
      salePrice: 379.0,
      image: "https://via.placeholder.com/300x200?text=Bose+Soundbar",
      url: "https://www.bestbuy.com/",
    },
    {
      sku: "demo-10",
      name: "Fitbit Charge 6",
      salePrice: 159.95,
      image: "https://via.placeholder.com/300x200?text=Fitbit+Charge+6",
      url: "https://www.bestbuy.com/",
    },
    {
      sku: "demo-11",
      name: "Dyson V11 Cordless Vacuum",
      salePrice: 499.99,
      image: "https://via.placeholder.com/300x200?text=Dyson+V11",
      url: "https://www.bestbuy.com/",
    },
    {
      sku: "demo-12",
      name: "Amazon Echo Show 8",
      salePrice: 129.99,
      image: "https://via.placeholder.com/300x200?text=Echo+Show+8",
      url: "https://www.bestbuy.com/",
    },
  ];
}

function searchMockProducts({ query, minPrice, maxPrice, sort, page, pageSize }) {
  const normalizedQuery = query.toLowerCase();
  let results = getMockProducts().filter((product) => {
    const matchesQuery = product.name.toLowerCase().includes(normalizedQuery);
    const withinMin = !Number.isFinite(minPrice) || product.salePrice >= minPrice;
    const withinMax = !Number.isFinite(maxPrice) || product.salePrice <= maxPrice;
    return matchesQuery && withinMin && withinMax;
  });

  results.sort((a, b) => {
    if (sort === "price_desc") {
      return b.salePrice - a.salePrice;
    }
    return a.salePrice - b.salePrice;
  });

  const total = results.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  results = results.slice(start, start + pageSize);

  return { products: results, total, totalPages };
}

async function fetchBestBuyProducts({ query, minPrice, maxPrice, sort, page, pageSize }) {
  if (!BESTBUY_API_KEY) {
    const mockResults = searchMockProducts({ query, minPrice, maxPrice, sort, page, pageSize });
    return {
      ...mockResults,
      notice: "Using demo data (no Best Buy API key configured).",
      error: "",
    };
  }

  const filters = [];
  if (query) {
    filters.push(`search=${encodeURIComponent(query)}`);
  }
  if (Number.isFinite(minPrice)) {
    filters.push(`salePrice>=${minPrice}`);
  }
  if (Number.isFinite(maxPrice)) {
    filters.push(`salePrice<=${maxPrice}`);
  }

  if (!filters.length) {
    return { products: [], total: 0, totalPages: 0, error: "" };
  }

  const sortMap = {
    price_asc: "salePrice.asc",
    price_desc: "salePrice.dsc",
  };

  const filterString = `(${filters.join("&")})`;
  const apiUrl = `https://api.bestbuy.com/v1/products${filterString}`;
  const fullUrl = buildSearchParams(apiUrl, {
    apiKey: BESTBUY_API_KEY,
    format: "json",
    show: "sku,name,salePrice,image,url",
    page,
    pageSize,
    sort: sortMap[sort] || "salePrice.asc",
  });

  const response = await fetch(fullUrl);
  if (!response.ok) {
    return {
      products: [],
      total: 0,
      totalPages: 0,
      error: `Best Buy API error: ${response.status}`,
    };
  }

  const data = await response.json();
  return {
    products: data.products || [],
    total: data.total || 0,
    totalPages: data.totalPages || 0,
    error: "",
  };
}

async function start() {
  const db = await initDb();
  const app = express();

  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  app.use(cookieParser());

  app.get("/", async (req, res) => {
    const hasToken = Boolean(req.cookies.token);
    const query = String(req.query.q || "").trim();
    const minPrice = parseNumber(req.query.minPrice, 0);
    const maxPrice = parseNumber(req.query.maxPrice, 2000);
    const sort = String(req.query.sort || "price_asc");
    const page = Math.max(parseNumber(req.query.page, 1), 1);
    const pageSize = 20;

    let results = { products: [], total: 0, totalPages: 0, error: "", notice: "" };
    if (query) {
      results = await fetchBestBuyProducts({
        query,
        minPrice,
        maxPrice,
        sort,
        page,
        pageSize,
      });
    }

    const resultsHtml = query ? `
      <div class="results">
        ${results.notice ? `<div class="notice">${results.notice}</div>` : ""}
        ${results.error ? `<div class="notice">${results.error}</div>` : ""}
        ${!results.error && results.products.length === 0 ? `<p class="muted">No results found.</p>` : ""}
        ${results.products.length ? `
          <div class="grid">
            ${results.products.map((item) => `
              <div class="card">
                <img src="${item.image || ""}" alt="${item.name || "Product"}" />
                <div class="card-title">${item.name || "Untitled product"}</div>
                <div class="card-meta">${formatPrice(item.salePrice)} · Best Buy</div>
                ${item.url ? `<a href="${item.url}" target="_blank" rel="noreferrer">View on Best Buy</a>` : ""}
              </div>
            `).join("")}
          </div>
          <div class="pagination">
            ${page > 1 ? `<a href="${buildSearchParams("/", { q: query, minPrice, maxPrice, sort, page: page - 1 })}">← Prev</a>` : ""}
            <span>Page ${page} of ${results.totalPages || 1}</span>
            ${page < results.totalPages ? `<a href="${buildSearchParams("/", { q: query, minPrice, maxPrice, sort, page: page + 1 })}">Next →</a>` : ""}
          </div>
        ` : ""}
      </div>
    ` : "";

    const searchSection = hasToken ? `
      <form class="search-form" method="get" action="/">
        <div class="full">
          <label>Search products</label>
          <input name="q" type="text" placeholder="Search Best Buy products" value="${query}" />
        </div>
        <div class="filters full">
          <div class="range-row">
            <label>Min price: <span id="minPriceValue">${minPrice}</span></label>
            <input id="minPrice" name="minPrice" type="range" min="0" max="2000" step="10" value="${minPrice}" />
          </div>
          <div class="range-row">
            <label>Max price: <span id="maxPriceValue">${maxPrice}</span></label>
            <input id="maxPrice" name="maxPrice" type="range" min="0" max="2000" step="10" value="${maxPrice}" />
          </div>
          <div class="range-row">
            <label>Sort by</label>
            <select name="sort">
              <option value="price_asc" ${sort === "price_asc" ? "selected" : ""}>Price: low to high</option>
              <option value="price_desc" ${sort === "price_desc" ? "selected" : ""}>Price: high to low</option>
            </select>
          </div>
        </div>
        <div class="full">
          <button type="submit">Search</button>
        </div>
      </form>
      ${resultsHtml}
    ` : `
      <div class="notice">
        Please <a href="/login">log in</a> to search products.
      </div>
    `;

    res.send(renderPage(
      "ShopSavvy Price Tracker",
      `
        <div class="search-wrapper">
          <h1>ShopSavvy Price Tracker</h1>
          ${searchSection}
          <ul>
            <li><a href="/register">Register</a></li>
            <li><a href="/login">Login</a></li>
            <li><a href="/profile">Profile</a></li>
          </ul>
          ${hasToken ? `<form method="post" action="/logout"><button>Logout</button></form>` : ""}
        </div>
      `,
      `
        <script>
          const minInput = document.getElementById("minPrice");
          const maxInput = document.getElementById("maxPrice");
          const minValue = document.getElementById("minPriceValue");
          const maxValue = document.getElementById("maxPriceValue");

          function syncRanges(changed) {
            if (!minInput || !maxInput || !minValue || !maxValue) {
              return;
            }
            let min = Number(minInput.value);
            let max = Number(maxInput.value);
            if (min > max) {
              if (changed === minInput) {
                max = min;
                maxInput.value = String(max);
              } else {
                min = max;
                minInput.value = String(min);
              }
            }
            minValue.textContent = min;
            maxValue.textContent = max;
          }

          minInput?.addEventListener("input", () => syncRanges(minInput));
          maxInput?.addEventListener("input", () => syncRanges(maxInput));
          syncRanges();
        </script>
      `
    ));
  });

  app.get("/register", (req, res) => {
    res.send(renderPage("Register", `
      <h1>Create Account</h1>
      <form method="post" action="/register">
        <label>Email</label>
        <input name="email" type="email" required />
        <label>Password</label>
        <input name="password" type="password" minlength="8" required />
        <button type="submit">Register</button>
      </form>
      <p class="muted">Already have an account? <a href="/login">Login</a></p>
    `));
  });

  app.post("/register", async (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!email || !password) {
      return res.send(renderPage("Register", `<p class="error">Email and password are required.</p>`));
    }

    const existing = await db.get("SELECT id, verified FROM users WHERE email = ?", email);
    if (existing) {
      return res.send(renderPage("Register", `
        <p class="error">Account already exists.</p>
        <p><a href="/login">Go to login</a></p>
      `));
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const createdAt = new Date().toISOString();

    await db.run(
      "INSERT INTO users (email, password_hash, verified, verification_token, created_at) VALUES (?, ?, 0, ?, ?)",
      email,
      passwordHash,
      verificationToken,
      createdAt
    );

    const verificationLink = `${APP_BASE_URL}/verify?token=${verificationToken}`;
    sendVerificationEmail(email, verificationLink);

    res.send(renderPage("Verify Email", `
      <h1>Verify your email</h1>
      <p>We sent a verification link to <strong>${email}</strong>.</p>
      <p class="muted">In development, the verification link is printed in the server console.</p>
    `));
  });

  app.get("/verify", async (req, res) => {
    const token = String(req.query.token || "");
    if (!token) {
      return res.send(renderPage("Verify Email", `<p class="error">Invalid verification token.</p>`));
    }

    const user = await db.get("SELECT id FROM users WHERE verification_token = ?", token);
    if (!user) {
      return res.send(renderPage("Verify Email", `<p class="error">Verification token not found.</p>`));
    }

    await db.run(
      "UPDATE users SET verified = 1, verification_token = NULL WHERE id = ?",
      user.id
    );

    res.send(renderPage("Verified", `
      <h1>Email verified</h1>
      <p>Your account is now verified.</p>
      <p><a href="/login">Continue to login</a></p>
    `));
  });

  app.get("/login", (req, res) => {
    res.send(renderPage("Login", `
      <h1>Login</h1>
      <form method="post" action="/login">
        <label>Email</label>
        <input name="email" type="email" required />
        <label>Password</label>
        <input name="password" type="password" required />
        <button type="submit">Login</button>
      </form>
      <p class="muted">New here? <a href="/register">Create an account</a></p>
    `));
  });

  app.post("/login", async (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    const user = await db.get("SELECT * FROM users WHERE email = ?", email);
    if (!user) {
      return res.send(renderPage("Login", `<p class="error">Invalid email or password.</p>`));
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.send(renderPage("Login", `<p class="error">Invalid email or password.</p>`));
    }

    if (!user.verified) {
      return res.send(renderPage("Login", `
        <p class="error">Please verify your email before logging in.</p>
        <p class="muted">Check your email for the verification link.</p>
      `));
    }

    const token = createToken(user);
    setAuthCookie(res, token);
    return res.redirect("/profile");
  });

  app.post("/logout", (req, res) => {
    clearAuthCookie(res);
    res.redirect("/login");
  });

  app.get("/profile", authRequired, async (req, res) => {
    const user = await db.get("SELECT email FROM users WHERE id = ?", req.user.id);
    if (!user) {
      clearAuthCookie(res);
      return res.redirect("/login");
    }

    res.send(renderPage("Profile", `
      <h1>Profile</h1>
      <p>Email: <strong>${user.email}</strong></p>
      <form method="post" action="/logout">
        <button type="submit">Logout</button>
      </form>
    `));
  });

  app.get("/api/me", authRequired, async (req, res) => {
    const user = await db.get("SELECT email FROM users WHERE id = ?", req.user.id);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    res.json({ email: user.email });
  });

  app.listen(PORT, () => {
    console.log(`Server running at ${APP_BASE_URL}`);
  });
}

start().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
