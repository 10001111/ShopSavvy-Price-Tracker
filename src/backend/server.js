const express = require("express");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const https = require("https");
const dotenv = require("dotenv");

// Load .env FIRST before checking any environment variables
// Go up two directories: src/backend -> src -> project root
dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

const { initDb } = require("./db");
const supabaseDb = require("./supabase-db");
const { isRedisConfigured } = require("./config/redis");
const {
  initQueue,
  initWorker,
  setupRecurringJobs,
  triggerPriceUpdate,
  getQueueStatus,
  getRecentJobs,
} = require("./queue");

// Use Supabase for cloud storage, SQLite as fallback
const USE_SUPABASE = Boolean(
  process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY,
);
console.log(
  "[Config] Database:",
  USE_SUPABASE ? "Supabase (cloud)" : "SQLite (local)",
);

// Debug: Log config status
console.log(
  "[Config] SUPABASE_URL:",
  process.env.SUPABASE_URL ? "✓ Set" : "✗ Not set",
);
console.log(
  "[Config] SUPABASE_ANON_KEY:",
  process.env.SUPABASE_ANON_KEY ? "✓ Set" : "✗ Not set",
);
console.log(
  "[Config] AMAZON_ACCESS_KEY:",
  process.env.AMAZON_ACCESS_KEY ? "✓ Set" : "✗ Not set",
);
console.log(
  "[Config] AMAZON_SECRET_KEY:",
  process.env.AMAZON_SECRET_KEY ? "✓ Set" : "✗ Not set",
);
console.log(
  "[Config] AMAZON_PARTNER_TAG:",
  process.env.AMAZON_PARTNER_TAG ? "✓ Set" : "✗ Not set",
);
console.log(
  "[Config] REDIS_URL:",
  process.env.REDIS_URL ? "✓ Set" : "✗ Not set",
);

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

// Mercado Libre API Configuration
const ML_CLIENT_ID =
  process.env.MERCADO_LIBRE_App_ID || process.env.MERCADO_LIBRE_CLIENT_ID || "";
const ML_CLIENT_SECRET = process.env.MERCADO_LIBRE_CLIENT_SECRET || "";
const ML_SITE = process.env.MERCADO_LIBRE_SITE || "MLM"; // Default to Mexico

// Cache for ML access token
let mlAccessToken = null;
let mlTokenExpiry = 0;

// Amazon Product Advertising API Configuration
const AMAZON_ACCESS_KEY = process.env.AMAZON_ACCESS_KEY || "";
const AMAZON_SECRET_KEY = process.env.AMAZON_SECRET_KEY || "";
const AMAZON_PARTNER_TAG = process.env.AMAZON_PARTNER_TAG || "";
const AMAZON_REGION = process.env.AMAZON_REGION || "us-east-1";
const AMAZON_HOST =
  AMAZON_REGION === "us-east-1"
    ? "webservices.amazon.com"
    : `webservices.amazon.${AMAZON_REGION.split("-")[0]}`;

// Check if Amazon PA-API is configured
const HAS_AMAZON_API = Boolean(
  AMAZON_ACCESS_KEY && AMAZON_SECRET_KEY && AMAZON_PARTNER_TAG,
);

// Auto-detect certs in ./certs directory (supports both PEM and PFX)
const defaultKeyPath = path.join(__dirname, "..", "certs", "localhost-key.pem");
const defaultCertPath = path.join(__dirname, "..", "certs", "localhost.pem");
const defaultPfxPath = path.join(__dirname, "..", "certs", "localhost.pfx");

const SSL_KEY_PATH =
  process.env.SSL_KEY_PATH ||
  (fs.existsSync(defaultKeyPath) ? defaultKeyPath : "");
const SSL_CERT_PATH =
  process.env.SSL_CERT_PATH ||
  (fs.existsSync(defaultCertPath) ? defaultCertPath : "");
const SSL_PFX_PATH =
  process.env.SSL_PFX_PATH ||
  (fs.existsSync(defaultPfxPath) ? defaultPfxPath : "");
const SSL_PFX_PASSPHRASE = process.env.SSL_PFX_PASSPHRASE || "dev";

const HAS_TLS =
  (Boolean(SSL_KEY_PATH && SSL_CERT_PATH) &&
    fs.existsSync(SSL_KEY_PATH) &&
    fs.existsSync(SSL_CERT_PATH)) ||
  (Boolean(SSL_PFX_PATH) && fs.existsSync(SSL_PFX_PATH));

// Debug logging
if (HAS_TLS) {
  console.log(
    `TLS detected: ${SSL_PFX_PATH || `${SSL_KEY_PATH} + ${SSL_CERT_PATH}`}`,
  );
}

const APP_BASE_URL =
  process.env.APP_BASE_URL ||
  `${HAS_TLS ? "https" : "http"}://localhost:${PORT}`;

// Handle favicon requests to prevent 404 errors
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="#3C91ED"/><text x="50" y="68" font-family="Arial" font-size="50" font-weight="bold" fill="white" text-anchor="middle">OR</text></svg>`;

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
    pleaseLogin: 'Please <a href="/login">log in</a> to search for products.',
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
    signUpWithGoogle: "Sign up with Google",

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
    priceTracker: "Price Tracker",

    // Source selector
    source: "Source",
    sourceAll: "All Stores",
    sourceMercadoLibre: "Mercado Libre",
    sourceAmazon: "Amazon",
    fromAmazon: "Amazon",
    fromMercadoLibre: "Mercado Libre",
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
    pleaseLogin:
      'Por favor <a href="/login">inicia sesión</a> para buscar productos.',
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
    signUpWithGoogle: "Registrarse con Google",

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
    priceTracker: "Rastreador de Precios",

    // Source selector
    source: "Fuente",
    sourceAll: "Todas las Tiendas",
    sourceMercadoLibre: "Mercado Libre",
    sourceAmazon: "Amazon",
    fromAmazon: "Amazon",
    fromMercadoLibre: "Mercado Libre",
  },
};

function t(lang, key) {
  return translations[lang]?.[key] || translations.en[key] || key;
}

function renderPage(
  title,
  body,
  extraHead = "",
  isLoggedIn = false,
  userEmail = "",
  lang = "en",
  userData = null,
) {
  const otherLang = lang === "en" ? "es" : "en";
  const currentFlag = lang === "en" ? "🇺🇸" : "🇲🇽";
  const currentLangName = lang === "en" ? "EN" : "ES";

  // User data for avatar display
  const displayName =
    userData?.username || (userEmail ? userEmail.split("@")[0] : "");
  const profilePic = userData?.profile_picture_url;
  const userInitials = getInitials(userData?.username || userEmail);

  return `<!doctype html>
<html lang="${lang}" data-theme="dark">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <title>${title} | OfertaRadar</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/styles.css">
    <!-- Chart.js for price history charts -->
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns@3.0.0/dist/chartjs-adapter-date-fns.bundle.min.js"></script>
    <script>
      // Theme initialization - runs before page render to prevent flash
      // Default to dark theme
      (function() {
        const savedTheme = localStorage.getItem('theme');
        const theme = savedTheme || 'dark';
        document.documentElement.setAttribute('data-theme', theme);
      })();
    </script>
    <style>/* Page-specific overrides */</style>
    ${extraHead}
  </head>
  <body class="${isLoggedIn ? "" : "guest-page"}">
    <header class="site-header">
      <a href="/" class="logo">OfertaRadar</a>
      <nav class="nav">
        ${
          isLoggedIn
            ? `
          <div class="user-dropdown" id="userDropdown">
            <button class="user-dropdown-toggle" type="button" id="dropdownToggle">
              <div class="user-avatar-small">
                ${
                  profilePic
                    ? `<img src="${profilePic}" alt="${displayName}" />`
                    : `<span class="avatar-initials-small">${userInitials}</span>`
                }
              </div>
              <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 9l6 6 6-6"/>
              </svg>
            </button>
            <div class="user-dropdown-menu" id="dropdownMenu">
              <div class="dropdown-header">
                <div class="dropdown-avatar">
                  ${
                    profilePic
                      ? `<img src="${profilePic}" alt="${displayName}" />`
                      : `<span class="avatar-initials">${userInitials}</span>`
                  }
                </div>
                <div class="dropdown-user-info">
                  <span class="dropdown-name">${displayName}</span>
                  <span class="dropdown-email">${userEmail}</span>
                </div>
              </div>
              <div class="dropdown-divider"></div>
              <a href="/profile">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
                ${t(lang, "profile")}
              </a>
              <a href="/dashboard">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 3v18h18"></path>
                  <path d="M18 17V9"></path>
                  <path d="M13 17V5"></path>
                  <path d="M8 17v-3"></path>
                </svg>
                ${lang === "es" ? "Mi Panel" : "Dashboard"}
              </a>
              <a href="/profile/settings">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="3"></circle>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
                ${lang === "es" ? "Configuración" : "Settings"}
              </a>
              <div class="dropdown-divider"></div>
              <form method="post" action="/logout" class="dropdown-logout-form">
                <button type="submit" class="dropdown-logout">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                    <polyline points="16 17 21 12 16 7"></polyline>
                    <line x1="21" y1="12" x2="9" y2="12"></line>
                  </svg>
                  ${t(lang, "logout")}
                </button>
              </form>
            </div>
          </div>
        `
            : `
          <a href="/login" class="nav-link">${t(lang, "login")}</a>
          <a href="/register" class="nav-btn-primary">${t(lang, "register")}</a>
        `
        }

        <!-- Theme Toggle -->
        <button class="theme-toggle" id="themeToggle" title="${lang === "es" ? "Cambiar tema" : "Toggle theme"}">
          <svg class="sun-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="5"></circle>
            <line x1="12" y1="1" x2="12" y2="3"></line>
            <line x1="12" y1="21" x2="12" y2="23"></line>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
            <line x1="1" y1="12" x2="3" y2="12"></line>
            <line x1="21" y1="12" x2="23" y2="12"></line>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
          </svg>
          <svg class="moon-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
          </svg>
        </button>

        <!-- Language Dropdown -->
        <div class="lang-dropdown" id="langDropdown">
          <button class="lang-dropdown-toggle" type="button">
            <span class="flag">${currentFlag}</span>
            <span>${currentLangName}</span>
            <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </button>
          <div class="lang-dropdown-menu">
            <a href="/set-lang/en" class="${lang === "en" ? "active" : ""}">
              <span class="flag">🇺🇸</span>
              English
            </a>
            <a href="/set-lang/es" class="${lang === "es" ? "active" : ""}">
              <span class="flag">🇲🇽</span>
              Español
            </a>
          </div>
        </div>
      </nav>
    </header>
    <nav class="category-nav">
      <div class="category-tabs">
        <a href="/?q=${lang === "es" ? "Electrónica" : "Electronics"}" class="category-tab">${lang === "es" ? "Electrónica" : "Electronics"}</a>
        <a href="/?q=${lang === "es" ? "Celulares" : "Phones"}" class="category-tab">${lang === "es" ? "Celulares" : "Phones"}</a>
        <a href="/?q=${lang === "es" ? "Computadoras" : "Computers"}" class="category-tab">${lang === "es" ? "Computadoras" : "Computers"}</a>
        <a href="/?q=${lang === "es" ? "Ropa" : "Clothing"}" class="category-tab">${lang === "es" ? "Ropa" : "Clothing"}</a>
        <a href="/?q=${lang === "es" ? "Hogar" : "Home"}" class="category-tab">${lang === "es" ? "Hogar" : "Home"}</a>
        <a href="/?q=${lang === "es" ? "Deportes" : "Sports"}" class="category-tab">${lang === "es" ? "Deportes" : "Sports"}</a>
        <a href="/?q=${lang === "es" ? "Juguetes" : "Toys"}" class="category-tab">${lang === "es" ? "Juguetes" : "Toys"}</a>
        <a href="/?q=${lang === "es" ? "Belleza" : "Beauty"}" class="category-tab">${lang === "es" ? "Belleza" : "Beauty"}</a>
      </div>
    </nav>
    <main class="main-content">
    ${body}
    </main>
    ${
      isLoggedIn
        ? `
    <script>
      (function() {
        const dropdown = document.querySelector('.user-dropdown');
        const toggle = document.querySelector('.user-dropdown-toggle');
        const menu = document.querySelector('.user-dropdown-menu');

        if (toggle && dropdown && menu) {
          toggle.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            dropdown.classList.toggle('open');
          });

          menu.querySelectorAll('a').forEach(function(link) {
            link.addEventListener('click', function() {
              dropdown.classList.remove('open');
            });
          });

          document.addEventListener('click', function(e) {
            if (!dropdown.contains(e.target)) {
              dropdown.classList.remove('open');
            }
          });

          document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
              dropdown.classList.remove('open');
            }
          });
        }
      })();
    </script>
    `
        : ""
    }
    <script>
      // Header scroll effect
      (function() {
        const header = document.querySelector('.site-header');
        if (!header) return;

        let ticking = false;

        function updateHeader() {
          if (window.scrollY > 50) {
            header.classList.add('scrolled');
          } else {
            header.classList.remove('scrolled');
          }
          ticking = false;
        }

        window.addEventListener('scroll', function() {
          if (!ticking) {
            window.requestAnimationFrame(updateHeader);
            ticking = true;
          }
        }, { passive: true });

        updateHeader();
      })();

      // Theme Toggle
      (function() {
        const themeToggle = document.getElementById('themeToggle');
        if (!themeToggle) return;

        function setTheme(theme) {
          document.documentElement.setAttribute('data-theme', theme);
          localStorage.setItem('theme', theme);
        }

        function toggleTheme() {
          const currentTheme = document.documentElement.getAttribute('data-theme');
          const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
          setTheme(newTheme);
        }

        themeToggle.addEventListener('click', toggleTheme);

        // Listen for system theme changes
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
          if (!localStorage.getItem('theme')) {
            setTheme(e.matches ? 'dark' : 'light');
          }
        });
      })();

      // Language Dropdown
      (function() {
        const langDropdown = document.getElementById('langDropdown');
        if (!langDropdown) return;

        const toggle = langDropdown.querySelector('.lang-dropdown-toggle');

        toggle.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          langDropdown.classList.toggle('open');
        });

        // Close on outside click
        document.addEventListener('click', function(e) {
          if (!langDropdown.contains(e.target)) {
            langDropdown.classList.remove('open');
          }
        });

        // Close on escape
        document.addEventListener('keydown', function(e) {
          if (e.key === 'Escape') {
            langDropdown.classList.remove('open');
          }
        });
      })();

      // Scroll Reveal Animations (Intersection Observer)
      (function() {
        // Only run if IntersectionObserver is supported
        if (!('IntersectionObserver' in window)) return;

        // Mark body as ready for reveal animations
        document.body.classList.add('reveal-ready');

        // Get all elements with data-reveal attribute
        const revealElements = document.querySelectorAll('[data-reveal]');
        if (!revealElements.length) return;

        // Create the observer
        const observer = new IntersectionObserver(function(entries) {
          entries.forEach(function(entry) {
            // When element enters viewport
            if (entry.isIntersecting) {
              entry.target.classList.add('revealed');
              // Stop observing once revealed (animate only once)
              observer.unobserve(entry.target);
            }
          });
        }, {
          root: null, // viewport
          rootMargin: '0px 0px -50px 0px', // trigger slightly before fully visible
          threshold: 0.1 // trigger when 10% visible
        });

        // Observe all reveal elements
        revealElements.forEach(function(el) {
          observer.observe(el);
        });
      })();
    </script>
  </body>
</html>`;
}

function createToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: "7d",
  });
}

function setAuthCookie(res, token) {
  // Detect if running in production (Render sets NODE_ENV)
  const isProduction = process.env.NODE_ENV === "production";
  const isLocalhost =
    !isProduction && (process.env.APP_BASE_URL || "").includes("localhost");

  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction, // true in production, false for localhost
    maxAge: 1000 * 60 * 60 * 24 * 7,
    path: "/",
  };

  console.log(
    "[Cookie] Setting auth cookie (secure:",
    cookieOptions.secure,
    ")",
  );
  res.cookie("token", token, cookieOptions);
}

function clearAuthCookie(res) {
  res.clearCookie("token", { path: "/" });
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

// Dribbble-style split-screen auth page renderer
function renderAuthPage(
  title,
  formContent,
  extraScript = "",
  lang = "en",
  illustrationText = {},
) {
  const otherLang = lang === "en" ? "es" : "en";

  return `<!doctype html>
<html lang="${lang}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <title>${title} | OfertaRadar</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/styles.css">
  </head>
  <body>
    <div class="auth-page">
      <div class="auth-illustration">
        <div class="auth-illustration-content">
          <h2>${illustrationText.title || (lang === "es" ? "Bienvenido a OfertaRadar" : "Welcome to OfertaRadar")}</h2>
          <p>${illustrationText.subtitle || (lang === "es" ? "Rastrea precios, encuentra ofertas y ahorra en tus compras" : "Track prices, find deals, and save on your purchases")}</p>
        </div>
      </div>
      <div class="auth-form-container">
        <div class="auth-form-inner">
          <a href="/" class="auth-logo">
            <span class="auth-logo-text">OfertaRadar</span>
          </a>
          ${formContent}
          <div style="margin-top: 24px; text-align: center;">
            <a href="/set-lang/${otherLang}" style="font-size: 13px; color: var(--text-muted); text-decoration: none;">
              ${lang === "en" ? "🇲🇽 Español" : "🇺🇸 English"}
            </a>
          </div>
        </div>
      </div>
    </div>
    ${extraScript}
  </body>
</html>`;
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
          linkExpires: "24 hours",
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

// Get user initials for avatar placeholder
function getInitials(str) {
  if (!str) return "?";
  // If it's an email, use the part before @
  const name = str.includes("@") ? str.split("@")[0] : str;
  // Get first two characters
  return name.substring(0, 2).toUpperCase();
}

function buildSearchParams(baseUrl, params) {
  // Handle relative URLs by using a dummy base
  const isRelative = baseUrl.startsWith("/");
  const url = isRelative
    ? new URL(baseUrl, "http://localhost")
    : new URL(baseUrl);

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }
    url.searchParams.set(key, String(value));
  });

  // Return just the path + search for relative URLs
  return isRelative ? url.pathname + url.search : url.toString();
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
      description:
        "El iPhone más avanzado con chip A17 Pro, cámara de 48MP y Dynamic Island.",
      price: 28999,
      currency_id: "MXN",
      thumbnail:
        "https://http2.mlstatic.com/D_NQ_NP_2X_600741-MLA54876949912_042023-F.webp",
      permalink: "https://www.mercadolibre.com.mx/",
      condition: "new",
      available_quantity: 50,
      seller: { nickname: "APPLE_STORE_MX" },
    },
    {
      id: "MLM-002",
      title: "Samsung Galaxy S24 Ultra 256GB Negro",
      description:
        "Smartphone con Galaxy AI, cámara de 200MP y S Pen incluido.",
      price: 24999,
      currency_id: "MXN",
      thumbnail:
        "https://http2.mlstatic.com/D_NQ_NP_2X_896939-MLM72661707718_112023-F.webp",
      permalink: "https://www.mercadolibre.com.mx/",
      condition: "new",
      available_quantity: 35,
      seller: { nickname: "SAMSUNG_MX" },
    },
    {
      id: "MLM-003",
      title: 'MacBook Air M3 13" 256GB - Medianoche',
      description:
        "Laptop ultraligera con chip M3, 18 horas de batería y pantalla Liquid Retina.",
      price: 26999,
      currency_id: "MXN",
      thumbnail:
        "https://http2.mlstatic.com/D_NQ_NP_2X_854712-MLA74601558556_022024-F.webp",
      permalink: "https://www.mercadolibre.com.mx/",
      condition: "new",
      available_quantity: 20,
      seller: { nickname: "APPLE_STORE_MX" },
    },
    {
      id: "MLM-004",
      title: "PlayStation 5 Slim 1TB Digital Edition",
      description:
        "Consola de nueva generación con SSD ultrarrápido y DualSense.",
      price: 9499,
      currency_id: "MXN",
      thumbnail:
        "https://http2.mlstatic.com/D_NQ_NP_2X_691344-MLM74174576447_012024-F.webp",
      permalink: "https://www.mercadolibre.com.mx/",
      condition: "new",
      available_quantity: 15,
      seller: { nickname: "SONY_MX" },
    },
    {
      id: "MLM-005",
      title: "Audífonos Sony WH-1000XM5 Bluetooth Negro",
      description:
        "Los mejores audífonos con cancelación de ruido y 30 horas de batería.",
      price: 6499,
      currency_id: "MXN",
      thumbnail:
        "https://http2.mlstatic.com/D_NQ_NP_2X_673653-MLA51543508498_092022-F.webp",
      permalink: "https://www.mercadolibre.com.mx/",
      condition: "new",
      available_quantity: 45,
      seller: { nickname: "SONY_MX" },
    },
    {
      id: "MLM-006",
      title: 'iPad Pro M4 11" 256GB WiFi Space Black',
      description:
        "La tablet más potente con chip M4, pantalla Ultra Retina XDR y Apple Pencil Pro.",
      price: 21999,
      currency_id: "MXN",
      thumbnail:
        "https://http2.mlstatic.com/D_NQ_NP_2X_929429-MLA75879827421_042024-F.webp",
      permalink: "https://www.mercadolibre.com.mx/",
      condition: "new",
      available_quantity: 25,
      seller: { nickname: "APPLE_STORE_MX" },
    },
    {
      id: "MLM-007",
      title: "Nintendo Switch OLED Edición Zelda",
      description:
        "Consola portátil con pantalla OLED de 7 pulgadas, edición especial.",
      price: 7999,
      currency_id: "MXN",
      thumbnail:
        "https://http2.mlstatic.com/D_NQ_NP_2X_943597-MLM73034589839_112023-F.webp",
      permalink: "https://www.mercadolibre.com.mx/",
      condition: "new",
      available_quantity: 30,
      seller: { nickname: "NINTENDO_MX" },
    },
    {
      id: "MLM-008",
      title: "AirPods Pro 2 con USB-C",
      description:
        "Audífonos con cancelación activa de ruido, audio espacial y estuche MagSafe.",
      price: 4499,
      currency_id: "MXN",
      thumbnail:
        "https://http2.mlstatic.com/D_NQ_NP_2X_756250-MLA73970988653_012024-F.webp",
      permalink: "https://www.mercadolibre.com.mx/",
      condition: "new",
      available_quantity: 60,
      seller: { nickname: "APPLE_STORE_MX" },
    },
    {
      id: "MLM-009",
      title: 'Smart TV Samsung 55" Crystal UHD 4K',
      description:
        "Televisor inteligente con Tizen, Gaming Hub y diseño AirSlim.",
      price: 8999,
      currency_id: "MXN",
      thumbnail:
        "https://http2.mlstatic.com/D_NQ_NP_2X_600741-MLA54876949912_042023-F.webp",
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
      thumbnail:
        "https://http2.mlstatic.com/D_NQ_NP_2X_709115-MLA45629061694_042021-F.webp",
      permalink: "https://www.mercadolibre.com.mx/",
      condition: "new",
      available_quantity: 22,
      seller: { nickname: "MICROSOFT_MX" },
    },
    {
      id: "MLM-011",
      title: "Aspiradora Dyson V15 Detect Absolute",
      description:
        "Aspiradora inalámbrica con láser para detectar polvo microscópico.",
      price: 14999,
      currency_id: "MXN",
      thumbnail:
        "https://http2.mlstatic.com/D_NQ_NP_2X_672464-MLA50401987399_062022-F.webp",
      permalink: "https://www.mercadolibre.com.mx/",
      condition: "new",
      available_quantity: 12,
      seller: { nickname: "DYSON_MX" },
    },
    {
      id: "MLM-012",
      title: "Apple Watch Series 9 GPS 45mm Aluminio",
      description:
        "Reloj inteligente con chip S9, doble toque y pantalla siempre activa.",
      price: 8999,
      currency_id: "MXN",
      thumbnail:
        "https://http2.mlstatic.com/D_NQ_NP_2X_667508-MLA73458044571_122023-F.webp",
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

function searchMockProducts({
  query,
  minPrice,
  maxPrice,
  sort,
  page,
  pageSize,
}) {
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

async function fetchMLProducts({
  query,
  minPrice,
  maxPrice,
  sort,
  page,
  pageSize,
}) {
  try {
    // Build search URL with filters
    const sortMap = {
      price_asc: "price_asc",
      price_desc: "price_desc",
    };

    const searchUrl = new URL(
      `https://api.mercadolibre.com/sites/${ML_SITE}/search`,
    );
    searchUrl.searchParams.set("q", query);
    searchUrl.searchParams.set("offset", String((page - 1) * pageSize));
    searchUrl.searchParams.set("limit", String(pageSize));

    if (Number.isFinite(minPrice)) {
      searchUrl.searchParams.set("price", `${minPrice}-${maxPrice || "*"}`);
    }
    if (sort && sortMap[sort]) {
      searchUrl.searchParams.set("sort", sortMap[sort]);
    }

    // First try: Use PUBLIC API (no authentication required for search)
    console.log(`[ML API] Searching for: ${query}`);
    let response = await fetch(searchUrl.toString());

    // If public API fails, try with authentication
    if (!response.ok && ML_CLIENT_ID && ML_CLIENT_SECRET) {
      console.log("[ML API] Public API failed, trying with authentication...");
      const token = await getMLAccessToken();
      if (token) {
        response = await fetch(searchUrl.toString(), {
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    }

    if (response.ok) {
      const data = await response.json();
      console.log(`[ML API] Found ${data.paging?.total || 0} results`);
      return {
        products: data.results || [],
        total: data.paging?.total || 0,
        totalPages: Math.ceil((data.paging?.total || 0) / pageSize),
        error: "",
        isRealData: true,
      };
    }

    const errorText = await response.text();
    console.log(`[ML API] Search failed (${response.status}):`, errorText);
  } catch (error) {
    console.error("[ML API] Exception:", error.message);
  }

  // Fallback to mock data
  console.log("[ML API] Using mock data fallback");
  const mockResults = searchMockProducts({
    query,
    minPrice,
    maxPrice,
    sort,
    page,
    pageSize,
  });
  return {
    ...mockResults,
    notice:
      "Demo mode: Using sample data. Configure Mercado Libre API for real products.",
    error: "",
    isRealData: false,
  };
}

async function fetchMLProductById(id) {
  try {
    // First try: Use PUBLIC API (no authentication required)
    console.log(`[ML API] Fetching product: ${id}`);
    let response = await fetch(`https://api.mercadolibre.com/items/${id}`);

    // If public API fails, try with authentication
    if (!response.ok && ML_CLIENT_ID && ML_CLIENT_SECRET) {
      console.log("[ML API] Public API failed, trying with authentication...");
      const token = await getMLAccessToken();
      if (token) {
        response = await fetch(`https://api.mercadolibre.com/items/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    }

    if (response.ok) {
      const product = await response.json();
      console.log(`[ML API] Product found: ${product.title}`);
      return { product, notice: "", error: "", isRealData: true };
    }

    const errorText = await response.text();
    console.log(
      `[ML API] Product fetch failed (${response.status}):`,
      errorText,
    );
  } catch (error) {
    console.error("[ML API] Exception:", error.message);
  }

  // Fallback to mock data
  console.log("[ML API] Using mock product data");
  return {
    product: getMockProductById(id),
    notice: "Demo mode: This is sample data.",
    error: "",
    isRealData: false,
  };
}

// Get ML categories
async function fetchMLCategories() {
  const token = await getMLAccessToken();

  if (token) {
    try {
      const response = await fetch(
        `https://api.mercadolibre.com/sites/${ML_SITE}/categories`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

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

// ============================================
// AMAZON PRODUCT ADVERTISING API (PA-API 5.0)
// ============================================

/**
 * Create AWS Signature Version 4 for Amazon PA-API
 */
function createAmazonSignature(
  method,
  uri,
  queryString,
  headers,
  payload,
  timestamp,
) {
  const dateStamp = timestamp.substring(0, 8);
  const amzDate = timestamp;
  const service = "ProductAdvertisingAPI";
  const region = AMAZON_REGION;

  // Create canonical request
  const sortedHeaders = Object.keys(headers).sort();
  const signedHeaders = sortedHeaders.join(";");
  const canonicalHeaders = sortedHeaders
    .map((h) => `${h}:${headers[h]}\n`)
    .join("");

  const payloadHash = crypto
    .createHash("sha256")
    .update(payload || "")
    .digest("hex");
  const canonicalRequest = `${method}\n${uri}\n${queryString}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  // Create string to sign
  const algorithm = "AWS4-HMAC-SHA256";
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const canonicalRequestHash = crypto
    .createHash("sha256")
    .update(canonicalRequest)
    .digest("hex");
  const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${canonicalRequestHash}`;

  // Calculate signature
  const kDate = crypto
    .createHmac("sha256", `AWS4${AMAZON_SECRET_KEY}`)
    .update(dateStamp)
    .digest();
  const kRegion = crypto.createHmac("sha256", kDate).update(region).digest();
  const kService = crypto
    .createHmac("sha256", kRegion)
    .update(service)
    .digest();
  const kSigning = crypto
    .createHmac("sha256", kService)
    .update("aws4_request")
    .digest();
  const signature = crypto
    .createHmac("sha256", kSigning)
    .update(stringToSign)
    .digest("hex");

  return {
    signature,
    signedHeaders,
    credentialScope,
    algorithm,
  };
}

/**
 * Search products on Amazon using PA-API 5.0
 */
async function fetchAmazonProducts({
  query,
  minPrice,
  maxPrice,
  sort,
  page,
  pageSize,
}) {
  if (!HAS_AMAZON_API) {
    console.log("[Amazon] PA-API not configured, skipping");
    return {
      products: [],
      total: 0,
      totalPages: 0,
      error: "",
      source: "amazon",
    };
  }

  try {
    const timestamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
    const uri = "/paapi5/searchitems";

    // Build request payload
    const payload = JSON.stringify({
      PartnerTag: AMAZON_PARTNER_TAG,
      PartnerType: "Associates",
      Keywords: query,
      SearchIndex: "All",
      ItemCount: Math.min(pageSize, 10), // PA-API max is 10
      ItemPage: page,
      Resources: [
        "Images.Primary.Large",
        "ItemInfo.Title",
        "Offers.Listings.Price",
        "Offers.Listings.Condition",
        "Offers.Listings.Availability.Message",
        "Offers.Listings.MerchantInfo",
      ],
      ...(minPrice > 0 && { MinPrice: minPrice * 100 }), // Amazon uses cents
      ...(maxPrice < 50000 && { MaxPrice: maxPrice * 100 }),
      SortBy:
        sort === "price_asc"
          ? "Price:LowToHigh"
          : sort === "price_desc"
            ? "Price:HighToLow"
            : "Relevance",
    });

    const headers = {
      "content-encoding": "amz-1.0",
      "content-type": "application/json; charset=utf-8",
      host: AMAZON_HOST,
      "x-amz-date": timestamp,
      "x-amz-target":
        "com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems",
    };

    const { signature, signedHeaders, credentialScope, algorithm } =
      createAmazonSignature("POST", uri, "", headers, payload, timestamp);

    const authHeader = `${algorithm} Credential=${AMAZON_ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const response = await fetch(`https://${AMAZON_HOST}${uri}`, {
      method: "POST",
      headers: {
        ...headers,
        Authorization: authHeader,
      },
      body: payload,
    });

    if (response.ok) {
      const data = await response.json();
      const items = data.SearchResult?.Items || [];

      // Transform Amazon items to match our product format
      const products = items.map((item) => ({
        id: `AMZN-${item.ASIN}`,
        asin: item.ASIN,
        title: item.ItemInfo?.Title?.DisplayValue || "Amazon Product",
        price: item.Offers?.Listings?.[0]?.Price?.Amount || 0,
        currency_id: item.Offers?.Listings?.[0]?.Price?.Currency || "USD",
        thumbnail: item.Images?.Primary?.Large?.URL || "",
        condition: item.Offers?.Listings?.[0]?.Condition?.Value || "New",
        available_quantity: item.Offers?.Listings?.[0]?.Availability?.Message
          ? 1
          : 0,
        permalink: `https://www.amazon.com/dp/${item.ASIN}?tag=${AMAZON_PARTNER_TAG}`,
        seller: {
          nickname: item.Offers?.Listings?.[0]?.MerchantInfo?.Name || "Amazon",
        },
        source: "amazon",
      }));

      return {
        products,
        total: data.SearchResult?.TotalResultCount || products.length,
        totalPages: Math.ceil(
          (data.SearchResult?.TotalResultCount || products.length) / pageSize,
        ),
        error: "",
        source: "amazon",
      };
    } else {
      const errorText = await response.text();
      console.error("[Amazon] PA-API error:", response.status, errorText);
      return {
        products: [],
        total: 0,
        totalPages: 0,
        error: `Amazon API error: ${response.status}`,
        source: "amazon",
      };
    }
  } catch (error) {
    console.error("[Amazon] PA-API exception:", error.message);
    return {
      products: [],
      total: 0,
      totalPages: 0,
      error: error.message,
      source: "amazon",
    };
  }
}

/**
 * Get Amazon product details by ASIN
 */
async function fetchAmazonProductById(asin) {
  if (!HAS_AMAZON_API) {
    return {
      product: null,
      error: "Amazon PA-API not configured",
      source: "amazon",
    };
  }

  // Remove AMZN- prefix if present
  const cleanAsin = asin.replace(/^AMZN-/, "");

  try {
    const timestamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
    const uri = "/paapi5/getitems";

    const payload = JSON.stringify({
      PartnerTag: AMAZON_PARTNER_TAG,
      PartnerType: "Associates",
      ItemIds: [cleanAsin],
      Resources: [
        "Images.Primary.Large",
        "Images.Variants.Large",
        "ItemInfo.Title",
        "ItemInfo.Features",
        "ItemInfo.ProductInfo",
        "ItemInfo.ByLineInfo",
        "Offers.Listings.Price",
        "Offers.Listings.Condition",
        "Offers.Listings.Availability.Message",
        "Offers.Listings.MerchantInfo",
        "Offers.Summaries.LowestPrice",
      ],
    });

    const headers = {
      "content-encoding": "amz-1.0",
      "content-type": "application/json; charset=utf-8",
      host: AMAZON_HOST,
      "x-amz-date": timestamp,
      "x-amz-target": "com.amazon.paapi5.v1.ProductAdvertisingAPIv1.GetItems",
    };

    const { signature, signedHeaders, credentialScope, algorithm } =
      createAmazonSignature("POST", uri, "", headers, payload, timestamp);

    const authHeader = `${algorithm} Credential=${AMAZON_ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const response = await fetch(`https://${AMAZON_HOST}${uri}`, {
      method: "POST",
      headers: {
        ...headers,
        Authorization: authHeader,
      },
      body: payload,
    });

    if (response.ok) {
      const data = await response.json();
      const item = data.ItemsResult?.Items?.[0];

      if (!item) {
        return { product: null, error: "Product not found", source: "amazon" };
      }

      const product = {
        id: `AMZN-${item.ASIN}`,
        asin: item.ASIN,
        title: item.ItemInfo?.Title?.DisplayValue || "Amazon Product",
        price:
          item.Offers?.Listings?.[0]?.Price?.Amount ||
          item.Offers?.Summaries?.[0]?.LowestPrice?.Amount ||
          0,
        currency_id: item.Offers?.Listings?.[0]?.Price?.Currency || "USD",
        thumbnail: item.Images?.Primary?.Large?.URL || "",
        pictures:
          item.Images?.Variants?.map((v) => ({ url: v.Large?.URL })) || [],
        condition: item.Offers?.Listings?.[0]?.Condition?.Value || "New",
        available_quantity: item.Offers?.Listings?.[0]?.Availability?.Message
          ? 1
          : 0,
        permalink: `https://www.amazon.com/dp/${item.ASIN}?tag=${AMAZON_PARTNER_TAG}`,
        description: item.ItemInfo?.Features?.DisplayValues?.join("\n") || "",
        seller: {
          nickname: item.Offers?.Listings?.[0]?.MerchantInfo?.Name || "Amazon",
        },
        brand: item.ItemInfo?.ByLineInfo?.Brand?.DisplayValue || "",
        source: "amazon",
      };

      return { product, error: "", source: "amazon" };
    } else {
      const errorText = await response.text();
      console.error("[Amazon] GetItems error:", response.status, errorText);
      return {
        product: null,
        error: `Amazon API error: ${response.status}`,
        source: "amazon",
      };
    }
  } catch (error) {
    console.error("[Amazon] GetItems exception:", error.message);
    return { product: null, error: error.message, source: "amazon" };
  }
}

/**
 * Combined search from multiple sources (Mercado Libre + Amazon)
 */
async function fetchAllProducts({
  query,
  minPrice,
  maxPrice,
  sort,
  page,
  pageSize,
  source = "all",
}) {
  const results = {
    products: [],
    total: 0,
    totalPages: 0,
    error: "",
    notices: [],
  };

  // Determine which sources to query
  const queryML = source === "all" || source === "mercadolibre";
  const queryAmazon = source === "all" || source === "amazon";

  // Fetch from sources in parallel
  const promises = [];

  if (queryML) {
    promises.push(
      fetchMLProducts({ query, minPrice, maxPrice, sort, page, pageSize })
        .then((r) => ({ ...r, source: "mercadolibre" }))
        .catch((e) => ({
          products: [],
          total: 0,
          totalPages: 0,
          error: e.message,
          source: "mercadolibre",
        })),
    );
  }

  if (queryAmazon && HAS_AMAZON_API) {
    promises.push(
      fetchAmazonProducts({
        query,
        minPrice,
        maxPrice,
        sort,
        page,
        pageSize,
      }).catch((e) => ({
        products: [],
        total: 0,
        totalPages: 0,
        error: e.message,
        source: "amazon",
      })),
    );
  }

  const responses = await Promise.all(promises);

  // Combine results
  for (const res of responses) {
    // Add source to each product if not already set
    const productsWithSource = res.products.map((p) => ({
      ...p,
      source: p.source || res.source,
    }));

    results.products.push(...productsWithSource);
    results.total += res.total || 0;

    if (res.error) {
      results.notices.push(`${res.source}: ${res.error}`);
    }
    if (res.notice) {
      results.notices.push(res.notice);
    }
  }

  // Sort combined results
  if (sort === "price_asc") {
    results.products.sort((a, b) => (a.price || 0) - (b.price || 0));
  } else if (sort === "price_desc") {
    results.products.sort((a, b) => (b.price || 0) - (a.price || 0));
  }

  // Calculate total pages based on combined results
  results.totalPages = Math.ceil(results.total / pageSize) || 1;

  // Limit to pageSize
  results.products = results.products.slice(0, pageSize);

  return results;
}

/**
 * Get product by ID from the appropriate source
 */
async function fetchProductById(id) {
  // Check if it's an Amazon product (AMZN- prefix or ASIN format)
  if (id.startsWith("AMZN-") || /^[A-Z0-9]{10}$/.test(id)) {
    return fetchAmazonProductById(id);
  }

  // Otherwise treat as Mercado Libre product
  return fetchMLProductById(id);
}

async function start() {
  // Initialize local SQLite database (always available as fallback)
  const localDb = await initDb();

  // Track which database is actually being used
  let useSupabaseDb = USE_SUPABASE;

  // Initialize Supabase if configured
  if (USE_SUPABASE) {
    supabaseDb.initSupabase();

    // Verify required tables exist
    const tableCheck = await supabaseDb.verifyTables();
    if (!tableCheck.ok) {
      console.error("\n" + "=".repeat(60));
      console.error("⚠️  SUPABASE TABLES NOT FOUND - FALLING BACK TO SQLITE");
      console.error("=".repeat(60));
      console.error(
        "To use Supabase, run this SQL in your Supabase SQL Editor:",
      );
      console.error("File: supabase/migrations/001_create_tables.sql");
      console.error("=".repeat(60) + "\n");
      useSupabaseDb = false;
    } else {
      // Create demo accounts in Supabase
      await supabaseDb.createDemoAccounts().catch((err) => {
        console.log("[Supabase] Demo accounts may already exist:", err.message);
      });
    }
  }

  // Use Supabase or SQLite based on configuration AND table availability
  const db = useSupabaseDb ? supabaseDb.createDbInterface() : localDb;
  console.log(
    "[Database] Using:",
    useSupabaseDb ? "Supabase (cloud)" : "SQLite (local)",
  );

  // Helper functions that work with both databases
  const recordLoginAttempt = useSupabaseDb
    ? supabaseDb.recordLoginAttempt
    : require("./db").recordLoginAttempt.bind(null, localDb);

  const getLoginHistory = useSupabaseDb
    ? supabaseDb.getLoginHistory
    : require("./db").getLoginHistory.bind(null, localDb);

  // Initialize Bull queue for background price updates (if Redis configured)
  if (isRedisConfigured()) {
    const queue = initQueue();
    if (queue) {
      // Initialize worker with dependencies
      // Note: fetchMLProductById and fetchAmazonProductById are defined later in this file
      // We pass them via a deferred initialization after they're defined
      initWorker({
        db: supabaseDb,
        fetchMLProductById: async (id) => fetchMLProductById(id),
        fetchAmazonProductById: async (asin) => fetchAmazonProductById(asin),
      });

      // Setup recurring jobs
      setupRecurringJobs().catch((err) => {
        console.error("[Queue] Failed to setup recurring jobs:", err.message);
      });
    }
  } else {
    console.log(
      "[Queue] Redis not configured - background price updates disabled",
    );
  }

  const app = express();

  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  app.use(cookieParser());

  // Prevent caching of dynamic pages to ensure auth state updates in UI
  app.use((req, res, next) => {
    // Don't cache HTML pages (allow caching of static assets)
    if (
      !req.path.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)
    ) {
      res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
      res.set("Pragma", "no-cache");
      res.set("Expires", "0");
    }
    next();
  });

  // Favicon route to prevent 404 errors
  app.get("/favicon.ico", (req, res) => {
    res.type("image/svg+xml");
    res.send(faviconSvg);
  });

  // Serve static files from frontend folder
  app.use(express.static(path.join(__dirname, "..", "frontend")));

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

    // DEBUG: Log all cookies and token status
    console.log("[Home Route] =========== REQUEST DEBUG ===========");
    console.log(
      "[Home Route] Cookies received:",
      Object.keys(req.cookies || {}),
    );
    console.log("[Home Route] Token cookie exists:", !!req.cookies?.token);
    console.log("[Home Route] hasToken:", hasToken);

    let userEmail = "";
    let userData = null;
    if (hasToken) {
      try {
        const payload = jwt.verify(req.cookies.token, JWT_SECRET);
        console.log(`[Home] Token valid for user ID: ${payload.id}`);
        const user = await db.get(
          "SELECT * FROM users WHERE id = ?",
          payload.id,
        );
        userEmail = user?.email || "";
        userData = user;
        console.log(`[Home] User found: ${userEmail || "NO"}`);
      } catch (e) {
        console.log(`[Home] Token invalid: ${e.message}`);
      }
    }
    const query = String(req.query.q || "").trim();
    const minPrice = parseNumber(req.query.minPrice, 0);
    const maxPrice = parseNumber(req.query.maxPrice, 50000);
    const sort = String(req.query.sort || "price_asc");
    const source = String(req.query.source || "all");
    const page = Math.max(parseNumber(req.query.page, 1), 1);
    const pageSize = 20;

    let results = {
      products: [],
      total: 0,
      totalPages: 0,
      error: "",
      notices: [],
    };
    let isFeatured = false;

    if (query) {
      results = await fetchAllProducts({
        query,
        minPrice,
        maxPrice,
        sort,
        page,
        pageSize,
        source,
      });
    } else {
      // Fetch featured/trending products when no search query (for all users)
      isFeatured = true;
      try {
        results = await fetchAllProducts({
          query: "ofertas", // Popular search term for deals/offers
          minPrice: 0,
          maxPrice: 50000,
          sort: "price_asc",
          page: 1,
          pageSize: 12,
          source: "mercadolibre",
        });
      } catch (e) {
        console.log("[Home] Error fetching featured products:", e.message);
      }
    }

    // Helper to get source badge HTML
    const getSourceBadge = (item) => {
      const src = item.source || "mercadolibre";
      if (src === "amazon") {
        return `<span class="source-badge amazon">Amazon</span>`;
      }
      return `<span class="source-badge ml">Mercado Libre</span>`;
    };

    // Product card HTML generator
    const renderProductCard = (item) => `
      <div class="product-card">
        <a href="${buildSearchParams(`/product/${encodeURIComponent(item.id)}`, { q: query, minPrice, maxPrice, sort, source, page })}" class="product-card-link">
          <div class="product-card-image">
            <img src="${item.thumbnail || ""}" alt="${item.title || t(lang, "product")}" loading="lazy" />
            ${getSourceBadge(item)}
          </div>
          <div class="product-card-content">
            <h3 class="product-card-title">${item.title || t(lang, "product")}</h3>
            <div class="product-card-price">${formatPrice(item.price, item.currency_id || "MXN")}</div>
            ${item.seller?.nickname ? `<div class="product-card-seller">${item.seller.nickname}</div>` : ""}
          </div>
        </a>
      </div>
    `;

    const resultsHtml =
      (query || isFeatured) && results.products.length
        ? `
      <div class="results-section">
        ${isFeatured ? `<h2 class="section-title">${lang === "es" ? "Ofertas Destacadas" : "Featured Deals"}</h2>` : ""}
        ${results.notices?.length ? results.notices.map((n) => `<div class="notice">${n}</div>`).join("") : ""}
        ${results.error ? `<div class="notice">${results.error}</div>` : ""}
        ${!results.error && results.products.length === 0 ? `<p class="muted">${t(lang, "noResults")}</p>` : ""}
        ${
          results.products.length
            ? `
          <div class="product-grid">
            ${results.products.map(renderProductCard).join("")}
          </div>
          ${
            query
              ? `
            <div class="pagination">
              ${page > 1 ? `<a href="${buildSearchParams("/", { q: query, minPrice, maxPrice, sort, source, page: page - 1 })}">${t(lang, "previous")}</a>` : ""}
              <span>${t(lang, "page")} ${page} ${t(lang, "of")} ${results.totalPages || 1}</span>
              ${page < results.totalPages ? `<a href="${buildSearchParams("/", { q: query, minPrice, maxPrice, sort, source, page: page + 1 })}">${t(lang, "next")}</a>` : ""}
            </div>
          `
              : ""
          }
        `
            : ""
        }
      </div>
    `
        : "";

    const searchSection = `
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
          <div class="range-row">
            <label>${t(lang, "source")}</label>
            <select name="source">
              <option value="all" ${source === "all" ? "selected" : ""}>${t(lang, "sourceAll")}</option>
              <option value="mercadolibre" ${source === "mercadolibre" ? "selected" : ""}>${t(lang, "sourceMercadoLibre")}</option>
              <option value="amazon" ${source === "amazon" ? "selected" : ""}>${t(lang, "sourceAmazon")}${HAS_AMAZON_API ? "" : " (Not configured)"}</option>
            </select>
          </div>
        </div>
        <div class="full">
          <button type="submit">${t(lang, "search")}</button>
        </div>
      </form>
      ${resultsHtml}
    `;

    // Landing page for guests (Modern & Dynamic)
    const landingPage = `
      <!-- Hero Section -->
      <section class="hero-section" data-reveal="fade-up">
        <div class="hero-content">
          <div class="hero-badge" data-reveal="fade-up" data-reveal-delay="100">
            <span class="hero-badge-icon">🇲🇽</span>
            ${lang === "es" ? "La herramienta #1 de ahorro en México" : "#1 Price Tracking Tool in Mexico"}
          </div>
          <h1 class="hero-title" data-reveal="fade-up" data-reveal-delay="200">${lang === "es" ? "Nunca Pagues de Más" : "Never Overpay Again"}</h1>
          <p class="hero-subtitle" data-reveal="fade-up" data-reveal-delay="300">${
            lang === "es"
              ? "Rastrea precios de Mercado Libre, recibe alertas instantáneas cuando bajen y ahorra hasta un 40% en tus compras. Completamente gratis."
              : "Track prices from Mercado Libre, get instant alerts when they drop, and save up to 40% on your purchases. Completely free."
          }</p>
          <div class="hero-cta" data-reveal="fade-up" data-reveal-delay="400">
            <a href="/register" class="btn-primary">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <line x1="19" y1="8" x2="19" y2="14"></line>
                <line x1="22" y1="11" x2="16" y2="11"></line>
              </svg>
              ${lang === "es" ? "Crear Cuenta Gratis" : "Create Free Account"}
            </a>
            <a href="/login" class="btn-secondary">
              ${lang === "es" ? "Ya tengo cuenta" : "I have an account"}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
            </a>
          </div>
          <div class="hero-trust" data-reveal="fade-up" data-reveal-delay="500">
            <div class="trust-item">
              <span class="trust-icon">✓</span>
              ${lang === "es" ? "Sin tarjeta de crédito" : "No credit card required"}
            </div>
            <div class="trust-item">
              <span class="trust-icon">⚡</span>
              ${lang === "es" ? "Configuración en 30 segundos" : "30-second setup"}
            </div>
            <div class="trust-item">
              <span class="trust-icon">🔒</span>
              ${lang === "es" ? "100% Seguro" : "100% Secure"}
            </div>
          </div>
        </div>
      </section>

      <!-- Category Showcase -->
      <section class="category-showcase" data-reveal="fade-up">
        <div class="section-header" data-reveal="fade-up">
          <span class="section-label">${lang === "es" ? "Explora por Categoría" : "Browse by Category"}</span>
          <h2 class="section-title">${lang === "es" ? "Encuentra Ofertas en Todo lo que Necesitas" : "Find Deals on Everything You Need"}</h2>
          <p class="section-subtitle">${
            lang === "es"
              ? "Rastrea precios en miles de productos de las categorías más populares."
              : "Track prices on thousands of products across the most popular categories."
          }</p>
        </div>
        <div class="category-showcase-grid" data-reveal-stagger>
          <a href="/register" class="category-showcase-card" data-reveal="fade-up">
            <span class="category-showcase-icon">📱</span>
            <div class="category-showcase-name">${lang === "es" ? "Electrónica" : "Electronics"}</div>
            <div class="category-showcase-desc">${lang === "es" ? "Smartphones, tablets, laptops" : "Smartphones, tablets, laptops"}</div>
          </a>
          <a href="/register" class="category-showcase-card" data-reveal="fade-up">
            <span class="category-showcase-icon">🏠</span>
            <div class="category-showcase-name">${lang === "es" ? "Hogar" : "Home & Kitchen"}</div>
            <div class="category-showcase-desc">${lang === "es" ? "Electrodomésticos, muebles" : "Appliances, furniture"}</div>
          </a>
          <a href="/register" class="category-showcase-card" data-reveal="fade-up">
            <span class="category-showcase-icon">👗</span>
            <div class="category-showcase-name">${lang === "es" ? "Moda" : "Fashion"}</div>
            <div class="category-showcase-desc">${lang === "es" ? "Ropa, zapatos, accesorios" : "Clothing, shoes, accessories"}</div>
          </a>
          <a href="/register" class="category-showcase-card" data-reveal="fade-up">
            <span class="category-showcase-icon">⚽</span>
            <div class="category-showcase-name">${lang === "es" ? "Deportes" : "Sports"}</div>
            <div class="category-showcase-desc">${lang === "es" ? "Equipamiento, ropa deportiva" : "Equipment, sportswear"}</div>
          </a>
          <a href="/register" class="category-showcase-card" data-reveal="fade-up">
            <span class="category-showcase-icon">💄</span>
            <div class="category-showcase-name">${lang === "es" ? "Belleza" : "Beauty"}</div>
            <div class="category-showcase-desc">${lang === "es" ? "Cosméticos, cuidado personal" : "Cosmetics, personal care"}</div>
          </a>
          <a href="/register" class="category-showcase-card" data-reveal="fade-up">
            <span class="category-showcase-icon">🎮</span>
            <div class="category-showcase-name">${lang === "es" ? "Videojuegos" : "Gaming"}</div>
            <div class="category-showcase-desc">${lang === "es" ? "Consolas, juegos, accesorios" : "Consoles, games, accessories"}</div>
          </a>
          <a href="/register" class="category-showcase-card" data-reveal="fade-up">
            <span class="category-showcase-icon">🔧</span>
            <div class="category-showcase-name">${lang === "es" ? "Herramientas" : "Tools"}</div>
            <div class="category-showcase-desc">${lang === "es" ? "Bricolaje, jardín, auto" : "DIY, garden, automotive"}</div>
          </a>
          <a href="/register" class="category-showcase-card" data-reveal="fade-up">
            <span class="category-showcase-icon">🧸</span>
            <div class="category-showcase-name">${lang === "es" ? "Juguetes" : "Toys"}</div>
            <div class="category-showcase-desc">${lang === "es" ? "Juegos, figuras, educativos" : "Games, figures, educational"}</div>
          </a>
        </div>
        <div class="category-showcase-cta" data-reveal="fade-up">
          <a href="/register" class="btn-primary">
            ${lang === "es" ? "Crear Cuenta y Empezar" : "Create Account & Start Tracking"}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="5" y1="12" x2="19" y2="12"></line>
              <polyline points="12 5 19 12 12 19"></polyline>
            </svg>
          </a>
        </div>
      </section>

      <!-- How It Works -->
      <section class="features-section" data-reveal="fade-up">
        <div class="section-header" data-reveal="fade-up">
          <span class="section-label">${lang === "es" ? "Cómo Funciona" : "How It Works"}</span>
          <h2 class="section-title">${lang === "es" ? "Ahorra Dinero en 4 Simples Pasos" : "Save Money in 4 Simple Steps"}</h2>
          <p class="section-subtitle">${
            lang === "es"
              ? "No más verificar precios manualmente. Nosotros hacemos el trabajo por ti."
              : "No more manually checking prices. We do the work for you."
          }</p>
        </div>
        <div class="features-grid" data-reveal-stagger>
          <div class="feature-card" data-reveal="fade-up">
            <div class="feature-icon">🔍</div>
            <h3>${lang === "es" ? "Busca Productos" : "Search Products"}</h3>
            <p>${
              lang === "es"
                ? "Encuentra cualquier producto de Mercado Libre usando nuestra búsqueda inteligente."
                : "Find any product from Mercado Libre using our smart search."
            }</p>
          </div>
          <div class="feature-card" data-reveal="fade-up">
            <div class="feature-icon">📊</div>
            <h3>${lang === "es" ? "Rastrea Precios" : "Track Prices"}</h3>
            <p>${
              lang === "es"
                ? "Ve el historial completo de precios y tendencias de cada producto."
                : "See complete price history and trends for each product."
            }</p>
          </div>
          <div class="feature-card" data-reveal="fade-up">
            <div class="feature-icon">🔔</div>
            <h3>${lang === "es" ? "Recibe Alertas" : "Get Alerts"}</h3>
            <p>${
              lang === "es"
                ? "Te notificamos al instante por email cuando el precio baje."
                : "We notify you instantly by email when the price drops."
            }</p>
          </div>
          <div class="feature-card" data-reveal="fade-up">
            <div class="feature-icon">💰</div>
            <h3>${lang === "es" ? "Ahorra Dinero" : "Save Money"}</h3>
            <p>${
              lang === "es"
                ? "Compra siempre al mejor precio posible. Usuarios ahorran en promedio 25%."
                : "Always buy at the best possible price. Users save 25% on average."
            }</p>
          </div>
        </div>
      </section>

      <!-- Featured Deals -->
      ${
        results.products.length
          ? `
        <section class="deals-section" data-reveal="fade-up">
          <div class="section-header" data-reveal="fade-up">
            <span class="section-label">🔥 ${lang === "es" ? "En Tendencia" : "Trending Now"}</span>
            <h2 class="section-title">${lang === "es" ? "Ofertas Destacadas de Hoy" : "Today's Featured Deals"}</h2>
            <p class="section-subtitle">${
              lang === "es"
                ? "Productos populares con los mejores descuentos del momento."
                : "Popular products with the best discounts right now."
            }</p>
          </div>
          <div class="product-grid" data-reveal-stagger>
            ${results.products
              .slice(0, 8)
              .map(
                (product, index) =>
                  `<div data-reveal="fade-up">${renderProductCard(product)}</div>`,
              )
              .join("")}
          </div>
          <div class="section-cta" data-reveal="fade-up">
            <a href="/register" class="btn-primary">
              ${lang === "es" ? "Ver Todas las Ofertas" : "View All Deals"}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
            </a>
          </div>
        </section>
      `
          : ""
      }

      <!-- Stats Section -->
      <section class="stats-section" data-reveal="fade-up">
        <div class="stats-grid" data-reveal-stagger>
          <div class="stat-card" data-reveal="fade-up">
            <div class="stat-number">1M+</div>
            <div class="stat-label">${lang === "es" ? "Productos Rastreados" : "Products Tracked"}</div>
          </div>
          <div class="stat-card" data-reveal="fade-up">
            <div class="stat-number">$500K+</div>
            <div class="stat-label">${lang === "es" ? "Ahorros de Usuarios" : "User Savings"}</div>
          </div>
          <div class="stat-card" data-reveal="fade-up">
            <div class="stat-number">24/7</div>
            <div class="stat-label">${lang === "es" ? "Monitoreo Continuo" : "Continuous Monitoring"}</div>
          </div>
          <div class="stat-card" data-reveal="fade-up">
            <div class="stat-number">50K+</div>
            <div class="stat-label">${lang === "es" ? "Usuarios Activos" : "Active Users"}</div>
          </div>
        </div>
      </section>

      <!-- CTA Section -->
      <section class="cta-section" data-reveal="scale">
        <div class="section-content" data-reveal="fade-up">
          <h2>${lang === "es" ? "¿Listo para Empezar a Ahorrar?" : "Ready to Start Saving?"}</h2>
          <p>${
            lang === "es"
              ? "Únete a más de 50,000 usuarios mexicanos que ya están ahorrando dinero en sus compras en línea. Sin costos, sin compromisos."
              : "Join over 50,000 Mexican users who are already saving money on their online purchases. No costs, no commitments."
          }</p>
          <a href="/register" class="btn-primary btn-large">
            ${lang === "es" ? "Comenzar Ahora — Es Gratis" : "Start Now — It's Free"}
          </a>
        </div>
      </section>

      <!-- Footer Info -->
      <footer class="landing-footer" data-reveal="fade-up">
        <div class="footer-grid" data-reveal-stagger>
          <div class="footer-col" data-reveal="fade-up">
            <h4>${lang === "es" ? "Sobre OfertaRadar" : "About OfertaRadar"}</h4>
            <p>${
              lang === "es"
                ? "Somos la plataforma líder de rastreo de precios en México. Nuestra misión es ayudarte a encontrar las mejores ofertas y nunca pagar de más."
                : "We are the leading price tracking platform in Mexico. Our mission is to help you find the best deals and never overpay."
            }</p>
          </div>
          <div class="footer-col" data-reveal="fade-up">
            <h4>${lang === "es" ? "Características" : "Features"}</h4>
            <ul>
              <li>📈 ${lang === "es" ? "Historial de precios" : "Price history"}</li>
              <li>📧 ${lang === "es" ? "Alertas por email" : "Email alerts"}</li>
              <li>📊 ${lang === "es" ? "Comparación de precios" : "Price comparison"}</li>
              <li>✨ ${lang === "es" ? "100% gratis" : "100% free"}</li>
            </ul>
          </div>
          <div class="footer-col" data-reveal="fade-up">
            <h4>${lang === "es" ? "Tiendas Soportadas" : "Supported Stores"}</h4>
            <ul>
              <li>🛒 Mercado Libre México</li>
              <li>📦 Amazon México <span style="opacity:0.6">(${lang === "es" ? "próximamente" : "coming soon"})</span></li>
            </ul>
          </div>
        </div>
        <div class="footer-bottom">
          <p>© 2024 OfertaRadar México. ${lang === "es" ? "Todos los derechos reservados." : "All rights reserved."}</p>
        </div>
      </footer>
    `;

    // Fetch deals data for logged-in users
    let highlightedDeals = [];
    let popularProducts = [];
    let topPriceDrops = [];
    let categoryDiscounts = [];

    console.log(
      "[Home Debug] hasToken:",
      hasToken,
      "USE_SUPABASE:",
      USE_SUPABASE,
    );

    // ALWAYS try to fetch deals data (not just for logged-in users)
    // This ensures sections show for testing
    if (USE_SUPABASE) {
      try {
        [highlightedDeals, popularProducts, topPriceDrops, categoryDiscounts] =
          await Promise.all([
            supabaseDb.getHighlightedDeals(12),
            supabaseDb.getPopularProducts({ limit: 8 }),
            supabaseDb.getTopPriceDrops({ period: "recent", limit: 8 }),
            supabaseDb.getDiscountsByCategory(),
          ]);
      } catch (err) {
        console.error("[Home] Error fetching deals data:", err.message);
      }
    }

    // Show demo data when no tracked products exist (ALWAYS show for testing)
    // Demo Highlighted Deals - Using reliable Unsplash images
    if (highlightedDeals.length === 0) {
      highlightedDeals = [
        {
          product_id: "MLM-demo-1",
          product_title: 'Smart TV Samsung 55" Crystal UHD 4K',
          current_price: 8999,
          avgPrice: 12499,
          isBestPrice: true,
          isGoodDeal: true,
          savingsPercent: 28,
          savingsAmount: 3500,
          source: "mercadolibre",
          thumbnail:
            "https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=300&h=300&fit=crop",
        },
        {
          product_id: "MLM-demo-2",
          product_title: "iPhone 15 Pro Max 256GB",
          current_price: 24999,
          avgPrice: 28999,
          isBestPrice: false,
          isGoodDeal: true,
          savingsPercent: 14,
          savingsAmount: 4000,
          source: "mercadolibre",
          thumbnail:
            "https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=300&h=300&fit=crop",
        },
        {
          product_id: "MLM-demo-3",
          product_title: 'Laptop ASUS VivoBook 15.6" Ryzen 5',
          current_price: 12999,
          avgPrice: 15999,
          isBestPrice: true,
          isGoodDeal: true,
          savingsPercent: 19,
          savingsAmount: 3000,
          source: "mercadolibre",
          thumbnail:
            "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=300&h=300&fit=crop",
        },
        {
          product_id: "MLM-demo-4",
          product_title: "Audífonos Sony WH-1000XM5",
          current_price: 6499,
          avgPrice: 8499,
          isBestPrice: false,
          isGoodDeal: true,
          savingsPercent: 24,
          savingsAmount: 2000,
          source: "mercadolibre",
          thumbnail:
            "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=300&h=300&fit=crop",
        },
        {
          product_id: "MLM-demo-5",
          product_title: "Consola PlayStation 5 Slim",
          current_price: 11999,
          avgPrice: 14999,
          isBestPrice: true,
          isGoodDeal: true,
          savingsPercent: 20,
          savingsAmount: 3000,
          source: "mercadolibre",
          thumbnail:
            "https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?w=300&h=300&fit=crop",
        },
        {
          product_id: "MLM-demo-6",
          product_title: "Robot Aspiradora iRobot Roomba",
          current_price: 7999,
          avgPrice: 9999,
          isBestPrice: false,
          isGoodDeal: true,
          savingsPercent: 20,
          savingsAmount: 2000,
          source: "mercadolibre",
          thumbnail:
            "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=300&h=300&fit=crop",
        },
      ];
    }

    // Demo Popular Products - Using reliable Unsplash images
    if (popularProducts.length === 0) {
      popularProducts = [
        {
          product_id: "MLM-pop-1",
          product_title: "AirPods Pro 2da Generación",
          current_price: 4499,
          avgPrice: 5499,
          isBestPrice: false,
          isGoodDeal: true,
          savingsPercent: 18,
          source: "mercadolibre",
          thumbnail:
            "https://images.unsplash.com/photo-1606220588913-b3aacb4d2f46?w=300&h=300&fit=crop",
        },
        {
          product_id: "MLM-pop-2",
          product_title: "Nintendo Switch OLED",
          current_price: 6999,
          avgPrice: 7999,
          isBestPrice: true,
          isGoodDeal: true,
          savingsPercent: 13,
          source: "mercadolibre",
          thumbnail:
            "https://images.unsplash.com/photo-1578303512597-81e6cc155b3e?w=300&h=300&fit=crop",
        },
        {
          product_id: "MLM-pop-3",
          product_title: "Samsung Galaxy S24 Ultra 256GB",
          current_price: 22999,
          avgPrice: 27999,
          isBestPrice: false,
          isGoodDeal: true,
          savingsPercent: 18,
          source: "mercadolibre",
          thumbnail:
            "https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?w=300&h=300&fit=crop",
        },
        {
          product_id: "MLM-pop-4",
          product_title: "MacBook Air M2 256GB",
          current_price: 19999,
          avgPrice: 24999,
          isBestPrice: true,
          isGoodDeal: true,
          savingsPercent: 20,
          source: "mercadolibre",
          thumbnail:
            "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=300&h=300&fit=crop",
        },
        {
          product_id: "MLM-pop-5",
          product_title: "Dyson V15 Detect Aspiradora",
          current_price: 14999,
          avgPrice: 17999,
          isBestPrice: false,
          isGoodDeal: true,
          savingsPercent: 17,
          source: "mercadolibre",
          thumbnail:
            "https://images.unsplash.com/photo-1558317374-067fb5f30001?w=300&h=300&fit=crop",
        },
        {
          product_id: "MLM-pop-6",
          product_title: "Xbox Series X 1TB",
          current_price: 11499,
          avgPrice: 13999,
          isBestPrice: true,
          isGoodDeal: true,
          savingsPercent: 18,
          source: "mercadolibre",
          thumbnail:
            "https://images.unsplash.com/photo-1621259182978-fbf93132d53d?w=300&h=300&fit=crop",
        },
        {
          product_id: "MLM-pop-7",
          product_title: 'Monitor LG UltraGear 27" 144Hz',
          current_price: 4999,
          avgPrice: 6499,
          isBestPrice: false,
          isGoodDeal: true,
          savingsPercent: 23,
          source: "mercadolibre",
          thumbnail:
            "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=300&h=300&fit=crop",
        },
        {
          product_id: "MLM-pop-8",
          product_title: "Kindle Paperwhite 16GB",
          current_price: 2999,
          avgPrice: 3499,
          isBestPrice: true,
          isGoodDeal: true,
          savingsPercent: 14,
          source: "mercadolibre",
          thumbnail:
            "https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=300&h=300&fit=crop",
        },
      ];
    }

    // Demo Top Price Drops - Using reliable Unsplash images
    if (topPriceDrops.length === 0) {
      topPriceDrops = [
        {
          product_id: "MLM-drop-1",
          product_title: "Cámara Canon EOS R50 Kit",
          current_price: 18999,
          previousPrice: 24999,
          dropPercent: 24,
          dropAmount: 6000,
          isBestPrice: true,
          source: "mercadolibre",
          thumbnail:
            "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=300&h=300&fit=crop",
        },
        {
          product_id: "MLM-drop-2",
          product_title: "Refrigerador Samsung French Door",
          current_price: 29999,
          previousPrice: 39999,
          dropPercent: 25,
          dropAmount: 10000,
          isBestPrice: false,
          isGoodDeal: true,
          source: "mercadolibre",
          thumbnail:
            "https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?w=300&h=300&fit=crop",
        },
        {
          product_id: "MLM-drop-3",
          product_title: "Apple Watch Series 9 GPS 45mm",
          current_price: 8499,
          previousPrice: 10999,
          dropPercent: 23,
          dropAmount: 2500,
          isBestPrice: true,
          source: "mercadolibre",
          thumbnail:
            "https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=300&h=300&fit=crop",
        },
        {
          product_id: "MLM-drop-4",
          product_title: "Bose QuietComfort Ultra",
          current_price: 7999,
          previousPrice: 9999,
          dropPercent: 20,
          dropAmount: 2000,
          isBestPrice: false,
          isGoodDeal: true,
          source: "mercadolibre",
          thumbnail:
            "https://images.unsplash.com/photo-1583394838336-acd977736f90?w=300&h=300&fit=crop",
        },
        {
          product_id: "MLM-drop-5",
          product_title: "GoPro Hero 12 Black",
          current_price: 8499,
          previousPrice: 10999,
          dropPercent: 23,
          dropAmount: 2500,
          isBestPrice: true,
          source: "mercadolibre",
          thumbnail:
            "https://images.unsplash.com/photo-1564466809058-bf4114d55352?w=300&h=300&fit=crop",
        },
        {
          product_id: "MLM-drop-6",
          product_title: "Lavadora LG TurboWash 22kg",
          current_price: 16999,
          previousPrice: 21999,
          dropPercent: 23,
          dropAmount: 5000,
          isBestPrice: false,
          isGoodDeal: true,
          source: "mercadolibre",
          thumbnail:
            "https://images.unsplash.com/photo-1626806787461-102c1bfaaea1?w=300&h=300&fit=crop",
        },
        {
          product_id: "MLM-drop-7",
          product_title: "iPad Air M1 256GB WiFi",
          current_price: 12999,
          previousPrice: 16999,
          dropPercent: 24,
          dropAmount: 4000,
          isBestPrice: true,
          source: "mercadolibre",
          thumbnail:
            "https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=300&h=300&fit=crop",
        },
        {
          product_id: "MLM-drop-8",
          product_title: "Silla Gamer Secretlab Titan",
          current_price: 9999,
          previousPrice: 12999,
          dropPercent: 23,
          dropAmount: 3000,
          isBestPrice: false,
          isGoodDeal: true,
          source: "mercadolibre",
          thumbnail:
            "https://images.unsplash.com/photo-1598550476439-6847785fcea6?w=300&h=300&fit=crop",
        },
      ];
    }

    // Demo category discounts
    if (categoryDiscounts.length === 0) {
      categoryDiscounts = [
        {
          key: "electronics",
          icon: "📱",
          nameEn: "Electronics",
          nameEs: "Electrónica",
          maxDiscount: 25,
          productCount: 156,
        },
        {
          key: "home",
          icon: "🏠",
          nameEn: "Home & Kitchen",
          nameEs: "Hogar y Cocina",
          maxDiscount: 30,
          productCount: 89,
        },
        {
          key: "fashion",
          icon: "👗",
          nameEn: "Fashion",
          nameEs: "Moda",
          maxDiscount: 40,
          productCount: 234,
        },
        {
          key: "sports",
          icon: "⚽",
          nameEn: "Sports & Outdoors",
          nameEs: "Deportes",
          maxDiscount: 35,
          productCount: 67,
        },
        {
          key: "beauty",
          icon: "💄",
          nameEn: "Beauty",
          nameEs: "Belleza",
          maxDiscount: 28,
          productCount: 112,
        },
        {
          key: "toys",
          icon: "🎮",
          nameEn: "Toys & Games",
          nameEs: "Juguetes",
          maxDiscount: 32,
          productCount: 78,
        },
      ];
    }

    console.log(
      "[Home Debug] After demo data - highlightedDeals:",
      highlightedDeals.length,
      "popularProducts:",
      popularProducts.length,
      "topPriceDrops:",
      topPriceDrops.length,
    );

    // Helper to render deal card for carousel (CamelCamelCamel style)
    const renderDealCard = (deal) => {
      const badges = [];
      if (deal.isBestPrice) {
        badges.push(`<span class="badge-best-price">Best Price</span>`);
      }
      if (deal.isGoodDeal && !deal.isBestPrice) {
        badges.push(`<span class="badge-good-deal">Good Deal</span>`);
      }

      // Use thumbnail if available, otherwise construct from product_id
      const imageUrl =
        deal.thumbnail ||
        (deal.product_url?.includes("amazon")
          ? "/images/product-placeholder.svg"
          : `https://http2.mlstatic.com/D_NQ_NP_${deal.product_id?.split("-")[1] || ""}-O.webp`);

      return `
        <div class="deal-card-ccc">
          ${badges.length > 0 ? `<div class="deal-card-badges">${badges.join("")}</div>` : ""}
          <div class="deal-card-image">
            <img src="${imageUrl}"
                 alt="${deal.product_title || ""}"
                 loading="lazy"
                 onerror="this.src='/images/product-placeholder.svg'" />
          </div>
          <div class="deal-card-content">
            <h4 class="deal-card-title">${deal.product_title || "Product"}</h4>
            <div class="deal-card-pricing">
              <span class="deal-card-price">${formatPrice(deal.current_price, "MXN")}</span>
              ${deal.avgPrice ? `<span class="deal-card-avg">Avg: ${formatPrice(deal.avgPrice, "MXN")}</span>` : ""}
            </div>
            ${
              deal.savingsPercent > 0
                ? `
              <div class="deal-card-savings">
                Save ${Math.round(deal.savingsPercent)}% (${formatPrice(deal.savingsAmount || 0, "MXN")})
              </div>
            `
                : ""
            }
            <a href="/product/${encodeURIComponent(deal.product_id)}?source=${deal.source || "mercadolibre"}" class="deal-card-btn">
              ${lang === "es" ? "Ver en Mercado Libre" : "View on Mercado Libre"}
            </a>
          </div>
        </div>
      `;
    };

    // Helper to render home product card (CamelCamelCamel style)
    const renderHomeProductCard = (product, showDrop = false) => {
      const badges = [];
      if (product.isBestPrice) {
        badges.push(`<span class="badge-best-price">Best Price</span>`);
      } else if (product.isGoodDeal) {
        badges.push(`<span class="badge-good-deal">Good Deal</span>`);
      }

      // Use thumbnail if available
      const imageUrl =
        product.thumbnail ||
        (product.product_url?.includes("amazon")
          ? "/images/product-placeholder.svg"
          : `https://http2.mlstatic.com/D_NQ_NP_${product.product_id?.split("-")[1] || ""}-O.webp`);

      const avgOrPrevPrice = product.previousPrice || product.avgPrice;
      const savingsText =
        showDrop && product.dropPercent
          ? `Save ${Math.round(product.dropPercent)}% (${formatPrice(product.dropAmount || 0, "MXN")})`
          : product.savingsPercent
            ? `Save ${Math.round(product.savingsPercent)}%`
            : "";

      return `
        <div class="product-card-ccc">
          ${badges.length > 0 ? `<div class="product-card-badges">${badges.join("")}</div>` : ""}
          <div class="product-card-image">
            <img src="${imageUrl}"
                 alt="${product.product_title || ""}"
                 loading="lazy"
                 onerror="this.src='/images/product-placeholder.svg'" />
          </div>
          <div class="product-card-content">
            <h4 class="product-card-title">${product.product_title || "Product"}</h4>
            <div class="product-card-pricing">
              <span class="product-card-price">${formatPrice(product.current_price, "MXN")}</span>
              ${avgOrPrevPrice ? `<span class="product-card-avg">Avg: ${formatPrice(avgOrPrevPrice, "MXN")}</span>` : ""}
            </div>
            ${savingsText ? `<div class="product-card-savings">${savingsText}</div>` : ""}
            <a href="/product/${encodeURIComponent(product.product_id)}?source=${product.source || "mercadolibre"}" class="product-card-btn">
              ${lang === "es" ? "Ver en Mercado Libre" : "View on Mercado Libre"}
            </a>
          </div>
        </div>
      `;
    };

    // Highlighted Deals Section (CamelCamelCamel style with carousel)
    const highlightedDealsSection =
      highlightedDeals.length > 0
        ? `
      <section class="ccc-section" id="highlighted-deals">
        <div class="ccc-section-header">
          <div class="ccc-section-title-row">
            <h2 class="ccc-section-title">Highlighted Deals →</h2>
            <div class="carousel-nav-group">
              <button class="carousel-nav-btn" data-carousel="deals-carousel" data-dir="prev" aria-label="Previous" title="Previous">‹</button>
              <button class="carousel-nav-btn" data-carousel="deals-carousel" data-dir="next" aria-label="Next" title="Next">›</button>
            </div>
          </div>
          <p class="ccc-section-desc">${
            lang === "es"
              ? "Estas son ofertas excepcionales que encontramos y vale la pena compartir. Revisa seguido, estas se actualizan frecuentemente."
              : "These are outstanding deals we've found and feel are worth sharing. Check back often as these are frequently updated."
          }</p>
        </div>
        <div class="ccc-carousel" id="deals-carousel">
          ${highlightedDeals.map(renderDealCard).join("")}
        </div>
      </section>
    `
        : "";

    // Popular Products Section (CamelCamelCamel style)
    const popularProductsSection =
      popularProducts.length > 0
        ? `
      <section class="ccc-section" id="popular-products">
        <div class="ccc-section-header">
          <h2 class="ccc-section-title">Popular Products →</h2>
          <p class="ccc-section-desc">${
            lang === "es"
              ? "Mira estas ofertas populares recientes. Ve lo que otros usuarios de OfertaRadar han estado comprando últimamente."
              : "Check out these recently popular deals. See what OfertaRadar users have been buying lately."
          }</p>
          <div class="ccc-filter-row">
            <div class="ccc-filter-tabs" data-filter-target="popular-grid">
              <button class="ccc-filter-tab active" data-filter="all">All Products</button>
              <button class="ccc-filter-tab" data-filter="deals">Deals Only</button>
            </div>
            <select class="ccc-category-select" id="popular-category">
              <option value="">All Categories</option>
              <option value="electronics">Electronics</option>
              <option value="phones">Phones</option>
              <option value="computers">Computers</option>
              <option value="home">Home & Kitchen</option>
              <option value="fashion">Fashion</option>
              <option value="sports">Sports</option>
            </select>
            <div class="carousel-nav-group">
              <button class="carousel-nav-btn-sm" data-carousel="popular-grid" data-dir="prev" aria-label="Previous" title="Previous">‹</button>
              <button class="carousel-nav-btn-sm" data-carousel="popular-grid" data-dir="next" aria-label="Next" title="Next">›</button>
            </div>
          </div>
        </div>
        <div class="ccc-product-grid" id="popular-grid">
          ${popularProducts.map((p) => renderHomeProductCard(p, false)).join("")}
        </div>
      </section>
    `
        : "";

    // Top Mercado Libre Price Drops Section (CamelCamelCamel style)
    const priceDropsSection =
      topPriceDrops.length > 0
        ? `
      <section class="ccc-section" id="price-drops">
        <div class="ccc-section-header">
          <h2 class="ccc-section-title">Top Mercado Libre Price Drops →</h2>
          <p class="ccc-section-desc">${
            lang === "es"
              ? "Grandes bajas de precio. Los productos abajo fueron seleccionados de categorías que rastrean frecuentemente y han tenido grandes bajas de precio desde la última actualización."
              : "Big price drops! The products below are selected from categories that you frequently track products in and have had large price drops since the last price update."
          }</p>
          <div class="ccc-filter-row">
            <div class="ccc-filter-tabs" data-filter-target="drops-grid">
              <button class="ccc-filter-tab active" data-filter="recent">Most Recent</button>
              <button class="ccc-filter-tab" data-filter="daily">Daily</button>
              <button class="ccc-filter-tab" data-filter="weekly">Weekly</button>
            </div>
            <select class="ccc-category-select" id="drops-category">
              <option value="">All Categories</option>
              <option value="electronics">Electronics</option>
              <option value="phones">Phones</option>
              <option value="computers">Computers</option>
              <option value="home">Home & Kitchen</option>
              <option value="fashion">Fashion</option>
              <option value="sports">Sports</option>
            </select>
            <div class="carousel-nav-group">
              <button class="carousel-nav-btn-sm" data-carousel="drops-grid" data-dir="prev" aria-label="Previous" title="Previous">‹</button>
              <button class="carousel-nav-btn-sm" data-carousel="drops-grid" data-dir="next" aria-label="Next" title="Next">›</button>
            </div>
          </div>
        </div>
        <div class="ccc-product-grid" id="drops-grid">
          ${topPriceDrops.map((p) => renderHomeProductCard(p, true)).join("")}
        </div>
      </section>
    `
        : "";

    // Discounts by Category Section
    const categorySection =
      categoryDiscounts.length > 0
        ? `
      <section class="home-section" id="category-discounts">
        <div class="home-section-header">
          <h2 class="home-section-title">
            <span class="home-section-title-icon">🏷️</span>
            ${lang === "es" ? "Descuentos por Categoría" : "Discounts by Category"}
          </h2>
        </div>
        <div class="category-grid">
          ${categoryDiscounts
            .map(
              (cat) => `
            <a href="/?q=${encodeURIComponent(lang === "es" ? cat.nameEs : cat.nameEn)}" class="category-discount-card">
              <span class="category-discount-icon">${cat.icon}</span>
              <div class="category-discount-name">${lang === "es" ? cat.nameEs : cat.nameEn}</div>
              <div class="category-discount-percent">
                ${lang === "es" ? "Hasta" : "Up to"} ${cat.maxDiscount}% ${lang === "es" ? "OFF" : "OFF"}
              </div>
              <div class="category-discount-count">${cat.productCount} ${lang === "es" ? "productos" : "products"}</div>
            </a>
          `,
            )
            .join("")}
        </div>
      </section>
    `
        : "";

    // Empty state if no deals data
    const emptyDealsSection =
      highlightedDeals.length === 0 &&
      popularProducts.length === 0 &&
      topPriceDrops.length === 0 &&
      hasToken
        ? `
      <section class="home-section">
        <div class="home-section-empty">
          <span class="home-section-empty-icon">📊</span>
          <p class="home-section-empty-text">
            ${
              lang === "es"
                ? "Aún no hay datos de ofertas. ¡Empieza a rastrear productos para ver ofertas personalizadas!"
                : "No deals data yet. Start tracking products to see personalized deals!"
            }
          </p>
          <a href="/?q=ofertas" class="home-section-empty-cta">
            ${lang === "es" ? "Explorar Productos" : "Explore Products"}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </a>
        </div>
      </section>
    `
        : "";

    // DEBUG: Log section generation
    console.log("[Home Route] =========== SECTIONS DEBUG ===========");
    console.log(
      "[Home Route] highlightedDealsSection length:",
      highlightedDealsSection.length,
    );
    console.log(
      "[Home Route] popularProductsSection length:",
      popularProductsSection.length,
    );
    console.log(
      "[Home Route] priceDropsSection length:",
      priceDropsSection.length,
    );
    console.log("[Home Route] categorySection length:", categorySection.length);
    console.log(
      "[Home Route] Will show:",
      hasToken ? "searchPage (logged in)" : "landingPage (guest)",
    );

    // Search page for logged-in users with CamelCamelCamel-style sections
    const searchPage = `
      <div class="logged-in-home">
        <div class="search-wrapper">
          <p class="tagline">${t(lang, "siteTagline")}</p>
          ${searchSection}
        </div>
        ${highlightedDealsSection}
        ${popularProductsSection}
        ${priceDropsSection}
        ${categorySection}
        ${emptyDealsSection}
      </div>
    `;

    // Show landing page for guests, search page for logged-in users
    const pageContent = hasToken ? searchPage : landingPage;

    res.send(
      renderPage(
        t(lang, "priceTracker"),
        pageContent,
        `
        <style>
          .tagline { color: var(--text-muted); margin-bottom: 24px; font-size: 1.1rem; }
          .search-wrapper { max-width: 900px; margin: 0 auto; }
        </style>
        <script>
          // Price range sync for search
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

          // Carousel Navigation
          (function() {
            const carouselNavButtons = document.querySelectorAll('.carousel-nav');

            carouselNavButtons.forEach(btn => {
              btn.addEventListener('click', function() {
                const carouselId = this.getAttribute('data-carousel');
                const direction = this.getAttribute('data-dir');
                const carousel = document.getElementById(carouselId);

                if (!carousel) return;

                const scrollAmount = 300;
                const currentScroll = carousel.scrollLeft;

                if (direction === 'next') {
                  carousel.scrollTo({
                    left: currentScroll + scrollAmount,
                    behavior: 'smooth'
                  });
                } else {
                  carousel.scrollTo({
                    left: currentScroll - scrollAmount,
                    behavior: 'smooth'
                  });
                }
              });
            });
          })();

          // Tab Filtering for Popular Products and Price Drops
          (function() {
            const filterTabs = document.querySelectorAll('.filter-tabs');

            filterTabs.forEach(tabGroup => {
              const tabs = tabGroup.querySelectorAll('.filter-tab');

              tabs.forEach(tab => {
                tab.addEventListener('click', async function() {
                  // Update active state
                  tabs.forEach(t => t.classList.remove('active'));
                  this.classList.add('active');

                  const filterValue = this.getAttribute('data-filter');
                  const targetId = tabGroup.getAttribute('data-filter-target');
                  const targetGrid = document.getElementById(targetId);

                  if (!targetGrid) return;

                  // Show loading state
                  targetGrid.style.opacity = '0.5';

                  // Fetch filtered data via API
                  try {
                    let endpoint = '';
                    if (targetId === 'popular-grid') {
                      endpoint = '/api/deals/popular?dealsOnly=' + (filterValue === 'deals');
                    } else if (targetId === 'drops-grid') {
                      endpoint = '/api/deals/price-drops?period=' + filterValue;
                    }

                    if (endpoint) {
                      const response = await fetch(endpoint);
                      if (response.ok) {
                        const html = await response.text();
                        targetGrid.innerHTML = html;
                      }
                    }
                  } catch (err) {
                    console.error('Filter error:', err);
                  } finally {
                    targetGrid.style.opacity = '1';
                  }
                });
              });
            });
          })();

          // Scroll animations for landing page
          (function() {
            const animatedElements = document.querySelectorAll('.animate-on-scroll');

            if (animatedElements.length === 0) return;

            // Add class to enable animations only when JS is ready
            document.body.classList.add('js-animations-ready');

            const observerOptions = {
              root: null,
              rootMargin: '0px 0px -50px 0px',
              threshold: 0.1
            };

            const observer = new IntersectionObserver((entries) => {
              entries.forEach(entry => {
                if (entry.isIntersecting) {
                  entry.target.classList.add('visible');
                  observer.unobserve(entry.target);
                }
              });
            }, observerOptions);

            animatedElements.forEach(el => observer.observe(el));

            // Smooth scroll for anchor links
            document.querySelectorAll('a[href^="#"]').forEach(anchor => {
              anchor.addEventListener('click', function(e) {
                e.preventDefault();
                const target = document.querySelector(this.getAttribute('href'));
                if (target) {
                  target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                  });
                }
              });
            });
          })();
        </script>
      `,
        hasToken,
        userEmail,
        lang,
        userData,
      ),
    );
  });

  app.get("/register", (req, res) => {
    const lang = getLang(req);
    const formContent = `
      <h1 class="auth-title">${lang === "es" ? "Crear Cuenta" : "Create your account"}</h1>
      <p class="auth-subtitle">${lang === "es" ? "Únete y comienza a ahorrar hoy" : "Join and start saving today"}</p>

      <button id="google-signup-btn" type="button" class="google-btn">
        <svg width="18" height="18" viewBox="0 0 18 18">
          <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
          <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
          <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707 0-.593.102-1.17.282-1.709V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.335z"/>
          <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
        </svg>
        <span>${t(lang, "signUpWithGoogle")}</span>
      </button>

      <div class="auth-divider">
        <span>${lang === "es" ? "o regístrate con correo" : "or sign up with email"}</span>
      </div>

      <form method="post" action="/register" class="auth-form">
        <div>
          <label>${t(lang, "email")}</label>
          <input name="email" type="email" autocomplete="email" placeholder="${lang === "es" ? "tu@email.com" : "you@example.com"}" required />
        </div>
        <div>
          <label>${t(lang, "password")}</label>
          <input name="password" type="password" autocomplete="new-password" placeholder="${lang === "es" ? "Mínimo 8 caracteres" : "Minimum 8 characters"}" minlength="8" required />
        </div>
        <button type="submit">${t(lang, "createAccount")}</button>
      </form>

      <div class="auth-links">
        <p>${t(lang, "alreadyHaveAccount")} <a href="/login">${t(lang, "login")}</a></p>
      </div>
    `;

    const extraScript = `
      <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
      <script>
        document.addEventListener('DOMContentLoaded', function() {
          const SUPABASE_URL = '${process.env.SUPABASE_URL || ""}';
          const SUPABASE_ANON_KEY = '${process.env.SUPABASE_ANON_KEY || ""}';
          const REDIRECT_URL = '${APP_BASE_URL}/auth/supabase-callback';

          if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
            const btn = document.getElementById('google-signup-btn');
            if (btn) {
              btn.disabled = true;
              btn.innerHTML = '<span style="color: #666;">Google Sign Up Not Available</span>';
            }
            return;
          }

          const { createClient } = supabase;
          const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

          const btn = document.getElementById('google-signup-btn');
          if (!btn) return;

          btn.addEventListener('click', async () => {
            btn.disabled = true;
            btn.innerHTML = '<span>Redirecting to Google...</span>';

            try {
              const { data, error } = await supabaseClient.auth.signInWithOAuth({
                provider: 'google',
                options: {
                  redirectTo: REDIRECT_URL
                }
              });

              if (error) {
                btn.disabled = false;
                btn.innerHTML = '<span>Sign up with Google</span>';
                alert('Failed to sign up with Google: ' + error.message);
              }
            } catch (err) {
              btn.disabled = false;
              btn.innerHTML = '<span>Sign up with Google</span>';
              alert('An error occurred: ' + err.message);
            }
          });
        });
      </script>
    `;

    res.send(
      renderAuthPage(t(lang, "register"), formContent, extraScript, lang, {
        title: lang === "es" ? "Únete a OfertaRadar" : "Join OfertaRadar",
        subtitle:
          lang === "es"
            ? "Miles de usuarios ya están ahorrando con nosotros"
            : "Thousands of users are already saving with us",
      }),
    );
  });

  app.post("/register", async (req, res) => {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();
    const password = String(req.body.password || "");

    if (!email || !password) {
      return res.send(
        renderPage(
          "Register",
          `<p class="error">Email and password are required.</p>`,
        ),
      );
    }

    const existing = await db.get(
      "SELECT id, verified FROM users WHERE email = ?",
      email,
    );
    if (existing) {
      return res.send(
        renderPage(
          "Register",
          `
        <p class="error">Account already exists.</p>
        <p><a href="/login">Go to login</a></p>
      `,
        ),
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const createdAt = new Date().toISOString();

    await db.run(
      "INSERT INTO users (email, password_hash, verified, verification_token, created_at) VALUES (?, ?, 0, ?, ?)",
      email,
      passwordHash,
      verificationToken,
      createdAt,
    );

    const verificationLink = `${APP_BASE_URL}/verify?token=${verificationToken}`;

    // CALLBACK EXAMPLE: Using callbacks for email sending
    sendVerificationEmail(
      email,
      verificationLink,
      // Success callback
      (info) => {
        logAction(
          "Email Sent",
          `Verification email sent to ${info.email}`,
          () => {
            console.log("✓ Email logging complete");
          },
        );
      },
      // Error callback
      (error) => {
        console.error("✗ Failed to send email:", error);
      },
    );

    res.send(
      renderPage(
        "Verify Email",
        `
      <h1>Verify your email</h1>
      <p>We sent a verification link to <strong>${email}</strong>.</p>
      <p class="muted">In development, the verification link is printed in the server console.</p>
    `,
      ),
    );
  });

  app.get("/verify", async (req, res) => {
    const token = String(req.query.token || "");
    if (!token) {
      return res.send(
        renderPage(
          "Verify Email",
          `<p class="error">Invalid verification token.</p>`,
        ),
      );
    }

    const user = await db.get(
      "SELECT id FROM users WHERE verification_token = ?",
      token,
    );
    if (!user) {
      return res.send(
        renderPage(
          "Verify Email",
          `<p class="error">Verification token not found.</p>`,
        ),
      );
    }

    await db.run(
      "UPDATE users SET verified = 1, verification_token = NULL WHERE id = ?",
      user.id,
    );

    res.send(
      renderPage(
        "Verified",
        `
      <h1>Email verified</h1>
      <p>Your account is now verified.</p>
      <p><a href="/login">Continue to login</a></p>
    `,
      ),
    );
  });

  app.get("/login", (req, res) => {
    const lang = getLang(req);
    const formContent = `
      <h1 class="auth-title">${lang === "es" ? "Iniciar Sesión" : "Sign in to OfertaRadar"}</h1>
      <p class="auth-subtitle">${lang === "es" ? "Ingresa tus credenciales para continuar" : "Enter your credentials to continue"}</p>

      <button id="google-login-btn" type="button" class="google-btn">
        <svg width="18" height="18" viewBox="0 0 18 18">
          <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
          <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
          <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707 0-.593.102-1.17.282-1.709V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.335z"/>
          <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
        </svg>
        <span>${t(lang, "continueWithGoogle")}</span>
      </button>

      <div class="auth-divider">
        <span>${lang === "es" ? "o" : "or"}</span>
      </div>

      <form method="post" action="/login" class="auth-form">
        <div>
          <label>${t(lang, "email")}</label>
          <input name="email" type="email" autocomplete="email" placeholder="${lang === "es" ? "tu@email.com" : "you@example.com"}" required />
        </div>
        <div>
          <label>${t(lang, "password")}</label>
          <input name="password" type="password" autocomplete="current-password" placeholder="••••••••" required />
        </div>
        <div class="auth-forgot">
          <a href="/forgot-password">${t(lang, "forgotPassword")}</a>
        </div>
        <button type="submit">${t(lang, "login")}</button>
      </form>

      <div class="auth-links">
        <p>${t(lang, "newHere")} <a href="/register">${t(lang, "createAccount")}</a></p>
      </div>
    `;

    const extraScript = `
      <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
      <script>
        document.addEventListener('DOMContentLoaded', function() {
          const SUPABASE_URL = '${process.env.SUPABASE_URL || ""}';
          const SUPABASE_ANON_KEY = '${process.env.SUPABASE_ANON_KEY || ""}';
          const REDIRECT_URL = '${APP_BASE_URL}/auth/supabase-callback';

          if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
            const btn = document.getElementById('google-login-btn');
            if (btn) {
              btn.disabled = true;
              btn.innerHTML = '<span style="color: #666;">Google Login Not Available</span>';
            }
            return;
          }

          const { createClient } = supabase;
          const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

          const btn = document.getElementById('google-login-btn');
          if (!btn) return;

          btn.addEventListener('click', async () => {
            btn.disabled = true;
            btn.innerHTML = '<span>Redirecting to Google...</span>';

            try {
              const { data, error } = await supabaseClient.auth.signInWithOAuth({
                provider: 'google',
                options: {
                  redirectTo: REDIRECT_URL
                }
              });

              if (error) {
                btn.disabled = false;
                btn.innerHTML = '<span>Continue with Google</span>';
                alert('Failed to sign in with Google: ' + error.message);
              }
            } catch (err) {
              btn.disabled = false;
              btn.innerHTML = '<span>Continue with Google</span>';
              alert('An error occurred: ' + err.message);
            }
          });
        });
      </script>
    `;

    res.send(
      renderAuthPage(t(lang, "login"), formContent, extraScript, lang, {
        title: lang === "es" ? "Bienvenido de nuevo" : "Welcome back",
        subtitle:
          lang === "es"
            ? "Rastrea precios y encuentra las mejores ofertas en México"
            : "Track prices and find the best deals in Mexico",
      }),
    );
  });

  app.post("/login", async (req, res) => {
    const lang = getLang(req);
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();
    const password = String(req.body.password || "");
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.get("User-Agent") || "";

    const user = await db.get("SELECT * FROM users WHERE email = ?", email);
    if (!user) {
      // Record failed login attempt
      await recordLoginAttempt({
        userId: null,
        email,
        success: false,
        ipAddress,
        userAgent,
        authMethod: "local",
      });
      return res.send(
        renderPage(
          t(lang, "login"),
          `
        <h1>${t(lang, "login")}</h1>
        <p class="error">${t(lang, "invalidCredentials")}</p>
        <form method="post" action="/login">
          <label>${t(lang, "email")}</label>
          <input name="email" type="email" value="${email}" required />
          <label>${t(lang, "password")}</label>
          <input name="password" type="password" required />
          <button type="submit">${t(lang, "login")}</button>
        </form>
        <p class="muted">${t(lang, "newHere")} <a href="/register">${t(lang, "register")}</a></p>
      `,
          "",
          false,
          "",
          lang,
        ),
      );
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      // Record failed login attempt
      await recordLoginAttempt({
        userId: user.id,
        email,
        success: false,
        ipAddress,
        userAgent,
        authMethod: "local",
      });
      return res.send(
        renderPage(
          t(lang, "login"),
          `
        <h1>${t(lang, "login")}</h1>
        <p class="error">${t(lang, "invalidCredentials")}</p>
        <form method="post" action="/login">
          <label>${t(lang, "email")}</label>
          <input name="email" type="email" value="${email}" required />
          <label>${t(lang, "password")}</label>
          <input name="password" type="password" required />
          <button type="submit">${t(lang, "login")}</button>
        </form>
        <p class="muted">${t(lang, "newHere")} <a href="/register">${t(lang, "register")}</a></p>
      `,
          "",
          false,
          "",
          lang,
        ),
      );
    }

    if (!user.verified) {
      return res.send(
        renderPage(
          t(lang, "login"),
          `
        <h1>${t(lang, "login")}</h1>
        <p class="error">Please verify your email before logging in.</p>
        <p class="muted">Check your email for the verification link.</p>
        <form method="post" action="/login">
          <label>${t(lang, "email")}</label>
          <input name="email" type="email" value="${email}" required />
          <label>${t(lang, "password")}</label>
          <input name="password" type="password" required />
          <button type="submit">${t(lang, "login")}</button>
        </form>
      `,
          "",
          false,
          "",
          lang,
        ),
      );
    }

    // Record successful login
    await recordLoginAttempt({
      userId: user.id,
      email,
      success: true,
      ipAddress,
      userAgent,
      authMethod: "local",
    });

    console.log(`[Login] User logged in: ${email} (ID: ${user.id})`);

    const token = createToken(user);
    setAuthCookie(res, token);
    return res.redirect("/"); // Redirect to home after login
  });

  app.post("/logout", (req, res) => {
    clearAuthCookie(res);
    res.redirect("/"); // Redirect to home after logout
  });

  // Diagnostic endpoint to check Supabase configuration
  app.get("/debug/supabase-config", (req, res) => {
    const hasSupabaseUrl = Boolean(process.env.SUPABASE_URL);
    const hasSupabaseKey = Boolean(process.env.SUPABASE_ANON_KEY);

    res.send(
      renderPage(
        "Supabase Configuration",
        `
      <h1>Supabase Configuration Status</h1>
      <p><strong>SUPABASE_URL:</strong> ${hasSupabaseUrl ? "✅ Configured" : "❌ Not configured"}</p>
      ${hasSupabaseUrl ? `<p class="muted">URL: ${process.env.SUPABASE_URL}</p>` : ""}
      <p><strong>SUPABASE_ANON_KEY:</strong> ${hasSupabaseKey ? "✅ Configured" : "❌ Not configured"}</p>
      ${hasSupabaseKey ? `<p class="muted">Key: ${process.env.SUPABASE_ANON_KEY.substring(0, 20)}...</p>` : ""}

      ${
        !hasSupabaseUrl || !hasSupabaseKey
          ? `
        <div class="notice" style="margin-top: 20px;">
          <h3>⚠️ Configuration Required</h3>
          <p>To enable Google login, add these to your <code>.env</code> file:</p>
          <pre style="background: #f5f5f5; padding: 12px; border-radius: 4px; overflow-x: auto;">
SUPABASE_URL=https://rcetefvuniellfuneejg.supabase.co
SUPABASE_ANON_KEY=your_anon_key_from_supabase</pre>
          <p>Then restart the server: <code>npm run dev</code></p>
        </div>
      `
          : `
        <div style="margin-top: 20px; padding: 12px; background: #e8f5e9; border-radius: 8px;">
          <p class="success">✅ Supabase is configured correctly!</p>
          <p><a href="/login">Go to login page</a></p>
        </div>
      `
      }

      <p style="margin-top: 24px;"><a href="/">Back to home</a></p>
    `,
      ),
    );
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
        return res.send(
          renderPage(
            "Authentication Failed",
            `
          <h1>Authentication Failed</h1>
          <p class="error">Error: ${error}</p>
          <p class="muted">There was a problem logging in with the external service.</p>
          <p><a href="/login">Back to login</a></p>
        `,
          ),
        );
      }

      // Verify we received an authorization code
      if (!code) {
        return res.send(
          renderPage(
            "Authentication Failed",
            `
          <h1>Authentication Failed</h1>
          <p class="error">No authorization code received.</p>
          <p><a href="/login">Back to login</a></p>
        `,
          ),
        );
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
      res.send(
        renderPage(
          "Authentication Successful",
          `
        <h1>OAuth Callback Received!</h1>
        <p class="success">✓ Authorization code received successfully</p>
        <div class="notice">
          <strong>Callback Data:</strong>
          <pre>Code: ${code}
State: ${state || "none"}</pre>
        </div>
        <p class="muted">Next step: Exchange this code for an access token to complete authentication.</p>
        <p><a href="/login">Back to login</a></p>
      `,
        ),
      );
    } catch (error) {
      console.error("Callback error:", error);
      res.send(
        renderPage(
          "Error",
          `
        <h1>Error</h1>
        <p class="error">An error occurred during authentication.</p>
        <p><a href="/login">Back to login</a></p>
      `,
        ),
      );
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
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Processing Login | OfertaRadar</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 40px; max-width: 600px; margin: 0 auto; text-align: center; }
            h1 { color: #333; }
            .muted { color: #666; }
            .error { color: #c00; background: #fee; padding: 10px; border-radius: 4px; text-align: left; }
            .spinner { width: 40px; height: 40px; margin: 20px auto; border: 4px solid #f3f3f3; border-top: 4px solid #7c6a5d; border-radius: 50%; animation: spin 1s linear infinite; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            a { color: #7c6a5d; }
          </style>
        </head>
        <body>
          <div class="spinner"></div>
          <h1>Signing you in...</h1>
          <p class="muted">Please wait while we complete your login.</p>

          <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
          <script>
          const SUPABASE_URL = '${process.env.SUPABASE_URL || ""}';
          const SUPABASE_ANON_KEY = '${process.env.SUPABASE_ANON_KEY || ""}';

          if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
            document.body.innerHTML = '<h1>Configuration Error</h1><p class="error">Authentication not configured. Please contact support.</p>';
          } else {
            const { createClient } = supabase;
            const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

            supabaseClient.auth.getSession().then(async ({ data: { session }, error }) => {
              if (error) {
                document.body.innerHTML = '<h1>Login Failed</h1><p class="error">Error: ' + error.message + '</p><p><a href="/login">Back to login</a></p>';
                return;
              }

              if (!session) {
                document.body.innerHTML = '<h1>Session Expired</h1><p class="error">Could not complete login. Please try again.</p><p><a href="/login">Back to login</a></p>';
                return;
              }

              try {
                const response = await fetch('/auth/supabase-verify', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify({
                    user: session.user,
                    access_token: session.access_token
                  })
                });

                const result = await response.json();

                if (result.success) {
                  window.location.href = '/';
                } else {
                  document.body.innerHTML = '<h1>Login Failed</h1><p class="error">' + (result.error || 'Unknown error') + '</p><p><a href="/login">Back to login</a></p>';
                }
              } catch (err) {
                document.body.innerHTML = '<h1>Error</h1><p class="error">Failed to complete login. Please try again.</p><p><a href="/login">Back to login</a></p>';
              }
            }).catch(err => {
              document.body.innerHTML = '<h1>Error</h1><p class="error">Authentication error. Please try again.</p><p><a href="/login">Back to login</a></p>';
            });
          }
          </script>
        </body>
        </html>
      `);
    } catch (error) {
      console.error("Supabase callback error:", error);
      res.send(
        renderPage(
          "Error",
          `
        <h1>Error</h1>
        <p class="error">An error occurred during authentication.</p>
        <p><a href="/login">Back to login</a></p>
      `,
        ),
      );
    }
  });

  /**
   * Verify Supabase user and create/login in our system
   */
  app.post("/auth/supabase-verify", express.json(), async (req, res) => {
    try {
      const { user, access_token } = req.body;

      if (!user || !user.email) {
        return res.json({ success: false, error: "Invalid user data" });
      }

      const email = user.email.toLowerCase();

      // Check if user exists
      let dbUser = await db.get("SELECT * FROM users WHERE email = ?", [email]);

      if (!dbUser) {
        // Create new user (no password needed for OAuth users)
        const randomPassword = crypto.randomBytes(32).toString("hex");
        const passwordHash = await bcrypt.hash(randomPassword, 10);

        await db.run(
          "INSERT INTO users (email, password_hash, verified, created_at, auth_provider) VALUES (?, ?, ?, ?, ?)",
          [email, passwordHash, 1, new Date().toISOString(), "google"],
        );

        dbUser = await db.get("SELECT * FROM users WHERE email = ?", [email]);
        console.log(`[OAuth] New user created: ${email}`);
      } else if (!dbUser.verified) {
        // Auto-verify existing user who logged in with OAuth
        await db.run(
          "UPDATE users SET verified = 1, auth_provider = 'google' WHERE id = ?",
          [dbUser.id],
        );
        dbUser.verified = 1;
      }

      // Verify we have a valid user
      if (!dbUser || !dbUser.id) {
        console.error("[OAuth] Failed to get/create user in database");
        return res.json({
          success: false,
          error: "Failed to create user account",
        });
      }

      // Record successful OAuth login
      await recordLoginAttempt({
        userId: dbUser.id,
        email,
        success: true,
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get("User-Agent") || "",
        authMethod: "google",
      });

      console.log(`[OAuth] ${email} logged in`);

      // Create JWT token for our app
      const token = createToken(dbUser);

      // Set httpOnly cookie server-side (more secure than client-side)
      setAuthCookie(res, token);

      res.json({
        success: true,
        user: { id: dbUser.id, email: dbUser.email },
      });
    } catch (error) {
      console.error("Supabase verify error:", error);

      // Provide helpful error messages for common issues
      let errorMessage = error.message;
      let errorHint = null;

      if (
        error.message.includes("schema cache") ||
        error.message.includes("relation") ||
        error.message.includes("does not exist")
      ) {
        errorMessage = "Database tables not configured";
        errorHint =
          "Run the migration SQL in Supabase SQL Editor: supabase/migrations/001_create_tables.sql";
      } else if (
        error.message.includes("JWT") ||
        error.message.includes("token")
      ) {
        errorMessage = "Authentication token error";
        errorHint = "Check your SUPABASE_ANON_KEY in .env file";
      } else if (
        error.message.includes("network") ||
        error.message.includes("fetch")
      ) {
        errorMessage = "Cannot connect to database";
        errorHint = "Check your SUPABASE_URL and internet connection";
      }

      console.error(
        "[OAuth Error]",
        errorMessage,
        errorHint ? `- ${errorHint}` : "",
      );
      res.json({
        success: false,
        error: errorMessage,
        hint: errorHint,
      });
    }
  });

  // ============================================
  // FORGOT PASSWORD - Uses Callbacks!
  // ============================================

  app.get("/forgot-password", (req, res) => {
    res.send(
      renderPage(
        "Forgot Password",
        `
      <h1>Forgot Password</h1>
      <p>Enter your email address and we'll send you a link to reset your password.</p>
      <form method="post" action="/forgot-password">
        <label>Email</label>
        <input name="email" type="email" required />
        <button type="submit">Send Reset Link</button>
      </form>
      <p class="muted"><a href="/login">Back to login</a></p>
    `,
      ),
    );
  });

  app.post("/forgot-password", async (req, res) => {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();

    if (!email) {
      return res.send(
        renderPage(
          "Forgot Password",
          `<p class="error">Email is required.</p>`,
        ),
      );
    }

    const user = await db.get(
      "SELECT id, email FROM users WHERE email = ?",
      email,
    );

    // Always show success message (security best practice - don't reveal if email exists)
    if (!user) {
      return res.send(
        renderPage(
          "Check Your Email",
          `
        <h1>Check Your Email</h1>
        <p>If an account exists with <strong>${email}</strong>, you will receive a password reset link.</p>
        <p class="muted">The link will expire in 1 hour.</p>
        <p><a href="/login">Back to login</a></p>
      `,
        ),
      );
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetExpires = new Date(Date.now() + 3600000).toISOString(); // 1 hour from now

    await db.run(
      "UPDATE users SET verification_token = ?, created_at = ? WHERE id = ?",
      resetToken,
      resetExpires,
      user.id,
    );

    const resetLink = `${APP_BASE_URL}/reset-password?token=${resetToken}`;

    // CALLBACK EXAMPLE: Send reset email with callbacks
    sendVerificationEmail(
      email,
      resetLink,
      // Success callback
      function (info) {
        logAction(
          "Password Reset Email Sent",
          `Reset link sent to ${info.email}`,
          function () {
            console.log("✓ Password reset email logged");
          },
        );
      },
      // Error callback
      function (error) {
        console.error("✗ Failed to send reset email:", error);
      },
    );

    res.send(
      renderPage(
        "Check Your Email",
        `
      <h1>Check Your Email</h1>
      <p>We sent a password reset link to <strong>${email}</strong>.</p>
      <p class="muted">The link will expire in 1 hour.</p>
      <p class="muted">In development, the reset link is printed in the server console.</p>
      <p><a href="/login">Back to login</a></p>
    `,
      ),
    );
  });

  app.get("/reset-password", async (req, res) => {
    const token = String(req.query.token || "");

    if (!token) {
      return res.send(
        renderPage(
          "Reset Password",
          `
        <p class="error">Invalid reset token.</p>
        <p><a href="/forgot-password">Request new reset link</a></p>
      `,
        ),
      );
    }

    const user = await db.get(
      "SELECT id, email FROM users WHERE verification_token = ?",
      token,
    );

    if (!user) {
      return res.send(
        renderPage(
          "Reset Password",
          `
        <p class="error">Invalid or expired reset token.</p>
        <p><a href="/forgot-password">Request new reset link</a></p>
      `,
        ),
      );
    }

    res.send(
      renderPage(
        "Reset Password",
        `
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
    `,
      ),
    );
  });

  app.post("/reset-password", async (req, res) => {
    const token = String(req.body.token || "");
    const password = String(req.body.password || "");
    const confirmPassword = String(req.body.confirmPassword || "");

    if (!token || !password || !confirmPassword) {
      return res.send(
        renderPage(
          "Reset Password",
          `<p class="error">All fields are required.</p>`,
        ),
      );
    }

    if (password !== confirmPassword) {
      return res.send(
        renderPage(
          "Reset Password",
          `<p class="error">Passwords do not match.</p>`,
        ),
      );
    }

    if (password.length < 8) {
      return res.send(
        renderPage(
          "Reset Password",
          `<p class="error">Password must be at least 8 characters.</p>`,
        ),
      );
    }

    const user = await db.get(
      "SELECT id, email FROM users WHERE verification_token = ?",
      token,
    );

    if (!user) {
      return res.send(
        renderPage(
          "Reset Password",
          `
        <p class="error">Invalid or expired reset token.</p>
        <p><a href="/forgot-password">Request new reset link</a></p>
      `,
        ),
      );
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(password, 10);

    // Update password and clear reset token
    await db.run(
      "UPDATE users SET password_hash = ?, verification_token = NULL, verified = 1 WHERE id = ?",
      passwordHash,
      user.id,
    );

    // Log the password reset with callback
    logAction(
      "Password Reset",
      `Password updated for ${user.email}`,
      function () {
        console.log("✓ Password reset completed");
      },
    );

    res.send(
      renderPage(
        "Password Reset Successful",
        `
      <h1>Password Reset Successful</h1>
      <p class="success">Your password has been reset successfully!</p>
      <p>You can now log in with your new password.</p>
      <p><a href="/login">Go to login</a></p>
    `,
      ),
    );
  });

  app.get("/profile", authRequired, async (req, res) => {
    const lang = getLang(req);
    const user = await db.get("SELECT * FROM users WHERE id = ?", req.user.id);
    if (!user) {
      clearAuthCookie(res);
      return res.redirect("/login");
    }

    // Get login history for this user
    const loginHistory = await getLoginHistory(req.user.id, 5);

    const loginHistoryHtml = loginHistory.length
      ? `
      <h2 style="margin-top: 24px;">${lang === "es" ? "Historial de Inicios de Sesión" : "Login History"}</h2>
      <div class="login-history">
        ${loginHistory
          .map(
            (log) => `
          <div class="login-entry ${log.success ? "success" : "failed"}">
            <span class="login-date">${new Date(log.created_at).toLocaleString(lang === "es" ? "es-MX" : "en-US")}</span>
            <span class="login-method">${log.auth_method === "google" ? "Google" : "Email/Password"}</span>
            <span class="login-status">${log.success ? "✓" : "✗"}</span>
          </div>
        `,
          )
          .join("")}
      </div>
    `
      : "";

    res.send(
      renderPage(
        t(lang, "profile"),
        `
      <div class="profile-header">
        <div class="profile-avatar">
          ${
            user.profile_picture_url
              ? `<img src="${user.profile_picture_url}" alt="Profile" />`
              : `<span class="avatar-initials">${getInitials(user.username || user.email)}</span>`
          }
        </div>
        <div class="profile-info">
          <h1>${user.username || user.email.split("@")[0]}</h1>
          <p class="muted">${user.email}</p>
        </div>
        <a href="/profile/settings" class="action-button secondary settings-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
          ${lang === "es" ? "Configuración" : "Settings"}
        </a>
      </div>
      <div class="profile-card">
        <p><strong>${t(lang, "accountStatus")}:</strong> ${t(lang, "verified")}</p>
        <p><strong>${lang === "es" ? "Método de autenticación" : "Auth method"}:</strong> ${user.auth_provider === "google" ? "Google" : "Email/Password"}</p>
        <p><strong>${lang === "es" ? "Inicios de sesión" : "Login count"}:</strong> ${user.login_count || 0}</p>
        ${user.last_login ? `<p><strong>${lang === "es" ? "Último inicio de sesión" : "Last login"}:</strong> ${new Date(user.last_login).toLocaleString(lang === "es" ? "es-MX" : "en-US")}</p>` : ""}
        <p><strong>${lang === "es" ? "Cuenta creada" : "Account created"}:</strong> ${new Date(user.created_at).toLocaleString(lang === "es" ? "es-MX" : "en-US")}</p>
      </div>
      ${loginHistoryHtml}
    `,
        `
      <style>
        .profile-header {
          display: flex;
          align-items: center;
          gap: 20px;
          margin-bottom: 24px;
          flex-wrap: wrap;
        }
        .profile-avatar {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          background: #3C91ED;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          flex-shrink: 0;
        }
        .profile-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .avatar-initials {
          color: #ffffff;
          font-size: 28px;
          font-weight: 600;
          text-transform: uppercase;
        }
        .profile-info {
          flex: 1;
          min-width: 150px;
        }
        .profile-info h1 {
          margin-bottom: 4px;
        }
        .settings-btn {
          width: auto;
          padding: 10px 16px;
          font-size: 14px;
          min-height: auto;
          gap: 8px;
        }
        .profile-card { background: var(--bg-secondary); padding: 20px; border-radius: var(--radius-lg); box-shadow: var(--shadow-soft); }
        .profile-card p { margin: 10px 0; }
        .login-history { margin-top: 12px; }
        .login-entry {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          background: var(--bg-secondary);
          border-radius: var(--radius-md);
          margin-bottom: 8px;
          border-left: 3px solid var(--accent-primary);
        }
        .login-entry.failed { border-left-color: #c94a4a; }
        .login-entry.success { border-left-color: #3d7a5a; }
        .login-date { font-size: 13px; color: var(--text-secondary); }
        .login-method { font-size: 12px; color: var(--text-muted); background: var(--bg-accent); padding: 4px 8px; border-radius: var(--radius-full); }
        .login-status { font-weight: 600; }
        .login-entry.success .login-status { color: #3d7a5a; }
        .login-entry.failed .login-status { color: #c94a4a; }
      </style>
    `,
        true,
        user.email,
        lang,
        user,
      ),
    );
  });

  // Profile settings page
  app.get("/profile/settings", authRequired, async (req, res) => {
    const lang = getLang(req);
    const user = await db.get("SELECT * FROM users WHERE id = ?", req.user.id);
    if (!user) {
      clearAuthCookie(res);
      return res.redirect("/login");
    }

    const success = req.query.success === "1";
    const error = req.query.error;

    // Debug logging
    console.log(
      "[Profile Settings GET] Loading page for user ID:",
      req.user.id,
    );
    console.log(
      "[Profile Settings GET] User data from DB:",
      JSON.stringify(user, null, 2),
    );

    res.send(
      renderPage(
        lang === "es" ? "Configuración de Perfil" : "Profile Settings",
        `
      <h1>${lang === "es" ? "Configuración de Perfil" : "Profile Settings"}</h1>

      <!-- Debug Info (remove in production) -->
      <div style="background: #ffe0e0; padding: 12px; border-radius: 8px; margin-bottom: 16px; font-size: 12px; font-family: monospace;">
        <strong>DEBUG INFO:</strong><br>
        User ID: ${user.id}<br>
        Username in DB: "${user.username || "(null)"}"<br>
        Profile Pic URL: "${user.profile_picture_url || "(null)"}"<br>
        Email: ${user.email}
      </div>

      ${success ? `<div class="success">${lang === "es" ? "Perfil actualizado correctamente" : "Profile updated successfully"}</div>` : ""}
      ${error ? `<div class="error">${decodeURIComponent(error)}</div>` : ""}

      <div class="settings-section">
        <h2>${lang === "es" ? "Foto de Perfil" : "Profile Picture"}</h2>
        <div class="avatar-section">
          <div class="avatar-preview" id="avatarPreview">
            ${
              user.profile_picture_url
                ? `<img src="${user.profile_picture_url}" alt="Profile" />`
                : `<span class="avatar-initials">${getInitials(user.username || user.email)}</span>`
            }
          </div>
          <div class="avatar-actions">
            <input type="file" id="avatarInput" accept="image/*" style="display: none;" />
            <button type="button" class="action-button secondary" onclick="document.getElementById('avatarInput').click()">
              ${lang === "es" ? "Cambiar Foto" : "Change Photo"}
            </button>
            ${
              user.profile_picture_url
                ? `
              <button type="button" class="action-button secondary" onclick="removeAvatar()">
                ${lang === "es" ? "Eliminar" : "Remove"}
              </button>
            `
                : ""
            }
          </div>
        </div>
      </div>

      <div class="settings-section">
        <h2>${lang === "es" ? "Información de Perfil" : "Profile Information"}</h2>
        <form method="post" action="/profile/settings/update">
          <label>${lang === "es" ? "Nombre de Usuario" : "Username"}</label>
          <input name="username" type="text" value="${user.username || ""}" placeholder="${lang === "es" ? "Ingresa un nombre de usuario" : "Enter a username"}" maxlength="50" />

          <label>${lang === "es" ? "Correo Electrónico" : "Email"}</label>
          <input type="email" value="${user.email}" disabled />
          <p class="muted">${lang === "es" ? "El correo no se puede cambiar" : "Email cannot be changed"}</p>

          <button type="submit">${lang === "es" ? "Guardar Cambios" : "Save Changes"}</button>
        </form>
      </div>

      <div class="settings-section">
        <a href="/profile" class="action-button secondary">${lang === "es" ? "Volver al Perfil" : "Back to Profile"}</a>
      </div>
    `,
        `
      <style>
        .settings-section {
          background: var(--bg-secondary);
          padding: 24px;
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-soft);
          margin-bottom: 20px;
        }
        .settings-section h2 {
          margin-bottom: 16px;
          font-size: 18px;
        }
        .avatar-section {
          display: flex;
          align-items: center;
          gap: 20px;
          flex-wrap: wrap;
        }
        .avatar-preview {
          width: 100px;
          height: 100px;
          border-radius: 50%;
          background: #3C91ED;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          flex-shrink: 0;
        }
        .avatar-preview img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .avatar-initials {
          color: #ffffff;
          font-size: 36px;
          font-weight: 600;
          text-transform: uppercase;
        }
        .avatar-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .avatar-actions .action-button {
          width: auto;
          padding: 10px 16px;
          font-size: 14px;
          min-height: auto;
        }
        .success {
          margin-bottom: 16px;
        }
        .error {
          margin-bottom: 16px;
        }
      </style>
      <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
      <script>
        const SUPABASE_URL = '${process.env.SUPABASE_URL || ""}';
        const SUPABASE_ANON_KEY = '${process.env.SUPABASE_ANON_KEY || ""}';
        const userId = '${req.user.id}';

        const avatarInput = document.getElementById('avatarInput');
        if (avatarInput) avatarInput.addEventListener('change', async function(e) {
          const file = e.target.files[0];
          console.log('[Avatar Upload] File selected:', file);
          if (!file) return;

          if (file.size > 2 * 1024 * 1024) {
            alert('${lang === "es" ? "La imagen debe ser menor a 2MB" : "Image must be less than 2MB"}');
            return;
          }

          const preview = document.getElementById('avatarPreview');
          preview.innerHTML = '<span style="font-size: 14px; color: white;">${lang === "es" ? "Subiendo..." : "Uploading..."}</span>';

          try {
            console.log('[Avatar Upload] Supabase URL:', SUPABASE_URL);
            console.log('[Avatar Upload] Supabase Key exists:', !!SUPABASE_ANON_KEY);

            if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
              throw new Error('Supabase not configured');
            }

            const { createClient } = supabase;
            const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            console.log('[Avatar Upload] Supabase client created');

            const fileExt = file.name.split('.').pop();
            const fileName = userId + '-' + Date.now() + '.' + fileExt;
            console.log('[Avatar Upload] Uploading as:', fileName);

            const { data, error } = await supabaseClient.storage
              .from('avatars')
              .upload(fileName, file, { upsert: true });

            console.log('[Avatar Upload] Supabase upload result:', { data, error });

            if (error) throw error;

            const { data: urlData } = supabaseClient.storage
              .from('avatars')
              .getPublicUrl(fileName);

            console.log('[Avatar Upload] Public URL:', urlData.publicUrl);

            // Update the profile picture URL in the database
            console.log('[Avatar Upload] Saving URL to server...');
            const response = await fetch('/profile/settings/avatar', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: urlData.publicUrl })
            });

            console.log('[Avatar Upload] Server response status:', response.status);
            const responseData = await response.json();
            console.log('[Avatar Upload] Server response:', responseData);

            if (response.ok) {
              preview.innerHTML = '<img src="' + urlData.publicUrl + '" alt="Profile" />';
              console.log('[Avatar Upload] Success!');
            } else {
              throw new Error('Failed to save: ' + JSON.stringify(responseData));
            }
          } catch (err) {
            console.error('[Avatar Upload] Error:', err);
            alert('${lang === "es" ? "Error al subir la imagen" : "Error uploading image"}: ' + err.message);
            location.reload();
          }
        });

        async function removeAvatar() {
          if (!confirm('${lang === "es" ? "¿Eliminar foto de perfil?" : "Remove profile picture?"}')) return;

          try {
            console.log('[Avatar Remove] Sending delete request...');
            const response = await fetch('/profile/settings/avatar', {
              method: 'DELETE'
            });

            console.log('[Avatar Remove] Response status:', response.status);

            if (response.ok) {
              console.log('[Avatar Remove] Success, reloading...');
              location.reload();
            }
          } catch (err) {
            console.error('[Avatar Remove] Error:', err);
          }
        }

        function getInitials(str) {
          return str.split('@')[0].substring(0, 2).toUpperCase();
        }

        // Debug: Log form submission
        const profileForm = document.querySelector('form[action="/profile/settings/update"]');
        if (profileForm) {
          profileForm.addEventListener('submit', function(e) {
            const username = this.querySelector('input[name="username"]').value;
            console.log('[Profile Update] Form submitting with username:', username);
          });
        }

        // Debug: Log page load state
        console.log('[Profile Settings] Page loaded');
        console.log('[Profile Settings] User ID:', userId);
        console.log('[Profile Settings] Current username input value:', document.querySelector('input[name="username"]')?.value);
        console.log('[Profile Settings] Form found:', !!profileForm);
      </script>
    `,
        true,
        user.email,
        lang,
        user,
      ),
    );
  });

  // Handle profile update
  app.post("/profile/settings/update", authRequired, async (req, res) => {
    const timestamp = new Date().toISOString();
    console.log(`\n========== PROFILE UPDATE ${timestamp} ==========`);
    console.log("[Profile Update] Raw request body:", req.body);
    console.log("[Profile Update] Body type:", typeof req.body);
    console.log("[Profile Update] Body keys:", Object.keys(req.body || {}));
    console.log("[Profile Update] User from JWT:", req.user);

    const username = String(req.body.username || "")
      .trim()
      .substring(0, 50);
    console.log("[Profile Update] Parsed username:", `"${username}"`);
    console.log("[Profile Update] Username length:", username.length);

    // Get current user data before update
    const beforeUser = await db.get(
      "SELECT * FROM users WHERE id = ?",
      req.user.id,
    );
    console.log(
      "[Profile Update] BEFORE update:",
      JSON.stringify(beforeUser, null, 2),
    );

    try {
      const result = await db.run(
        "UPDATE users SET username = ? WHERE id = ?",
        [username || null, req.user.id],
      );
      console.log("[Profile Update] DB UPDATE result:", result);
      console.log("[Profile Update] Changes:", result?.changes);

      // Verify the update
      const afterUser = await db.get(
        "SELECT * FROM users WHERE id = ?",
        req.user.id,
      );
      console.log(
        "[Profile Update] AFTER update:",
        JSON.stringify(afterUser, null, 2),
      );
      console.log(
        "[Profile Update] Username changed?",
        beforeUser?.username !== afterUser?.username,
      );
      console.log("========== END PROFILE UPDATE ==========\n");

      res.redirect("/profile/settings?success=1");
    } catch (error) {
      console.error("[Profile Update] ERROR:", error);
      console.error("[Profile Update] Error stack:", error.stack);
      console.log("========== END PROFILE UPDATE (ERROR) ==========\n");
      res.redirect(
        "/profile/settings?error=" +
          encodeURIComponent("Failed to update profile: " + error.message),
      );
    }
  });

  // Handle avatar URL update
  app.post(
    "/profile/settings/avatar",
    authRequired,
    express.json(),
    async (req, res) => {
      const timestamp = new Date().toISOString();
      console.log(`\n========== AVATAR UPDATE ${timestamp} ==========`);
      console.log("[Avatar Update] Request body:", req.body);
      console.log("[Avatar Update] Content-Type:", req.get("Content-Type"));
      console.log("[Avatar Update] User ID:", req.user.id);
      const { url } = req.body;
      console.log("[Avatar Update] URL to save:", url);
      console.log("[Avatar Update] URL length:", url?.length);

      // Get current user data before update
      const beforeUser = await db.get(
        "SELECT * FROM users WHERE id = ?",
        req.user.id,
      );
      console.log(
        "[Avatar Update] BEFORE update:",
        JSON.stringify(beforeUser, null, 2),
      );

      try {
        const result = await db.run(
          "UPDATE users SET profile_picture_url = ? WHERE id = ?",
          [url, req.user.id],
        );
        console.log("[Avatar Update] DB UPDATE result:", result);
        console.log("[Avatar Update] Changes:", result?.changes);

        // Verify the update
        const afterUser = await db.get(
          "SELECT * FROM users WHERE id = ?",
          req.user.id,
        );
        console.log(
          "[Avatar Update] AFTER update:",
          JSON.stringify(afterUser, null, 2),
        );
        console.log(
          "[Avatar Update] Avatar changed?",
          beforeUser?.profile_picture_url !== afterUser?.profile_picture_url,
        );
        console.log("========== END AVATAR UPDATE ==========\n");

        res.json({ success: true, newUrl: afterUser?.profile_picture_url });
      } catch (error) {
        console.error("[Avatar Update] ERROR:", error);
        console.error("[Avatar Update] Error stack:", error.stack);
        console.log("========== END AVATAR UPDATE (ERROR) ==========\n");
        res
          .status(500)
          .json({ error: "Failed to update avatar: " + error.message });
      }
    },
  );

  // Handle avatar removal
  app.delete("/profile/settings/avatar", authRequired, async (req, res) => {
    console.log("[Avatar Remove] User ID:", req.user.id);

    try {
      const result = await db.run(
        "UPDATE users SET profile_picture_url = NULL WHERE id = ?",
        [req.user.id],
      );
      console.log("[Avatar Remove] DB result:", result);

      res.json({ success: true });
    } catch (error) {
      console.error("[Avatar Remove] Error:", error);
      res.status(500).json({ error: "Failed to remove avatar" });
    }
  });

  // ============================================
  // DASHBOARD - TRACKED PRODUCTS WITH PRICE CHARTS
  // ============================================
  app.get("/dashboard", authRequired, async (req, res) => {
    const lang = getLang(req);
    const userEmail = req.user?.email || "";
    const userData = await db.get(
      "SELECT * FROM users WHERE id = ?",
      req.user.id,
    );

    // Get user's tracked products
    const trackedProducts = await supabaseDb.getTrackedProducts(req.user.id);

    const noProductsMessage =
      lang === "es"
        ? "Aún no estás rastreando ningún producto. Busca productos y haz clic en 'Rastrear Precio' para comenzar."
        : "You're not tracking any products yet. Search for products and click 'Track Price' to get started.";

    const productsHtml =
      trackedProducts.length === 0
        ? `<div class="empty-state">
          <div class="empty-state-icon">📊</div>
          <h3>${lang === "es" ? "Sin productos rastreados" : "No Tracked Products"}</h3>
          <p>${noProductsMessage}</p>
          <a href="/" class="btn-primary">${lang === "es" ? "Buscar Productos" : "Search Products"}</a>
        </div>`
        : trackedProducts
            .map(
              (product, index) => `
        <div class="tracked-product-card" data-product-id="${product.id}">
          <div class="tracked-product-header">
            <div class="tracked-product-info">
              <h3 class="tracked-product-title">${product.product_title || product.product_id}</h3>
              <div class="tracked-product-meta">
                <span class="current-price">${formatPrice(product.current_price, "MXN")}</span>
                <span class="tracked-since">${lang === "es" ? "Rastreando desde" : "Tracking since"}: ${new Date(product.created_at).toLocaleDateString(lang === "es" ? "es-MX" : "en-US")}</span>
              </div>
            </div>
            <div class="tracked-product-actions">
              <a href="/product/${product.product_id}" class="btn-small btn-secondary">
                ${lang === "es" ? "Ver Producto" : "View Product"}
              </a>
              <button class="btn-small btn-danger" onclick="removeTrackedProduct('${product.id}')">
                ${lang === "es" ? "Eliminar" : "Remove"}
              </button>
            </div>
          </div>

          <!-- Price Statistics -->
          <div class="price-stats" id="stats-${product.id}">
            <div class="stat-loading">${lang === "es" ? "Cargando estadísticas..." : "Loading statistics..."}</div>
          </div>

          <!-- Price Chart -->
          <div class="chart-container">
            <div class="chart-header">
              <h4>${lang === "es" ? "Historial de Precios" : "Price History"}</h4>
              <div class="chart-period-toggle" data-product-id="${product.id}">
                <button class="period-btn active" data-period="7d">7 ${lang === "es" ? "días" : "days"}</button>
                <button class="period-btn" data-period="30d">30 ${lang === "es" ? "días" : "days"}</button>
              </div>
            </div>
            <div class="chart-wrapper" id="chart-wrapper-${product.id}">
              <canvas id="chart-${product.id}"></canvas>
            </div>
            <div class="chart-empty" id="chart-empty-${product.id}" style="display: none;">
              <p>${lang === "es" ? "No hay suficientes datos de historial aún. Los precios se actualizan cada 12 horas." : "Not enough history data yet. Prices update every 12 hours."}</p>
            </div>
          </div>
        </div>
      `,
            )
            .join("");

    res.send(
      renderPage(
        lang === "es" ? "Mi Panel" : "My Dashboard",
        `
      <div class="dashboard-container">
        <div class="dashboard-header">
          <h1>${lang === "es" ? "Mi Panel de Rastreo" : "My Tracking Dashboard"}</h1>
          <p class="dashboard-subtitle">${
            lang === "es"
              ? `Rastreando ${trackedProducts.length} producto${trackedProducts.length !== 1 ? "s" : ""}`
              : `Tracking ${trackedProducts.length} product${trackedProducts.length !== 1 ? "s" : ""}`
          }</p>
        </div>

        <div class="tracked-products-list">
          ${productsHtml}
        </div>
      </div>
    `,
        `
      <style>
        .dashboard-container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 24px 20px;
        }

        .dashboard-header {
          margin-bottom: 32px;
        }

        .dashboard-header h1 {
          color: var(--text-primary);
          margin-bottom: 8px;
        }

        .dashboard-subtitle {
          color: var(--text-muted);
          font-size: 1.1rem;
        }

        .empty-state {
          text-align: center;
          padding: 60px 20px;
          background: var(--bg-card);
          border-radius: var(--radius-xl);
          border: 1px solid var(--border-color);
        }

        .empty-state-icon {
          font-size: 48px;
          margin-bottom: 16px;
        }

        .empty-state h3 {
          color: var(--text-primary);
          margin-bottom: 8px;
        }

        .empty-state p {
          color: var(--text-muted);
          margin-bottom: 24px;
          max-width: 400px;
          margin-left: auto;
          margin-right: auto;
        }

        .tracked-products-list {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .tracked-product-card {
          background: var(--bg-card);
          border-radius: var(--radius-xl);
          border: 1px solid var(--border-color);
          padding: 24px;
          transition: box-shadow var(--transition-fast);
        }

        .tracked-product-card:hover {
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
        }

        .tracked-product-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          margin-bottom: 20px;
          flex-wrap: wrap;
        }

        .tracked-product-title {
          color: var(--text-primary);
          font-size: 1.1rem;
          margin-bottom: 8px;
          line-height: 1.4;
        }

        .tracked-product-meta {
          display: flex;
          gap: 16px;
          align-items: center;
          flex-wrap: wrap;
        }

        .current-price {
          font-size: 1.25rem;
          font-weight: 700;
          color: var(--accent-primary);
        }

        .tracked-since {
          color: var(--text-muted);
          font-size: 0.85rem;
        }

        .tracked-product-actions {
          display: flex;
          gap: 8px;
          flex-shrink: 0;
        }

        .btn-small {
          padding: 8px 16px;
          font-size: 0.85rem;
          border-radius: var(--radius-md);
          border: none;
          cursor: pointer;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          transition: all var(--transition-fast);
        }

        .btn-secondary {
          background: var(--bg-secondary);
          color: var(--text-primary);
          border: 1px solid var(--border-color);
        }

        .btn-secondary:hover {
          background: var(--bg-tertiary);
        }

        .btn-danger {
          background: #fee2e2;
          color: #dc2626;
        }

        .btn-danger:hover {
          background: #fecaca;
        }

        /* Price Statistics */
        .price-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 16px;
          margin-bottom: 20px;
          padding: 16px;
          background: var(--bg-secondary);
          border-radius: var(--radius-lg);
        }

        .stat-item {
          text-align: center;
        }

        .stat-label {
          font-size: 0.75rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 4px;
        }

        .stat-value {
          font-size: 1.1rem;
          font-weight: 600;
          color: var(--text-primary);
        }

        .stat-value.good-deal {
          color: #16a34a;
        }

        .stat-value.price-up {
          color: #dc2626;
        }

        .stat-value.price-down {
          color: #16a34a;
        }

        .good-deal-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          background: #dcfce7;
          color: #16a34a;
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 0.85rem;
          font-weight: 600;
        }

        .stat-loading {
          grid-column: 1 / -1;
          text-align: center;
          color: var(--text-muted);
          padding: 8px;
        }

        /* Chart Container */
        .chart-container {
          margin-top: 16px;
        }

        .chart-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
          flex-wrap: wrap;
          gap: 12px;
        }

        .chart-header h4 {
          color: var(--text-primary);
          margin: 0;
        }

        .chart-period-toggle {
          display: flex;
          background: var(--bg-secondary);
          border-radius: var(--radius-md);
          padding: 4px;
        }

        .period-btn {
          padding: 8px 16px;
          border: none;
          background: transparent;
          color: var(--text-muted);
          cursor: pointer;
          border-radius: var(--radius-sm);
          font-size: 0.85rem;
          transition: all var(--transition-fast);
        }

        .period-btn:hover {
          color: var(--text-primary);
        }

        .period-btn.active {
          background: var(--accent-primary);
          color: white;
        }

        .chart-wrapper {
          position: relative;
          height: 300px;
          width: 100%;
        }

        .chart-wrapper canvas {
          width: 100% !important;
          height: 100% !important;
        }

        .chart-empty {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 200px;
          background: var(--bg-secondary);
          border-radius: var(--radius-lg);
          color: var(--text-muted);
          text-align: center;
          padding: 20px;
        }

        /* Responsive */
        @media (max-width: 640px) {
          .tracked-product-header {
            flex-direction: column;
          }

          .tracked-product-actions {
            width: 100%;
          }

          .btn-small {
            flex: 1;
            justify-content: center;
          }

          .chart-wrapper {
            height: 250px;
          }

          .price-stats {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        /* Confirmation Modal */
        .confirm-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          animation: fadeIn 0.2s ease;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .confirm-modal {
          background: var(--bg-card);
          border-radius: var(--radius-xl);
          padding: 24px;
          max-width: 400px;
          width: 90%;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          animation: slideUp 0.2s ease;
        }

        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        .confirm-modal h3 {
          color: var(--text-primary);
          margin: 0 0 12px 0;
          font-size: 1.25rem;
        }

        .confirm-modal p {
          color: var(--text-muted);
          margin: 0 0 24px 0;
          line-height: 1.5;
        }

        .confirm-modal-actions {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
        }

        .confirm-modal .btn-cancel {
          padding: 10px 20px;
          border: 1px solid var(--border-color);
          background: var(--bg-secondary);
          color: var(--text-primary);
          border-radius: var(--radius-md);
          cursor: pointer;
          font-size: 0.9rem;
          transition: all var(--transition-fast);
        }

        .confirm-modal .btn-cancel:hover {
          background: var(--bg-tertiary);
        }

        .confirm-modal .btn-confirm {
          padding: 10px 20px;
          border: none;
          background: #dc2626;
          color: white;
          border-radius: var(--radius-md);
          cursor: pointer;
          font-size: 0.9rem;
          transition: all var(--transition-fast);
        }

        .confirm-modal .btn-confirm:hover {
          background: #b91c1c;
        }

        /* Toast Notification */
        .toast {
          position: fixed;
          bottom: 24px;
          left: 50%;
          transform: translateX(-50%);
          padding: 12px 24px;
          border-radius: var(--radius-lg);
          color: white;
          font-size: 0.9rem;
          z-index: 10000;
          animation: toastIn 0.3s ease;
        }

        @keyframes toastIn {
          from { transform: translateX(-50%) translateY(20px); opacity: 0; }
          to { transform: translateX(-50%) translateY(0); opacity: 1; }
        }

        .toast-info {
          background: #3b82f6;
        }

        .toast-success {
          background: #16a34a;
        }

        .toast-error {
          background: #dc2626;
        }
      </style>

      <script>
        // Store chart instances for cleanup
        const chartInstances = {};

        // Initialize all charts when page loads
        document.addEventListener('DOMContentLoaded', function() {
          const productCards = document.querySelectorAll('.tracked-product-card');
          productCards.forEach(card => {
            const productId = card.dataset.productId;
            loadPriceData(productId, '7d');
          });

          // Add click handlers for period toggles
          document.querySelectorAll('.chart-period-toggle').forEach(toggle => {
            toggle.addEventListener('click', function(e) {
              if (e.target.classList.contains('period-btn')) {
                const productId = this.dataset.productId;
                const period = e.target.dataset.period;

                // Update active state
                this.querySelectorAll('.period-btn').forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');

                // Reload chart with new period
                loadPriceData(productId, period);
              }
            });
          });
        });

        // Load price data and render chart
        async function loadPriceData(productId, period) {
          try {
            const response = await fetch(\`/api/tracked/\${productId}/history?period=\${period}\`);
            const data = await response.json();

            if (!data.success) {
              throw new Error(data.error || 'Failed to load data');
            }

            // Update statistics
            updateStats(productId, data.statistics, data.goodDeal);

            // Render chart
            renderChart(productId, data.history, period);

          } catch (error) {
            console.error('Error loading price data:', error);
            document.getElementById(\`stats-\${productId}\`).innerHTML =
              '<div class="stat-loading" style="color: #dc2626;">Error loading data</div>';
          }
        }

        // Update statistics display
        function updateStats(productId, stats, goodDeal) {
          const statsContainer = document.getElementById(\`stats-\${productId}\`);

          if (!stats) {
            statsContainer.innerHTML = '<div class="stat-loading">${lang === "es" ? "Sin datos de historial aún" : "No history data yet"}</div>';
            return;
          }

          const priceChangeClass = stats.priceChange > 0 ? 'price-up' : stats.priceChange < 0 ? 'price-down' : '';
          const priceChangeSign = stats.priceChange > 0 ? '+' : '';

          statsContainer.innerHTML = \`
            <div class="stat-item">
              <div class="stat-label">${lang === "es" ? "Precio Actual" : "Current"}</div>
              <div class="stat-value">\${formatPrice(stats.currentPrice)}</div>
            </div>
            <div class="stat-item">
              <div class="stat-label">${lang === "es" ? "Promedio" : "Average"}</div>
              <div class="stat-value">\${formatPrice(stats.avgPrice)}</div>
            </div>
            <div class="stat-item">
              <div class="stat-label">${lang === "es" ? "Mínimo" : "Lowest"}</div>
              <div class="stat-value price-down">\${formatPrice(stats.minPrice)}</div>
            </div>
            <div class="stat-item">
              <div class="stat-label">${lang === "es" ? "Máximo" : "Highest"}</div>
              <div class="stat-value price-up">\${formatPrice(stats.maxPrice)}</div>
            </div>
            <div class="stat-item">
              <div class="stat-label">${lang === "es" ? "Cambio" : "Change"}</div>
              <div class="stat-value \${priceChangeClass}">\${priceChangeSign}\${stats.priceChangePercent.toFixed(1)}%</div>
            </div>
            \${goodDeal && goodDeal.isGoodDeal ? \`
              <div class="stat-item">
                <div class="good-deal-badge">🔥 ${lang === "es" ? "Buen Precio" : "Good Deal"}!</div>
              </div>
            \` : ''}
          \`;
        }

        // Render price chart
        function renderChart(productId, history, period) {
          const chartWrapper = document.getElementById(\`chart-wrapper-\${productId}\`);
          const chartEmpty = document.getElementById(\`chart-empty-\${productId}\`);
          const canvas = document.getElementById(\`chart-\${productId}\`);

          // Destroy existing chart if it exists
          if (chartInstances[productId]) {
            chartInstances[productId].destroy();
            delete chartInstances[productId];
          }

          // Show empty state if not enough data
          if (!history || history.length < 2) {
            chartWrapper.style.display = 'none';
            chartEmpty.style.display = 'flex';
            return;
          }

          chartWrapper.style.display = 'block';
          chartEmpty.style.display = 'none';

          // Prepare data (reverse to show oldest first)
          const sortedHistory = [...history].reverse();
          const labels = sortedHistory.map(h => new Date(h.recorded_at));
          const prices = sortedHistory.map(h => parseFloat(h.price));

          // Calculate min/max for better Y axis
          const minPrice = Math.min(...prices);
          const maxPrice = Math.max(...prices);
          const padding = (maxPrice - minPrice) * 0.1 || maxPrice * 0.1;

          // Get theme colors
          const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
          const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
          const textColor = isDark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)';

          // Create gradient
          const ctx = canvas.getContext('2d');
          const gradient = ctx.createLinearGradient(0, 0, 0, 300);
          gradient.addColorStop(0, 'rgba(59, 130, 246, 0.3)');
          gradient.addColorStop(1, 'rgba(59, 130, 246, 0.0)');

          // Create chart
          chartInstances[productId] = new Chart(ctx, {
            type: 'line',
            data: {
              labels: labels,
              datasets: [{
                label: '${lang === "es" ? "Precio" : "Price"}',
                data: prices,
                borderColor: '#3b82f6',
                backgroundColor: gradient,
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 4,
                pointHoverRadius: 6,
                pointBackgroundColor: '#3b82f6',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              interaction: {
                intersect: false,
                mode: 'index'
              },
              plugins: {
                legend: {
                  display: false
                },
                tooltip: {
                  backgroundColor: isDark ? '#1f2937' : '#fff',
                  titleColor: isDark ? '#fff' : '#111',
                  bodyColor: isDark ? '#d1d5db' : '#374151',
                  borderColor: isDark ? '#374151' : '#e5e7eb',
                  borderWidth: 1,
                  padding: 12,
                  displayColors: false,
                  callbacks: {
                    title: function(items) {
                      const date = new Date(items[0].parsed.x);
                      return date.toLocaleDateString('${lang === "es" ? "es-MX" : "en-US"}', {
                        weekday: 'short',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      });
                    },
                    label: function(item) {
                      return '${lang === "es" ? "Precio" : "Price"}: ' + formatPrice(item.parsed.y);
                    }
                  }
                }
              },
              scales: {
                x: {
                  type: 'time',
                  time: {
                    unit: period === '7d' ? 'day' : 'week',
                    displayFormats: {
                      day: 'MMM d',
                      week: 'MMM d'
                    }
                  },
                  grid: {
                    color: gridColor,
                    drawBorder: false
                  },
                  ticks: {
                    color: textColor,
                    maxTicksLimit: 7
                  }
                },
                y: {
                  min: Math.max(0, minPrice - padding),
                  max: maxPrice + padding,
                  grid: {
                    color: gridColor,
                    drawBorder: false
                  },
                  ticks: {
                    color: textColor,
                    callback: function(value) {
                      return '$' + value.toLocaleString();
                    }
                  }
                }
              }
            }
          });
        }

        // Format price helper
        function formatPrice(price) {
          return '$' + parseFloat(price).toLocaleString('${lang === "es" ? "es-MX" : "en-US"}', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          });
        }

        // Remove tracked product with custom confirmation modal
        function removeTrackedProduct(productId) {
          showConfirmModal(
            '${lang === "es" ? "¿Eliminar producto?" : "Remove product?"}',
            '${lang === "es" ? "¿Estás seguro de que quieres dejar de rastrear este producto?" : "Are you sure you want to stop tracking this product?"}',
            async function() {
              try {
                const response = await fetch(\`/api/track/\${productId}\`, {
                  method: 'DELETE',
                  credentials: 'include'
                });

                const data = await response.json();

                if (data.success) {
                  // Refresh the page to show updated list
                  location.reload();
                } else {
                  console.error('[Remove] Error:', data.error);
                  showToast('${lang === "es" ? "Error al eliminar producto" : "Error removing product"}', 'error');
                }
              } catch (error) {
                console.error('[Remove] Exception:', error);
                showToast('${lang === "es" ? "Error al eliminar producto" : "Error removing product"}', 'error');
              }
            }
          );
        }

        // Custom confirmation modal
        function showConfirmModal(title, message, onConfirm) {
          // Remove existing modal if any
          const existingModal = document.getElementById('confirmModal');
          if (existingModal) existingModal.remove();

          const modal = document.createElement('div');
          modal.id = 'confirmModal';
          modal.className = 'confirm-modal-overlay';
          modal.innerHTML = \`
            <div class="confirm-modal">
              <h3>\${title}</h3>
              <p>\${message}</p>
              <div class="confirm-modal-actions">
                <button class="btn-cancel" onclick="closeConfirmModal()">${lang === "es" ? "Cancelar" : "Cancel"}</button>
                <button class="btn-confirm" id="confirmBtn">${lang === "es" ? "Sí, eliminar" : "Yes, remove"}</button>
              </div>
            </div>
          \`;

          document.body.appendChild(modal);

          // Add click handler for confirm button
          document.getElementById('confirmBtn').onclick = function() {
            closeConfirmModal();
            onConfirm();
          };

          // Close on overlay click
          modal.addEventListener('click', function(e) {
            if (e.target === modal) closeConfirmModal();
          });

          // Close on Escape key
          document.addEventListener('keydown', function escHandler(e) {
            if (e.key === 'Escape') {
              closeConfirmModal();
              document.removeEventListener('keydown', escHandler);
            }
          });
        }

        function closeConfirmModal() {
          const modal = document.getElementById('confirmModal');
          if (modal) modal.remove();
        }

        // Toast notification
        function showToast(message, type = 'info') {
          const existingToast = document.querySelector('.toast');
          if (existingToast) existingToast.remove();

          const toast = document.createElement('div');
          toast.className = \`toast toast-\${type}\`;
          toast.textContent = message;
          document.body.appendChild(toast);

          setTimeout(() => toast.remove(), 3000);
        }
      </script>
    `,
        true,
        userEmail,
        lang,
        userData,
      ),
    );
  });

  app.get("/product/:id", authRequired, async (req, res) => {
    const lang = getLang(req);
    const userEmail = req.user?.email || "";
    const userData = await db.get(
      "SELECT * FROM users WHERE id = ?",
      req.user.id,
    );
    const id = String(req.params.id || "");
    const query = String(req.query.q || "").trim();
    const minPrice = parseNumber(req.query.minPrice, 0);
    const maxPrice = parseNumber(req.query.maxPrice, 50000);
    const sort = String(req.query.sort || "price_asc");
    const source = String(req.query.source || "all");
    const page = Math.max(parseNumber(req.query.page, 1), 1);

    // Use combined product fetcher that handles both ML and Amazon
    const result = await fetchProductById(id);
    const product = result.product;

    if (!product) {
      return res.send(
        renderPage(
          t(lang, "productNotFound"),
          `
        <div class="breadcrumb">
          <a href="/">${t(lang, "home")}</a>
          <span> / </span>
          <a href="${buildSearchParams("/", { q: query, minPrice, maxPrice, sort, source, page })}">${t(lang, "searchResults")}</a>
          <span> / ${t(lang, "product")}</span>
        </div>
        <h1>${t(lang, "productNotFound")}</h1>
        ${result.error ? `<p class="error">${result.error}</p>` : ""}
        <p class="muted">${t(lang, "tryGoingBack")}</p>
      `,
          "",
          true,
          userEmail,
          lang,
          userData,
        ),
      );
    }

    const description = product.description || "";
    const condition =
      product.condition === "new" || product.condition === "New"
        ? t(lang, "new")
        : product.condition === "used" || product.condition === "Used"
          ? t(lang, "used")
          : product.condition;
    const available = product.available_quantity || 0;
    const isAmazon = product.source === "amazon" || id.startsWith("AMZN-");

    // Get appropriate retailer badge and button text
    const retailerBadge = isAmazon
      ? `<div class="retailer-badge amazon-badge"><img src="https://upload.wikimedia.org/wikipedia/commons/a/a9/Amazon_logo.svg" alt="Amazon" style="height: 20px;" /></div>`
      : `<div class="retailer-badge ml-badge"><img src="https://http2.mlstatic.com/frontend-assets/ml-web-navigation/ui-navigation/5.21.22/mercadolibre/logo__large_plus.png" alt="Mercado Libre" style="height: 24px;" /></div>`;

    const viewButtonText = isAmazon ? "View on Amazon" : t(lang, "viewOnML");

    // Check if user is tracking this product and get price statistics
    let trackedProduct = null;
    let priceStats = null;
    let isGoodDeal = false;

    try {
      const trackedProducts = await supabaseDb.getTrackedProducts(req.user.id);
      trackedProduct = trackedProducts.find((tp) => tp.product_id === id);

      if (trackedProduct) {
        priceStats = await supabaseDb.getPriceStatistics(
          trackedProduct.id,
          "30d",
        );
        isGoodDeal = priceStats?.isGoodDeal || false;
      }
    } catch (err) {
      console.error("[Product Detail] Error fetching tracking status:", err);
    }

    // Generate price statistics HTML
    const priceStatsHtml = priceStats
      ? `
      <div class="price-stats-section">
        <h3>${lang === "es" ? "Estadísticas de Precio (30 días)" : "Price Statistics (30 days)"}</h3>
        ${isGoodDeal ? `<div class="good-deal-badge good-deal-badge-large">${lang === "es" ? "Buen Precio" : "Good Deal"} - ${priceStats.savingsPercent.toFixed(1)}% ${lang === "es" ? "menos" : "off"}</div>` : ""}
        <div class="price-stats-component">
          <div class="price-stat-item">
            <div class="price-stat-label">${lang === "es" ? "Actual" : "Current"}</div>
            <div class="price-stat-value current">${formatPrice(priceStats.currentPrice, "MXN")}</div>
          </div>
          <div class="price-stat-item">
            <div class="price-stat-label">${lang === "es" ? "Promedio" : "Average"}</div>
            <div class="price-stat-value">${formatPrice(priceStats.avgPrice, "MXN")}</div>
          </div>
          <div class="price-stat-item">
            <div class="price-stat-label">${lang === "es" ? "Mínimo" : "Lowest"}</div>
            <div class="price-stat-value good">${formatPrice(priceStats.minPrice, "MXN")}</div>
          </div>
          <div class="price-stat-item">
            <div class="price-stat-label">${lang === "es" ? "Máximo" : "Highest"}</div>
            <div class="price-stat-value expensive">${formatPrice(priceStats.maxPrice, "MXN")}</div>
          </div>
        </div>
        <div class="price-change-section">
          <span>${lang === "es" ? "Cambio de precio:" : "Price change:"}</span>
          <span class="price-change ${priceStats.priceChange > 0 ? "up" : priceStats.priceChange < 0 ? "down" : "neutral"}">
            <span class="price-change-arrow">${priceStats.priceChange > 0 ? "↑" : priceStats.priceChange < 0 ? "↓" : "→"}</span>
            ${priceStats.priceChange > 0 ? "+" : ""}${priceStats.priceChangePercent.toFixed(1)}%
          </span>
        </div>
      </div>
    `
      : "";

    // Generate tracking button text based on status
    const trackButtonText = trackedProduct
      ? lang === "es"
        ? "Ya rastreando"
        : "Already Tracking"
      : `📊 ${t(lang, "trackPrice")}`;
    const trackButtonClass = trackedProduct
      ? "action-button secondary tracked"
      : "action-button secondary";

    res.send(
      renderPage(
        product.title || t(lang, "product"),
        `
      <div class="breadcrumb">
        <a href="/">${t(lang, "home")}</a>
        <span> / </span>
        <a href="${buildSearchParams("/", { q: query, minPrice, maxPrice, sort, source, page })}">${t(lang, "searchResults")}</a>
        <span> / ${t(lang, "product")}</span>
      </div>
      ${result.notice ? `<div class="notice">${result.notice}</div>` : ""}
      <div class="product-detail">
        <div class="product-image-container">
          <img class="product-image" src="${product.thumbnail || ""}" alt="${product.title || t(lang, "product")}" />
          ${isGoodDeal ? `<div class="good-deal-badge good-deal-badge-card">${lang === "es" ? "Buen Precio" : "Good Deal"}</div>` : ""}
        </div>
        <div class="product-info">
          <h1>${product.title || t(lang, "product")}</h1>
          ${retailerBadge}
          <div class="product-price-section">
            <div class="product-price">${formatPrice(product.price, product.currency_id || (isAmazon ? "USD" : "MXN"))}</div>
            ${
              priceStats && priceStats.avgPrice > product.price
                ? `
              <div class="product-price-comparison">
                <span class="avg-label">${lang === "es" ? "Promedio:" : "Avg:"}</span>
                <span class="avg-value">${formatPrice(priceStats.avgPrice, "MXN")}</span>
              </div>
            `
                : ""
            }
          </div>
          <div class="product-meta">
            <span class="condition">${condition}</span>
            ${available > 0 ? `<span class="stock">· ${available} ${t(lang, "available")}</span>` : `<span class="stock out">· ${t(lang, "outOfStock")}</span>`}
          </div>
          ${product.brand ? `<div class="seller-info"><strong>${product.brand}</strong></div>` : ""}
          ${product.seller?.nickname ? `<div class="seller-info">${t(lang, "soldBy")}: <strong>${product.seller.nickname}</strong></div>` : ""}

          ${priceStatsHtml}

          <p>${description}</p>
          <div class="product-actions">
            ${product.permalink ? `<a class="action-button ${isAmazon ? "amazon-btn" : ""}" href="${product.permalink}" target="_blank" rel="noreferrer">${viewButtonText}</a>` : ""}
            ${
              trackedProduct
                ? `<a href="/dashboard" class="action-button secondary tracked">✓ ${lang === "es" ? "Ver en Panel" : "View in Dashboard"}</a>`
                : `<button class="action-button secondary" id="trackPriceBtn">📊 ${t(lang, "trackPrice")}</button>`
            }
          </div>
        </div>
      </div>
    `,
        `
      <style>
        .product-detail {
          display: grid;
          grid-template-columns: 1fr;
          gap: 24px;
        }
        @media (min-width: 768px) {
          .product-detail {
            grid-template-columns: 1fr 1fr;
            gap: 40px;
          }
        }
        .product-image-container {
          position: relative;
        }
        .product-image-container .good-deal-badge-card {
          position: absolute;
          top: 16px;
          left: 16px;
        }
        .product-meta { margin: 8px 0 16px; font-size: 14px; color: #666; }
        .condition { background: #e8f5e9; color: #2e7d32; padding: 4px 8px; border-radius: 4px; }
        .stock { margin-left: 8px; }
        .stock.out { color: #c62828; }
        .seller-info { margin: 12px 0; font-size: 14px; color: #555; }
        .retailer-badge.amazon-badge { background: #232f3e; }
        .retailer-badge.ml-badge { background: #ffe600; }
        .action-button.amazon-btn { background: #ff9900; color: #111; }
        .action-button.amazon-btn:hover { background: #e88b00; }
        .action-button.tracked { background: #dcfce7; color: #16a34a; border-color: #16a34a; }
        .action-button.tracked:hover { background: #bbf7d0; }

        /* Price Section */
        .product-price-section {
          display: flex;
          align-items: baseline;
          gap: 12px;
          flex-wrap: wrap;
        }
        .product-price-comparison {
          font-size: 14px;
          color: var(--text-muted);
        }
        .product-price-comparison .avg-value {
          text-decoration: line-through;
          color: #ef4444;
        }

        /* Price Stats Section */
        .price-stats-section {
          margin: 24px 0;
          padding: 20px;
          background: var(--bg-secondary);
          border-radius: var(--radius-lg);
          border: 1px solid var(--border-color);
        }
        .price-stats-section h3 {
          font-size: 16px;
          margin: 0 0 16px 0;
          color: var(--text-primary);
        }
        .price-stats-section .good-deal-badge-large {
          margin-bottom: 16px;
        }
        .price-change-section {
          margin-top: 16px;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          color: var(--text-muted);
        }
      </style>
      <script>
        // Product data stored safely in JavaScript object
        const productData = {
          id: ${JSON.stringify(product.id)},
          title: ${JSON.stringify(product.title || "Unknown Product")},
          url: ${JSON.stringify(product.permalink || "")},
          source: ${JSON.stringify(product.source || "mercadolibre")},
          price: ${product.price || 0}
        };

        // Wait for DOM to be ready
        document.addEventListener('DOMContentLoaded', function() {
          const trackBtn = document.getElementById('trackPriceBtn');
          if (trackBtn) {
            trackBtn.addEventListener('click', async function() {
              console.log('[TrackProduct] Starting to track product...');
              console.log('[TrackProduct] Product Data:', productData);

              try {
                const payload = {
                  productId: productData.id,
                  productTitle: productData.title,
                  productUrl: productData.url,
                  source: productData.source,
                  currentPrice: productData.price
                };
                console.log('[TrackProduct] Sending payload:', JSON.stringify(payload, null, 2));

                const res = await fetch('/api/track', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify(payload)
                });

                console.log('[TrackProduct] Response status:', res.status);
                const data = await res.json();
                console.log('[TrackProduct] Response data:', JSON.stringify(data, null, 2));

                if (data.success) {
                  console.log('[TrackProduct] Success! Redirecting to dashboard...');
                  window.location.href = '/dashboard';
                } else {
                  console.error('[TrackProduct] Error from server:', data.error);
                  alert('Error: ' + (data.error || 'Could not track product'));
                }
              } catch (err) {
                console.error('[TrackProduct] Exception:', err);
                alert('Error: ' + err.message);
              }
            });
          }
        });
      </script>
    `,
        true,
        userEmail,
        lang,
        userData,
      ),
    );
  });

  app.get("/api/me", authRequired, async (req, res) => {
    const user = await db.get(
      "SELECT email FROM users WHERE id = ?",
      req.user.id,
    );
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    res.json({ email: user.email });
  });

  // ============================================
  // PRICE TRACKING ENDPOINTS
  // ============================================

  /**
   * API: Track a product for price monitoring
   * URL: POST /api/track
   */
  app.post("/api/track", authRequired, async (req, res) => {
    console.log("[Track API] Received request");
    console.log("[Track API] User ID:", req.user.id);
    console.log("[Track API] Request body:", JSON.stringify(req.body, null, 2));

    try {
      const { productId, productTitle, productUrl, source, currentPrice } =
        req.body;
      const userId = req.user.id;

      console.log("[Track API] Extracted fields:");
      console.log("  - productId:", productId);
      console.log("  - productTitle:", productTitle);
      console.log("  - productUrl:", productUrl);
      console.log("  - source:", source);
      console.log("  - currentPrice:", currentPrice);

      if (!productId || !source) {
        console.log("[Track API] Missing required fields");
        return res
          .status(400)
          .json({ success: false, error: "Missing required fields" });
      }

      console.log("[Track API] Calling addTrackedProduct...");
      const tracked = await supabaseDb.addTrackedProduct({
        userId,
        productId,
        productTitle: productTitle || "Unknown Product",
        productUrl: productUrl || "",
        source,
        targetPrice: null,
        currentPrice: currentPrice || 0,
      });

      console.log(
        "[Track API] addTrackedProduct result:",
        JSON.stringify(tracked, null, 2),
      );

      if (tracked) {
        // Also record initial price in history
        console.log("[Track API] Recording initial price in history...");
        await supabaseDb.addPriceHistory(tracked.id, currentPrice || 0);
        console.log("[Track API] Price history recorded");
      }

      console.log("[Track API] Sending success response");
      res.json({ success: true, tracked });
    } catch (error) {
      console.error("[Track API] Error:", error);
      console.error("[Track API] Error stack:", error.stack);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * API: Get user's tracked products
   * URL: GET /api/track
   */
  app.get("/api/track", authRequired, async (req, res) => {
    try {
      const products = await supabaseDb.getTrackedProducts(req.user.id);
      res.json({ success: true, products });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * API: Remove tracked product
   * URL: DELETE /api/track/:id
   */
  app.delete("/api/track/:id", authRequired, async (req, res) => {
    try {
      const success = await supabaseDb.removeTrackedProduct(
        req.params.id,
        req.user.id,
      );
      res.json({ success });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
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
  app.get("/api/products/search", function (req, res) {
    // Log the API call
    logAction(
      "API Request",
      `/api/products/search?q=${req.query.q}`,
      function () {
        console.log("  Request logged successfully");
      },
    );

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
        example: "/api/products/search?q=iphone",
      });
    }

    // Async operation with callback pattern (using .then)
    fetchMLProducts({ query, minPrice, maxPrice, sort, page, pageSize })
      .then(function (results) {
        // ← SUCCESS CALLBACK
        res.json({
          success: true,
          query: query,
          site: ML_SITE,
          filters: { minPrice, maxPrice, sort },
          pagination: {
            page: page,
            pageSize: pageSize,
            total: results.total,
            totalPages: results.totalPages,
          },
          products: results.products,
          notice: results.notice,
        });
      })
      .catch(function (error) {
        // ← ERROR CALLBACK
        res.status(500).json({
          success: false,
          error: error.message || "Error al buscar productos",
        });
      });
  });

  /**
   * API: Get product by ID with callback pattern
   * URL: GET /api/products/:id
   * Example: GET /api/products/MLM-001
   */
  app.get("/api/products/:id", function (req, res) {
    const id = String(req.params.id || "");

    if (!id) {
      return res.status(400).json({
        success: false,
        error: "Se requiere el ID del producto",
      });
    }

    // Async operation with callback
    fetchMLProductById(id)
      .then(function (result) {
        // ← SUCCESS CALLBACK
        if (!result.product) {
          return res.status(404).json({
            success: false,
            error: "Producto no encontrado",
            id: id,
          });
        }

        res.json({
          success: true,
          product: result.product,
          notice: result.notice,
        });
      })
      .catch(function (error) {
        // ← ERROR CALLBACK
        res.status(500).json({
          success: false,
          error: error.message || "Error al obtener el producto",
        });
      });
  });

  /**
   * API: Get all demo products
   * URL: GET /api/products
   */
  app.get("/api/products", function (req, res) {
    try {
      const products = getMockProducts();

      // Simulate async operation with setTimeout
      setTimeout(function () {
        // ← CALLBACK after delay
        res.json({
          success: true,
          count: products.length,
          products: products,
          site: ML_SITE,
          note: "",
        });
      }, 100); // Small delay to simulate network
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * API: Get Mercado Libre categories
   * URL: GET /api/categories
   */
  app.get("/api/categories", async function (req, res) {
    try {
      const categories = await fetchMLCategories();
      res.json({
        success: true,
        site: ML_SITE,
        categories: categories,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message || "Error al obtener categorías",
      });
    }
  });

  /**
   * API: Health check endpoint
   * URL: GET /api/health
   */
  app.get("/api/health", async function (req, res) {
    const startTime = Date.now();

    // Check ML API connection
    const mlToken = await getMLAccessToken();
    const mlStatus = mlToken ? "connected" : "not configured";

    // Check database with callback
    db.get("SELECT 1 as status", function (error, result) {
      const responseTime = Date.now() - startTime;

      if (error) {
        return res.status(500).json({
          success: false,
          status: "unhealthy",
          error: "Database connection failed",
        });
      }

      res.json({
        success: true,
        status: "healthy",
        database: result ? "connected" : "disconnected",
        mercadoLibre: {
          status: mlStatus,
          site: ML_SITE,
          clientId: ML_CLIENT_ID
            ? `${ML_CLIENT_ID.substring(0, 6)}...`
            : "not set",
        },
        responseTime: `${responseTime}ms`,
        https: HAS_TLS,
        baseUrl: APP_BASE_URL,
      });
    });
  });

  // ============================================
  // DEALS API ENDPOINTS - For Home Page Filtering
  // ============================================

  /**
   * API: Get popular products with optional deals filter
   * URL: GET /api/deals/popular?dealsOnly=true&category=electronics
   */
  app.get("/api/deals/popular", authRequired, async function (req, res) {
    const lang = getLang(req);
    const dealsOnly = req.query.dealsOnly === "true";
    const category = req.query.category || "";

    try {
      const products = await supabaseDb.getPopularProducts({
        limit: 8,
        category,
        dealsOnly,
      });

      // Render product cards HTML
      const html = products
        .map((product) => {
          const badges = [];
          if (product.isBestPrice) {
            badges.push(
              `<span class="badge-best-price">${lang === "es" ? "Mejor Precio" : "Best Price"}</span>`,
            );
          } else if (product.isGoodDeal) {
            badges.push(
              `<span class="good-deal-badge">${lang === "es" ? "Buen Precio" : "Good Deal"}</span>`,
            );
          }

          return `
          <div class="home-product-card">
            <a href="/product/${encodeURIComponent(product.product_id)}?source=${product.source || "mercadolibre"}" class="home-product-card-link">
              <div class="home-product-card-image">
                ${badges.length > 0 ? `<div class="home-product-card-badges">${badges.join("")}</div>` : ""}
                <img src="${product.product_url?.includes("amazon") ? "/images/product-placeholder.svg" : `https://http2.mlstatic.com/D_NQ_NP_${product.product_id?.split("-")[1] || ""}-O.webp`}"
                     alt="${product.product_title || ""}"
                     loading="lazy"
                     onerror="this.src='/images/product-placeholder.svg'" />
              </div>
              <div class="home-product-card-content">
                <h4 class="home-product-card-title">${product.product_title || (lang === "es" ? "Producto" : "Product")}</h4>
                <div class="home-product-card-pricing">
                  <span class="home-product-card-price">${formatPrice(product.current_price, "MXN")}</span>
                  ${product.avgPrice ? `<span class="home-product-card-original">${formatPrice(product.avgPrice, "MXN")}</span>` : ""}
                </div>
                ${
                  product.savingsPercent
                    ? `
                  <div class="home-product-card-savings">
                    ${lang === "es" ? "Ahorras" : "Save"} ${Math.round(product.savingsPercent)}%
                  </div>
                `
                    : ""
                }
                ${
                  product.trackCount
                    ? `
                  <div class="home-product-card-meta">
                    <span class="home-product-card-trackers">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                        <circle cx="9" cy="7" r="4"/>
                      </svg>
                      ${product.trackCount} ${lang === "es" ? "siguiendo" : "tracking"}
                    </span>
                  </div>
                `
                    : ""
                }
              </div>
            </a>
          </div>
        `;
        })
        .join("");

      res.send(
        html ||
          `<p class="muted">${lang === "es" ? "No hay productos" : "No products found"}</p>`,
      );
    } catch (error) {
      console.error("[API] /api/deals/popular error:", error);
      res
        .status(500)
        .send(
          `<p class="error">${lang === "es" ? "Error al cargar productos" : "Error loading products"}</p>`,
        );
    }
  });

  /**
   * API: Get top price drops with period filter
   * URL: GET /api/deals/price-drops?period=daily&category=electronics
   */
  app.get("/api/deals/price-drops", authRequired, async function (req, res) {
    const lang = getLang(req);
    const period = req.query.period || "recent";
    const category = req.query.category || "";

    try {
      const products = await supabaseDb.getTopPriceDrops({
        period,
        category,
        limit: 8,
      });

      // Render product cards HTML
      const html = products
        .map((product) => {
          const badges = [];
          if (product.dropPercent) {
            badges.push(
              `<span class="drop-badge">${lang === "es" ? "Bajó" : "Down"} ${Math.round(product.dropPercent)}%</span>`,
            );
          }

          return `
          <div class="home-product-card">
            <a href="/product/${encodeURIComponent(product.product_id)}?source=${product.source || "mercadolibre"}" class="home-product-card-link">
              <div class="home-product-card-image">
                ${badges.length > 0 ? `<div class="home-product-card-badges">${badges.join("")}</div>` : ""}
                <img src="${product.product_url?.includes("amazon") ? "/images/product-placeholder.svg" : `https://http2.mlstatic.com/D_NQ_NP_${product.product_id?.split("-")[1] || ""}-O.webp`}"
                     alt="${product.product_title || ""}"
                     loading="lazy"
                     onerror="this.src='/images/product-placeholder.svg'" />
              </div>
              <div class="home-product-card-content">
                <h4 class="home-product-card-title">${product.product_title || (lang === "es" ? "Producto" : "Product")}</h4>
                <div class="home-product-card-pricing">
                  <span class="home-product-card-price">${formatPrice(product.current_price, "MXN")}</span>
                  ${product.previousPrice ? `<span class="home-product-card-original">${formatPrice(product.previousPrice, "MXN")}</span>` : ""}
                </div>
                ${
                  product.dropAmount
                    ? `
                  <div class="home-product-card-savings">
                    ${lang === "es" ? "Bajó" : "Down"} ${formatPrice(product.dropAmount, "MXN")}
                  </div>
                `
                    : ""
                }
              </div>
            </a>
          </div>
        `;
        })
        .join("");

      res.send(
        html ||
          `<p class="muted">${lang === "es" ? "No hay bajas de precio" : "No price drops found"}</p>`,
      );
    } catch (error) {
      console.error("[API] /api/deals/price-drops error:", error);
      res
        .status(500)
        .send(
          `<p class="error">${lang === "es" ? "Error al cargar productos" : "Error loading products"}</p>`,
        );
    }
  });

  // ============================================
  // ADMIN ENDPOINTS - Queue Management
  // ============================================

  /**
   * Admin middleware - requires authenticated user
   * In production, add additional admin role check
   */
  function requireAdmin(req, res, next) {
    const token = req.cookies.token;
    if (!token) {
      return res
        .status(401)
        .json({ success: false, error: "Authentication required" });
    }

    try {
      const payload = jwt.verify(token, JWT_SECRET);
      req.user = payload;
      // TODO: Add admin role check here when roles are implemented
      return next();
    } catch (error) {
      return res.status(401).json({ success: false, error: "Invalid token" });
    }
  }

  /**
   * API: Trigger manual price update
   * URL: POST /api/admin/trigger-price-update
   */
  app.post(
    "/api/admin/trigger-price-update",
    requireAdmin,
    async function (req, res) {
      try {
        const job = await triggerPriceUpdate();
        res.json({
          success: true,
          message: "Price update job queued",
          jobId: job.id,
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    },
  );

  /**
   * API: Get queue status
   * URL: GET /api/admin/queue-status
   */
  app.get("/api/admin/queue-status", requireAdmin, async function (req, res) {
    try {
      const status = await getQueueStatus();
      const recentJobs = await getRecentJobs(10);

      res.json({
        success: true,
        status,
        recentJobs,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * API: Get price history for a tracked product
   * URL: GET /api/tracked/:id/history
   * Query params:
   *   - period: '7d', '30d', or 'all' (default: '30d')
   *   - limit: max number of records (default: 100)
   *   - noCache: set to 'true' to bypass cache
   */
  app.get("/api/tracked/:id/history", authRequired, async function (req, res) {
    try {
      const { id } = req.params;
      const period = req.query.period || "30d";
      const limit = parseInt(req.query.limit) || 100;
      const noCache = req.query.noCache === "true";

      // Validate period
      const validPeriods = ["7d", "30d", "all"];
      if (!validPeriods.includes(period)) {
        return res.status(400).json({
          success: false,
          error: `Invalid period. Must be one of: ${validPeriods.join(", ")}`,
        });
      }

      // Try to get from cache first (unless noCache is set)
      const {
        getCache,
        setCache,
        priceHistoryCacheKey,
      } = require("./config/redis");
      const cacheKey = priceHistoryCacheKey(id, period);

      if (!noCache) {
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
          return res.json({
            ...cachedData,
            cached: true,
          });
        }
      }

      // Fetch from database
      const history = await supabaseDb.getPriceHistory(id, { period, limit });
      const statistics = await supabaseDb.getPriceStatistics(id, period);

      const responseData = {
        success: true,
        trackedProductId: id,
        period,
        history,
        statistics,
        goodDeal: statistics
          ? {
              isGoodDeal: statistics.isGoodDeal,
              message: statistics.isGoodDeal
                ? `Great deal! ${statistics.savingsPercent.toFixed(1)}% below average price`
                : "Price is at or above average",
              savingsFromAvg: statistics.savingsFromAvg,
              savingsPercent: statistics.savingsPercent,
            }
          : null,
      };

      // Cache the response (30 minutes TTL)
      await setCache(cacheKey, responseData);

      res.json({
        ...responseData,
        cached: false,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * API: Get price statistics only (lightweight endpoint)
   * URL: GET /api/tracked/:id/stats
   */
  app.get("/api/tracked/:id/stats", authRequired, async function (req, res) {
    try {
      const { id } = req.params;
      const period = req.query.period || "30d";

      // Validate period
      const validPeriods = ["7d", "30d", "all"];
      if (!validPeriods.includes(period)) {
        return res.status(400).json({
          success: false,
          error: `Invalid period. Must be one of: ${validPeriods.join(", ")}`,
        });
      }

      const statistics = await supabaseDb.getPriceStatistics(id, period);

      if (!statistics) {
        return res.status(404).json({
          success: false,
          error: "No price history found for this product",
        });
      }

      res.json({
        success: true,
        trackedProductId: id,
        period,
        statistics,
        goodDeal: {
          isGoodDeal: statistics.isGoodDeal,
          message: statistics.isGoodDeal
            ? `Great deal! ${statistics.savingsPercent.toFixed(1)}% below average price`
            : "Price is at or above average",
          savingsFromAvg: statistics.savingsFromAvg,
          savingsPercent: statistics.savingsPercent,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
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
