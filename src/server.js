const express = require("express");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const https = require("https");
const dotenv = require("dotenv");
const { initDb } = require("./db");

// Load .env from project root (one level up from src/)
dotenv.config({ path: path.join(__dirname, "..", ".env") });

// Debug: Log Supabase config status
console.log("[Config] SUPABASE_URL:", process.env.SUPABASE_URL ? "✓ Set" : "✗ Not set");
console.log("[Config] SUPABASE_ANON_KEY:", process.env.SUPABASE_ANON_KEY ? "✓ Set" : "✗ Not set");

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

// Mercado Libre API Configuration
const ML_CLIENT_ID = process.env.MERCADO_LIBRE_App_ID || process.env.MERCADO_LIBRE_CLIENT_ID || "";
const ML_CLIENT_SECRET = process.env.MERCADO_LIBRE_CLIENT_SECRET || "";
const ML_SITE = process.env.MERCADO_LIBRE_SITE || "MLM"; // Default to Mexico

// Cache for ML access token
let mlAccessToken = null;
let mlTokenExpiry = 0;

// Auto-detect certs in ./certs directory (supports both PEM and PFX)
const defaultKeyPath = path.join(__dirname, "..", "certs", "localhost-key.pem");
const defaultCertPath = path.join(__dirname, "..", "certs", "localhost.pem");
const defaultPfxPath = path.join(__dirname, "..", "certs", "localhost.pfx");

const SSL_KEY_PATH = process.env.SSL_KEY_PATH || (fs.existsSync(defaultKeyPath) ? defaultKeyPath : "");
const SSL_CERT_PATH = process.env.SSL_CERT_PATH || (fs.existsSync(defaultCertPath) ? defaultCertPath : "");
const SSL_PFX_PATH = process.env.SSL_PFX_PATH || (fs.existsSync(defaultPfxPath) ? defaultPfxPath : "");
const SSL_PFX_PASSPHRASE = process.env.SSL_PFX_PASSPHRASE || "dev";

const HAS_TLS =
  (Boolean(SSL_KEY_PATH && SSL_CERT_PATH) &&
    fs.existsSync(SSL_KEY_PATH) &&
    fs.existsSync(SSL_CERT_PATH)) ||
  (Boolean(SSL_PFX_PATH) && fs.existsSync(SSL_PFX_PATH));

// Debug logging
if (HAS_TLS) {
  console.log(`TLS detected: ${SSL_PFX_PATH || `${SSL_KEY_PATH} + ${SSL_CERT_PATH}`}`);
}

const APP_BASE_URL = process.env.APP_BASE_URL
  || `${HAS_TLS ? "https" : "http"}://localhost:${PORT}`;

// Translations for bilingual support (English/Spanish)
const translations = {
  en: {
    // Header
    login: "Login",
    register: "Register",
    profile: "Profile",
    logout: "Logout",

    // Home page
    siteTagline: "Track prices and find the best deals",
    searchPlaceholder: "Search products...",
    minPrice: "Min price",
    maxPrice: "Max price",
    sortBy: "Sort by",
    priceLowHigh: "Price: low to high",
    priceHighLow: "Price: high to low",
    search: "Search",
    pleaseLogin: "Please <a href=\"/login\">log in</a> to search for products.",
    noResults: "No results found.",
    page: "Page",
    of: "of",
    previous: "← Previous",
    next: "Next →",
    viewDetails: "View details",
    soldBy: "Sold by",

    // Product page
    home: "Home",
    searchResults: "Search",
    product: "Product",
    productNotFound: "Product not found",
    tryGoingBack: "Try going back to search.",
    new: "New",
    used: "Used",
    available: "available",
    outOfStock: "Out of stock",
    viewOnML: "View on Mercado Libre",
    trackPrice: "Track Price",
    trackPriceAlert: "Coming soon: Add to price tracking",

    // Auth pages
    createAccount: "Create Account",
    email: "Email",
    password: "Password",
    confirmPassword: "Confirm Password",
    alreadyHaveAccount: "Already have an account?",
    newHere: "New here?",
    forgotPassword: "Forgot password?",
    orContinueWith: "Or continue with",
    continueWithGoogle: "Continue with Google",

    // Profile
    myProfile: "My Profile",
    accountStatus: "Account Status",
    verified: "Verified",

    // Errors
    invalidCredentials: "Invalid email or password.",
    emailInUse: "Email already in use.",
    passwordMismatch: "Passwords do not match.",
    passwordTooShort: "Password must be at least 8 characters.",

    // Misc
    priceTracker: "Price Tracker"
  },
  es: {
    // Header
    login: "Iniciar Sesión",
    register: "Registrarse",
    profile: "Perfil",
    logout: "Cerrar Sesión",

    // Home page
    siteTagline: "Rastrea precios y encuentra las mejores ofertas",
    searchPlaceholder: "Buscar productos...",
    minPrice: "Precio mínimo",
    maxPrice: "Precio máximo",
    sortBy: "Ordenar por",
    priceLowHigh: "Precio: menor a mayor",
    priceHighLow: "Precio: mayor a menor",
    search: "Buscar",
    pleaseLogin: "Por favor <a href=\"/login\">inicia sesión</a> para buscar productos.",
    noResults: "No se encontraron resultados.",
    page: "Página",
    of: "de",
    previous: "← Anterior",
    next: "Siguiente →",
    viewDetails: "Ver detalles",
    soldBy: "Vendido por",

    // Product page
    home: "Inicio",
    searchResults: "Búsqueda",
    product: "Producto",
    productNotFound: "Producto no encontrado",
    tryGoingBack: "Intenta regresar a la búsqueda.",
    new: "Nuevo",
    used: "Usado",
    available: "disponibles",
    outOfStock: "Sin stock",
    viewOnML: "Ver en Mercado Libre",
    trackPrice: "Rastrear Precio",
    trackPriceAlert: "Próximamente: Agregar a seguimiento de precios",

    // Auth pages
    createAccount: "Crear Cuenta",
    email: "Correo electrónico",
    password: "Contraseña",
    confirmPassword: "Confirmar Contraseña",
    alreadyHaveAccount: "¿Ya tienes cuenta?",
    newHere: "¿Eres nuevo?",
    forgotPassword: "¿Olvidaste tu contraseña?",
    orContinueWith: "O continuar con",
    continueWithGoogle: "Continuar con Google",

    // Profile
    myProfile: "Mi Perfil",
    accountStatus: "Estado de la Cuenta",
    verified: "Verificada",

    // Errors
    invalidCredentials: "Correo o contraseña inválidos.",
    emailInUse: "El correo ya está en uso.",
    passwordMismatch: "Las contraseñas no coinciden.",
    passwordTooShort: "La contraseña debe tener al menos 8 caracteres.",

    // Misc
    priceTracker: "Rastreador de Precios"
  }
};

function t(lang, key) {
  return translations[lang]?.[key] || translations.en[key] || key;
}

function renderPage(title, body, extraHead = "", isLoggedIn = false, userEmail = "", lang = "en") {
  const otherLang = lang === "en" ? "es" : "en";
  const langLabel = lang === "en" ? "ES" : "EN";
  const langFlag = lang === "en" ? "🇪🇸" : "🇺🇸";

  return `<!doctype html>
<html lang="${lang}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title} | ShopSavvy</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: Arial, sans-serif; margin: 0; padding: 0; }
      .site-header { background: #1a73e8; color: white; padding: 12px 24px; display: flex; justify-content: space-between; align-items: center; }
      .site-header a { color: white; text-decoration: none; }
      .site-header .logo { font-size: 20px; font-weight: bold; }
      .site-header .nav { display: flex; gap: 16px; align-items: center; }
      .site-header .nav a { padding: 6px 12px; border-radius: 4px; }
      .site-header .nav a:hover { background: rgba(255,255,255,0.1); }
      .site-header .user-email { font-size: 13px; opacity: 0.9; }
      .site-header form { display: inline; }
      .site-header button { background: rgba(255,255,255,0.2); border: none; color: white; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 14px; }
      .site-header button:hover { background: rgba(255,255,255,0.3); }
      .lang-switch { background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.3); padding: 4px 10px; border-radius: 4px; font-size: 13px; display: flex; align-items: center; gap: 4px; }
      .lang-switch:hover { background: rgba(255,255,255,0.25); }
      .main-content { padding: 24px 40px; max-width: 900px; }
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
      .card-seller { font-size: 12px; color: #888; }
      .pagination { display: flex; gap: 12px; align-items: center; margin-top: 16px; }
      .pagination a { text-decoration: none; }
      .notice { background: #fff7e6; border: 1px solid #ffd591; padding: 12px; border-radius: 8px; margin-bottom: 16px; }
      .breadcrumb { font-size: 13px; color: #666; margin-bottom: 16px; }
      .breadcrumb a { color: #1a73e8; text-decoration: none; }
      .product-detail { display: grid; gap: 20px; grid-template-columns: minmax(220px, 1fr) 2fr; align-items: start; }
      .product-image { width: 100%; max-width: 420px; height: auto; border-radius: 12px; background: #fafafa; }
      .product-price { font-size: 28px; font-weight: 700; margin: 12px 0; }
      .retailer-badge { display: inline-flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 999px; background: #f2f2f2; font-size: 13px; }
      .retailer-badge img { height: 20px; width: auto; }
      .action-button { display: inline-block; padding: 10px 16px; background: #1a73e8; color: #fff; border-radius: 8px; text-decoration: none; border: none; cursor: pointer; font-size: 14px; }
      .action-button:hover { background: #1557b0; }
      @media (max-width: 720px) {
        .main-content { padding: 16px; }
        .product-detail { grid-template-columns: 1fr; }
        .site-header { flex-direction: column; gap: 12px; }
      }
    </style>
    ${extraHead}
  </head>
  <body>
    <header class="site-header">
      <a href="/" class="logo">ShopSavvy</a>
      <nav class="nav">
        <a href="/set-lang/${otherLang}" class="lang-switch">${langFlag} ${langLabel}</a>
        ${isLoggedIn ? `
          <span class="user-email">${userEmail}</span>
          <a href="/profile">${t(lang, "profile")}</a>
          <form method="post" action="/logout"><button type="submit">${t(lang, "logout")}</button></form>
        ` : `
          <a href="/login">${t(lang, "login")}</a>
          <a href="/register">${t(lang, "register")}</a>
        `}
      </nav>
    </header>
    <main class="main-content">
    ${body}
    </main>
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

function getLang(req) {
  const lang = req.cookies.lang;
  return lang === "es" ? "es" : "en";
}

function setLangCookie(res, lang) {
  res.cookie("lang", lang, {
    httpOnly: false,
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 24 * 365, // 1 year
  });
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

// ============================================
// CALLBACK EXAMPLE: Email Sending with Callbacks
// ============================================

/**
 * Sends verification email with callback for success/error handling
 * @param {string} email - Recipient email
 * @param {string} verificationLink - Verification URL
 * @param {function} onSuccess - Callback when email sent successfully
 * @param {function} onError - Callback when error occurs
 */
function sendVerificationEmail(email, verificationLink, onSuccess, onError) {
  console.log(`\n[Verification Email] Sending to: ${email}`);
  
  // Simulate email sending (in real app, this would be async)
  setTimeout(() => {
    try {
      // In development, just log to console
      console.log(`Verify your account: ${verificationLink}\n`);
      
      // Call the success callback
      if (onSuccess) {
        onSuccess({
          email: email,
          sentAt: new Date().toISOString(),
          linkExpires: "24 hours"
        });
      }
    } catch (error) {
      // Call the error callback
      if (onError) {
        onError(error);
      }
    }
  }, 100);
}

/**
 * CALLBACK EXAMPLE: Logger utility with callbacks
 * This function logs actions and executes a callback when done
 */
function logAction(action, details, callback) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${action}:`, details);
  
  // Execute callback after logging
  if (callback && typeof callback === "function") {
    callback();
  }
}

function formatPrice(value, currency = "MXN") {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "N/A";
  }
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: currency,
    maximumFractionDigits: 2,
  }).format(value);
}

// Get Mercado Libre access token
async function getMLAccessToken() {
  // Return cached token if still valid
  if (mlAccessToken && Date.now() < mlTokenExpiry) {
    return mlAccessToken;
  }

  if (!ML_CLIENT_ID || !ML_CLIENT_SECRET) {
    console.log("Mercado Libre credentials not configured");
    return null;
  }

  try {
    const params = new URLSearchParams();
    params.append("grant_type", "client_credentials");
    params.append("client_id", ML_CLIENT_ID);
    params.append("client_secret", ML_CLIENT_SECRET);

    const response = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });

    const data = await response.json();

    if (data.access_token) {
      mlAccessToken = data.access_token;
      // Set expiry 5 minutes before actual expiry for safety
      mlTokenExpiry = Date.now() + (data.expires_in - 300) * 1000;
      console.log("Mercado Libre access token obtained");
      return mlAccessToken;
    }

    console.error("Failed to get ML token:", data);
    return null;
  } catch (error) {
    console.error("ML token error:", error);
    return null;
  }
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
  // Mock products styled for Mercado Libre Mexico
  return [
    {
      id: "MLM-001",
      title: "iPhone 15 Pro Max 256GB - Titanio Natural",
      description: "El iPhone más avanzado con chip A17 Pro, cámara de 48MP y Dynamic Island.",
      price: 28999,
      currency_id: "MXN",
      thumbnail: "https://http2.mlstatic.com/D_NQ_NP_2X_600741-MLA54876949912_042023-F.webp",
      permalink: "https://www.mercadolibre.com.mx/",
      condition: "new",
      available_quantity: 50,
      seller: { nickname: "APPLE_STORE_MX" },
    },
    {
      id: "MLM-002",
      title: "Samsung Galaxy S24 Ultra 256GB Negro",
      description: "Smartphone con Galaxy AI, cámara de 200MP y S Pen incluido.",
      price: 24999,
      currency_id: "MXN",
      thumbnail: "https://http2.mlstatic.com/D_NQ_NP_2X_896939-MLM72661707718_112023-F.webp",
      permalink: "https://www.mercadolibre.com.mx/",
      condition: "new",
      available_quantity: 35,
      seller: { nickname: "SAMSUNG_MX" },
    },
    {
      id: "MLM-003",
      title: "MacBook Air M3 13\" 256GB - Medianoche",
      description: "Laptop ultraligera con chip M3, 18 horas de batería y pantalla Liquid Retina.",
      price: 26999,
      currency_id: "MXN",
      thumbnail: "https://http2.mlstatic.com/D_NQ_NP_2X_854712-MLA74601558556_022024-F.webp",
      permalink: "https://www.mercadolibre.com.mx/",
      condition: "new",
      available_quantity: 20,
      seller: { nickname: "APPLE_STORE_MX" },
    },
    {
      id: "MLM-004",
      title: "PlayStation 5 Slim 1TB Digital Edition",
      description: "Consola de nueva generación con SSD ultrarrápido y DualSense.",
      price: 9499,
      currency_id: "MXN",
      thumbnail: "https://http2.mlstatic.com/D_NQ_NP_2X_691344-MLM74174576447_012024-F.webp",
      permalink: "https://www.mercadolibre.com.mx/",
      condition: "new",
      available_quantity: 15,
      seller: { nickname: "SONY_MX" },
    },
    {
      id: "MLM-005",
      title: "Audífonos Sony WH-1000XM5 Bluetooth Negro",
      description: "Los mejores audífonos con cancelación de ruido y 30 horas de batería.",
      price: 6499,
      currency_id: "MXN",
      thumbnail: "https://http2.mlstatic.com/D_NQ_NP_2X_673653-MLA51543508498_092022-F.webp",
      permalink: "https://www.mercadolibre.com.mx/",
      condition: "new",
      available_quantity: 45,
      seller: { nickname: "SONY_MX" },
    },
    {
      id: "MLM-006",
      title: "iPad Pro M4 11\" 256GB WiFi Space Black",
      description: "La tablet más potente con chip M4, pantalla Ultra Retina XDR y Apple Pencil Pro.",
      price: 21999,
      currency_id: "MXN",
      thumbnail: "https://http2.mlstatic.com/D_NQ_NP_2X_929429-MLA75879827421_042024-F.webp",
      permalink: "https://www.mercadolibre.com.mx/",
      condition: "new",
      available_quantity: 25,
      seller: { nickname: "APPLE_STORE_MX" },
    },
    {
      id: "MLM-007",
      title: "Nintendo Switch OLED Edición Zelda",
      description: "Consola portátil con pantalla OLED de 7 pulgadas, edición especial.",
      price: 7999,
      currency_id: "MXN",
      thumbnail: "https://http2.mlstatic.com/D_NQ_NP_2X_943597-MLM73034589839_112023-F.webp",
      permalink: "https://www.mercadolibre.com.mx/",
      condition: "new",
      available_quantity: 30,
      seller: { nickname: "NINTENDO_MX" },
    },
    {
      id: "MLM-008",
      title: "AirPods Pro 2 con USB-C",
      description: "Audífonos con cancelación activa de ruido, audio espacial y estuche MagSafe.",
      price: 4499,
      currency_id: "MXN",
      thumbnail: "https://http2.mlstatic.com/D_NQ_NP_2X_756250-MLA73970988653_012024-F.webp",
      permalink: "https://www.mercadolibre.com.mx/",
      condition: "new",
      available_quantity: 60,
      seller: { nickname: "APPLE_STORE_MX" },
    },
    {
      id: "MLM-009",
      title: "Smart TV Samsung 55\" Crystal UHD 4K",
      description: "Televisor inteligente con Tizen, Gaming Hub y diseño AirSlim.",
      price: 8999,
      currency_id: "MXN",
      thumbnail: "https://http2.mlstatic.com/D_NQ_NP_2X_600741-MLA54876949912_042023-F.webp",
      permalink: "https://www.mercadolibre.com.mx/",
      condition: "new",
      available_quantity: 18,
      seller: { nickname: "SAMSUNG_MX" },
    },
    {
      id: "MLM-010",
      title: "Xbox Series X 1TB Negro",
      description: "La consola Xbox más rápida con 4K a 120fps y Quick Resume.",
      price: 12999,
      currency_id: "MXN",
      thumbnail: "https://http2.mlstatic.com/D_NQ_NP_2X_709115-MLA45629061694_042021-F.webp",
      permalink: "https://www.mercadolibre.com.mx/",
      condition: "new",
      available_quantity: 22,
      seller: { nickname: "MICROSOFT_MX" },
    },
    {
      id: "MLM-011",
      title: "Aspiradora Dyson V15 Detect Absolute",
      description: "Aspiradora inalámbrica con láser para detectar polvo microscópico.",
      price: 14999,
      currency_id: "MXN",
      thumbnail: "https://http2.mlstatic.com/D_NQ_NP_2X_672464-MLA50401987399_062022-F.webp",
      permalink: "https://www.mercadolibre.com.mx/",
      condition: "new",
      available_quantity: 12,
      seller: { nickname: "DYSON_MX" },
    },
    {
      id: "MLM-012",
      title: "Apple Watch Series 9 GPS 45mm Aluminio",
      description: "Reloj inteligente con chip S9, doble toque y pantalla siempre activa.",
      price: 8999,
      currency_id: "MXN",
      thumbnail: "https://http2.mlstatic.com/D_NQ_NP_2X_667508-MLA73458044571_122023-F.webp",
      permalink: "https://www.mercadolibre.com.mx/",
      condition: "new",
      available_quantity: 40,
      seller: { nickname: "APPLE_STORE_MX" },
    },
  ];
}

function getMockProductById(id) {
  return getMockProducts().find((product) => product.id === id) || null;
}

function searchMockProducts({ query, minPrice, maxPrice, sort, page, pageSize }) {
  const normalizedQuery = query.toLowerCase();
  let results = getMockProducts().filter((product) => {
    const matchesQuery = product.title.toLowerCase().includes(normalizedQuery);
    const withinMin = !Number.isFinite(minPrice) || product.price >= minPrice;
    const withinMax = !Number.isFinite(maxPrice) || product.price <= maxPrice;
    return matchesQuery && withinMin && withinMax;
  });

  results.sort((a, b) => {
    if (sort === "price_desc") {
      return b.price - a.price;
    }
    return a.price - b.price;
  });

  const total = results.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  results = results.slice(start, start + pageSize);

  return { products: results, total, totalPages };
}

async function fetchMLProducts({ query, minPrice, maxPrice, sort, page, pageSize }) {
  // Try to use real Mercado Libre API if configured
  const token = await getMLAccessToken();

  if (token) {
    try {
      // Build search URL with filters
      const sortMap = {
        price_asc: "price_asc",
        price_desc: "price_desc",
      };

      const searchUrl = new URL(`https://api.mercadolibre.com/sites/${ML_SITE}/search`);
      searchUrl.searchParams.set("q", query);
      searchUrl.searchParams.set("offset", String((page - 1) * pageSize));
      searchUrl.searchParams.set("limit", String(pageSize));

      if (Number.isFinite(minPrice)) {
        searchUrl.searchParams.set("price", `${minPrice}-${maxPrice || "*"}`);
      }
      if (sort && sortMap[sort]) {
        searchUrl.searchParams.set("sort", sortMap[sort]);
      }

      const response = await fetch(searchUrl.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        return {
          products: data.results || [],
          total: data.paging?.total || 0,
          totalPages: Math.ceil((data.paging?.total || 0) / pageSize),
          error: "",
        };
      }

      // If API returns forbidden, fall back to mock data
      console.log("ML Search API restricted, using demo data");
    } catch (error) {
      console.error("ML API error:", error);
    }
  }

  // Fallback to mock data
  const mockResults = searchMockProducts({ query, minPrice, maxPrice, sort, page, pageSize });
  return {
    ...mockResults,
    notice: "",
    error: "",
  };
}

async function fetchMLProductById(id) {
  const token = await getMLAccessToken();

  if (token) {
    try {
      const response = await fetch(`https://api.mercadolibre.com/items/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const product = await response.json();
        return { product, notice: "", error: "" };
      }

      console.log("ML Items API restricted, using demo data");
    } catch (error) {
      console.error("ML API error:", error);
    }
  }

  // Fallback to mock data
  return {
    product: getMockProductById(id),
    notice: "",
    error: ""
  };
}

// Get ML categories
async function fetchMLCategories() {
  const token = await getMLAccessToken();

  if (token) {
    try {
      const response = await fetch(`https://api.mercadolibre.com/sites/${ML_SITE}/categories`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error("ML Categories error:", error);
    }
  }

  // Return some default categories
  return [
    { id: "MLM1051", name: "Celulares y Teléfonos" },
    { id: "MLM1648", name: "Computación" },
    { id: "MLM1000", name: "Electrónica, Audio y Video" },
    { id: "MLM1144", name: "Consolas y Videojuegos" },
    { id: "MLM1574", name: "Hogar, Muebles y Jardín" },
  ];
}

async function start() {
  const db = await initDb();
  const app = express();

  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  app.use(cookieParser());

  // Serve static files from public folder
  app.use(express.static(path.join(__dirname, "..", "public")));

  // Language switch route
  app.get("/set-lang/:lang", (req, res) => {
    const lang = req.params.lang === "es" ? "es" : "en";
    setLangCookie(res, lang);
    const referer = req.get("Referer") || "/";
    res.redirect(referer);
  });

  app.get("/", async (req, res) => {
    const lang = getLang(req);
    const hasToken = Boolean(req.cookies.token);
    let userEmail = "";
    if (hasToken) {
      try {
        const payload = jwt.verify(req.cookies.token, JWT_SECRET);
        const user = await db.get("SELECT email FROM users WHERE id = ?", payload.id);
        userEmail = user?.email || "";
      } catch (e) { /* invalid token */ }
    }
    const query = String(req.query.q || "").trim();
    const minPrice = parseNumber(req.query.minPrice, 0);
    const maxPrice = parseNumber(req.query.maxPrice, 50000);
    const sort = String(req.query.sort || "price_asc");
    const page = Math.max(parseNumber(req.query.page, 1), 1);
    const pageSize = 20;

    let results = { products: [], total: 0, totalPages: 0, error: "", notice: "" };
    if (query) {
      results = await fetchMLProducts({
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
        ${!results.error && results.products.length === 0 ? `<p class="muted">${t(lang, "noResults")}</p>` : ""}
        ${results.products.length ? `
          <div class="grid">
            ${results.products.map((item) => `
              <div class="card">
                <img src="${item.thumbnail || ""}" alt="${item.title || t(lang, "product")}" />
                <div class="card-title">${item.title || t(lang, "product")}</div>
                <div class="card-meta">${formatPrice(item.price, item.currency_id || "MXN")} · Mercado Libre</div>
                <div class="card-seller">${item.seller?.nickname ? `${t(lang, "soldBy")}: ${item.seller.nickname}` : ""}</div>
                <a href="${buildSearchParams(`/product/${encodeURIComponent(item.id)}`, { q: query, minPrice, maxPrice, sort, page })}">${t(lang, "viewDetails")}</a>
              </div>
            `).join("")}
          </div>
          <div class="pagination">
            ${page > 1 ? `<a href="${buildSearchParams("/", { q: query, minPrice, maxPrice, sort, page: page - 1 })}">${t(lang, "previous")}</a>` : ""}
            <span>${t(lang, "page")} ${page} ${t(lang, "of")} ${results.totalPages || 1}</span>
            ${page < results.totalPages ? `<a href="${buildSearchParams("/", { q: query, minPrice, maxPrice, sort, page: page + 1 })}">${t(lang, "next")}</a>` : ""}
          </div>
        ` : ""}
      </div>
    ` : "";

    const searchSection = hasToken ? `
      <form class="search-form" method="get" action="/">
        <div class="full">
          <input name="q" type="text" placeholder="${t(lang, "searchPlaceholder")}" value="${query}" />
        </div>
        <div class="filters full">
          <div class="range-row">
            <label>${t(lang, "minPrice")}: <span id="minPriceValue">${formatPrice(minPrice)}</span></label>
            <input id="minPrice" name="minPrice" type="range" min="0" max="50000" step="500" value="${minPrice}" />
          </div>
          <div class="range-row">
            <label>${t(lang, "maxPrice")}: <span id="maxPriceValue">${formatPrice(maxPrice)}</span></label>
            <input id="maxPrice" name="maxPrice" type="range" min="0" max="50000" step="500" value="${maxPrice}" />
          </div>
          <div class="range-row">
            <label>${t(lang, "sortBy")}</label>
            <select name="sort">
              <option value="price_asc" ${sort === "price_asc" ? "selected" : ""}>${t(lang, "priceLowHigh")}</option>
              <option value="price_desc" ${sort === "price_desc" ? "selected" : ""}>${t(lang, "priceHighLow")}</option>
            </select>
          </div>
        </div>
        <div class="full">
          <button type="submit">${t(lang, "search")}</button>
        </div>
      </form>
      ${resultsHtml}
    ` : `
      <div class="notice">
        ${t(lang, "pleaseLogin")}
      </div>
    `;

    res.send(renderPage(
      t(lang, "priceTracker"),
      `
        <div class="search-wrapper">
          <p class="tagline">${t(lang, "siteTagline")}</p>
          ${searchSection}
        </div>
      `,
      `
        <style>
          .tagline { color: #666; margin-bottom: 24px; }
        </style>
        <script>
          const minInput = document.getElementById("minPrice");
          const maxInput = document.getElementById("maxPrice");
          const minValue = document.getElementById("minPriceValue");
          const maxValue = document.getElementById("maxPriceValue");

          function formatMXN(value) {
            return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value);
          }

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
            minValue.textContent = formatMXN(min);
            maxValue.textContent = formatMXN(max);
          }

          minInput?.addEventListener("input", () => syncRanges(minInput));
          maxInput?.addEventListener("input", () => syncRanges(maxInput));
          syncRanges();
        </script>
      `,
      hasToken,
      userEmail,
      lang
    ));
  });

  app.get("/register", (req, res) => {
    const lang = getLang(req);
    res.send(renderPage(t(lang, "register"), `
      <h1>${t(lang, "createAccount")}</h1>
      <form method="post" action="/register">
        <label>${t(lang, "email")}</label>
        <input name="email" type="email" autocomplete="email" required />
        <label>${t(lang, "password")}</label>
        <input name="password" type="password" autocomplete="new-password" minlength="8" required />
        <button type="submit">${t(lang, "register")}</button>
      </form>
      <p class="muted">${t(lang, "alreadyHaveAccount")} <a href="/login">${t(lang, "login")}</a></p>
    `, "", false, "", lang));
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
    
    // CALLBACK EXAMPLE: Using callbacks for email sending
    sendVerificationEmail(
      email,
      verificationLink,
      // Success callback
      (info) => {
        logAction("Email Sent", `Verification email sent to ${info.email}`, () => {
          console.log("✓ Email logging complete");
        });
      },
      // Error callback
      (error) => {
        console.error("✗ Failed to send email:", error);
      }
    );

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
    const lang = getLang(req);
    res.send(renderPage(t(lang, "login"), `
      <h1>${t(lang, "login")}</h1>
      <form method="post" action="/login">
        <label>${t(lang, "email")}</label>
        <input name="email" type="email" autocomplete="email" required />
        <label>${t(lang, "password")}</label>
        <input name="password" type="password" autocomplete="current-password" required />
        <button type="submit">${t(lang, "login")}</button>
      </form>
      <p class="muted"><a href="/forgot-password">${t(lang, "forgotPassword")}</a></p>
      <p class="muted">${t(lang, "newHere")} <a href="/register">${t(lang, "createAccount")}</a></p>

      <div style="margin-top: 24px; padding-top: 24px; border-top: 1px solid #ddd; max-width: 360px;">
        <p style="text-align: center; color: #666; margin-bottom: 16px;">${t(lang, "orContinueWith")}</p>
        <button
          id="google-login-btn"
          type="button"
          style="width: 100%; padding: 10px; font-size: 14px; border: 1px solid #ddd; border-radius: 8px; background: white; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 12px;"
        >
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
            <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707 0-.593.102-1.17.282-1.709V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.335z"/>
            <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
          </svg>
          <span>${t(lang, "continueWithGoogle")}</span>
        </button>
      </div>
    `, `
      <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
      <script>
        document.addEventListener('DOMContentLoaded', function() {
          const SUPABASE_URL = '${process.env.SUPABASE_URL || ''}';
          const SUPABASE_ANON_KEY = '${process.env.SUPABASE_ANON_KEY || ''}';

          if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
            console.error('Supabase credentials not configured');
            const btn = document.getElementById('google-login-btn');
            if (btn) {
              btn.disabled = true;
              btn.innerHTML = '<span style="color: #666;">Google Login Not Configured</span>';
            }
            return;
          }

          const { createClient } = supabase;
          const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

          const btn = document.getElementById('google-login-btn');
          if (!btn) {
            console.error('Google login button not found');
            return;
          }

          btn.addEventListener('click', async () => {
            btn.disabled = true;
            btn.innerHTML = '<span>Redirecting to Google...</span>';

            try {
              const { data, error } = await supabaseClient.auth.signInWithOAuth({
                provider: 'google',
                options: {
                  redirectTo: '${APP_BASE_URL}/auth/supabase-callback'
                }
              });

              if (error) {
                console.error('OAuth error:', error);
                btn.disabled = false;
                btn.innerHTML = '<span>Continue with Google</span>';
                alert('Failed to sign in with Google: ' + error.message);
              }
            } catch (err) {
              console.error('Error:', err);
              btn.disabled = false;
              btn.innerHTML = '<span>Continue with Google</span>';
              alert('An error occurred. Please try again.');
            }
          });
        });
      </script>
    `, false, "", lang));
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

  // Diagnostic endpoint to check Supabase configuration
  app.get("/debug/supabase-config", (req, res) => {
    const hasSupabaseUrl = Boolean(process.env.SUPABASE_URL);
    const hasSupabaseKey = Boolean(process.env.SUPABASE_ANON_KEY);
    
    res.send(renderPage("Supabase Configuration", `
      <h1>Supabase Configuration Status</h1>
      <p><strong>SUPABASE_URL:</strong> ${hasSupabaseUrl ? '✅ Configured' : '❌ Not configured'}</p>
      ${hasSupabaseUrl ? `<p class="muted">URL: ${process.env.SUPABASE_URL}</p>` : ''}
      <p><strong>SUPABASE_ANON_KEY:</strong> ${hasSupabaseKey ? '✅ Configured' : '❌ Not configured'}</p>
      ${hasSupabaseKey ? `<p class="muted">Key: ${process.env.SUPABASE_ANON_KEY.substring(0, 20)}...</p>` : ''}
      
      ${!hasSupabaseUrl || !hasSupabaseKey ? `
        <div class="notice" style="margin-top: 20px;">
          <h3>⚠️ Configuration Required</h3>
          <p>To enable Google login, add these to your <code>.env</code> file:</p>
          <pre style="background: #f5f5f5; padding: 12px; border-radius: 4px; overflow-x: auto;">
SUPABASE_URL=https://rcetefvuniellfuneejg.supabase.co
SUPABASE_ANON_KEY=your_anon_key_from_supabase</pre>
          <p>Then restart the server: <code>npm run dev</code></p>
        </div>
      ` : `
        <div style="margin-top: 20px; padding: 12px; background: #e8f5e9; border-radius: 8px;">
          <p class="success">✅ Supabase is configured correctly!</p>
          <p><a href="/login">Go to login page</a></p>
        </div>
      `}
      
      <p style="margin-top: 24px;"><a href="/">Back to home</a></p>
    `));
  });

  // ============================================
  // OAUTH CALLBACK ENDPOINT
  // For third-party authentication (Mercado Libre, Google, etc.)
  // ============================================

  /**
   * OAuth Callback Endpoint
   * This is where external services (like Mercado Libre) redirect users after login
   * URL to use in OAuth app settings: https://localhost:3000/auth/callback
   */
  app.get("/auth/callback", async (req, res) => {
    try {
      // Get authorization code from query parameters
      const code = req.query.code;
      const state = req.query.state;
      const error = req.query.error;

      // Check for errors from OAuth provider
      if (error) {
        console.error("OAuth Error:", error);
        return res.send(renderPage("Authentication Failed", `
          <h1>Authentication Failed</h1>
          <p class="error">Error: ${error}</p>
          <p class="muted">There was a problem logging in with the external service.</p>
          <p><a href="/login">Back to login</a></p>
        `));
      }

      // Verify we received an authorization code
      if (!code) {
        return res.send(renderPage("Authentication Failed", `
          <h1>Authentication Failed</h1>
          <p class="error">No authorization code received.</p>
          <p><a href="/login">Back to login</a></p>
        `));
      }

      console.log("\n[OAuth Callback] Received authorization code:", code);
      console.log("[OAuth Callback] State:", state);

      // TODO: Exchange authorization code for access token
      // This is where you'd call Mercado Libre's token endpoint
      // Example:
      // const tokenResponse = await fetch('https://api.mercadolibre.com/oauth/token', {
      //   method: 'POST',
      //   body: JSON.stringify({
      //     grant_type: 'authorization_code',
      //     client_id: process.env.MERCADO_LIBRE_CLIENT_ID,
      //     client_secret: process.env.MERCADO_LIBRE_CLIENT_SECRET,
      //     code: code,
      //     redirect_uri: `${APP_BASE_URL}/auth/callback`
      //   })
      // });

      // For now, show success page
      res.send(renderPage("Authentication Successful", `
        <h1>OAuth Callback Received!</h1>
        <p class="success">✓ Authorization code received successfully</p>
        <div class="notice">
          <strong>Callback Data:</strong>
          <pre>Code: ${code}
State: ${state || 'none'}</pre>
        </div>
        <p class="muted">Next step: Exchange this code for an access token to complete authentication.</p>
        <p><a href="/login">Back to login</a></p>
      `));

    } catch (error) {
      console.error("Callback error:", error);
      res.send(renderPage("Error", `
        <h1>Error</h1>
        <p class="error">An error occurred during authentication.</p>
        <p><a href="/login">Back to login</a></p>
      `));
    }
  });

  /**
   * Alternative callback endpoint (some services use /callback)
   */
  app.get("/callback", async (req, res) => {
    // Redirect to the main auth callback handler
    const query = new URLSearchParams(req.query).toString();
    res.redirect(`/auth/callback?${query}`);
  });

  /**
   * Supabase OAuth Callback Endpoint
   * Handles the response from Supabase after Google/other OAuth login
   */
  app.get("/auth/supabase-callback", async (req, res) => {
    try {
      // Get the hash fragment (Supabase sends data in URL hash)
      res.send(renderPage("Login Success", `
        <h1>Processing Google Login...</h1>
        <p class="muted">Please wait while we complete your login.</p>
      `, `
        <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
        <script>
          const SUPABASE_URL = '${process.env.SUPABASE_URL || ''}';
          const SUPABASE_ANON_KEY = '${process.env.SUPABASE_ANON_KEY || ''}';
          
          if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
            document.body.innerHTML = '<h1>Configuration Error</h1><p class="error">Supabase not configured. Please contact support.</p>';
          } else {
            const { createClient } = supabase;
            const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            
            // Get the session from URL hash
            supabaseClient.auth.getSession().then(async ({ data: { session }, error }) => {
              if (error) {
                document.body.innerHTML = '<h1>Login Failed</h1><p class="error">Error: ' + error.message + '</p><p><a href="/login">Back to login</a></p>';
                return;
              }
              
              if (!session) {
                document.body.innerHTML = '<h1>No Session</h1><p class="error">Could not retrieve session.</p><p><a href="/login">Back to login</a></p>';
                return;
              }
              
              // Send session info to backend to create/login user
              try {
                const response = await fetch('/auth/supabase-verify', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  },
                  credentials: 'include',
                  body: JSON.stringify({
                    user: session.user,
                    access_token: session.access_token
                  })
                });

                const result = await response.json();

                if (result.success) {
                  // Cookie is set by server (httpOnly), redirect to home page
                  window.location.href = '/';
                } else {
                  document.body.innerHTML = '<h1>Login Failed</h1><p class="error">' + (result.error || 'Unknown error') + '</p><p><a href="/login">Back to login</a></p>';
                }
              } catch (err) {
                document.body.innerHTML = '<h1>Error</h1><p class="error">Failed to verify login: ' + err.message + '</p><p><a href="/login">Back to login</a></p>';
              }
            });
          }
        </script>
      `));
    } catch (error) {
      console.error("Supabase callback error:", error);
      res.send(renderPage("Error", `
        <h1>Error</h1>
        <p class="error">An error occurred during authentication.</p>
        <p><a href="/login">Back to login</a></p>
      `));
    }
  });

  /**
   * Verify Supabase user and create/login in our system
   */
  app.post("/auth/supabase-verify", express.json(), async (req, res) => {
    try {
      const { user, access_token } = req.body;
      
      if (!user || !user.email) {
        return res.json({ success: false, error: 'Invalid user data' });
      }
      
      const email = user.email.toLowerCase();
      const name = user.user_metadata?.full_name || user.user_metadata?.name || email.split('@')[0];
      
      // Check if user exists
      let dbUser = await db.get("SELECT * FROM users WHERE email = ?", email);
      
      if (!dbUser) {
        // Create new user (no password needed for OAuth users)
        const randomPassword = crypto.randomBytes(32).toString('hex');
        const passwordHash = await bcrypt.hash(randomPassword, 10);
        
        await db.run(
          "INSERT INTO users (email, password_hash, verified) VALUES (?, ?, ?)",
          email,
          passwordHash,
          1 // Auto-verify OAuth users
        );
        
        dbUser = await db.get("SELECT * FROM users WHERE email = ?", email);
        console.log("[OAuth] New user created: " + email);
      } else if (!dbUser.verified) {
        // Auto-verify existing user who logged in with OAuth
        await db.run("UPDATE users SET verified = 1 WHERE id = ?", dbUser.id);
        dbUser.verified = 1;
        console.log("[OAuth] User auto-verified: " + email);
      }
      
      // Create JWT token for our app
      const token = createToken(dbUser);

      // Set httpOnly cookie server-side (more secure than client-side)
      setAuthCookie(res, token);

      res.json({
        success: true,
        user: { id: dbUser.id, email: dbUser.email }
      });
      
    } catch (error) {
      console.error("Supabase verify error:", error);
      res.json({ success: false, error: error.message });
    }
  });

  // ============================================
  // FORGOT PASSWORD - Uses Callbacks!
  // ============================================

  app.get("/forgot-password", (req, res) => {
    res.send(renderPage("Forgot Password", `
      <h1>Forgot Password</h1>
      <p>Enter your email address and we'll send you a link to reset your password.</p>
      <form method="post" action="/forgot-password">
        <label>Email</label>
        <input name="email" type="email" required />
        <button type="submit">Send Reset Link</button>
      </form>
      <p class="muted"><a href="/login">Back to login</a></p>
    `));
  });

  app.post("/forgot-password", async (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();

    if (!email) {
      return res.send(renderPage("Forgot Password", `<p class="error">Email is required.</p>`));
    }

    const user = await db.get("SELECT id, email FROM users WHERE email = ?", email);
    
    // Always show success message (security best practice - don't reveal if email exists)
    if (!user) {
      return res.send(renderPage("Check Your Email", `
        <h1>Check Your Email</h1>
        <p>If an account exists with <strong>${email}</strong>, you will receive a password reset link.</p>
        <p class="muted">The link will expire in 1 hour.</p>
        <p><a href="/login">Back to login</a></p>
      `));
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetExpires = new Date(Date.now() + 3600000).toISOString(); // 1 hour from now

    await db.run(
      "UPDATE users SET verification_token = ?, created_at = ? WHERE id = ?",
      resetToken,
      resetExpires,
      user.id
    );

    const resetLink = `${APP_BASE_URL}/reset-password?token=${resetToken}`;
    
    // CALLBACK EXAMPLE: Send reset email with callbacks
    sendVerificationEmail(
      email,
      resetLink,
      // Success callback
      function(info) {
        logAction("Password Reset Email Sent", `Reset link sent to ${info.email}`, function() {
          console.log("✓ Password reset email logged");
        });
      },
      // Error callback
      function(error) {
        console.error("✗ Failed to send reset email:", error);
      }
    );

    res.send(renderPage("Check Your Email", `
      <h1>Check Your Email</h1>
      <p>We sent a password reset link to <strong>${email}</strong>.</p>
      <p class="muted">The link will expire in 1 hour.</p>
      <p class="muted">In development, the reset link is printed in the server console.</p>
      <p><a href="/login">Back to login</a></p>
    `));
  });

  app.get("/reset-password", async (req, res) => {
    const token = String(req.query.token || "");
    
    if (!token) {
      return res.send(renderPage("Reset Password", `
        <p class="error">Invalid reset token.</p>
        <p><a href="/forgot-password">Request new reset link</a></p>
      `));
    }

    const user = await db.get("SELECT id, email FROM users WHERE verification_token = ?", token);
    
    if (!user) {
      return res.send(renderPage("Reset Password", `
        <p class="error">Invalid or expired reset token.</p>
        <p><a href="/forgot-password">Request new reset link</a></p>
      `));
    }

    res.send(renderPage("Reset Password", `
      <h1>Reset Password</h1>
      <p>Enter your new password for <strong>${user.email}</strong></p>
      <form method="post" action="/reset-password">
        <input type="hidden" name="token" value="${token}" />
        <label>New Password</label>
        <input name="password" type="password" minlength="8" required />
        <label>Confirm Password</label>
        <input name="confirmPassword" type="password" minlength="8" required />
        <button type="submit">Reset Password</button>
      </form>
      <p class="muted"><a href="/login">Back to login</a></p>
    `));
  });

  app.post("/reset-password", async (req, res) => {
    const token = String(req.body.token || "");
    const password = String(req.body.password || "");
    const confirmPassword = String(req.body.confirmPassword || "");

    if (!token || !password || !confirmPassword) {
      return res.send(renderPage("Reset Password", `<p class="error">All fields are required.</p>`));
    }

    if (password !== confirmPassword) {
      return res.send(renderPage("Reset Password", `<p class="error">Passwords do not match.</p>`));
    }

    if (password.length < 8) {
      return res.send(renderPage("Reset Password", `<p class="error">Password must be at least 8 characters.</p>`));
    }

    const user = await db.get("SELECT id, email FROM users WHERE verification_token = ?", token);
    
    if (!user) {
      return res.send(renderPage("Reset Password", `
        <p class="error">Invalid or expired reset token.</p>
        <p><a href="/forgot-password">Request new reset link</a></p>
      `));
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(password, 10);

    // Update password and clear reset token
    await db.run(
      "UPDATE users SET password_hash = ?, verification_token = NULL, verified = 1 WHERE id = ?",
      passwordHash,
      user.id
    );

    // Log the password reset with callback
    logAction("Password Reset", `Password updated for ${user.email}`, function() {
      console.log("✓ Password reset completed");
    });

    res.send(renderPage("Password Reset Successful", `
      <h1>Password Reset Successful</h1>
      <p class="success">Your password has been reset successfully!</p>
      <p>You can now log in with your new password.</p>
      <p><a href="/login">Go to login</a></p>
    `));
  });

  app.get("/profile", authRequired, async (req, res) => {
    const lang = getLang(req);
    const user = await db.get("SELECT email FROM users WHERE id = ?", req.user.id);
    if (!user) {
      clearAuthCookie(res);
      return res.redirect("/login");
    }

    res.send(renderPage(t(lang, "profile"), `
      <h1>${t(lang, "myProfile")}</h1>
      <div class="profile-card">
        <p><strong>${t(lang, "email")}:</strong> ${user.email}</p>
        <p><strong>${t(lang, "accountStatus")}:</strong> ${t(lang, "verified")}</p>
      </div>
    `, `
      <style>
        .profile-card { background: #f9f9f9; padding: 20px; border-radius: 8px; }
      </style>
    `, true, user.email, lang));
  });

  app.get("/product/:id", authRequired, async (req, res) => {
    const lang = getLang(req);
    const userEmail = req.user?.email || "";
    const id = String(req.params.id || "");
    const query = String(req.query.q || "").trim();
    const minPrice = parseNumber(req.query.minPrice, 0);
    const maxPrice = parseNumber(req.query.maxPrice, 50000);
    const sort = String(req.query.sort || "price_asc");
    const page = Math.max(parseNumber(req.query.page, 1), 1);

    const result = await fetchMLProductById(id);
    const product = result.product;

    if (!product) {
      return res.send(renderPage(t(lang, "productNotFound"), `
        <div class="breadcrumb">
          <a href="/">${t(lang, "home")}</a>
          <span> / </span>
          <a href="${buildSearchParams("/", { q: query, minPrice, maxPrice, sort, page })}">${t(lang, "searchResults")}</a>
          <span> / ${t(lang, "product")}</span>
        </div>
        <h1>${t(lang, "productNotFound")}</h1>
        ${result.error ? `<p class="error">${result.error}</p>` : ""}
        <p class="muted">${t(lang, "tryGoingBack")}</p>
      `, "", true, userEmail, lang));
    }

    const description = product.description || "";
    const condition = product.condition === "new" ? t(lang, "new") : product.condition === "used" ? t(lang, "used") : product.condition;
    const available = product.available_quantity || 0;

    res.send(renderPage(product.title || t(lang, "product"), `
      <div class="breadcrumb">
        <a href="/">${t(lang, "home")}</a>
        <span> / </span>
        <a href="${buildSearchParams("/", { q: query, minPrice, maxPrice, sort, page })}">${t(lang, "searchResults")}</a>
        <span> / ${t(lang, "product")}</span>
      </div>
      ${result.notice ? `<div class="notice">${result.notice}</div>` : ""}
      <div class="product-detail">
        <img class="product-image" src="${product.thumbnail || ""}" alt="${product.title || t(lang, "product")}" />
        <div>
          <h1>${product.title || t(lang, "product")}</h1>
          <div class="retailer-badge">
            <img src="https://http2.mlstatic.com/frontend-assets/ml-web-navigation/ui-navigation/5.21.22/mercadolibre/logo__large_plus.png" alt="Mercado Libre" style="height: 24px;" />
          </div>
          <div class="product-price">${formatPrice(product.price, product.currency_id || "MXN")}</div>
          <div class="product-meta">
            <span class="condition">${condition}</span>
            ${available > 0 ? `<span class="stock">· ${available} ${t(lang, "available")}</span>` : `<span class="stock out">· ${t(lang, "outOfStock")}</span>`}
          </div>
          ${product.seller?.nickname ? `<div class="seller-info">${t(lang, "soldBy")}: <strong>${product.seller.nickname}</strong></div>` : ""}
          <p>${description}</p>
          ${product.permalink ? `<a class="action-button" href="${product.permalink}" target="_blank" rel="noreferrer">${t(lang, "viewOnML")}</a>` : ""}
          <button class="action-button secondary" onclick="alert('${t(lang, "trackPriceAlert")}')">📊 ${t(lang, "trackPrice")}</button>
        </div>
      </div>
    `, `
      <style>
        .product-meta { margin: 8px 0 16px; font-size: 14px; color: #666; }
        .condition { background: #e8f5e9; color: #2e7d32; padding: 4px 8px; border-radius: 4px; }
        .stock { margin-left: 8px; }
        .stock.out { color: #c62828; }
        .seller-info { margin: 12px 0; font-size: 14px; color: #555; }
        .action-button.secondary { background: #fff; color: #333; border: 1px solid #ddd; margin-left: 8px; }
        .action-button.secondary:hover { background: #f5f5f5; }
      </style>
    `, true, userEmail, lang));
  });

  app.get("/api/me", authRequired, async (req, res) => {
    const user = await db.get("SELECT email FROM users WHERE id = ?", req.user.id);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    res.json({ email: user.email });
  });

  // ============================================
  // API ENDPOINTS
  // ============================================

  /**
   * API: Search products with callback pattern
   * URL: GET /api/products/search?q=iphone&minPrice=1000&maxPrice=30000
   *
   * This endpoint demonstrates:
   * 1. Express route callback: app.get('/path', callback)
   * 2. Async operation callback: fetchMLProducts with then()
   * 3. Response callback: res.json() sends data to browser
   */
  app.get("/api/products/search", function(req, res) {
    // Log the API call
    logAction("API Request", `/api/products/search?q=${req.query.q}`, function() {
      console.log("  Request logged successfully");
    });

    const query = String(req.query.q || "").trim();
    const minPrice = parseNumber(req.query.minPrice, 0);
    const maxPrice = parseNumber(req.query.maxPrice, 50000);
    const sort = String(req.query.sort || "price_asc");
    const page = Math.max(parseNumber(req.query.page, 1), 1);
    const pageSize = 20;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: "Se requiere una consulta de búsqueda",
        example: "/api/products/search?q=iphone"
      });
    }

    // Async operation with callback pattern (using .then)
    fetchMLProducts({ query, minPrice, maxPrice, sort, page, pageSize })
      .then(function(results) {  // ← SUCCESS CALLBACK
        res.json({
          success: true,
          query: query,
          site: ML_SITE,
          filters: { minPrice, maxPrice, sort },
          pagination: {
            page: page,
            pageSize: pageSize,
            total: results.total,
            totalPages: results.totalPages
          },
          products: results.products,
          notice: results.notice
        });
      })
      .catch(function(error) {  // ← ERROR CALLBACK
        res.status(500).json({
          success: false,
          error: error.message || "Error al buscar productos"
        });
      });
  });

  /**
   * API: Get product by ID with callback pattern
   * URL: GET /api/products/:id
   * Example: GET /api/products/MLM-001
   */
  app.get("/api/products/:id", function(req, res) {
    const id = String(req.params.id || "");

    if (!id) {
      return res.status(400).json({
        success: false,
        error: "Se requiere el ID del producto"
      });
    }

    // Async operation with callback
    fetchMLProductById(id)
      .then(function(result) {  // ← SUCCESS CALLBACK
        if (!result.product) {
          return res.status(404).json({
            success: false,
            error: "Producto no encontrado",
            id: id
          });
        }

        res.json({
          success: true,
          product: result.product,
          notice: result.notice
        });
      })
      .catch(function(error) {  // ← ERROR CALLBACK
        res.status(500).json({
          success: false,
          error: error.message || "Error al obtener el producto"
        });
      });
  });

  /**
   * API: Get all demo products
   * URL: GET /api/products
   */
  app.get("/api/products", function(req, res) {
    try {
      const products = getMockProducts();

      // Simulate async operation with setTimeout
      setTimeout(function() {  // ← CALLBACK after delay
        res.json({
          success: true,
          count: products.length,
          products: products,
          site: ML_SITE,
          note: ""
        });
      }, 100);  // Small delay to simulate network
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * API: Get Mercado Libre categories
   * URL: GET /api/categories
   */
  app.get("/api/categories", async function(req, res) {
    try {
      const categories = await fetchMLCategories();
      res.json({
        success: true,
        site: ML_SITE,
        categories: categories
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message || "Error al obtener categorías"
      });
    }
  });

  /**
   * API: Health check endpoint
   * URL: GET /api/health
   */
  app.get("/api/health", async function(req, res) {
    const startTime = Date.now();

    // Check ML API connection
    const mlToken = await getMLAccessToken();
    const mlStatus = mlToken ? "connected" : "not configured";

    // Check database with callback
    db.get("SELECT 1 as status", function(error, result) {
      const responseTime = Date.now() - startTime;

      if (error) {
        return res.status(500).json({
          success: false,
          status: "unhealthy",
          error: "Database connection failed"
        });
      }

      res.json({
        success: true,
        status: "healthy",
        database: result ? "connected" : "disconnected",
        mercadoLibre: {
          status: mlStatus,
          site: ML_SITE,
          clientId: ML_CLIENT_ID ? `${ML_CLIENT_ID.substring(0, 6)}...` : "not set"
        },
        responseTime: `${responseTime}ms`,
        https: HAS_TLS,
        baseUrl: APP_BASE_URL
      });
    });
  });

  if (HAS_TLS) {
    let tlsOptions;
    
    // Use PFX if available (Windows self-signed cert)
    if (SSL_PFX_PATH && fs.existsSync(SSL_PFX_PATH)) {
      tlsOptions = {
        pfx: fs.readFileSync(SSL_PFX_PATH),
        passphrase: SSL_PFX_PASSPHRASE,
      };
    }
    // Fall back to PEM format
    else if (SSL_KEY_PATH && SSL_CERT_PATH) {
      tlsOptions = {
        key: fs.readFileSync(SSL_KEY_PATH),
        cert: fs.readFileSync(SSL_CERT_PATH),
      };
    }

    https.createServer(tlsOptions, app).listen(PORT, () => {
      console.log(`HTTPS server running at ${APP_BASE_URL}`);
    });
  } else {
    app.listen(PORT, () => {
      console.log(`HTTP server running at ${APP_BASE_URL}`);
    });
  }
}

start().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
