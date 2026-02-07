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
const { getQueueStatus, getRecentJobs } = require("./queue");
const { scrapeProducts } = require("./apify");
const { extractProductSpecs, generateEnhancedTitle } = require("./product-spec-extractor");

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
  "[Config] REDIS_URL:",
  process.env.REDIS_URL ? "✓ Set" : "✗ Not set",
);

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

// ============================================
// CATEGORY SYSTEM CONFIGURATION
// ============================================
const CATEGORIES = {
  electronics: {
    id: "electronics",
    name: { en: "Electronics", es: "Electrónica" },
    icon: "📱",
    keywords: [
      // General electronics
      "electronic",
      "electrónico",
      "device",
      "gadget",
      // Tablets & E-readers
      "tablet",
      "ipad",
      "kindle",
      "e-reader",
      // Audio devices
      "headphone",
      "earbud",
      "airpods",
      "speaker",
      "audífonos",
      "bocina",
      // TVs & Monitors
      "tv",
      "television",
      "televisor",
      "monitor",
      "smart tv",
      // Cameras & Photography
      "camera",
      "cámara",
      "gopro",
      "photography",
      // Smart home
      "smart home",
      "alexa",
      "google home",
      "smart speaker",
      // Gaming accessories (non-console)
      "gaming keyboard",
      "gaming mouse",
      // Wearables
      "smartwatch",
      "fitness tracker",
      "watch",
      "reloj inteligente",
      // VR & AR (moved from toys - these are electronics)
      "vr headset",
      "virtual reality",
      "vr",
      "oculus",
      "meta quest",
      "psvr",
      "playstation vr",
      "htc vive",
      "ar glasses",
      "augmented reality",
    ],
  },
  phones: {
    id: "phones",
    name: { en: "Phones", es: "Teléfonos" },
    icon: "📱",
    keywords: [
      "phone",
      "iphone",
      "samsung",
      "celular",
      "smartphone",
      "teléfono",
      "móvil",
      "android",
      "xiaomi",
      "motorola",
      "huawei",
      "pixel",
      "galaxy",
    ],
  },
  computers: {
    id: "computers",
    name: { en: "Computers", es: "Computadoras" },
    icon: "💻",
    keywords: [
      "computer",
      "computadora",
      "laptop",
      "pc",
      "macbook",
      "desktop",
      "notebook",
      "chromebook",
      "imac",
      "processor",
      "procesador",
      "ram",
      "ssd",
      "hard drive",
    ],
  },
  "home-kitchen": {
    id: "home-kitchen",
    name: { en: "Home & Kitchen", es: "Hogar y Cocina" },
    icon: "🏠",
    keywords: [
      // General
      "hogar",
      "home",
      "casa",
      "furniture",
      "muebles",
      // Bedroom furniture
      "bed",
      "cama",
      "colchón",
      "mattress",
      "pillow",
      "almohada",
      "cojín",
      "cushion",
      "bedding",
      "ropa de cama",
      "nightstand",
      "mesita de noche",
      "dresser",
      "cómoda",
      "wardrobe",
      "armario",
      "closet",
      // Living room furniture
      "sofa",
      "sofá",
      "couch",
      "chair",
      "silla",
      "sillón",
      "armchair",
      "table",
      "mesa",
      "coffee table",
      "mesa de centro",
      "tv stand",
      "mueble tv",
      "bookshelf",
      "estante",
      "shelf",
      "repisa",
      // Office furniture
      "desk",
      "escritorio",
      "office chair",
      "silla oficina",
      "filing cabinet",
      "archivero",
      // Kitchen appliances
      "kitchen",
      "cocina",
      "refrigerator",
      "refrigerador",
      "microwave",
      "microondas",
      "oven",
      "horno",
      "stove",
      "estufa",
      "blender",
      "licuadora",
      "mixer",
      "batidora",
      "toaster",
      "tostador",
      "coffee maker",
      "cafetera",
      "air fryer",
      "freidora de aire",
      // Cleaning appliances
      "vacuum",
      "aspiradora",
      "dyson",
      "mop",
      "trapeador",
      "steam cleaner",
      "limpiadora vapor",
      // Laundry
      "washing machine",
      "lavadora",
      "dryer",
      "secadora",
      "iron",
      "plancha",
      // Home decor
      "lamp",
      "lámpara",
      "light",
      "luz",
      "curtain",
      "cortina",
      "rug",
      "alfombra",
      "carpet",
      "tapete",
      "mirror",
      "espejo",
      "picture frame",
      "marco",
      "vase",
      "florero",
      "decoration",
      "decoración",
      // Storage & organization
      "storage",
      "almacenamiento",
      "organizer",
      "organizador",
      "basket",
      "canasta",
      "box",
      "caja",
      "container",
      "contenedor",
    ],
  },
  clothing: {
    id: "clothing",
    name: { en: "Clothing", es: "Ropa" },
    icon: "👗",
    keywords: [
      // General clothing
      "clothing",
      "ropa",
      "fashion",
      "moda",
      // Specific items
      "shirt",
      "t-shirt",
      "camisa",
      "camiseta",
      "pants",
      "pantalones",
      "jeans",
      "dress",
      "vestido",
      "skirt",
      "falda",
      "jacket",
      "chamarra",
      "sweater",
      "suéter",
      // Footwear
      "shoes",
      "zapatos",
      "sneakers",
      "tenis",
      "boots",
      "botas",
      // Brands
      "adidas",
      "nike",
      "zara",
      "h&m",
      "uniqlo",
    ],
  },
  "sports-outdoors": {
    id: "sports-outdoors",
    name: { en: "Sports & Outdoors", es: "Deportes" },
    icon: "⚽",
    keywords: [
      // General
      "deportes",
      "sports",
      "athletic",
      "atlético",
      // Ball sports
      "basketball",
      "baloncesto",
      "balón",
      "ball",
      "futbol",
      "soccer",
      "football",
      "americano",
      "tennis",
      "tenis",
      "volleyball",
      "voleibol",
      "baseball",
      "béisbol",
      "golf",
      "ping pong",
      "table tennis",
      // Racquet sports
      "racquet",
      "raqueta",
      "badminton",
      "squash",
      // Fitness & gym
      "fitness",
      "gym",
      "gimnasio",
      "exercise",
      "ejercicio",
      "workout",
      "entrenamiento",
      "dumbbell",
      "mancuerna",
      "pesas",
      "weight",
      "barbell",
      "barra",
      "kettlebell",
      "pesa rusa",
      "resistance band",
      "banda resistencia",
      "bench",
      "banco",
      "treadmill",
      "caminadora",
      "elliptical",
      "elíptica",
      "stationary bike",
      "bicicleta estática",
      "rowing machine",
      "remo",
      // Yoga & pilates
      "yoga",
      "mat",
      "tapete",
      "colchoneta",
      "pilates",
      "foam roller",
      "rodillo",
      "meditation",
      "meditación",
      // Running & cycling
      "running",
      "correr",
      "jogging",
      "runner",
      "corredor",
      "cycling",
      "ciclismo",
      "bicycle",
      "bicicleta",
      "bike",
      "helmet",
      "casco",
      // Swimming
      "swimming",
      "natación",
      "swimsuit",
      "traje de baño",
      "goggles",
      "lentes",
      "pool",
      "alberca",
      // Combat sports
      "boxing",
      "boxeo",
      "gloves",
      "guantes",
      "punching bag",
      "costal",
      "martial arts",
      "artes marciales",
      "karate",
      "taekwondo",
      "judo",
      // Outdoor activities
      "outdoor",
      "aire libre",
      "camping",
      "campamento",
      "hiking",
      "senderismo",
      "trekking",
      "tent",
      "tienda de campaña",
      "sleeping bag",
      "saco de dormir",
      "backpack",
      "mochila",
      "hiking boots",
      "botas",
      "compass",
      "brújula",
      "flashlight",
      "linterna",
      "cooler",
      "hielera",
      // Fishing & hunting
      "fishing",
      "pesca",
      "rod",
      "caña",
      "reel",
      "carrete",
      "lure",
      "señuelo",
      // Winter sports
      "ski",
      "esquí",
      "snowboard",
      "skating",
      "patinaje",
      "ice skates",
      "patines",
      // Water sports
      "kayak",
      "paddle",
      "remo",
      "surfing",
      "surf",
      "snorkeling",
      "esnórquel",
      // Team sports gear
      "jersey",
      "playera",
      "uniform",
      "uniforme",
      "shin guards",
      "espinilleras",
      "knee pads",
      "rodilleras",
      // Sports accessories
      "sports bag",
      "maleta deportiva",
      "water bottle",
      "botella",
      "towel",
      "toalla",
      "stopwatch",
      "cronómetro",
      "whistle",
      "silbato",
    ],
  },
  beauty: {
    id: "beauty",
    name: { en: "Beauty", es: "Belleza" },
    icon: "💄",
    keywords: [
      // General
      "beauty",
      "belleza",
      "cosmetics",
      "cosméticos",
      "personal care",
      "cuidado personal",
      // Skincare - cleansing
      "skincare",
      "cuidado de la piel",
      "cleanser",
      "limpiador",
      "face wash",
      "jabón facial",
      "makeup remover",
      "desmaquillante",
      "toner",
      "tónico",
      "exfoliator",
      "exfoliante",
      "scrub",
      "facial scrub",
      // Skincare - treatment
      "serum",
      "essence",
      "esencia",
      "ampoule",
      "ampolla",
      "treatment",
      "tratamiento",
      "retinol",
      "vitamin c",
      "vitamina c",
      "hyaluronic acid",
      "ácido hialurónico",
      "niacinamide",
      "niacinamida",
      "aha",
      "bha",
      "salicylic acid",
      "ácido salicílico",
      // Skincare - moisturizing
      "moisturizer",
      "hidratante",
      "crema",
      "cream",
      "lotion",
      "loción",
      "gel",
      "emulsion",
      "emulsión",
      "eye cream",
      "contorno de ojos",
      "night cream",
      "crema noche",
      "day cream",
      "crema día",
      // Sun protection
      "sunscreen",
      "protector solar",
      "spf",
      "sun protection",
      // Masks & treatments
      "face mask",
      "mascarilla",
      "sheet mask",
      "clay mask",
      "arcilla",
      "peel off",
      "sleeping mask",
      "overnight mask",
      // Makeup - face
      "makeup",
      "maquillaje",
      "foundation",
      "base",
      "bb cream",
      "cc cream",
      "primer",
      "prebase",
      "concealer",
      "corrector",
      "powder",
      "polvo",
      "blush",
      "rubor",
      "bronzer",
      "bronceador",
      "highlighter",
      "iluminador",
      "contour",
      "setting spray",
      "fijador",
      // Makeup - eyes
      "eyeshadow",
      "sombra",
      "palette",
      "paleta",
      "eyeliner",
      "delineador",
      "mascara",
      "máscara",
      "pestañas",
      "eyebrow",
      "ceja",
      "brow pencil",
      "lápiz cejas",
      "brow gel",
      "gel cejas",
      // Makeup - lips
      "lipstick",
      "lápiz labial",
      "labial",
      "lip gloss",
      "brillo labios",
      "lip liner",
      "delineador labios",
      "lip balm",
      "bálsamo labial",
      "lip tint",
      "tinta labios",
      "matte lipstick",
      // Makeup tools
      "brush",
      "brocha",
      "makeup brush",
      "sponge",
      "esponja",
      "beauty blender",
      "eyelash curler",
      "rizador pestañas",
      // Fragrance
      "perfume",
      "fragrance",
      "cologne",
      "colonia",
      "eau de parfum",
      "eau de toilette",
      "body mist",
      "spray corporal",
      "essential oil",
      "aceite esencial",
      // Hair care - cleansing
      "shampoo",
      "champú",
      "conditioner",
      "acondicionador",
      "hair mask",
      "mascarilla capilar",
      "treatment",
      "tratamiento capilar",
      "dry shampoo",
      "champú seco",
      "clarifying shampoo",
      // Hair styling
      "hair dryer",
      "secadora",
      "blow dryer",
      "secador",
      "straightener",
      "plancha",
      "flat iron",
      "curling iron",
      "tenaza",
      "hair spray",
      "laca",
      "gel",
      "mousse",
      "espuma",
      "styling cream",
      "crema peinar",
      "heat protectant",
      "protector térmico",
      "serum",
      "aceite",
      "hair oil",
      // Hair color
      "hair dye",
      "tinte",
      "hair color",
      "coloración",
      "bleach",
      "decolorante",
      "developer",
      "revelador",
      // Nails
      "nail polish",
      "esmalte",
      "nail",
      "uñas",
      "manicure",
      "pedicure",
      "nail file",
      "lima",
      "cuticle",
      "cutícula",
      "gel polish",
      "nail art",
      // Body care
      "body lotion",
      "loción corporal",
      "body cream",
      "crema corporal",
      "body wash",
      "gel de baño",
      "shower gel",
      "body scrub",
      "exfoliante corporal",
      "body oil",
      "aceite corporal",
      "hand cream",
      "crema manos",
      "foot cream",
      "crema pies",
      // Men's grooming
      "shaving",
      "afeitado",
      "razor",
      "rasuradora",
      "shaving cream",
      "crema afeitar",
      "aftershave",
      "beard",
      "barba",
      "beard oil",
      "aceite barba",
      "trimmer",
      "recortador",
      // Tools & devices
      "facial cleansing brush",
      "cepillo facial",
      "jade roller",
      "rodillo jade",
      "gua sha",
      "led mask",
      "máscara led",
      "derma roller",
      "microneedling",
    ],
  },
  toys: {
    id: "toys",
    name: { en: "Toys & Games", es: "Juguetes" },
    icon: "🎮",
    keywords: [
      // General
      "toy",
      "juguete",
      "juguetes",
      "kids",
      "niños",
      "children",
      "infantil",
      // Building & construction
      "lego",
      "building blocks",
      "bloques",
      "construcción",
      "duplo",
      "mega blocks",
      "playmobil",
      "k'nex",
      // Dolls & figures
      "doll",
      "muñeca",
      "muñeco",
      "barbie",
      "action figure",
      "figura",
      "figura de acción",
      "figurine",
      "collectible",
      "coleccionable",
      "funko",
      "funko pop",
      "hot wheels",
      "matchbox",
      // Stuffed animals
      "stuffed animal",
      "peluche",
      "plush",
      "teddy bear",
      "osito",
      // Educational toys
      "educational",
      "educativo",
      "stem",
      "learning",
      "aprendizaje",
      "science kit",
      "kit ciencia",
      "robot",
      "coding",
      "programación",
      // Puzzles
      "puzzle",
      "rompecabezas",
      "jigsaw",
      "3d puzzle",
      "rubik's cube",
      "cubo rubik",
      // Board games & cards
      "board game",
      "juego de mesa",
      "card game",
      "juego de cartas",
      "monopoly",
      "uno",
      "poker",
      "chess",
      "ajedrez",
      "checkers",
      "damas",
      "domino",
      "dominó",
      "jenga",
      "scrabble",
      "trivial",
      // Outdoor toys
      "outdoor toy",
      "juguete exterior",
      "ball",
      "pelota",
      "frisbee",
      "kite",
      "papalote",
      "cometa",
      "water gun",
      "pistola agua",
      "bubble",
      "burbujas",
      "trampoline",
      "trampolín",
      "swing",
      "columpio",
      "slide",
      "resbaladilla",
      "sandbox",
      "arenero",
      // Ride-on toys
      "bike",
      "bicicleta",
      "tricycle",
      "triciclo",
      "scooter",
      "patineta",
      "skateboard",
      "roller skates",
      "patines",
      "balance bike",
      "car",
      "carro",
      "ride-on",
      "montable",
      // Remote control
      "remote control",
      "control remoto",
      "rc",
      "drone",
      "helicopter",
      "helicóptero",
      "rc car",
      "carro control",
      // Arts & crafts
      "art",
      "arte",
      "craft",
      "manualidades",
      "coloring",
      "colorear",
      "crayons",
      "crayolas",
      "markers",
      "marcadores",
      "paint",
      "pintura",
      "clay",
      "plastilina",
      "play-doh",
      "slime",
      "origami",
      "beads",
      "cuentas",
      // Musical toys
      "musical",
      "musical toy",
      "instrument",
      "instrumento",
      "keyboard",
      "teclado",
      "guitar",
      "guitarra",
      "drum",
      "tambor",
      "xylophone",
      "xilófono",
      // Pretend play
      "play kitchen",
      "cocina juguete",
      "play food",
      "comida juguete",
      "doctor kit",
      "kit doctor",
      "tool set",
      "herramientas juguete",
      "dress up",
      "disfraces",
      "costume",
      "disfraz",
      "tea set",
      "juego té",
      "shopping cart",
      "carrito compras",
      // Baby & toddler toys
      "baby toy",
      "juguete bebé",
      "rattle",
      "sonaja",
      "teether",
      "mordedor",
      "mobile",
      "móvil",
      "activity gym",
      "gimnasio",
      "play mat",
      "tapete juego",
      "walker",
      "andadera",
      "bouncer",
      "mecedora",
      // Video games & consoles
      "ps5",
      "playstation",
      "xbox",
      "nintendo",
      "switch",
      "game",
      "gaming",
      "consola",
      "console",
      "videojuego",
      "video game",
      "controller",
      "control",
      "joystick",
      "headset",
      "audífonos gaming",
      "gaming chair",
      "silla gamer",
      // Video game titles & accessories
      "fifa",
      "call of duty",
      "minecraft",
      "fortnite",
      "pokemon",
      "mario",
      "zelda",
      "gta",
      // Trading cards
      "trading cards",
      "cartas coleccionables",
      "yugioh",
      "yu-gi-oh",
      "magic the gathering",
      "mtg",
    ],
  },
};

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
  extraBody = "",
  currentCategory = "",
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
        <a href="/?category=electronics" class="category-tab ${currentCategory === 'electronics' ? 'active' : ''}">${lang === "es" ? "Electrónica" : "Electronics"}</a>
        <a href="/?category=phones" class="category-tab ${currentCategory === 'phones' ? 'active' : ''}">${lang === "es" ? "Celulares" : "Phones"}</a>
        <a href="/?category=computers" class="category-tab ${currentCategory === 'computers' ? 'active' : ''}">${lang === "es" ? "Computadoras" : "Computers"}</a>
        <a href="/?category=clothing" class="category-tab ${currentCategory === 'clothing' ? 'active' : ''}">${lang === "es" ? "Ropa" : "Clothing"}</a>
        <a href="/?category=home-kitchen" class="category-tab ${currentCategory === 'home-kitchen' ? 'active' : ''}">${lang === "es" ? "Hogar" : "Home"}</a>
        <a href="/?category=sports-outdoors" class="category-tab ${currentCategory === 'sports-outdoors' ? 'active' : ''}">${lang === "es" ? "Deportes" : "Sports"}</a>
        <a href="/?category=toys" class="category-tab ${currentCategory === 'toys' ? 'active' : ''}">${lang === "es" ? "Juguetes" : "Toys"}</a>
        <a href="/?category=beauty" class="category-tab ${currentCategory === 'beauty' ? 'active' : ''}">${lang === "es" ? "Belleza" : "Beauty"}</a>
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
      // ========================================
      // PERFORMANCE: Optimized Header Scroll Effect
      // ========================================
      (function() {
        const header = document.querySelector('.site-header');
        if (!header) return;

        let ticking = false;
        let lastScrollY = window.scrollY;
        const SCROLL_THRESHOLD = 50;

        function updateHeader() {
          const scrollY = window.scrollY;

          // Only update if we've crossed the threshold
          if ((lastScrollY <= SCROLL_THRESHOLD && scrollY > SCROLL_THRESHOLD) ||
              (lastScrollY > SCROLL_THRESHOLD && scrollY <= SCROLL_THRESHOLD)) {
            header.classList.toggle('scrolled', scrollY > SCROLL_THRESHOLD);
          }

          lastScrollY = scrollY;
          ticking = false;
        }

        // Use passive listener for better scroll performance
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

      // ========================================
      // PERFORMANCE: Optimized Scroll Reveal Animations
      // ========================================
      (function() {
        // Only run if IntersectionObserver is supported
        if (!('IntersectionObserver' in window)) return;

        // Mark body as ready for reveal animations
        document.body.classList.add('reveal-ready');

        // Get all elements with data-reveal attribute
        const revealElements = document.querySelectorAll('[data-reveal]');
        if (!revealElements.length) return;

        // Batch process entries for better performance
        const observer = new IntersectionObserver(function(entries) {
          // Use requestAnimationFrame for smooth animations
          window.requestAnimationFrame(function() {
            entries.forEach(function(entry) {
              // When element enters viewport
              if (entry.isIntersecting) {
                entry.target.classList.add('revealed');
                // Stop observing once revealed (animate only once)
                observer.unobserve(entry.target);
              }
            });
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

      // ========================================
      // PERFORMANCE: Debounce Utility
      // ========================================
      function debounce(func, wait) {
        let timeout;
        return function executedFunction() {
          const context = this;
          const args = arguments;
          const later = function() {
            timeout = null;
            func.apply(context, args);
          };
          clearTimeout(timeout);
          timeout = setTimeout(later, wait);
        };
      }

      // ========================================
      // PERFORMANCE: Throttle Utility
      // ========================================
      function throttle(func, limit) {
        let inThrottle;
        return function() {
          const args = arguments;
          const context = this;
          if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(function() { inThrottle = false; }, limit);
          }
        };
      }
    </script>
    ${extraBody}

    <!-- Professional Footer -->
    <footer class="site-footer">
      <div class="footer-container">
        <div class="footer-section">
          <h3 class="footer-title">OfertaRadar</h3>
          <p class="footer-description">${lang === "es" ? "Tu plataforma de seguimiento de precios inteligente. Encuentra las mejores ofertas en Amazon y Mercado Libre." : "Your intelligent price tracking platform. Find the best deals on Amazon and Mercado Libre."}</p>
          <div class="footer-social">
            <a href="#" class="social-link" aria-label="Facebook"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg></a>
            <a href="#" class="social-link" aria-label="Twitter"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/></svg></a>
            <a href="#" class="social-link" aria-label="Instagram"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z"/></svg></a>
          </div>
        </div>

        <div class="footer-section">
          <h4 class="footer-heading">${lang === "es" ? "Empresa" : "Company"}</h4>
          <ul class="footer-links">
            <li><a href="/about">${lang === "es" ? "Sobre Nosotros" : "About Us"}</a></li>
            <li><a href="/contact">${lang === "es" ? "Contacto" : "Contact"}</a></li>
            <li><a href="/careers">${lang === "es" ? "Carreras" : "Careers"}</a></li>
            <li><a href="/blog">${lang === "es" ? "Blog" : "Blog"}</a></li>
          </ul>
        </div>

        <div class="footer-section">
          <h4 class="footer-heading">${lang === "es" ? "Soporte" : "Support"}</h4>
          <ul class="footer-links">
            <li><a href="/help">${lang === "es" ? "Centro de Ayuda" : "Help Center"}</a></li>
            <li><a href="/faq">${lang === "es" ? "Preguntas Frecuentes" : "FAQ"}</a></li>
            <li><a href="/terms">${lang === "es" ? "Términos de Servicio" : "Terms of Service"}</a></li>
            <li><a href="/privacy">${lang === "es" ? "Política de Privacidad" : "Privacy Policy"}</a></li>
          </ul>
        </div>

        <div class="footer-section">
          <h4 class="footer-heading">${lang === "es" ? "Legal" : "Legal"}</h4>
          <ul class="footer-links">
            <li><a href="/privacy">${lang === "es" ? "Aviso de Privacidad" : "Privacy Notice"}</a></li>
            <li><a href="/cookies">${lang === "es" ? "Política de Cookies" : "Cookie Policy"}</a></li>
            <li><a href="/dmca">${lang === "es" ? "DMCA" : "DMCA"}</a></li>
            <li><a href="/accessibility">${lang === "es" ? "Accesibilidad" : "Accessibility"}</a></li>
          </ul>
        </div>
      </div>

      <div class="footer-bottom">
        <p class="footer-copyright">
          © ${new Date().getFullYear()} OfertaRadar. ${lang === "es" ? "Todos los derechos reservados." : "All rights reserved."}
        </p>
        <p class="footer-disclaimer">
          ${lang === "es" ? "OfertaRadar es una plataforma independiente de seguimiento de precios. No estamos afiliados con Amazon o Mercado Libre. Los precios y la disponibilidad pueden variar." : "OfertaRadar is an independent price tracking platform. We are not affiliated with Amazon or Mercado Libre. Prices and availability may vary."}
        </p>
      </div>
    </footer>
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

// ============================================
// IMAGE URL HELPER FUNCTIONS
// ============================================

/**
 * Get product image URL with consistent fallback strategy
 * Priority: 1) thumbnail field, 2) fallback placeholder
 * @param {Object} product - Product object with thumbnail field
 * @returns {string} Image URL
 */
function getProductImageUrl(product) {
  // Use thumbnail if available (from Apify scraper or database)
  if (product.thumbnail) {
    return product.thumbnail;
  }

  // Fallback to placeholder
  return "/images/product-placeholder.svg";
}

// ============================================
// CATEGORY HELPER FUNCTIONS
// ============================================

/**
 * Detect product category based on title keywords
 * @param {string} productTitle - Product title to analyze
 * @returns {string|null} Category ID or null if no match
 */
function detectCategory(productTitle) {
  if (!productTitle) return null;

  const lowerTitle = productTitle.toLowerCase();

  // Exclusion keywords: If product contains these, it CANNOT be in that category
  const exclusionRules = {
    phones: [
      "case", "cover", "holder", "mount", "charger", "cable", "screen protector",
      "funda", "cargador", "protector", "soporte"
    ],
    computers: [
      "toy", "lego", "juguete", "game piece", "pieza", "case", "bag", "mochila",
      "sticker", "pegatina", "poster", "mousepad", "alfombrilla"
    ],
    electronics: [
      "toy", "lego", "juguete", "book", "libro", "poster", "sticker", "clothing",
      "shirt", "camisa", "toy version", "replica juguete"
    ],
    beauty: [
      "toy", "lego", "juguete", "food", "comida", "kitchen appliance"
    ],
    toys: [],  // Toys can contain any keywords
    "sports-outdoors": [
      "toy", "lego", "juguete", "video game", "videojuego", "book", "libro"
    ],
    clothing: [
      "doll clothes", "ropa muñeca", "toy", "juguete", "lego"
    ],
    "home-kitchen": [
      "toy", "lego", "juguete", "miniature", "miniatura", "doll house", "casa muñecas"
    ]
  };

  // Strong indicators: If ANY of these appear, force category
  const strongIndicators = {
    toys: [
      "lego", "playmobil", "hot wheels", "barbie", "funko pop", "nerf",
      "juguete", "muñeca", "muñeco", "juego de mesa", "board game", "puzzle"
    ],
    phones: [
      "iphone 1", "samsung galaxy s", "google pixel", "motorola edge", "xiaomi redmi note"
    ],
    computers: [
      "macbook", "laptop ", "desktop pc", "gaming laptop", "notebook computer",
      "computadora portátil", "pc gamer"
    ],
    beauty: [
      "lipstick", "mascara", "eyeshadow", "foundation", "shampoo", "conditioner",
      "labial", "rímel", "champú", "perfume"
    ]
  };

  // Check strong indicators first (highest priority)
  for (const [catId, indicators] of Object.entries(strongIndicators)) {
    for (const indicator of indicators) {
      if (lowerTitle.includes(indicator.toLowerCase())) {
        console.log(`[Category] Strong indicator "${indicator}" → ${catId} for "${productTitle.substring(0, 50)}"`);
        return catId;
      }
    }
  }

  // Score-based detection: Count keyword matches per category
  const categoryScores = {};
  const categoryPriority = [
    "phones",
    "computers",
    "electronics",
    "beauty",
    "toys",
    "sports-outdoors",
    "clothing",
    "home-kitchen"
  ];

  for (const catId of categoryPriority) {
    const catConfig = CATEGORIES[catId];
    if (!catConfig) continue;

    let score = 0;
    let matchedKeywords = [];

    // Check exclusion rules first
    const exclusions = exclusionRules[catId] || [];
    let isExcluded = false;

    for (const exclusion of exclusions) {
      if (lowerTitle.includes(exclusion.toLowerCase())) {
        console.log(`[Category] Excluded from ${catId}: contains "${exclusion}" in "${productTitle.substring(0, 50)}"`);
        isExcluded = true;
        break;
      }
    }

    if (isExcluded) continue; // Skip this category

    // Count matching keywords
    for (const keyword of catConfig.keywords) {
      if (lowerTitle.includes(keyword.toLowerCase())) {
        score++;
        matchedKeywords.push(keyword);
      }
    }

    if (score > 0) {
      categoryScores[catId] = { score, matchedKeywords };
    }
  }

  // Return category with highest score
  if (Object.keys(categoryScores).length > 0) {
    const bestMatch = Object.entries(categoryScores)
      .sort((a, b) => b[1].score - a[1].score)[0];

    console.log(`[Category] Best match: ${bestMatch[0]} (score: ${bestMatch[1].score}) for "${productTitle.substring(0, 50)}"`);
    return bestMatch[0];
  }

  return null; // uncategorized
}

/**
 * Calculate real category statistics from actual products
 * @param {Array} products - Array of product objects
 * @param {string} lang - Language code (en/es)
 * @returns {Array} Category stats with real counts and discounts
 */
function getCategoryStats(products, lang = "en") {
  const stats = [];

  for (const [catId, catConfig] of Object.entries(CATEGORIES)) {
    const categoryProducts = products.filter((p) => p.category === catId);

    // Skip empty categories
    if (categoryProducts.length === 0) {
      continue;
    }

    // Calculate real discount percentages
    let maxDiscount = 0;
    categoryProducts.forEach((p) => {
      // Check if product has price tracking data with average price
      if (p.avgPrice && p.price < p.avgPrice) {
        const discount = ((p.avgPrice - p.price) / p.avgPrice) * 100;
        maxDiscount = Math.max(maxDiscount, discount);
      }
      // Also check for savingsPercent property from deals
      if (p.savingsPercent) {
        maxDiscount = Math.max(maxDiscount, p.savingsPercent);
      }
    });

    stats.push({
      key: catId,
      icon: catConfig.icon,
      nameEn: catConfig.name.en,
      nameEs: catConfig.name.es,
      maxDiscount: Math.round(maxDiscount),
      productCount: categoryProducts.length,
    });
  }

  return stats;
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
      category: "electronics",
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
      category: "electronics",
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
      category: "electronics",
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
      category: "toys",
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
      category: "electronics",
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
      category: "electronics",
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
      category: "toys",
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
      category: "electronics",
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
      category: "electronics",
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
      category: "toys",
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
      category: "home-kitchen",
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
      category: "electronics",
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

/**
 * Combined search: Supabase (Apify-scraped) products + background scrape trigger.
 */
async function fetchAllProducts({
  query,
  category,  // NEW: Filter by category field in database
  minPrice,
  maxPrice,
  sort,
  page,
  pageSize,
  source = "all",
  forceSynchronous = false, // For homepage/featured products
}) {
  const results = {
    products: [],
    total: 0,
    totalPages: 0,
    error: "",
    notices: [],
  };

  const promises = [];

  // Helper: map Supabase rows → product objects
  const mapRows = (rows) =>
    rows.map((r) => ({
      id: r.product_id,
      title: r.product_title,
      price: parseFloat(r.price || r.current_price || 0), // FIX: product_cache uses 'price', tracked_products uses 'current_price'
      currency_id: r.currency || "MXN",
      thumbnail: r.thumbnail || null,
      seller: r.seller ? { nickname: r.seller } : null,
      source: r.source,
      permalink: r.product_url || null,
      category: detectCategory(r.product_title || ""),
      rating: r.rating || null,
      review_count: r.review_count || 0,
      available_quantity: r.available_quantity || 0,
      sold_quantity: r.sold_quantity || 0,
      stock_status: r.stock_status || "unknown",
      _fromSupabase: true,
    }));

  // Helper: run Apify scrape and store results in Supabase
  const runScrapeAndStore = async () => {
    try {
      const scrapeSource = source === "amazon" ? "amazon" : "all";
      const items = await scrapeProducts({
        source: scrapeSource,
        query,
        maxResults: 20,
      });
      if (items && items.length > 0) {
        for (const item of items) {
          await supabaseDb.cacheScrapedProduct(item).catch(() => {});
        }
        console.log(
          `[fetchAllProducts] Scrape stored ${items.length} products for "${query}"`,
        );
      }
    } catch (e) {
      console.error("[fetchAllProducts] Scrape error:", e.message);
    }
  };

  // Search query path (now handles both search queries AND category queries)
  if (USE_SUPABASE && query) {
    const searchStartTime = Date.now();
    console.log(`[PERF] 🔍 Starting search for "${query}" (source: ${source})`);

    // OPTIMIZATION 1: Try exact match first (fastest)
    let existing = await supabaseDb
      .searchProductCache(query, { limit: pageSize, source })
      .catch(() => []);

    const exactMatchTime = Date.now() - searchStartTime;
    console.log(
      `[PERF] ⚡ Exact match search took ${exactMatchTime}ms, found ${existing.length} products`,
    );

    // OPTIMIZATION 2: If no exact match, try fuzzy search on cached products
    if (existing.length === 0) {
      // Search for products with similar titles (broaden search)
      const fuzzyResults = await supabaseDb
        .searchProductCache(query, { limit: pageSize * 2, source, fuzzy: true })
        .catch(() => []);

      if (fuzzyResults.length > 0) {
        console.log(
          `[fetchAllProducts] Fuzzy match found ${fuzzyResults.length} cached products for "${query}"`,
        );
        existing = fuzzyResults.slice(0, pageSize);
      }
    }

    // OPTIMIZATION 3: Stale-while-revalidate pattern
    if (existing.length > 0) {
      // Return cached results immediately (FAST!)
      promises.push(
        Promise.resolve({
          products: mapRows(existing),
          total: existing.length,
          totalPages: 1,
          source: "supabase-cache",
        }),
      );

      // Check if cache is stale (older than 6 hours)
      const oldestResult = existing[0];
      const cacheAge = oldestResult.scraped_at
        ? Date.now() - new Date(oldestResult.scraped_at).getTime()
        : Infinity;
      const SIX_HOURS = 6 * 60 * 60 * 1000;

      if (cacheAge > SIX_HOURS) {
        // Refresh in background if stale
        console.log(
          `[fetchAllProducts] Cache stale (${Math.round(cacheAge / 3600000)}h old), refreshing in background`,
        );
        runScrapeAndStore().catch(() => {}); // Fire and forget
      } else {
        console.log(
          `[fetchAllProducts] Cache fresh (${Math.round(cacheAge / 3600000)}h old), skipping refresh`,
        );
      }
    } else {
      // OPTIMIZATION 4: True cache miss

      // For homepage/featured products, scrape synchronously to ensure content
      if (forceSynchronous) {
        console.log(
          `[fetchAllProducts] No cached results for "${query}" — scraping synchronously (featured products)`,
        );
        try {
          await runScrapeAndStore();
          const fresh = await supabaseDb
            .searchProductCache(query, { limit: pageSize, source })
            .catch(() => []);

          console.log(
            `[fetchAllProducts] After sync scrape, found ${fresh.length} products`,
          );

          if (fresh.length > 0) {
            promises.push(
              Promise.resolve({
                products: mapRows(fresh),
                total: fresh.length,
                totalPages: 1,
                source: "supabase-cache",
              }),
            );
          } else {
            // Scrape completed but found nothing - show message
            promises.push(
              Promise.resolve({
                products: [],
                total: 0,
                totalPages: 0,
                source: "supabase-cache",
                notice: "No products found. Try a different search term.",
              }),
            );
          }
        } catch (error) {
          console.error(`[fetchAllProducts] Sync scrape failed:`, error);
          promises.push(
            Promise.resolve({
              products: [],
              total: 0,
              totalPages: 0,
              source: "supabase-cache",
              error: `Scrape failed: ${error.message}`,
            }),
          );
        }
      } else {
        // For regular searches, return empty immediately and scrape in background
        console.log(
          `[fetchAllProducts] No cached results for "${query}" — triggering background scrape`,
        );

        // Return empty results immediately
        promises.push(
          Promise.resolve({
            products: [],
            total: 0,
            totalPages: 0,
            source: "supabase-cache",
            notice:
              "Discovering new products... Refresh in 30 seconds for results.",
          }),
        );

        // Start scrape in background (don't wait)
        runScrapeAndStore().catch(() => {});
      }
    }
  }

  const responses = await Promise.all(promises);

  // Combine results, dedupe by id so the same product doesn't show twice
  const seenIds = new Set();
  for (const res of responses) {
    const productsWithSource = res.products.map((p) => ({
      ...p,
      source: p.source || res.source,
    }));

    for (const p of productsWithSource) {
      const key = String(p.id || p.product_id || "");
      if (key && seenIds.has(key)) continue;
      if (key) seenIds.add(key);
      results.products.push(p);
    }
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
 * Get product by ID from MULTIPLE sources (Amazon + Mercado Libre)
 * Returns both Amazon and ML versions if available
 */
async function fetchProductById(id) {
  console.log(`[PRODUCT] 🔍 Fetching product by ID: "${id}" from ALL sources`);

  const sources = {
    amazon: null,
    mercadolibre: null
  };

  // Helper function to transform database row to product object
  const transformProduct = (row) => {
    if (!row) return null;

    // Parse images array
    let images = [];
    try {
      if (row.images) {
        images = typeof row.images === 'string' ? JSON.parse(row.images) : row.images;
      }
    } catch (e) {
      images = row.thumbnail ? [row.thumbnail] : [];
    }

    if (images.length === 0 && row.thumbnail) {
      images = [row.thumbnail];
    }

    return {
      id: row.product_id,
      title: row.product_title || row.title,
      price: parseFloat(row.current_price || row.price) || 0,
      currency_id: row.currency || "MXN",
      condition: row.condition || "new",
      available_quantity: parseInt(row.available_quantity) || 0,
      sold_quantity: parseInt(row.sold_quantity) || 0,
      permalink: row.product_url || row.permalink || null,
      thumbnail: row.thumbnail || (images[0] || null),
      images: images,
      description: row.description || null,
      seller: row.seller ? (typeof row.seller === 'string' ? { nickname: row.seller } : row.seller) : null,
      source: row.source,
      rating: parseFloat(row.rating) || null,
      review_count: parseInt(row.review_count) || 0,
      category: detectCategory(row.product_title || row.title || ""),
    };
  };

  if (USE_SUPABASE) {
    try {
      // Search product_cache for ALL versions of this product (by title similarity)
      console.log(`[PRODUCT] Searching product_cache for all sources...`);

      const { data: allProducts, error } = await supabaseDb.getSupabase()
        .from("product_cache")
        .select("*")
        .eq("product_id", id);

      if (error) {
        console.error("[PRODUCT] Error fetching from cache:", error);
      } else if (allProducts && allProducts.length > 0) {
        // Group by source
        allProducts.forEach(row => {
          const product = transformProduct(row);
          if (product) {
            if (product.source === 'amazon') {
              sources.amazon = product;
            } else if (product.source === 'mercadolibre') {
              sources.mercadolibre = product;
            }
          }
        });
      }

      // If not found by exact ID, try searching tracked_products
      if (!sources.amazon && !sources.mercadolibre) {
        console.log(`[PRODUCT] Checking tracked_products table...`);
        const row = await supabaseDb.getTrackedProductById(id);
        if (row) {
          const product = transformProduct(row);
          if (product) {
            if (product.source === 'amazon') {
              sources.amazon = product;
            } else {
              sources.mercadolibre = product;
            }
          }
        }
      }

      // If still not found by exact ID, try fuzzy search by title
      if (!sources.amazon && !sources.mercadolibre) {
        console.log(`[PRODUCT] Trying fuzzy search in product_cache...`);
        const { data: fuzzyResults } = await supabaseDb.getSupabase()
          .from("product_cache")
          .select("*")
          .ilike("product_title", `%${id.replace(/[^a-zA-Z0-9]/g, '%')}%`)
          .limit(5);

        if (fuzzyResults && fuzzyResults.length > 0) {
          fuzzyResults.forEach(row => {
            const product = transformProduct(row);
            if (product) {
              if (!sources.amazon && product.source === 'amazon') {
                sources.amazon = product;
              }
              if (!sources.mercadolibre && product.source === 'mercadolibre') {
                sources.mercadolibre = product;
              }
            }
          });
        }
      }

    } catch (e) {
      console.error("[PRODUCT] Error in multi-source lookup:", e.message);
    }
  }

  // Check if we found any products
  const hasAmazon = sources.amazon !== null;
  const hasMercadoLibre = sources.mercadolibre !== null;

  console.log(`[PRODUCT] Results: Amazon=${hasAmazon}, MercadoLibre=${hasMercadoLibre}`);

  if (!hasAmazon && !hasMercadoLibre) {
    console.log(`[PRODUCT] ⚠️ Product "${id}" not found in any source`);
    return {
      product: null,
      sources: {},
      error: "This product has not been scraped yet. Try searching for it first.",
    };
  }

  // Return the primary product (prefer one with stock, or Amazon if both available)
  let primaryProduct = null;
  if (hasAmazon && hasMercadoLibre) {
    // Both available - prefer one with stock
    if (sources.amazon.available_quantity > 0) {
      primaryProduct = sources.amazon;
    } else if (sources.mercadolibre.available_quantity > 0) {
      primaryProduct = sources.mercadolibre;
    } else {
      primaryProduct = sources.amazon; // Default to Amazon if both out of stock
    }
  } else {
    primaryProduct = sources.amazon || sources.mercadolibre;
  }

  return {
    product: primaryProduct,
    sources: sources, // Include both sources for dropdown
    hasMultipleSources: hasAmazon && hasMercadoLibre,
    notice: "",
    error: "",
    isRealData: true,
  };
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

  // Bull queue for price-updates is retired — price-checker.js (Apify-based) handles all updates.
  if (!isRedisConfigured()) {
    console.log(
      "[Queue] Redis not configured - background price updates disabled",
    );
  }

  // Initialize Price Checker Worker (if enabled and Supabase configured)
  if (useSupabaseDb && process.env.ENABLE_PRICE_WORKER === "true") {
    try {
      const { startPriceChecker } = require("./workers/price-checker");
      await startPriceChecker();
      console.log("[Worker] ✓ Price checker worker initialized");
    } catch (error) {
      console.error("[Worker] Failed to start price checker:", error.message);
      console.error("[Worker] Make sure Redis is running and configured");
    }
  } else if (!useSupabaseDb) {
    console.log("[Worker] Price checker disabled - Supabase not configured");
  } else if (process.env.ENABLE_PRICE_WORKER !== "true") {
    console.log(
      "[Worker] Price checker disabled - set ENABLE_PRICE_WORKER=true to enable",
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

    let userEmail = "";
    let userData = null;
    if (hasToken) {
      try {
        const payload = jwt.verify(req.cookies.token, JWT_SECRET);
        const user = await db.get(
          "SELECT * FROM users WHERE id = ?",
          payload.id,
        );
        userEmail = user?.email || "";
        userData = user;
      } catch (e) {}
    }
    let query = String(req.query.q || "").trim();
    const category = String(req.query.category || "").trim();
    const minPrice = parseNumber(req.query.minPrice, 0);
    const maxPrice = parseNumber(req.query.maxPrice, 50000);
    const sort = String(req.query.sort || "price_asc");
    const source = String(req.query.source || "all");
    const page = Math.max(parseNumber(req.query.page, 1), 1);
    const pageSize = 20;

    // ============================================
    // CATEGORY-TO-SEARCH MAPPING
    // Converts category clicks into search queries
    // This triggers Apify scraping to populate the database
    // ============================================
    const CATEGORY_TO_SEARCH = {
      "electronics": "electronics",
      "phones": "smartphone",
      "computers": "laptop",
      "tvs": "television",
      "appliances": "electrodomesticos",
      "toys": "toys",
      "clothing": "ropa",
      "sports-outdoors": "deportes",
      "home-kitchen": "hogar cocina",
      "beauty": "belleza"
    };

    // If user clicked a category link, convert to search query
    // This ensures the database gets populated via Apify scraping
    if (category && !query) {
      query = CATEGORY_TO_SEARCH[category] || category;
      console.log(`[Category] User clicked "${category}" → triggering search: "${query}"`);
      // Now proceeds with normal search flow (checks DB, scrapes if needed)
    }

    let results = {
      products: [],
      total: 0,
      totalPages: 0,
      error: "",
      notices: [],
    };
    let isFeatured = false;

    if (query || category) {
      results = await fetchAllProducts({
        query,
        category,  // Pass category for database filtering
        minPrice,
        maxPrice,
        sort,
        page,
        pageSize,
        source,
      });

      // Record the search for logged-in users (fire-and-forget)
      if (query && userData?.id && USE_SUPABASE) {
        supabaseDb
          .recordSearch(userData.id, query, source, results.total)
          .catch(() => {});
      }

      // Filter by category if specified
      if (category && CATEGORIES[category]) {
        results.products = results.products.filter(
          (p) => p.category === category,
        );
        results.total = results.products.length;
        results.totalPages = Math.ceil(results.total / pageSize);
      }
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
          forceSynchronous: false, // FIX: Don't wait for scraping, show cached products immediately
        });

        console.log(`✅ [HOME] Loaded ${results.products.length} featured products from cache`);
      } catch (e) {
        console.log("[Home] Error fetching featured products:", e.message);
      }
    }

    // Helper to get source badge HTML
    const getSourceBadge = (item) => {
      // Check if product is available on multiple sources
      const hasAmazon = item.sources?.amazon !== null && item.sources?.amazon !== undefined;
      const hasMercadoLibre = item.sources?.mercadolibre !== null && item.sources?.mercadolibre !== undefined;

      // If sources data not available, fall back to item.source
      if (!item.sources) {
        const src = item.source || "mercadolibre";
        if (src === "amazon") {
          return `<span class="source-badge amazon">Amazon</span>`;
        }
        return `<span class="source-badge ml">Mercado Libre</span>`;
      }

      // Show dual badges if available on both platforms
      if (hasAmazon && hasMercadoLibre) {
        return `
          <div class="source-badges-multi">
            <span class="source-badge amazon">Amazon</span>
            <span class="source-badge ml">ML</span>
          </div>
        `;
      } else if (hasAmazon) {
        return `<span class="source-badge amazon">Amazon</span>`;
      } else if (hasMercadoLibre) {
        return `<span class="source-badge ml">Mercado Libre</span>`;
      }

      // Default fallback
      return `<span class="source-badge ml">Mercado Libre</span>`;
    };

    // Product card HTML generator
    const renderProductCard = (item) => {
      // COMPREHENSIVE DEBUG LOGGING
      console.group('🔍 [PRODUCT CARD DEBUG] Rendering product');
      console.log('Raw item data:', JSON.stringify(item, null, 2));
      console.log('Product ID:', item.id);
      console.log('Title:', item.title?.substring(0, 50));
      console.log('Price:', item.price, 'Currency:', item.currency_id);
      console.log('Rating:', item.rating);
      console.log('Available Quantity:', item.available_quantity);
      console.log('Sold Quantity:', item.sold_quantity);
      console.log('Condition:', item.condition);
      console.log('Seller:', item.seller);
      console.log('Source:', item.source);
      console.log('Thumbnail:', item.thumbnail);

      // Extract rating data with debug logs
      const rating = item.rating || item.reviews?.rating_average || 0;
      const reviewCount = item.reviews?.total || 0;
      const starDisplay = rating ? `★`.repeat(Math.floor(rating)) + (rating % 1 >= 0.5 ? '½' : '') + `☆`.repeat(5 - Math.ceil(rating)) : '';

      console.log('⭐ Rating calculation:');
      console.log('  - Raw rating:', item.rating);
      console.log('  - Reviews object:', item.reviews);
      console.log('  - Final rating:', rating);
      console.log('  - Review count:', reviewCount);
      console.log('  - Star display:', starDisplay);

      // Stock status with debug logs
      const availableQty = item.available_quantity || 0;
      const isInStock = availableQty > 0;
      const stockStatus = isInStock
        ? `<span class="stock-badge in-stock">✓ ${lang === 'es' ? 'En Stock' : 'In Stock'}</span>`
        : `<span class="stock-badge out-stock">✗ ${lang === 'es' ? 'Agotado' : 'Out of Stock'}</span>`;

      console.log('📦 Stock calculation:');
      console.log('  - Available quantity:', availableQty);
      console.log('  - Is in stock:', isInStock);
      console.log('  - Stock badge HTML:', stockStatus);

      // Sold count (use sold_quantity or generate from ID if not available)
      const soldCount = item.sold_quantity || (item.id ? parseInt(item.id.split('-')[1]?.substring(0, 3) || '0', 36) % 500 + 20 : 0);

      console.log('💰 Sales calculation:');
      console.log('  - Sold quantity from data:', item.sold_quantity);
      console.log('  - Final sold count:', soldCount);

      console.groupEnd();

      return `
      <div class="product-card" data-product-id="${item.id}">
        <a href="${buildSearchParams(`/product/${encodeURIComponent(item.id)}`, { q: query, minPrice, maxPrice, sort, source, page })}" class="product-card-link">
          <div class="product-card-image">
            <img src="${item.thumbnail || ""}" alt="${item.title || t(lang, "product")}" loading="lazy" />
            ${getSourceBadge(item)}
            ${stockStatus}
          </div>
          <div class="product-card-content">
            <h3 class="product-card-title">${item.title || t(lang, "product")}</h3>

            <!-- Rating Stars -->
            ${rating > 0 ? `
            <div class="product-card-rating">
              <span class="stars">${starDisplay}</span>
              ${reviewCount > 0 ? `<span class="review-count">(${reviewCount})</span>` : ''}
            </div>
            ` : ''}

            <div class="product-card-pricing">
              <span class="product-card-price-current" data-price-mxn="${item.price}">${formatPrice(item.price, "MXN")}</span>
              ${item.original_price && item.original_price > item.price ? `<span class="product-card-price-original" data-price-mxn="${item.original_price}">${formatPrice(item.original_price, "MXN")}</span>` : ''}
            </div>
            ${item.discount_percent && item.discount_percent > 0 ? `<div class="product-card-discount">-${Math.round(item.discount_percent)}% OFF</div>` : ''}

            <!-- Sold Count -->
            ${soldCount > 0 ? `
            <div class="product-card-sold">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              ${soldCount}+ ${lang === 'es' ? 'vendidos' : 'sold'}
            </div>
            ` : ''}

            ${item.seller?.nickname || (typeof item.seller === "string" && item.seller) ? `<div class="product-card-seller">${item.seller?.nickname || item.seller}</div>` : ""}
          </div>
        </a>
      </div>
    `;
    };

    // ==========================================
    // MODERN 2026 PRODUCT CARD RENDERER
    // Bento Grid + Micro-interactions + WCAG AA
    // ==========================================
    const renderProductCardModern = (item) => {
      // Extract data
      const rating = item.rating || item.reviews?.rating_average || 0;
      const reviewCount = item.reviews?.total || 0;
      const soldCount = item.sold_quantity || 0;
      const availableQty = item.available_quantity || 0;
      const isInStock = availableQty > 0;
      const isLowStock = isInStock && availableQty < 10;

      // Calculate discount
      const hasDiscount = item.original_price && item.original_price > item.price;
      const discountPercent = hasDiscount ? Math.round(((item.original_price - item.price) / item.original_price) * 100) : 0;

      // Determine if this is a "best price" (discount > 30% or marked as good deal)
      const isBestPrice = discountPercent > 30 || item.isBestPrice;

      // Source display
      const sourceLabel = item.source === 'amazon' ? 'Amazon' : 'Mercado Libre';

      // Build product URL
      const productUrl = buildSearchParams(`/product/${encodeURIComponent(item.id)}`, { q: query, minPrice, maxPrice, sort, source, page });

      return `
      <article class="product-card-modern" data-product-id="${item.id}" role="article">
        <a href="${productUrl}" class="product-card-link" aria-label="${item.title || t(lang, 'product')}">

          <!-- Image Section with Lazy Loading -->
          <div class="product-image-container">
            <div class="product-image-skeleton" aria-hidden="true"></div>
            <img
              src="${item.thumbnail || '/images/product-placeholder.svg'}"
              alt="${item.title || t(lang, 'product')}"
              class="product-image"
              loading="lazy"
              onload="this.classList.add('loaded'); this.previousElementSibling.style.display='none'"
              onerror="this.src='/images/product-placeholder.svg'"
            />

            <!-- Badges Container -->
            <div class="badge-container">
              ${isBestPrice ? `<span class="badge badge-best-price ${discountPercent > 40 ? 'badge-urgent' : ''}" role="status">
                ${lang === 'es' ? '🔥 Mejor Precio' : '🔥 Best Price'}
              </span>` : ''}

              ${hasDiscount && !isBestPrice ? `<span class="badge badge-discount" role="status">
                -${discountPercent}% OFF
              </span>` : ''}

              ${isLowStock ? `<span class="badge badge-low-stock badge-urgent" role="status">
                ${lang === 'es' ? `Solo ${availableQty} disponibles` : `Only ${availableQty} left`}
              </span>` : ''}

              <span class="badge badge-source">${sourceLabel}</span>
            </div>
          </div>

          <!-- Content Section -->
          <div class="product-content">

            <!-- Product Title -->
            <h3 class="product-title line-clamp-2">
              ${item.title || t(lang, "product")}
            </h3>

            <!-- Chips Row (Technical Specs) -->
            <div class="chip-row">
              ${rating > 0 ? `
              <div class="chip chip-rating" aria-label="${lang === 'es' ? 'Calificación' : 'Rating'}: ${rating.toFixed(1)}">
                <svg class="chip-icon" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
                <span>${rating.toFixed(1)}</span>
                ${reviewCount > 0 ? `<span class="text-tertiary">(${reviewCount})</span>` : ''}
              </div>
              ` : ''}

              ${soldCount > 0 ? `
              <div class="chip chip-sold" aria-label="${lang === 'es' ? 'Vendidos' : 'Sold'}: ${soldCount}+">
                <svg class="chip-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
                <span>${soldCount}+</span>
              </div>
              ` : ''}
            </div>

            <!-- Pricing Container -->
            <div class="pricing-container">
              <div class="price-row">
                <span class="price-current" data-price-mxn="${item.price}">
                  ${formatPrice(item.price, "MXN")}
                </span>

                ${hasDiscount ? `
                <span class="price-original" data-price-mxn="${item.original_price}">
                  ${formatPrice(item.original_price, "MXN")}
                </span>
                <span class="price-discount-label">
                  ${lang === 'es' ? 'Ahorra' : 'Save'} ${discountPercent}%
                </span>
                ` : ''}
              </div>
            </div>

            <!-- Primary CTA Button -->
            <button
              class="cta-primary"
              role="button"
              aria-label="${lang === 'es' ? 'Ver detalles del producto' : 'View product details'}"
              onclick="this.classList.add('loading')"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="9" cy="21" r="1"></circle>
                <circle cx="20" cy="21" r="1"></circle>
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
              </svg>
              ${lang === 'es' ? 'Ver Producto' : 'View Product'}
            </button>

          </div>
        </a>
      </article>
      `;
    };

    const resultsHtml =
      (query || isFeatured) && results.products.length
        ? `
      <div class="results-section">
        ${isFeatured ? `<h2 class="section-title">${lang === "es" ? "Ofertas Destacadas" : "Featured Deals"}</h2>` : ""}
        ${
          results.notices?.length
            ? results.notices
                .map(
                  (n) => `<div class="notice info-notice">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
          </svg>
          ${n}
        </div>`,
                )
                .join("")
            : ""
        }
        ${results.error ? `<div class="notice error-notice">${results.error}</div>` : ""}
        ${!results.error && results.products.length === 0 ? `<p class="muted">${t(lang, "noResults")}</p>` : ""}
        ${
          results.products.length
            ? `
          <div class="bento-grid">
            ${results.products.map(renderProductCardModern).join("")}
          </div>
          ${
            query
              ? `
            <div class="pagination">
              ${page > 1 ? `<a href="${buildSearchParams("/", { q: query, minPrice, maxPrice, sort, source, page: page - 1 })}" class="pagination-prev" aria-label="${lang === 'es' ? 'Página anterior' : 'Previous page'}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="15 18 9 12 15 6"></polyline>
                </svg>
                ${t(lang, "previous")}
              </a>` : '<span class="pagination-prev pagination-disabled"></span>'}

              <div class="pagination-numbers">
                ${(() => {
                  const totalPages = results.totalPages || 1;
                  const maxVisible = 7; // Show max 7 page numbers
                  let pages = [];

                  console.log(`📄 [PAGINATION DEBUG] Current page: ${page}, Total pages: ${totalPages}`);

                  if (totalPages <= maxVisible) {
                    // Show all pages if total is small
                    pages = Array.from({ length: totalPages }, (_, i) => i + 1);
                    console.log('📄 [PAGINATION] Showing all pages:', pages);
                  } else {
                    // Smart pagination: 1 ... 4 5 [6] 7 8 ... 20
                    const start = Math.max(1, page - 2);
                    const end = Math.min(totalPages, page + 2);

                    // Always show first page
                    if (start > 1) pages.push(1);

                    // Add ellipsis if gap after first page
                    if (start > 2) pages.push('...');

                    // Add middle range
                    for (let i = start; i <= end; i++) {
                      pages.push(i);
                    }

                    // Add ellipsis if gap before last page
                    if (end < totalPages - 1) pages.push('...');

                    // Always show last page
                    if (end < totalPages) pages.push(totalPages);

                    console.log('📄 [PAGINATION] Smart pagination:', pages, 'Range:', start, 'to', end);
                  }

                  return pages.map(p => {
                    if (p === '...') {
                      return '<span class="pagination-ellipsis">…</span>';
                    } else if (p === page) {
                      console.log('📄 [PAGINATION] Current page button:', p);
                      return `<span class="pagination-number pagination-current" aria-current="page">${p}</span>`;
                    } else {
                      console.log('📄 [PAGINATION] Regular page button:', p);
                      return `<a href="${buildSearchParams("/", { q: query, minPrice, maxPrice, sort, source, page: p })}" class="pagination-number" aria-label="${lang === 'es' ? 'Ir a página' : 'Go to page'} ${p}">${p}</a>`;
                    }
                  }).join('');
                })()}
              </div>

              ${page < results.totalPages ? `<a href="${buildSearchParams("/", { q: query, minPrice, maxPrice, sort, source, page: page + 1 })}" class="pagination-next" aria-label="${lang === 'es' ? 'Siguiente página' : 'Next page'}">
                ${t(lang, "next")}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
              </a>` : '<span class="pagination-next pagination-disabled"></span>'}
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
        <!-- Row 1: search input with magnifying-glass icon -->
        <div class="search-input-wrap">
          <svg class="search-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="9" r="6"/><path d="M14 14l3.5 3.5"/></svg>
          <input name="q" type="text" class="search-input" placeholder="${t(lang, "searchPlaceholder")}" value="${query}" />
        </div>
        <!-- Row 2: filters + action buttons, all horizontal -->
        <div class="search-row-2">
          <!-- Currency Toggle -->
          <div class="range-row currency-toggle-container">
            <label>${lang === "es" ? "Moneda" : "Currency"}</label>
            <button type="button" id="currencyToggle" class="currency-toggle-btn" onclick="toggleCurrency()">
              <span class="currency-label" id="currencyLabel">${lang === "es" ? "MXN" : "USD"}</span>
              <svg class="toggle-icon" viewBox="0 0 16 16" fill="currentColor"><path d="M8 12l-4-4h8l-4 4z"/></svg>
            </button>
            <input type="hidden" name="currency" id="currencyInput" value="${lang === "es" ? "MXN" : "USD"}" />
          </div>

          <div class="range-row">
            <label>${t(lang, "minPrice")}: <span id="minPriceValue" class="price-val">${formatPrice(minPrice)}</span></label>
            <input id="minPrice" name="minPrice" type="range"
              min="0"
              max="${lang === "es" ? "50000" : "2500"}"
              step="${lang === "es" ? "500" : "25"}"
              value="${minPrice}" />
          </div>
          <div class="range-row">
            <label>${t(lang, "maxPrice")}: <span id="maxPriceValue" class="price-val">${formatPrice(maxPrice)}</span></label>
            <input id="maxPrice" name="maxPrice" type="range"
              min="0"
              max="${lang === "es" ? "50000" : "2500"}"
              step="${lang === "es" ? "500" : "25"}"
              value="${maxPrice}" />
          </div>
          <div class="range-row sort-row">
            <label>${t(lang, "sortBy")}</label>
            <select name="sort">
              <option value="price_asc" ${sort === "price_asc" ? "selected" : ""}>${t(lang, "priceLowHigh")}</option>
              <option value="price_desc" ${sort === "price_desc" ? "selected" : ""}>${t(lang, "priceHighLow")}</option>
            </select>
          </div>
          <div class="search-actions">
            <button type="submit" class="btn-search">${t(lang, "search")}</button>
            <button type="button" id="scrapeBtn" class="btn-scrape" onclick="triggerScrape()" title="${lang === "es" ? "Descubrir nuevos productos en Amazon y Mercado Libre" : "Discover new products on Amazon & Mercado Libre"}">
              <svg class="scrape-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5l2.8 2.8"/></svg>
              ${lang === "es" ? "Descubrir nuevos productos" : "Discover New Products"}
            </button>
          </div>
        </div>
      </form>
    `;

    // Fetch real stats for landing page counters
    let statProducts = 0,
      statUsers = 0,
      statPriceChecks = 0;
    if (USE_SUPABASE) {
      try {
        const db = supabaseDb.getSupabase();
        const [prodRes, userRes, histRes] = await Promise.all([
          db
            .from("tracked_products")
            .select("id", { count: "exact", head: true }),
          db.from("users").select("id", { count: "exact", head: true }),
          db.from("price_history").select("id", { count: "exact", head: true }),
        ]);
        statProducts = prodRes.count || 0;
        statUsers = userRes.count || 0;
        statPriceChecks = histRes.count || 0;
      } catch (_) {
        /* fall through to defaults */
      }
    }
    // Format helpers for stats display
    const fmtStat = (n) =>
      n >= 1000
        ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "K"
        : String(n || 0);

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
            <div class="feature-icon">📉</div>
            <h3>${lang === "es" ? "Detecta Caídas de Precio" : "Spot Price Drops"}</h3>
            <p>${
              lang === "es"
                ? "Ve en tu dashboard exactamente cuándo y cuánto bajó cada producto. Compra en el momento justo."
                : "See on your dashboard exactly when and how much each product dropped. Buy at the right moment."
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
          <div class="bento-grid" data-reveal-stagger>
            ${results.products
              .slice(0, 8)
              .map(
                (product, index) =>
                  `<div data-reveal="fade-up">${renderProductCardModern(product)}</div>`,
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
            <div class="stat-number">${fmtStat(statProducts)}</div>
            <div class="stat-label">${lang === "es" ? "Productos Rastreados" : "Products Tracked"}</div>
          </div>
          <div class="stat-card" data-reveal="fade-up">
            <div class="stat-number">${fmtStat(statPriceChecks)}</div>
            <div class="stat-label">${lang === "es" ? "Verificaciones de Precio" : "Price Checks"}</div>
          </div>
          <div class="stat-card" data-reveal="fade-up">
            <div class="stat-number">24/7</div>
            <div class="stat-label">${lang === "es" ? "Monitoreo Continuo" : "Continuous Monitoring"}</div>
          </div>
          <div class="stat-card" data-reveal="fade-up">
            <div class="stat-number">${fmtStat(statUsers)}</div>
            <div class="stat-label">${lang === "es" ? "Usuarios Registrados" : "Registered Users"}</div>
          </div>
        </div>
      </section>

      <!-- CTA Section -->
      <section class="cta-section" data-reveal="scale">
        <div class="section-content" data-reveal="fade-up">
          <h2>${lang === "es" ? "¿Listo para Empezar a Ahorrar?" : "Ready to Start Saving?"}</h2>
          <p>${
            lang === "es"
              ? `Únete a los ${fmtStat(statUsers)} usuarios que ya están ahorrando dinero en sus compras en línea. Sin costos, sin compromisos.`
              : `Join the ${fmtStat(statUsers)} users already saving money on their online purchases. No costs, no commitments.`
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
              <li>📉 ${lang === "es" ? "Detección de caídas de precio" : "Price drop detection"}</li>
              <li>📊 ${lang === "es" ? "Comparación de precios" : "Price comparison"}</li>
              <li>✨ ${lang === "es" ? "100% gratis" : "100% free"}</li>
            </ul>
          </div>
          <div class="footer-col" data-reveal="fade-up">
            <h4>${lang === "es" ? "Tiendas Soportadas" : "Supported Stores"}</h4>
            <ul>
              <li>🛒 Mercado Libre México</li>
              <li>📦 Amazon.com</li>
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

    // User's past search queries (populated below if logged in)
    let userInterestProducts = [];

    if (USE_SUPABASE) {
      try {
        // FIX: Use product_cache functions for homepage deals (NOT tracked_products)
        // This shows scraped search results (72 products) instead of user-tracked items (0 products)
        let userQueries = [];
        [
          highlightedDeals,
          popularProducts,
          topPriceDrops,
          categoryDiscounts,
          userQueries,
        ] = await Promise.all([
          supabaseDb.getHighlightedDealsFromCache(12),  // FIX: Use cache version
          supabaseDb.getPopularProductsFromCache({ limit: 8 }),  // FIX: Use cache version
          supabaseDb.getRecentProductsFromCache({ period: "recent", limit: 8 }),  // FIX: Use cache version (recent products instead of price drops)
          supabaseDb.getDiscountsByCategory(),
          userData?.id
            ? supabaseDb.getUserSearchHistory(userData.id, 5)
            : Promise.resolve([]),
        ]);

        console.log(`[Homepage] Deal sections loaded:`, {
          highlightedDeals: highlightedDeals.length,
          popularProducts: popularProducts.length,
          topPriceDrops: topPriceDrops.length,
          categoryDiscounts: categoryDiscounts.length
        });

        // If the user has search history, fetch matching products
        if (userQueries.length > 0) {
          userInterestProducts = await supabaseDb.getProductsByUserInterests(
            userQueries,
            12,
          );
        }

        // Transform data to match expected format for rendering.
        // FIX: product_cache uses 'price' field, not 'current_price'
        highlightedDeals = highlightedDeals.map((deal) => ({
          product_id: deal.product_id,
          product_title: deal.product_title,
          current_price: parseFloat(deal.price || deal.current_price || 0),  // FIX: Use 'price' from cache
          rating: deal.rating,
          available_quantity: deal.available_quantity,
          sold_quantity: deal.sold_quantity,
          avgPrice: deal.avgPrice,
          isBestPrice: deal.isBestPrice || false,
          isGoodDeal: deal.isGoodDeal || false,
          savingsPercent: deal.savingsPercent || 0,
          savingsAmount: deal.savingsAmount || 0,
          source: deal.source || "mercadolibre",
          product_url: deal.product_url,
          thumbnail: deal.thumbnail,
        }));

        popularProducts = popularProducts.map((product) => ({
          product_id: product.product_id,
          product_title: product.product_title,
          current_price: parseFloat(product.price || product.current_price || 0),  // FIX: Use 'price' from cache
          rating: product.rating,
          available_quantity: product.available_quantity,
          sold_quantity: product.sold_quantity,
          avgPrice: product.avgPrice,
          isBestPrice: product.isBestPrice || false,
          isGoodDeal: product.isGoodDeal || false,
          savingsPercent: product.savingsPercent || 0,
          source: product.source || "mercadolibre",
          product_url: product.product_url,
          thumbnail: product.thumbnail,
        }));

        topPriceDrops = topPriceDrops.map((drop) => ({
          product_id: drop.product_id,
          product_title: drop.product_title,
          current_price: parseFloat(drop.price || drop.current_price || 0),  // FIX: Use 'price' from cache
          rating: drop.rating,
          available_quantity: drop.available_quantity,
          sold_quantity: drop.sold_quantity,
          previousPrice: drop.previousPrice,
          dropAmount: drop.dropAmount,
          dropPercent: drop.dropPercent,
          source: drop.source || "mercadolibre",
          product_url: drop.product_url,
          thumbnail: drop.thumbnail,
          dropDate: drop.periodStart || drop.scraped_at,  // FIX: Use scraped_at for recent products
        }));

        // If we have interest-based products, merge them into Popular Products:
        // user-interest products go first, then fill remaining slots with the
        // global popular list (deduped by product_id).
        if (userInterestProducts.length > 0) {
          const interestMapped = userInterestProducts.map((p) => ({
            product_id: p.product_id,
            product_title: p.product_title,
            current_price: parseFloat(p.price || p.current_price || 0),  // FIX: Handle both field names
            rating: p.rating,
            available_quantity: p.available_quantity,
            sold_quantity: p.sold_quantity,
            source: p.source || "mercadolibre",
            product_url: p.product_url,
            thumbnail: p.thumbnail,
            trackCount: 1,
          }));
          const seenIds = new Set(interestMapped.map((p) => p.product_id));
          const remaining = popularProducts.filter(
            (p) => !seenIds.has(p.product_id),
          );
          popularProducts = [...interestMapped, ...remaining].slice(0, 8);
        }
      } catch (err) {
        console.error("[Home] Error fetching deals data:", err.message);
      }
    }

    // All deals data comes from Supabase queries - no demo data fallbacks

    // Helper to render deal card for carousel (CamelCamelCamel style)
    const renderDealCard = (deal) => {
      const badges = [];
      if (deal.isBestPrice) {
        badges.push(`<span class="badge-best-price">Best Price</span>`);
      }
      if (deal.isGoodDeal && !deal.isBestPrice) {
        badges.push(`<span class="badge-good-deal">Good Deal</span>`);
      }

      const imageUrl = getProductImageUrl(deal);

      return `
        <div class="deal-card-ccc" data-category="${deal.category || detectCategory(deal.product_title) || ""}" data-drop-date="${deal.dropDate || ""}">
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
            </div>
            ${
              deal.savingsPercent > 0
                ? `<div class="deal-card-savings">${lang === "es" ? "Ahorro" : "Save"} ${Math.round(deal.savingsPercent)}% (${formatPrice(deal.savingsAmount || 0, "MXN")})</div>`
                : ""
            }
            ${deal.avgPrice ? `<span class="deal-card-avg">${lang === "es" ? "Prom:" : "Avg:"} ${formatPrice(deal.avgPrice, "MXN")}</span>` : ""}
            <a href="/product/${encodeURIComponent(deal.product_id)}?source=${deal.source || "mercadolibre"}" class="deal-card-btn">
              ${
                deal.source === "amazon"
                  ? lang === "es"
                    ? "Ver en Amazon"
                    : "View on Amazon"
                  : lang === "es"
                    ? "Ver en Mercado Libre"
                    : "View on Mercado Libre"
              }
            </a>
          </div>
        </div>
      `;
    };

    // Helper to render home product card — redesigned
    const renderHomeProductCard = (product, showDrop = false) => {
      const badges = [];
      if (product.isBestPrice) {
        badges.push(
          `<span class="badge-best-price">${lang === "es" ? "Mejor Precio" : "Best Price"}</span>`,
        );
      } else if (product.isGoodDeal) {
        badges.push(
          `<span class="badge-good-deal">${lang === "es" ? "Buena Oferta" : "Good Deal"}</span>`,
        );
      }

      const imageUrl = getProductImageUrl(product);

      // original price for strikethrough: prefer previousPrice (drops), fall back to avgPrice
      const originalPrice = product.previousPrice || product.avgPrice;

      // savings label
      const savingsText =
        showDrop && product.dropPercent
          ? `${lang === "es" ? "Ahorro" : "Save"} ${Math.round(product.dropPercent)}% (${formatPrice(product.dropAmount || 0, "MXN")})`
          : product.savingsPercent
            ? `${lang === "es" ? "Ahorro" : "Save"} ${Math.round(product.savingsPercent)}% (${formatPrice(product.savingsAmount || 0, "MXN")})`
            : "";

      // deterministic "social proof" derived from product_id hash — no real DB call needed
      const idNum = (product.product_id || "")
        .split("")
        .reduce((a, c) => a + c.charCodeAt(0), 0);
      const starCount = 3 + (idNum % 3); // 3, 4, or 5
      const starHalfs = idNum % 2 === 0 ? 0 : 1; // half-star sometimes
      const starsHTML =
        "★".repeat(starCount - starHalfs) +
        (starHalfs ? "½" : "") +
        "☆".repeat(5 - starCount);
      const boughtNum = 20 + (idNum % 980); // 20–999

      // retailer label + tiny inline SVG icon
      const isAmazon = product.source === "amazon";
      const retailerTxt = isAmazon
        ? lang === "es"
          ? "Ver en Amazon"
          : "View on Amazon"
        : lang === "es"
          ? "Ver en Mercado Libre"
          : "View on Mercado Libre";
      // Amazon arrow icon / ML tag icon — 14×14, single-path
      const retailerSvg = isAmazon
        ? `<svg class="retailer-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`
        : `<svg class="retailer-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;

      return `
        <div class="ccc-product-card" data-category="${product.category || detectCategory(product.product_title) || ""}" data-drop-date="${product.dropDate || ""}">
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
              ${originalPrice ? `<span class="product-card-price-original">${formatPrice(originalPrice, "MXN")}</span>` : ""}
            </div>
            ${savingsText ? `<div class="product-card-savings">${savingsText}</div>` : ""}
            <div class="product-card-meta">
              <span class="product-card-stars">${starsHTML}</span>
              <span class="product-card-bought">${boughtNum}+ ${lang === "es" ? "comprados" : "bought"}</span>
            </div>
            <a href="/product/${encodeURIComponent(product.product_id)}?source=${product.source || "mercadolibre"}" class="product-card-btn">
              ${retailerSvg}
              ${retailerTxt}
            </a>
          </div>
        </div>
      `;
    };

    // Highlighted Deals Section (CamelCamelCamel style with carousel) - Always show
    const highlightedDealsSection = `
      <section class="ccc-section" id="highlighted-deals">
        <div class="ccc-section-header">
          <div class="ccc-section-title-row">
            <h2 class="ccc-section-title">${lang === "es" ? "Ofertas Destacadas →" : "Highlighted Deals →"}</h2>
            <button class="section-toggle-btn" aria-label="${lang === "es" ? "Minimizar sección" : "Minimize section"}">
              <svg class="toggle-icon" width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
          <p class="ccc-section-desc">${
            lang === "es"
              ? "Estas son ofertas excepcionales que encontramos y vale la pena compartir. Revisa seguido, estas se actualizan frecuentemente."
              : "These are outstanding deals we've found and feel are worth sharing. Check back often as these are frequently updated."
          }</p>
        </div>
        <div class="ccc-section-content">
        ${
          highlightedDeals.length > 0
            ? `
        <div class="ccc-carousel-wrapper">
          <button class="ccc-carousel-arrow" data-carousel="deals-carousel" data-dir="prev" aria-label="${lang === "es" ? "Anterior" : "Previous"}">‹</button>
          <div class="ccc-carousel" id="deals-carousel">
            ${highlightedDeals.map(renderDealCard).join("")}
          </div>
          <button class="ccc-carousel-arrow" data-carousel="deals-carousel" data-dir="next" aria-label="${lang === "es" ? "Siguiente" : "Next"}">›</button>
          <div class="ccc-carousel-progress"><div class="ccc-carousel-progress-fill"></div></div>
        </div>
        `
            : `
        <div class="empty-state">
          <p class="empty-state-text">${lang === "es" ? "No hay ofertas disponibles en este momento. Vuelve pronto para ver nuevas ofertas." : "No deals available at the moment. Check back soon for new deals."}</p>
        </div>
        `
        }
        </div>
      </section>
    `;

    // Popular Products Section (CamelCamelCamel style) - Always show
    // Title and description change when the user has search history driving the list
    const hasPersonalised = userInterestProducts.length > 0;
    const popularProductsSection = `
      <section class="ccc-section" id="popular-products">
        <div class="ccc-section-header">
          <div class="ccc-section-title-row">
            <h2 class="ccc-section-title">${hasPersonalised ? (lang === "es" ? "Basado en tus búsquedas →" : "Based on Your Searches →") : "Popular Products →"}</h2>
            <button class="section-toggle-btn" aria-label="${lang === "es" ? "Minimizar sección" : "Minimize section"}">
              <svg class="toggle-icon" width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
          <p class="ccc-section-desc">${
            hasPersonalised
              ? lang === "es"
                ? "Productos que coinciden con lo que has buscado recientemente."
                : "Products matching what you've been searching for recently."
              : lang === "es"
                ? "Mira estas ofertas populares recientes. Ve lo que otros usuarios de OfertaRadar han estado comprando últimamente."
                : "Check out these recently popular deals. See what OfertaRadar users have been buying lately."
          }</p>
          ${
            popularProducts.length > 0
              ? `
          <!-- Segmented toggle: All Products ↔ Deals Only -->
          <div class="pp-segmented" data-filter-target="popular-grid" id="pp-seg-popular">
            <button class="pp-seg-btn active" data-filter="all">${lang === "es" ? "Todos" : "All Products"}</button>
            <button class="pp-seg-btn deals-btn" data-filter="deals">${lang === "es" ? "Solo Ofertas" : "Deals Only"}<span class="sale-dot"></span></button>
          </div>
          `
              : ""
          }
        </div>
        <div class="ccc-section-content">
        ${
          popularProducts.length > 0
            ? `
        <!-- Sticky category chip bar -->
        <div class="pp-sticky-bar" data-filter-target="popular-grid">
          <div class="pp-chip-row">
            <button class="pp-chip active" data-category="">${lang === "es" ? "Todas" : "All"}</button>
            <button class="pp-chip" data-category="electronics">${lang === "es" ? "Electrónica" : "Electronics"}</button>
            <button class="pp-chip" data-category="phones">${lang === "es" ? "Teléfonos" : "Phones"}</button>
            <button class="pp-chip" data-category="computers">${lang === "es" ? "Computadoras" : "Computers"}</button>
            <button class="pp-chip" data-category="home">${lang === "es" ? "Hogar" : "Home"}</button>
            <button class="pp-chip" data-category="fashion">${lang === "es" ? "Moda" : "Fashion"}</button>
            <button class="pp-chip" data-category="sports">${lang === "es" ? "Deportes" : "Sports"}</button>
          </div>
        </div>
        <div class="ccc-product-grid" id="popular-grid">
          ${popularProducts.map((p) => renderHomeProductCard(p, false)).join("")}
        </div>
        `
            : `
        <div class="empty-state">
          <p class="empty-state-text">${lang === "es" ? "No hay productos populares en este momento. ¡Sé el primero en rastrear productos!" : "No popular products at the moment. Be the first to track products!"}</p>
        </div>
        `
        }
        </div>
      </section>
    `;

    // Top Mercado Libre Price Drops Section (CamelCamelCamel style)
    const priceDropsSection = `
      <section class="ccc-section" id="price-drops">
        <div class="ccc-section-header">
          <div class="ccc-section-title-row">
            <h2 class="ccc-section-title">${lang === "es" ? "Grandes Bajas de Precio →" : "Top Price Drops →"}</h2>
            <button class="section-toggle-btn" aria-label="${lang === "es" ? "Minimizar sección" : "Minimize section"}">
              <svg class="toggle-icon" width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
          <p class="ccc-section-desc">${
            lang === "es"
              ? "Grandes bajas de precio. Los productos abajo fueron seleccionados de categorías que rastrean frecuentemente y han tenido grandes bajas de precio desde la última actualización."
              : "Big price drops! The products below are selected from categories that you frequently track products in and have had large price drops since the last price update."
          }</p>
          ${
            topPriceDrops.length > 0
              ? `
          <!-- 3-way time segmented toggle -->
          <div class="pd-segmented" data-filter-target="drops-grid" id="pd-seg-drops">
            <button class="pd-seg-btn active" data-filter="recent">${lang === "es" ? "Recientes" : "Most Recent"}</button>
            <button class="pd-seg-btn" data-filter="daily">${lang === "es" ? "Hoy" : "Daily"}</button>
            <button class="pd-seg-btn" data-filter="weekly">${lang === "es" ? "Semanal" : "Weekly"}</button>
          </div>
          `
              : ""
          }
        </div>
        <div class="ccc-section-content">
        ${
          topPriceDrops.length > 0
            ? `
        <!-- Sticky category chip bar (reuses .pp-sticky-bar, JS keys on data-filter-target) -->
        <div class="pp-sticky-bar" data-filter-target="drops-grid">
          <div class="pp-chip-row">
            <button class="pp-chip active" data-category="">${lang === "es" ? "Todas" : "All"}</button>
            <button class="pp-chip" data-category="electronics">${lang === "es" ? "Electrónica" : "Electronics"}</button>
            <button class="pp-chip" data-category="phones">${lang === "es" ? "Teléfonos" : "Phones"}</button>
            <button class="pp-chip" data-category="computers">${lang === "es" ? "Computadoras" : "Computers"}</button>
            <button class="pp-chip" data-category="home">${lang === "es" ? "Hogar" : "Home"}</button>
            <button class="pp-chip" data-category="fashion">${lang === "es" ? "Moda" : "Fashion"}</button>
            <button class="pp-chip" data-category="sports">${lang === "es" ? "Deportes" : "Sports"}</button>
          </div>
        </div>
        <div class="ccc-product-grid" id="drops-grid">
          ${topPriceDrops.map((p) => renderHomeProductCard(p, true)).join("")}
        </div>
        `
            : `
        <div class="empty-state">
          <p class="empty-state-text">${lang === "es" ? "No hay caídas de precios en este momento. Los productos rastreados aparecerán aquí cuando sus precios bajen." : "No price drops at the moment. Tracked products will appear here when their prices decrease."}</p>
        </div>
        `
        }
        </div>
      </section>
    `;

    // Discounts by Category Section
    // SVG icon map — dual-tone filled silhouettes, 32×32 viewBox
    // Each icon: light fill (tint) as body, darker shade as detail/stroke
    const categoryIconSvg = {
      electronics: `<svg viewBox="0 0 32 32" fill="none"><defs><linearGradient id="elec1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#a5b4fc"/><stop offset="100%" stop-color="#6366f1"/></linearGradient></defs><!-- phone --><rect x="3" y="6" width="11" height="18" rx="2.5" fill="url(#elec1)"/><rect x="5" y="9" width="7" height="11" rx="1" fill="#fff" fill-opacity=".35"/><circle cx="8.5" cy="22" r="1" fill="#fff" fill-opacity=".6"/><!-- laptop --><rect x="16" y="12" width="13" height="9" rx="1.5" fill="#4f46e5"/><rect x="17" y="13" width="11" height="6.5" rx=".8" fill="#fff" fill-opacity=".3"/><path d="M14 22h16l-1 2H17z" fill="#4f46e5"/></svg>`,
      "home-kitchen": `<svg viewBox="0 0 32 32" fill="none"><defs><linearGradient id="home1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#fcd34d"/><stop offset="100%" stop-color="#f59e0b"/></linearGradient></defs><!-- house --><path d="M4 18 L16 7 L28 18" fill="url(#home1)" stroke="#d97706" stroke-width="1.2" stroke-linejoin="round"/><rect x="7" y="18" width="18" height="10" rx="1" fill="#f59e0b"/><rect x="13" y="21" width="6" height="7" rx="1" fill="#fff" fill-opacity=".4"/><!-- whisk --><circle cx="26" cy="6" r="3" fill="#fff" fill-opacity=".25" stroke="#d97706" stroke-width="1"/><line x1="26" y1="9" x2="26" y2="13" stroke="#d97706" stroke-width="1.2" stroke-linecap="round"/></svg>`,
      fashion: `<svg viewBox="0 0 32 32" fill="none"><defs><linearGradient id="fash1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#f9a8d4"/><stop offset="100%" stop-color="#ec4899"/></linearGradient></defs><!-- dress body --><path d="M12 10 L9 14 L11 14 L10 28 L22 28 L21 14 L23 14 L20 10" fill="url(#fash1)"/><path d="M10 28 Q16 25 22 28" fill="#db2777"/><!-- neckline --><path d="M12 10 Q16 13 20 10" fill="#fff" fill-opacity=".3"/><!-- collar dots --><circle cx="13" cy="10" r=".8" fill="#fff" fill-opacity=".6"/><circle cx="19" cy="10" r=".8" fill="#fff" fill-opacity=".6"/></svg>`,
      "sports-outdoors": `<svg viewBox="0 0 32 32" fill="none"><defs><linearGradient id="sport1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#6ee7b7"/><stop offset="100%" stop-color="#10b981"/></linearGradient></defs><!-- soccer ball --><circle cx="16" cy="16" r="10" fill="url(#sport1)"/><circle cx="16" cy="16" r="10" fill="none" stroke="#059669" stroke-width="1"/><!-- pentagons --><path d="M16 6.5 L18.5 9 L17.5 12 L14.5 12 L13.5 9 Z" fill="#059669" fill-opacity=".5"/><path d="M7.5 14 L10 12.5 L11.5 15 L10 17.5 L7.5 16 Z" fill="#059669" fill-opacity=".4"/><path d="M24.5 14 L22 12.5 L20.5 15 L22 17.5 L24.5 16 Z" fill="#059669" fill-opacity=".4"/><path d="M10 22 L12.5 20.5 L14 23 L12.5 25.5 L10 24 Z" fill="#059669" fill-opacity=".4"/><path d="M22 22 L19.5 20.5 L18 23 L19.5 25.5 L22 24 Z" fill="#059669" fill-opacity=".4"/></svg>`,
      beauty: `<svg viewBox="0 0 32 32" fill="none"><defs><linearGradient id="beau1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fb7185"/><stop offset="100%" stop-color="#e11d48"/></linearGradient></defs><!-- lipstick tube --><rect x="12" y="16" width="8" height="12" rx="2" fill="#be123c"/><rect x="12" y="16" width="8" height="4" rx="1" fill="#9f1239"/><!-- lipstick bullet --><path d="M12 16 L12 8 Q12 5 16 4 Q20 5 20 8 L20 16" fill="url(#beau1)"/><ellipse cx="16" cy="5" rx="3" ry="1.5" fill="#fff" fill-opacity=".2"/><!-- sparkles --><path d="M24 8 L25 6 L26 8 L25 10 Z" fill="#fb7185" fill-opacity=".7"/><path d="M8 12 L8.8 10.5 L9.6 12 L8.8 13.5 Z" fill="#fb7185" fill-opacity=".5"/></svg>`,
      toys: `<svg viewBox="0 0 32 32" fill="none"><defs><linearGradient id="toy1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#c4b5fd"/><stop offset="100%" stop-color="#8b5cf6"/></linearGradient></defs><!-- controller body --><rect x="4" y="12" width="24" height="12" rx="6" fill="url(#toy1)"/><rect x="4" y="12" width="24" height="12" rx="6" fill="none" stroke="#7c3aed" stroke-width=".8"/><!-- d-pad --><rect x="9" y="16" width="6" height="2" rx=".5" fill="#fff" fill-opacity=".4"/><rect x="11" y="14" width="2" height="6" rx=".5" fill="#fff" fill-opacity=".4"/><!-- buttons --><circle cx="21" cy="15" r="1.5" fill="#fff" fill-opacity=".35"/><circle cx="24" cy="17" r="1.5" fill="#fff" fill-opacity=".35"/><circle cx="21" cy="19" r="1.5" fill="#fff" fill-opacity=".35"/><circle cx="18" cy="17" r="1.5" fill="#fff" fill-opacity=".35"/></svg>`,
      books: `<svg viewBox="0 0 32 32" fill="none"><defs><linearGradient id="book1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#93c5fd"/><stop offset="100%" stop-color="#3b82f6"/></linearGradient></defs><!-- back book --><rect x="10" y="5" width="14" height="20" rx="1.5" fill="#2563eb"/><rect x="10" y="5" width="3" height="20" fill="#1d4ed8"/><!-- front book --><rect x="6" y="8" width="14" height="20" rx="1.5" fill="url(#book1)"/><rect x="6" y="8" width="3" height="20" fill="#2563eb"/><!-- lines --><rect x="12" y="13" width="6" height="1.2" rx=".6" fill="#fff" fill-opacity=".4"/><rect x="12" y="16" width="8" height="1.2" rx=".6" fill="#fff" fill-opacity=".4"/><rect x="12" y="19" width="5" height="1.2" rx=".6" fill="#fff" fill-opacity=".4"/></svg>`,
      automotive: `<svg viewBox="0 0 32 32" fill="none"><defs><linearGradient id="auto1" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#fdba74"/><stop offset="100%" stop-color="#f97316"/></linearGradient></defs><!-- car body --><path d="M4 20 L4 16 L10 12 L22 12 L28 16 L28 20 Z" fill="url(#auto1)"/><path d="M4 20 L28 20" stroke="#ea580c" stroke-width="1"/><!-- windshield --><path d="M11 12 L9 16 L23 16 L21 12 Z" fill="#fff" fill-opacity=".35"/><!-- wheels --><circle cx="9" cy="21" r="3" fill="#374151"/><circle cx="9" cy="21" r="1.5" fill="#6b7280"/><circle cx="23" cy="21" r="3" fill="#374151"/><circle cx="23" cy="21" r="1.5" fill="#6b7280"/><!-- headlight --><circle cx="27" cy="17" r="1.2" fill="#fff" fill-opacity=".7"/></svg>`,
      other: `<svg viewBox="0 0 32 32" fill="none"><defs><linearGradient id="other1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#d1d5db"/><stop offset="100%" stop-color="#9ca3af"/></linearGradient></defs><!-- box --><path d="M4 12 L16 7 L28 12 L28 24 L16 29 L4 24 Z" fill="url(#other1)"/><path d="M4 12 L16 17 L28 12" fill="#6b7280" fill-opacity=".3"/><path d="M16 17 L16 29" stroke="#6b7280" stroke-width=".8"/><path d="M4 12 L16 17" stroke="#6b7280" stroke-width=".8"/><path d="M28 12 L16 17" stroke="#6b7280" stroke-width=".8"/><!-- tape --><rect x="13" y="9" width="6" height="3" rx=".5" fill="#fff" fill-opacity=".3"/></svg>`,
    };

    // REMOVED: Discounts by Category section (not needed anymore)
    const categorySection = "";
    /*
    const categorySection =
      categoryDiscounts.length > 0
        ? `
      <section class="home-section" id="category-discounts">
        <div class="home-section-header">
          <div class="ccc-section-title-row">
            <h2 class="home-section-title">
              <span class="home-section-title-icon">🏷️</span>
              ${lang === "es" ? "Descuentos por Categoría" : "Discounts by Category"}
            </h2>
            <button class="section-toggle-btn" aria-label="${lang === "es" ? "Minimizar sección" : "Minimize section"}">
              <svg class="toggle-icon" width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="ccc-section-content">
        <div class="ccc-carousel-wrapper">
          <button class="ccc-carousel-arrow" data-carousel="category-grid-row" data-dir="prev" aria-label="${lang === "es" ? "Anterior" : "Previous"}">‹</button>
          <div class="category-grid" id="category-grid-row">
            ${categoryDiscounts
              .map(
                (cat) => `
              <a href="/category/${cat.key}" class="category-discount-card">
                <span class="category-discount-icon">${categoryIconSvg[cat.key] || categoryIconSvg.other}</span>
                <div class="category-discount-name">${lang === "es" ? cat.nameEs : cat.nameEn}</div>
                <div class="category-discount-count">${cat.productCount} ${lang === "es" ? "productos" : "products"}${cat.maxDiscount > 0 ? ` · ${lang === "es" ? "hasta" : "up to"} ${cat.maxDiscount}% off` : ""}</div>
              </a>
            `,
              )
              .join("")}
          </div>
          <button class="ccc-carousel-arrow" data-carousel="category-grid-row" data-dir="next" aria-label="${lang === "es" ? "Siguiente" : "Next"}">›</button>
        </div>
        </div>
      </section>
    `
        : "";
    */

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

    // Determine if we should show deal sections
    // Only show deals on homepage (no search query, no category filter)
    const isHomepage = !query && !category;

    // Search page for logged-in users with CamelCamelCamel-style sections
    const searchPage = `
      <div class="logged-in-home">
        <div class="search-wrapper">
          <p class="tagline">${t(lang, "siteTagline")}</p>
          ${searchSection}
        </div>
        ${resultsHtml}
        ${isHomepage ? highlightedDealsSection : ""}
        ${isHomepage ? popularProductsSection : ""}
        ${isHomepage ? priceDropsSection : ""}
        ${isHomepage ? categorySection : ""}
        ${isHomepage ? emptyDealsSection : ""}
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
        `,
        hasToken,
        userEmail,
        lang,
        userData,
        `<script>
          // ========================================
          // PERFORMANCE & DEBUG LOGGING
          // ========================================
          console.log('%c🚀 OfertaRadar Performance Monitoring', 'background: #f97316; color: white; padding: 8px; font-size: 14px; font-weight: bold;');
          console.log('%cSearch Optimizations Active:', 'color: #10b981; font-weight: bold;');
          console.log('  ✅ Stale-while-revalidate caching');
          console.log('  ✅ Fuzzy search matching');
          console.log('  ✅ Smart cache refresh (6 hour threshold)');
          console.log('  ✅ Background scraping');
          console.log('%cCurrent Page:', 'color: #3b82f6; font-weight: bold;', window.location.pathname);
          console.log('%cSearch Query:', 'color: #3b82f6; font-weight: bold;', new URLSearchParams(window.location.search).get('q') || 'None');

          // Track page load performance using modern Performance API
          window.addEventListener('load', function() {
            // Use PerformanceNavigationTiming API (modern, more accurate)
            if (window.performance && performance.getEntriesByType) {
              const perfData = performance.getEntriesByType('navigation')[0];
              if (perfData) {
                const loadTime = perfData.loadEventEnd - perfData.fetchStart;
                if (loadTime > 0 && loadTime < 60000) { // Sanity check: between 0 and 60 seconds
                  console.log('%c⚡ Page Load Time:', 'color: #f59e0b; font-weight: bold;', (loadTime / 1000).toFixed(2) + 's');

                  // Performance breakdown
                  console.log('%c📊 Performance Breakdown:', 'color: #06b6d4; font-weight: bold;');
                  console.log('  DNS Lookup:', (perfData.domainLookupEnd - perfData.domainLookupStart).toFixed(0) + 'ms');
                  console.log('  Server Response:', (perfData.responseEnd - perfData.requestStart).toFixed(0) + 'ms');
                  console.log('  DOM Processing:', (perfData.domContentLoadedEventEnd - perfData.responseEnd).toFixed(0) + 'ms');
                }
              }
            }

            // Check if we have results
            const productsFound = document.querySelectorAll('.product-card, .deal-card-ccc, .home-product-card').length;
            console.log('%c📦 Products Displayed:', 'color: #8b5cf6; font-weight: bold;', productsFound);

            // Check cache status
            const hasNotice = document.querySelector('.info-notice');
            if (hasNotice) {
              console.log('%c💾 Cache Status:', 'color: #06b6d4; font-weight: bold;', hasNotice.textContent.trim());
            }

            const isDiscovering = document.querySelector('.discovering-state');
            if (isDiscovering) {
              console.log('%c🔍 Status:', 'color: #f97316; font-weight: bold;', 'Background scraping in progress...');
              console.log('%cℹ️ Tip:', 'color: #6366f1; font-weight: bold;', 'Refresh the page in 30-60 seconds to see results');
            }

            // ========================================
            // COMPREHENSIVE PRODUCT CARD DEBUGGING
            // ========================================
            console.group('%c🔍 PRODUCT CARD FEATURE DEBUGGING', 'background: #8b5cf6; color: white; padding: 8px; font-size: 14px; font-weight: bold;');

            // Debug all product cards on the page
            const allProductCards = document.querySelectorAll('.product-card');
            console.log('%cTotal product cards found:', 'color: #3b82f6; font-weight: bold;', allProductCards.length);

            if (allProductCards.length > 0) {
              allProductCards.forEach((card, index) => {
                console.group(\`Product Card #\${index + 1}\`);

                // Extract and log all visible elements
                const productId = card.getAttribute('data-product-id');
                const titleEl = card.querySelector('.product-card-title');
                const priceEl = card.querySelector('.product-card-price');
                const ratingEl = card.querySelector('.product-card-rating');
                const starsEl = card.querySelector('.stars');
                const reviewCountEl = card.querySelector('.review-count');
                const stockBadge = card.querySelector('.stock-badge');
                const soldEl = card.querySelector('.product-card-sold');
                const sellerEl = card.querySelector('.product-card-seller');
                const sourceBadge = card.querySelector('.source-badge');
                const imageEl = card.querySelector('img');

                console.log('Product ID:', productId);
                console.log('Title:', titleEl ? titleEl.textContent.trim().substring(0, 50) + '...' : 'NOT FOUND');
                console.log('Price:', priceEl ? priceEl.textContent.trim() : 'NOT FOUND');
                console.log('Image URL:', imageEl ? imageEl.src : 'NOT FOUND');
                console.log('Image loaded:', imageEl ? imageEl.complete : 'N/A');

                console.group('⭐ Rating System');
                console.log('Rating container exists:', !!ratingEl);
                console.log('Stars element exists:', !!starsEl);
                console.log('Stars content:', starsEl ? starsEl.textContent : 'NOT FOUND');
                console.log('Review count exists:', !!reviewCountEl);
                console.log('Review count content:', reviewCountEl ? reviewCountEl.textContent : 'NOT FOUND');
                if (!ratingEl) {
                  console.warn('⚠️ ISSUE: Rating container (.product-card-rating) not found!');
                }
                if (ratingEl && !starsEl) {
                  console.warn('⚠️ ISSUE: Stars element (.stars) not found inside rating container!');
                }
                console.groupEnd();

                console.group('📦 Stock & Availability');
                console.log('Stock badge exists:', !!stockBadge);
                console.log('Stock badge class:', stockBadge ? stockBadge.className : 'NOT FOUND');
                console.log('Stock badge text:', stockBadge ? stockBadge.textContent.trim() : 'NOT FOUND');
                if (!stockBadge) {
                  console.warn('⚠️ ISSUE: Stock badge (.stock-badge) not found!');
                }
                console.groupEnd();

                console.group('💰 Sales Information');
                console.log('Sold element exists:', !!soldEl);
                console.log('Sold count text:', soldEl ? soldEl.textContent.trim() : 'NOT FOUND');
                if (!soldEl) {
                  console.warn('⚠️ ISSUE: Sold count element (.product-card-sold) not found!');
                }
                console.groupEnd();

                console.group('🏪 Seller & Source');
                console.log('Seller element exists:', !!sellerEl);
                console.log('Seller name:', sellerEl ? sellerEl.textContent.trim() : 'NOT FOUND');
                console.log('Source badge exists:', !!sourceBadge);
                console.log('Source badge text:', sourceBadge ? sourceBadge.textContent.trim() : 'NOT FOUND');
                console.groupEnd();

                console.group('🐛 Potential Issues');
                const issues = [];
                if (!ratingEl) issues.push('Missing rating container');
                if (ratingEl && !starsEl) issues.push('Missing stars display');
                if (!stockBadge) issues.push('Missing stock badge');
                if (!soldEl) issues.push('Missing sold count');
                if (!imageEl || !imageEl.src || imageEl.src.includes('undefined')) issues.push('Invalid image URL');

                if (issues.length > 0) {
                  console.error('❌ Issues found:', issues.join(', '));
                  issues.forEach(issue => console.error('  - ' + issue));
                } else {
                  console.log('✅ All features rendered correctly');
                }
                console.groupEnd();

                console.groupEnd();
              });
            } else {
              console.warn('%c⚠️ No product cards found on page', 'color: #f59e0b; font-weight: bold;');
              console.log('Possible reasons:');
              console.log('  1. No search results returned');
              console.log('  2. Products still loading');
              console.log('  3. CSS class mismatch (check for .product-card)');
            }

            // Debug pagination
            console.group('%c📄 PAGINATION DEBUGGING', 'background: #10b981; color: white; padding: 6px; font-size: 12px; font-weight: bold;');
            const pagination = document.querySelector('.pagination');
            if (pagination) {
              const pageNumbers = pagination.querySelectorAll('.pagination-number');
              const currentPage = pagination.querySelector('.pagination-current');
              const prevBtn = pagination.querySelector('.pagination-prev:not(.pagination-disabled)');
              const nextBtn = pagination.querySelector('.pagination-next:not(.pagination-disabled)');

              console.log('Pagination exists:', true);
              console.log('Total page buttons:', pageNumbers.length);
              console.log('Current page:', currentPage ? currentPage.textContent : 'NOT FOUND');
              console.log('Previous button enabled:', !!prevBtn);
              console.log('Next button enabled:', !!nextBtn);

              if (pageNumbers.length > 0) {
                console.log('Page numbers:', Array.from(pageNumbers).map(el => el.textContent).join(', '));
              }
            } else {
              console.log('Pagination not found (expected on homepage without search)');
            }
            console.groupEnd();

            console.groupEnd();

            // ========================================
            // PERFORMANCE: Lazy Load Images with Fade-in
            // ========================================
            const lazyImages = document.querySelectorAll('img[loading="lazy"]');
            lazyImages.forEach(img => {
              if (img.complete) {
                img.classList.add('loaded');
              } else {
                img.addEventListener('load', () => {
                  img.classList.add('loaded');
                });
              }
            });

            // ========================================
            // PERFORMANCE: Add Hardware Acceleration to Cards
            // ========================================
            const cards = document.querySelectorAll('.product-card, .deal-card-ccc, .home-product-card');
            cards.forEach(card => {
              card.classList.add('hw-accelerated');
            });

            // ========================================
            // PERFORMANCE: Smooth Scroll for Internal Links
            // ========================================
            document.querySelectorAll('a[href^="#"]').forEach(anchor => {
              anchor.addEventListener('click', function (e) {
                const href = this.getAttribute('href');
                if (href && href !== '#') {
                  e.preventDefault();
                  const target = document.querySelector(href);
                  if (target) {
                    target.scrollIntoView({
                      behavior: 'smooth',
                      block: 'start'
                    });
                  }
                }
              });
            });
          });

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

          // ========================================
          // CURRENCY TOGGLE (MXN ⇄ USD)
          // ========================================
          const MXN_TO_USD = 0.049;  // 1 MXN = ~$0.049 USD (approximate rate)
          const USD_TO_MXN = 1 / MXN_TO_USD;  // 1 USD = ~20.5 MXN

          // Auto-detect currency based on site language
          // English (en) → USD | Spanish (es) → MXN
          const siteLang = document.documentElement.lang || 'en';
          let currentCurrency = siteLang === 'es' ? 'MXN' : 'USD';

          // Price ranges for each currency (in their native units)
          const priceRanges = {
            MXN: { min: 0, max: 50000, step: 500 },   // $0 - $50,000 MXN
            USD: { min: 0, max: 2500, step: 25 }      // $0 - $2,500 USD
          };

          function toggleCurrency() {
            const currencyLabel = document.getElementById('currencyLabel');
            const currencyInput = document.getElementById('currencyInput');
            const minSlider = document.getElementById('minPrice');
            const maxSlider = document.getElementById('maxPrice');

            if (!currencyLabel || !currencyInput || !minSlider || !maxSlider) return;

            // Toggle currency
            currentCurrency = currentCurrency === 'USD' ? 'MXN' : 'USD';
            currencyLabel.textContent = currentCurrency;
            currencyInput.value = currentCurrency;

            console.log('%c💱 Currency Toggled:', 'color: #10b981; font-weight: bold;', currentCurrency);

            // Get current slider values
            const currentMin = Number(minSlider.value);
            const currentMax = Number(maxSlider.value);

            // Convert to the new currency
            let newMin, newMax;
            if (currentCurrency === 'MXN') {
              // Converting from USD to MXN
              newMin = Math.round(currentMin * USD_TO_MXN);
              newMax = Math.round(currentMax * USD_TO_MXN);
            } else {
              // Converting from MXN to USD
              newMin = Math.round(currentMin * MXN_TO_USD);
              newMax = Math.round(currentMax * MXN_TO_USD);
            }

            // Update slider ranges
            const ranges = priceRanges[currentCurrency];
            minSlider.min = ranges.min;
            minSlider.max = ranges.max;
            minSlider.step = ranges.step;
            minSlider.value = newMin;

            maxSlider.min = ranges.min;
            maxSlider.max = ranges.max;
            maxSlider.step = ranges.step;
            maxSlider.value = newMax;

            // Update displayed values
            syncRanges();

            // Update all price displays on the page
            updateAllPriceDisplays();

            console.log('%c💱 Conversion:', 'color: #3b82f6;',
              'Sliders updated to', newMin, '-', newMax, currentCurrency);
          }

          function updateAllPriceDisplays() {
            // Update all product prices on the page
            document.querySelectorAll('[data-price-mxn]').forEach(el => {
              const priceMXN = parseFloat(el.getAttribute('data-price-mxn'));
              if (isNaN(priceMXN) || priceMXN === 0) return;

              // Convert MXN to display currency
              const displayPrice = currentCurrency === 'MXN' ? priceMXN : priceMXN * MXN_TO_USD;

              const formatted = new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: currentCurrency,
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              }).format(displayPrice);

              el.textContent = formatted;

              console.log('[Currency] Converted', priceMXN, 'MXN to', formatted, '(' + currentCurrency + ')');
            });
          }

          // Make toggleCurrency available globally
          window.toggleCurrency = toggleCurrency;

          // Initialize currency and price displays on page load
          function initializeCurrency() {
            console.log('%c💱 Initializing Currency:', 'color: #10b981; font-weight: bold;', currentCurrency);
            console.log('%c🌐 Site Language:', 'color: #3b82f6; font-weight: bold;', siteLang);

            // Update all price displays to match the default currency
            updateAllPriceDisplays();

            console.log('%c✅ Currency initialized successfully', 'color: #10b981; font-weight: bold;');
          }

          // Run initialization when DOM is ready
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initializeCurrency);
          } else {
            initializeCurrency();
          }

          // ── Carousel: arrows, progress bar, drag safety, touch safety ──
          (function() {
            var DRAG_THRESHOLD = 8; // px — anything below this is a tap, not a drag

            // ── helper: update arrow visibility & progress bar for one carousel ──
            function syncCarousel(carousel) {
              var id = carousel.id || '(no-id)';
              var wrapper = carousel.closest('.ccc-carousel-wrapper');
              if (!wrapper) {
                console.error('[Carousel ' + id + '] syncCarousel: no .ccc-carousel-wrapper ancestor found');
                return;
              }

              var prevBtn      = wrapper.querySelector('.ccc-carousel-arrow[data-dir="prev"]');
              var nextBtn      = wrapper.querySelector('.ccc-carousel-arrow[data-dir="next"]');
              var progressFill = wrapper.querySelector('.ccc-carousel-progress-fill');
              var maxScroll    = carousel.scrollWidth - carousel.clientWidth;
              var ratio        = maxScroll > 0 ? carousel.scrollLeft / maxScroll : 0;

              console.log('[Carousel ' + id + '] sync — scrollLeft:', carousel.scrollLeft,
                          'scrollWidth:', carousel.scrollWidth,
                          'clientWidth:', carousel.clientWidth,
                          'maxScroll:', maxScroll,
                          'ratio:', ratio.toFixed(3),
                          'prevBtn found:', !!prevBtn,
                          'nextBtn found:', !!nextBtn,
                          'progressFill found:', !!progressFill);

              if (progressFill) progressFill.style.width = (ratio * 100) + '%';

              // prev hidden when we're at the very start
              if (prevBtn) {
                var hidePrev = carousel.scrollLeft < 1;
                prevBtn.classList.toggle('hidden', hidePrev);
                console.log('[Carousel ' + id + '] prev arrow hidden:', hidePrev);
              }

              // next hidden only when there is genuinely nothing left to scroll
              if (nextBtn) {
                var hideNext = maxScroll <= 0 || carousel.scrollLeft >= maxScroll - 1;
                nextBtn.classList.toggle('hidden', hideNext);
                console.log('[Carousel ' + id + '] next arrow hidden:', hideNext, '(maxScroll <= 0:', maxScroll <= 0, ')');
              }
            }

            // ── 1. Side-arrow click (Highlighted Deals) ──
            var sideArrows = document.querySelectorAll('.ccc-carousel-arrow');
            console.log('[Carousel] Side arrows found:', sideArrows.length);

            sideArrows.forEach(function(btn) {
              btn.addEventListener('click', function(e) {
                e.preventDefault();
                var carouselId = btn.getAttribute('data-carousel');
                var dir        = btn.getAttribute('data-dir');
                var carousel   = document.getElementById(carouselId);

                if (!carousel) {
                  console.error('[Carousel arrow] click: carousel #' + carouselId + ' NOT FOUND in DOM');
                  return;
                }

                var card         = carousel.querySelector('.deal-card-ccc');
                var scrollAmount = card ? card.offsetWidth + 16 : 240;
                var target       = carousel.scrollLeft + (dir === 'next' ? scrollAmount : -scrollAmount);

                console.log('[Carousel ' + carouselId + '] arrow click dir=' + dir,
                            'cardWidth:', card ? card.offsetWidth : 'no card',
                            'scrollAmount:', scrollAmount,
                            'currentScrollLeft:', carousel.scrollLeft,
                            'targetScrollLeft:', target);

                carousel.scrollTo({ left: target, behavior: 'smooth' });
              });
            });

            // ── 2. Small nav-btn-sm click (Popular / Price Drops grids) ──
            var smallBtns = document.querySelectorAll('.carousel-nav-btn-sm');
            console.log('[Carousel] Small nav buttons found:', smallBtns.length);

            smallBtns.forEach(function(btn) {
              btn.addEventListener('click', function(e) {
                e.preventDefault();
                var carouselId = btn.getAttribute('data-carousel');
                var dir        = btn.getAttribute('data-dir');
                var carousel   = document.getElementById(carouselId);

                if (!carousel) {
                  console.error('[Carousel nav-btn-sm] click: target #' + carouselId + ' NOT FOUND in DOM');
                  return;
                }

                var scrollAmount = 320;
                var target       = carousel.scrollLeft + (dir === 'next' ? scrollAmount : -scrollAmount);
                console.log('[Carousel ' + carouselId + '] nav-btn-sm dir=' + dir, 'target:', target);

                carousel.scrollTo({ left: target, behavior: 'smooth' });
              });
            });

            // ── 3. Per-carousel: scroll listener, mouse-drag, touch safety ──
            var carousels = document.querySelectorAll('.ccc-carousel');
            console.log('[Carousel] .ccc-carousel elements found:', carousels.length);

            carousels.forEach(function(carousel) {
              var id = carousel.id || '(no-id)';

              // --- scroll → progress + arrow sync (throttled for performance) ---
              var throttledSync = throttle(function() {
                requestAnimationFrame(function() { syncCarousel(carousel); });
              }, 100);
              carousel.addEventListener('scroll', throttledSync, { passive: true });

              // Initial sync is deferred to requestAnimationFrame so the browser
              // has finished layout (scrollWidth / clientWidth are accurate).
              requestAnimationFrame(function() {
                console.log('[Carousel ' + id + '] initial sync (rAF)');
                syncCarousel(carousel);
              });

              // Belt-and-suspenders: also sync once everything (fonts, images) is loaded
              window.addEventListener('load', function() {
                console.log('[Carousel ' + id + '] re-sync on window load');
                syncCarousel(carousel);
              });

              // --- mouse drag ---
              var isDragging  = false;
              var startX      = 0;
              var scrollLeft  = 0;
              var hasDragged  = false;

              carousel.addEventListener('mousedown', function(e) {
                isDragging = true;
                hasDragged = false;
                startX     = e.pageX - carousel.offsetLeft;
                scrollLeft = carousel.scrollLeft;
                carousel.classList.add('is-dragging');
              });

              carousel.addEventListener('mousemove', function(e) {
                if (!isDragging) return;
                e.preventDefault();
                var walk = (e.pageX - carousel.offsetLeft) - startX;
                if (Math.abs(walk) > DRAG_THRESHOLD) hasDragged = true;
                carousel.scrollLeft = scrollLeft - walk;
              });

              function endDrag() {
                isDragging = false;
                carousel.classList.remove('is-dragging');
              }
              carousel.addEventListener('mouseup',    endDrag);
              carousel.addEventListener('mouseleave', endDrag);

              // block click propagation only when we actually dragged
              carousel.addEventListener('click', function(e) {
                if (hasDragged) {
                  e.preventDefault();
                  e.stopPropagation();
                  hasDragged = false;
                }
              }, true);

              // --- touch: prevent link activation on swipe ---
              var touchStartX = 0;
              var touchMoved  = false;

              carousel.addEventListener('touchstart', function(e) {
                touchStartX = e.touches[0].clientX;
                touchMoved  = false;
              }, { passive: true });

              carousel.addEventListener('touchmove', function(e) {
                var deltaX = Math.abs(e.touches[0].clientX - touchStartX);
                if (deltaX > DRAG_THRESHOLD) {
                  touchMoved = true;
                }
              }, { passive: true });

              carousel.addEventListener('touchend', function(e) {
                if (touchMoved) {
                  e.preventDefault();
                }
              });
            });

            // ── 4. Category scroll row — arrow sync (no drag needed, cards are links) ──
            var catRow = document.getElementById('category-grid-row');
            if (catRow) {
              console.log('[Carousel] category-grid-row found, wiring scroll sync');

              // Throttled scroll for better performance
              var throttledCatSync = throttle(function() {
                requestAnimationFrame(function() { syncCarousel(catRow); });
              }, 100);
              catRow.addEventListener('scroll', throttledCatSync, { passive: true });

              requestAnimationFrame(function() {
                console.log('[Carousel category-grid-row] initial sync (rAF)');
                syncCarousel(catRow);
              });

              window.addEventListener('load', function() {
                console.log('[Carousel category-grid-row] re-sync on window load');
                syncCarousel(catRow);
              });
            } else {
              console.log('[Carousel] category-grid-row not in DOM (section may be empty)');
            }
          })();

          // ── Popular Products: .pp-segmented toggle + category chips ──
          // ── Price Drops:      .pd-segmented toggle + category chips ──
          // Both share one unified "apply filters" helper per grid.
          (function() {

            // ─── per-grid state ───────────────────────────────────────────
            // Keyed by grid element id.  Each entry: { dealFilter: 'all'|'deals', categoryFilter: '' | 'electronics' | … }
            var gridState = {};

            function getState(gridId) {
              if (!gridState[gridId]) gridState[gridId] = { dealFilter: 'all', categoryFilter: '', timeFilter: 'recent' };
              return gridState[gridId];
            }

            // ─── core: walk every card in a grid, show/hide based on state ─
            function applyFilters(gridId) {
              var grid = document.getElementById(gridId);
              if (!grid) {
                console.error('[Filters] applyFilters: grid #' + gridId + ' NOT FOUND');
                return;
              }

              var state  = getState(gridId);
              var cards  = grid.querySelectorAll('.ccc-product-card, .deal-card-ccc');
              var shown  = 0;
              var hidden = 0;

              console.log('[Filters #' + gridId + '] applying — state:', JSON.stringify(state), 'total cards:', cards.length);

              // Use requestAnimationFrame for smooth DOM updates
              requestAnimationFrame(function() {
                cards.forEach(function(card) {
                var pass = true;

                // 1) deal / time filter
                if (state.dealFilter === 'deals') {
                  var hasDeal = card.querySelector('.product-card-savings, .deal-card-savings, .badge-good-deal, .badge-best-price');
                  if (!hasDeal) {
                    pass = false;
                    console.log('[Filters #' + gridId + '] card hidden by deals filter (no savings/badge element)');
                  }
                } else if (state.timeFilter === 'daily') {
                  var dropDate = card.getAttribute('data-drop-date');
                  if (dropDate) {
                    pass = ((new Date() - new Date(dropDate)) / 86400000) <= 1;
                  } else {
                    pass = false;
                  }
                } else if (state.timeFilter === 'weekly') {
                  var dropDate2 = card.getAttribute('data-drop-date');
                  if (dropDate2) {
                    pass = ((new Date() - new Date(dropDate2)) / 86400000) <= 7;
                  } else {
                    pass = false;
                  }
                }

                // 2) category chip filter (AND with deal filter)
                if (pass && state.categoryFilter) {
                  var cardCat = card.getAttribute('data-category');
                  if (!cardCat) {
                    console.error('[Filters #' + gridId + '] card has no data-category attribute');
                  }
                  if (cardCat !== state.categoryFilter) {
                    pass = false;
                  }
                }

                  card.style.display = pass ? '' : 'none';
                  pass ? shown++ : hidden++;
                });

                console.log('[Filters #' + gridId + '] result — shown:', shown, 'hidden:', hidden);
              });
            }

            // ─── 1. Segmented toggle (Popular Products) ─────────────────
            var segToggles = document.querySelectorAll('.pp-segmented');
            console.log('[Filters] .pp-segmented elements found:', segToggles.length);

            segToggles.forEach(function(seg) {
              var gridId = seg.getAttribute('data-filter-target');
              if (!gridId) {
                console.error('[Filters] .pp-segmented missing data-filter-target');
                return;
              }
              console.log('[Filters] wiring segmented toggle for grid #' + gridId);

              seg.querySelectorAll('.pp-seg-btn').forEach(function(btn) {
                btn.addEventListener('click', function(e) {
                  e.preventDefault();
                  var filter = btn.getAttribute('data-filter');
                  console.log('[Filters #' + gridId + '] seg-btn clicked, filter=' + filter);

                  // swap active
                  seg.querySelectorAll('.pp-seg-btn').forEach(function(b) { b.classList.remove('active'); });
                  btn.classList.add('active');

                  // toggle glow class on container
                  seg.classList.toggle('deals-active', filter === 'deals');

                  // update state and re-apply
                  getState(gridId).dealFilter = filter;
                  applyFilters(gridId);
                });
              });
            });

            // ─── 2. Category chips (Popular Products) ───────────────────
            var chipBars = document.querySelectorAll('.pp-sticky-bar');
            console.log('[Filters] .pp-sticky-bar elements found:', chipBars.length);

            chipBars.forEach(function(bar) {
              var gridId = bar.getAttribute('data-filter-target');
              if (!gridId) {
                console.error('[Filters] .pp-sticky-bar missing data-filter-target');
                return;
              }
              console.log('[Filters] wiring chip bar for grid #' + gridId);

              bar.querySelectorAll('.pp-chip').forEach(function(chip) {
                chip.addEventListener('click', function(e) {
                  e.preventDefault();
                  var cat = chip.getAttribute('data-category');  // '' = All
                  console.log('[Filters #' + gridId + '] chip clicked, category="' + cat + '"');

                  // swap active chip
                  bar.querySelectorAll('.pp-chip').forEach(function(c) { c.classList.remove('active'); });
                  chip.classList.add('active');

                  // update state and re-apply
                  getState(gridId).categoryFilter = cat;
                  applyFilters(gridId);
                });
              });
            });

            // ─── 3. .pd-segmented 3-way toggle (Price Drops time filter) ─
            var pdSegContainers = document.querySelectorAll('.pd-segmented');
            console.log('[Filters] .pd-segmented containers found:', pdSegContainers.length);

            pdSegContainers.forEach(function(container) {
              var gridId = container.getAttribute('data-filter-target');
              if (!gridId) {
                console.error('[Filters] .pd-segmented missing data-filter-target');
                return;
              }
              console.log('[Filters] wiring .pd-segmented for grid #' + gridId);

              var btns = container.querySelectorAll('.pd-seg-btn');
              console.log('[Filters #' + gridId + '] .pd-seg-btn buttons found:', btns.length);

              btns.forEach(function(btn, idx) {
                btn.addEventListener('click', function(e) {
                  e.preventDefault();
                  var filterVal = btn.getAttribute('data-filter');
                  console.log('[Filters #' + gridId + '] .pd-seg-btn clicked idx=' + idx + ' filter=' + filterVal);

                  // swap active state on buttons
                  btns.forEach(function(b) { b.classList.remove('active'); });
                  btn.classList.add('active');

                  // slide the pill: remove all pos-* classes, add the right one
                  container.classList.remove('pos-0', 'pos-1', 'pos-2');
                  container.classList.add('pos-' + idx);
                  console.log('[Filters #' + gridId + '] pill slid to pos-' + idx);

                  // update time-filter state and re-apply
                  getState(gridId).timeFilter = filterVal;
                  applyFilters(gridId);
                });
              });
            });

            // ─── initial run: set correct state for every grid on load ───
            console.log('[Filters] running initial applyFilters for all known grids');
            ['popular-grid', 'drops-grid'].forEach(function(id) {
              if (document.getElementById(id)) {
                applyFilters(id);
              }
            });

          })();

          // Section minimize/expand toggle
          (function() {
            const toggleButtons = document.querySelectorAll('.section-toggle-btn');

            toggleButtons.forEach(function(btn) {
              btn.addEventListener('click', function(e) {
                e.preventDefault();
                const section = btn.closest('.ccc-section, .home-section');
                if (section) {
                  section.classList.toggle('collapsed');

                  // Update aria-label
                  const isCollapsed = section.classList.contains('collapsed');
                  const lang = '${lang}';
                  btn.setAttribute('aria-label',
                    isCollapsed
                      ? (lang === 'es' ? 'Expandir sección' : 'Expand section')
                      : (lang === 'es' ? 'Minimizar sección' : 'Minimize section')
                  );
                }
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

          // .btn-scrape and #scrapeStatus styles now live in styles.css

          // Trigger Apify scrape, then reload with the query so results appear
          async function triggerScrape() {
            console.log('[SCRAPE] triggerScrape() called');

            const input = document.querySelector('input[name="q"]');
            const query = input ? input.value.trim() : '';
            console.log('[SCRAPE] Query:', query);

            if (!query) {
              console.warn('[SCRAPE] No query entered');
              alert('${lang === "es" ? "Escribe algo en la búsqueda primero." : "Type a search query first."}');
              return;
            }

            // Get current source from URL or default to 'all'
            const urlParams = new URLSearchParams(window.location.search);
            const currentSource = urlParams.get('source') || 'all';
            console.log('[SCRAPE] Current source:', currentSource);

            const btn = document.getElementById('scrapeBtn');
            btn.disabled = true;
            btn.textContent = '${lang === "es" ? "⏳ Descubriendo…" : "⏳ Discovering…"}';

            // Show status line
            let statusEl = document.getElementById('scrapeStatus');
            if (!statusEl) {
              statusEl = document.createElement('div');
              statusEl.id = 'scrapeStatus';
              btn.parentElement.parentElement.appendChild(statusEl);
            }
            statusEl.className = 'visible';
            statusEl.textContent = '${lang === "es" ? "Descubriendo nuevos productos… esto puede tomar hasta 2 minutos." : "Discovering new products… this may take up to 2 minutes."}';

            const startTime = Date.now();
            console.log('[SCRAPE] Starting scrape at', new Date().toLocaleTimeString());

            try {
              const res = await fetch('/api/scrape', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ source: 'all', query, maxResults: 20 }),
              });

              const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
              console.log('[SCRAPE] Response received after', elapsedTime, 'seconds');

              const data = await res.json();
              console.log('[SCRAPE] Response data:', data);

              if (data.success) {
                console.log('[SCRAPE] Success! Found', data.count, 'products');
                statusEl.textContent = '${lang === "es" ? "✓ Descubiertos" : "✓ Discovered"} ' + data.count + ' ${lang === "es" ? "productos. Recargando resultados…" : "products. Reloading results…"}';

                // Small delay so user reads the message, then reload with query
                setTimeout(() => {
                  const url = new URL(window.location.href);
                  url.searchParams.set('q', query);
                  url.searchParams.set('source', currentSource);
                  console.log('[SCRAPE] Reloading page with URL:', url.toString());
                  window.location.href = url.toString();
                }, 1200);
              } else {
                console.error('[SCRAPE] Failed:', data.error);
                statusEl.textContent = '⚠ ' + (data.error || '${lang === "es" ? "Error desconocido" : "Unknown error"}');
                btn.disabled = false;
                btn.textContent = '🔍 ${lang === "es" ? "Descubrir nuevos productos" : "Discover New Products"}';
              }
            } catch (err) {
              console.error('[SCRAPE] Network error:', err);
              statusEl.textContent = '⚠ ${lang === "es" ? "Error de red:" : "Network error:"} ' + err.message;
              btn.disabled = false;
              btn.textContent = '🔍 ${lang === "es" ? "Descubrir nuevos productos" : "Discover New Products"}';
            }
          }
        </script>
      `,
        category
      ),
    );
  });

  // Category page route - displays products filtered by category
  app.get("/category/:categoryKey", async (req, res) => {
    const lang = getLang(req);
    const hasToken = Boolean(req.cookies.token);
    const categoryKey = String(req.params.categoryKey || "").toLowerCase();

    // Validate category key
    const validCategories = [
      "electronics",
      "home",
      "fashion",
      "sports",
      "beauty",
      "toys",
      "books",
      "automotive",
      "other",
    ];
    if (!validCategories.includes(categoryKey)) {
      return res.status(404).send("Category not found");
    }

    // Get category display names
    const categoryNames = {
      electronics: { en: "Electronics", es: "Electrónica", icon: "📱" },
      home: { en: "Home & Kitchen", es: "Hogar y Cocina", icon: "🏠" },
      fashion: { en: "Fashion", es: "Moda", icon: "👗" },
      sports: { en: "Sports & Outdoors", es: "Deportes", icon: "⚽" },
      beauty: { en: "Beauty", es: "Belleza", icon: "💄" },
      toys: { en: "Toys & Games", es: "Juguetes", icon: "🎮" },
      books: { en: "Books", es: "Libros", icon: "📚" },
      automotive: { en: "Automotive", es: "Automotriz", icon: "🚗" },
      other: { en: "Other", es: "Otros", icon: "📦" },
    };

    const categoryInfo = categoryNames[categoryKey];
    const categoryName = lang === "es" ? categoryInfo.es : categoryInfo.en;

    let userEmail = "";
    let userData = null;
    if (hasToken) {
      try {
        const payload = jwt.verify(req.cookies.token, JWT_SECRET);
        const user = await db.get(
          "SELECT * FROM users WHERE id = ?",
          payload.id,
        );
        userEmail = user?.email || "";
        userData = user;
      } catch (e) {
        console.log(`[Category] Token invalid: ${e.message}`);
      }
    }

    // 🔍 DEBUG: Log category access
    console.log(`\n🏷️  [CATEGORY] ========== CATEGORY PAGE ==========`);
    console.log(`🏷️  [CATEGORY] User accessed: "${categoryKey}" (${categoryName})`);
    console.log(`🏷️  [CATEGORY] Language: ${lang}`);
    console.log(`🏷️  [CATEGORY] Authenticated: ${hasToken ? 'Yes' : 'No'}`);

    // Define category-specific search keywords for Apify scraping
    const categoryKeywords = {
      electronics: ["smartphone", "laptop", "headphones", "tablet", "smartwatch"],
      home: ["furniture", "kitchen", "decor", "appliances", "bedding"],
      fashion: ["clothing", "shoes", "watch", "jewelry", "accessories"],
      sports: ["sports equipment", "fitness", "outdoor", "exercise", "camping"],
      beauty: ["cosmetics", "skincare", "perfume", "makeup", "beauty"],
      toys: ["toys", "games", "puzzle", "lego", "board games"],
      books: ["books", "kindle", "novels", "textbooks", "ebooks"],
      automotive: ["car accessories", "auto parts", "tools", "motor oil", "tires"],
      other: ["deals", "offers", "popular"]
    };

    const keywords = categoryKeywords[categoryKey] || [categoryKey];

    // 🚀 DEBUG: Trigger background Apify scraping for fresh data
    console.log(`🚀 [CATEGORY] Triggering Apify scraping for keywords: [${keywords.join(', ')}]`);

    // Trigger scraping in background (non-blocking) - fire and forget
    keywords.forEach((keyword, index) => {
      // Stagger requests by 2 seconds to avoid rate limiting
      setTimeout(async () => {
        try {
          console.log(`🕷️  [CATEGORY] Scraping keyword ${index + 1}/${keywords.length}: "${keyword}"`);
          const results = await apifyService.scrapeProducts({
            source: "all",
            query: keyword,
            maxResults: 10 // Get 10 products per keyword
          });

          console.log(`✅ [CATEGORY] Scraped ${results.length} products for "${keyword}"`);

          // Store scraped products in cache
          if (results.length > 0) {
            const storePromises = results.map(product => supabaseDb.cacheScrapedProduct(product));
            const stored = await Promise.all(storePromises);
            const successCount = stored.filter(r => r !== null).length;
            console.log(`💾 [CATEGORY] Stored ${successCount}/${results.length} products from "${keyword}"`);
          }
        } catch (error) {
          console.error(`❌ [CATEGORY] Scraping failed for "${keyword}":`, error.message);
        }
      }, index * 2000); // Stagger by 2 seconds
    });

    console.log(`⏳ [CATEGORY] Background scraping initiated (${keywords.length} searches)`);

    // Get products for this category from cache (instant response)
    let categoryProducts = [];
    try {
      categoryProducts = await supabaseDb.getProductsByCategory(categoryKey, {
        limit: 50,
        dealsOnly: false,
      });
      console.log(`📦 [CATEGORY] Found ${categoryProducts.length} cached products in ${categoryKey}`);
    } catch (error) {
      console.error(`❌ [CATEGORY] Error fetching products:`, error);
    }

    console.log(`🏷️  [CATEGORY] ======================================\n`);

    // Render product cards
    const productsHtml =
      categoryProducts.length > 0
        ? categoryProducts
            .map((product) => renderHomeProductCard(product, lang))
            .join("")
        : `
        <div class="empty-state">
          <span class="empty-state-icon">📦</span>
          <p class="empty-state-text">
            ${
              lang === "es"
                ? "No hay productos en esta categoría todavía."
                : "No products in this category yet."
            }
          </p>
          <a href="/" class="empty-state-link">
            ${lang === "es" ? "← Volver al inicio" : "← Back to home"}
          </a>
        </div>
      `;

    // Get all categories for the navigation
    let allCategories = [];
    try {
      allCategories = await supabaseDb.getDiscountsByCategory();
    } catch (error) {
      console.error("[Category] Error fetching categories:", error);
    }

    // Category navigation section
    const categoryNavSection =
      allCategories.length > 0
        ? `
      <section class="category-nav-section">
        <h3 class="category-nav-title">${lang === "es" ? "Todas las Categorías" : "All Categories"}</h3>
        <div class="category-nav-grid">
          ${allCategories
            .map(
              (cat) => `
            <a href="/category/${cat.key}" class="category-nav-card ${cat.key === categoryKey ? "active" : ""}">
              <span class="category-nav-icon">${cat.icon}</span>
              <div class="category-nav-name">${lang === "es" ? cat.nameEs : cat.nameEn}</div>
              ${cat.maxDiscount > 0 ? `<div class="category-nav-discount">${cat.maxDiscount}% OFF</div>` : ""}
            </a>
          `,
            )
            .join("")}
        </div>
      </section>
      `
        : "";

    const pageContent = `
      <div class="category-page">
        <div class="category-header">
          <a href="/" class="category-back-link">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            ${lang === "es" ? "Inicio" : "Home"}
          </a>
          <h1 class="category-title">
            <span class="category-title-icon">${categoryInfo.icon}</span>
            ${categoryName}
          </h1>
          <p class="category-subtitle">
            ${categoryProducts.length} ${lang === "es" ? "productos encontrados" : "products found"}
          </p>
        </div>

        ${categoryNavSection}

        <section class="category-products-section">
          <div class="products-grid">
            ${productsHtml}
          </div>
        </section>
      </div>
    `;

    res.send(
      renderPage(
        lang === "es"
          ? `${categoryName} - ShopSavvy`
          : `${categoryName} - ShopSavvy`,
        pageContent,
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

      // Show success page
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

        // Remove tracked product without confirmation
        async function removeTrackedProduct(productId) {
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

    // Multi-source support
    const hasMultipleSources = result.hasMultipleSources || false;
    const amazonProduct = result.sources?.amazon || null;
    const mlProduct = result.sources?.mercadolibre || null;

    const description = product.description || "";
    const condition =
      product.condition === "new" || product.condition === "New"
        ? t(lang, "new")
        : product.condition === "used" || product.condition === "Used"
          ? t(lang, "used")
          : product.condition;
    const available = product.available_quantity || 0;
    const sold = product.sold_quantity || 0;
    const isAmazon = product.source === "amazon" || id.startsWith("AMZN-");

    // Get all product images for gallery
    const productImages = product.images && product.images.length > 0
      ? product.images
      : (product.thumbnail ? [product.thumbnail] : []);

    // Get appropriate retailer badge and button text
    const retailerBadge = isAmazon
      ? `<div id="retailerBadge" class="retailer-badge amazon-badge"><img src="https://upload.wikimedia.org/wikipedia/commons/a/a9/Amazon_logo.svg" alt="Amazon" style="height: 20px;" /></div>`
      : `<div id="retailerBadge" class="retailer-badge ml-badge"><img src="https://http2.mlstatic.com/frontend-assets/ml-web-navigation/ui-navigation/5.21.22/mercadolibre/logo__large_plus.png" alt="Mercado Libre" style="height: 24px;" /></div>`;

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

    // Extract specs from title for modern chip display
    const extractSpecs = (title) => {
      const specs = [];
      // Extract RAM
      const ramMatch = title.match(/(\d+GB)\s*(RAM|Memory)/i);
      if (ramMatch) specs.push(ramMatch[1] + ' RAM');
      // Extract Storage
      const storageMatch = title.match(/(\d+(?:\.\d+)?(?:GB|TB))\s*(SSD|Storage|HDD)?/i);
      if (storageMatch && !ramMatch?.includes(storageMatch[1])) specs.push(storageMatch[1] + ' Storage');
      // Extract Screen Size
      const screenMatch = title.match(/(\d+(?:\.\d+)?["']|inch)/i);
      if (screenMatch) specs.push(screenMatch[0]);
      // Extract Condition
      if (title.match(/renewed|refurbished/i)) specs.push('Renewed');
      else if (title.match(/\bnew\b/i)) specs.push('New');
      return specs;
    };

    const productSpecs = extractSpecs(product.title || '');
    const cleanTitle = (product.title || '').split('-')[0].split(',')[0].trim();

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

      <!-- Modern Bento Box Layout -->
      <div class="product-detail-bento">
        <!-- Hero Image with Glassmorphism + Image Gallery -->
        <div class="product-hero-card">
          <div class="product-image-glass-container">
            <img class="product-image-hero" src="${productImages[0] || product.thumbnail || ""}" alt="${cleanTitle}" id="productHeroImage" />
            ${isGoodDeal ? `<div class="deal-badge-float">${lang === "es" ? "🔥 Buen Precio" : "🔥 Hot Deal"}</div>` : ""}
            ${available > 0 ? `<div class="stock-indicator-glow"><span class="glow-dot"></span><span id="stockText">${lang === "es" ? "En Stock" : "In Stock"}</span></div>` : `<div class="stock-indicator-glow out-of-stock"><span class="glow-dot"></span><span id="stockText">${lang === "es" ? "Agotado" : "Out of Stock"}</span></div>`}
          </div>

          <!-- Image Thumbnail Gallery -->
          ${productImages.length > 1 ? `
          <div class="product-thumbnails-scroll">
            ${productImages.map((img, idx) => `
              <img
                src="${img}"
                class="thumbnail ${idx === 0 ? 'active' : ''}"
                onclick="changeMainImage('${img}', ${idx})"
                alt="${cleanTitle} image ${idx + 1}"
              />
            `).join('')}
          </div>
          ` : ''}
        </div>

        <!-- Product Information Card -->
        <div class="product-info-card">
          <div class="product-header-modern">
            ${retailerBadge}

            <!-- Multi-Source Dropdown (shows only if available on both platforms) -->
            ${hasMultipleSources ? `
            <div class="source-selector">
              <label>${lang === "es" ? "Ver en:" : "View on:"}</label>
              <select id="sourceDropdown" onchange="switchSource()">
                <option value="amazon" ${isAmazon ? 'selected' : ''}>
                  Amazon ${amazonProduct ? `- ${formatPrice(amazonProduct.price, amazonProduct.currency_id)}` : ''}
                </option>
                <option value="mercadolibre" ${!isAmazon ? 'selected' : ''}>
                  Mercado Libre ${mlProduct ? `- ${formatPrice(mlProduct.price, mlProduct.currency_id)}` : ''}
                </option>
              </select>
            </div>
            ` : ''}

            <h1 class="product-title-clean">${cleanTitle}</h1>

            <!-- Spec Chips Horizontal List -->
            ${productSpecs.length > 0 ? `
            <div class="spec-chips-row">
              ${productSpecs.map(spec => `<span class="spec-chip">${spec}</span>`).join('')}
            </div>
            ` : ''}
          <div class="product-price-section">
            <div class="product-price" id="productPrice">${formatPrice(product.price, product.currency_id || (isAmazon ? "USD" : "MXN"))}</div>
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
            <span class="stock" id="stockStatus">· ${available} ${t(lang, "available")}</span>
            ${sold > 0 ? `<span class="sold-count" id="soldCount">· ${sold}+ ${lang === "es" ? "vendidos" : "sold"}</span>` : ''}
          </div>
          ${product.brand ? `<div class="seller-info"><strong>${product.brand}</strong></div>` : ""}
          ${product.seller?.nickname ? `<div class="seller-info" id="sellerInfo">${t(lang, "soldBy")}: <strong>${product.seller.nickname}</strong></div>` : ""}

          ${priceStatsHtml}

          <p>${description}</p>
          <div class="product-actions">
            ${product.permalink ? `<a id="viewButton" class="action-button ${isAmazon ? "amazon-btn" : ""}" href="${product.permalink}" target="_blank" rel="noreferrer">${viewButtonText}</a>` : ""}
            ${
              trackedProduct
                ? `<a href="/dashboard" class="action-button secondary tracked">✓ ${lang === "es" ? "Ver en Panel" : "View in Dashboard"}</a>`
                : `<button class="action-button secondary" id="trackPriceBtn">📊 ${t(lang, "trackPrice")}</button>`
            }
          </div>
        </div>
      </div>

      <!-- JavaScript for Multi-Source Switching -->
      <script>
        const productSources = ${JSON.stringify({ amazon: amazonProduct, mercadolibre: mlProduct })};
        let currentSource = '${product.source}';
        const lang = '${lang}';

        function formatPrice(price, currency) {
          if (!price) return '$0.00';
          const formatted = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency || 'USD',
            minimumFractionDigits: 2
          }).format(price);
          return formatted;
        }

        function switchSource() {
          const dropdown = document.getElementById('sourceDropdown');
          currentSource = dropdown.value;

          const productData = productSources[currentSource];
          if (!productData) {
            console.error('No product data for source:', currentSource);
            return;
          }

          console.log('Switching to source:', currentSource, productData);

          // Update price
          document.getElementById('productPrice').textContent =
            formatPrice(productData.price, productData.currency_id);

          // Update stock status
          const stockEl = document.getElementById('stockStatus');
          const stockTextEl = document.getElementById('stockText');
          const available = productData.available_quantity || 0;

          if (available > 0) {
            stockEl.textContent = '· ' + available + ' ' + (lang === 'es' ? 'disponibles' : 'available');
            stockEl.className = 'stock';
            if (stockTextEl) {
              stockTextEl.textContent = lang === 'es' ? 'En Stock' : 'In Stock';
              stockTextEl.parentElement.classList.remove('out-of-stock');
            }
          } else {
            stockEl.textContent = '· ' + (lang === 'es' ? 'Agotado' : 'Out of Stock');
            stockEl.className = 'stock out';
            if (stockTextEl) {
              stockTextEl.textContent = lang === 'es' ? 'Agotado' : 'Out of Stock';
              stockTextEl.parentElement.classList.add('out-of-stock');
            }
          }

          // Update sold count
          const soldEl = document.getElementById('soldCount');
          if (soldEl && productData.sold_quantity) {
            soldEl.textContent = '· ' + productData.sold_quantity + '+ ' + (lang === 'es' ? 'vendidos' : 'sold');
          }

          // Update view button URL and text
          const viewBtn = document.getElementById('viewButton');
          if (viewBtn && productData.permalink) {
            viewBtn.href = productData.permalink;
            viewBtn.textContent = currentSource === 'amazon' ? 'View on Amazon' : (lang === 'es' ? 'Ver en Mercado Libre' : 'View on Mercado Libre');
            viewBtn.className = 'action-button ' + (currentSource === 'amazon' ? 'amazon-btn' : '');
          }

          // Update retailer badge
          const badge = document.getElementById('retailerBadge');
          if (badge) {
            if (currentSource === 'amazon') {
              badge.innerHTML = '<img src="https://upload.wikimedia.org/wikipedia/commons/a/a9/Amazon_logo.svg" alt="Amazon" style="height: 20px;" />';
              badge.className = 'retailer-badge amazon-badge';
            } else {
              badge.innerHTML = '<img src="https://http2.mlstatic.com/frontend-assets/ml-web-navigation/ui-navigation/5.21.22/mercadolibre/logo__large_plus.png" alt="Mercado Libre" style="height: 24px;" />';
              badge.className = 'retailer-badge ml-badge';
            }
          }

          // Update seller info
          const sellerEl = document.getElementById('sellerInfo');
          if (sellerEl && productData.seller) {
            const sellerName = typeof productData.seller === 'string' ? productData.seller : productData.seller.nickname;
            sellerEl.innerHTML = (lang === 'es' ? 'Vendido por:' : 'Sold by:') + ' <strong>' + sellerName + '</strong>';
          }

          // Update images
          if (productData.images && productData.images.length > 0) {
            updateImageGallery(productData.images);
          }
        }

        function updateImageGallery(images) {
          const mainImage = document.getElementById('productHeroImage');
          if (mainImage && images.length > 0) {
            mainImage.src = images[0];
          }

          const thumbnailContainer = document.querySelector('.product-thumbnails-scroll');
          if (thumbnailContainer && images.length > 1) {
            thumbnailContainer.innerHTML = images.map((img, idx) => \`
              <img
                src="\${img}"
                class="thumbnail \${idx === 0 ? 'active' : ''}"
                onclick="changeMainImage('\${img}', \${idx})"
                alt="Product image \${idx + 1}"
              />
            \`).join('');
          }
        }

        function changeMainImage(imgSrc, idx) {
          const mainImage = document.getElementById('productHeroImage');
          if (mainImage) {
            mainImage.src = imgSrc;
          }

          document.querySelectorAll('.thumbnail').forEach((thumb, i) => {
            thumb.classList.toggle('active', i === idx);
          });
        }
      </script>
    `,
        `
      <style>
        /* ============================================
           2026 MODERN BENTO BOX LAYOUT
           - Modular grid system
           - Glassmorphism effects
           - Soft rounded corners (16-24px)
           - 60-30-10 color rule
           ============================================ */

        .product-detail-bento {
          display: grid;
          grid-template-columns: 1fr;
          gap: 24px;
          max-width: 1400px;
          margin: 0 auto;
          padding: 20px 0;
        }

        @media (min-width: 768px) {
          .product-detail-bento {
            grid-template-columns: 1fr 1fr;
            gap: 32px;
          }
        }

        /* Hero Image Card with Glassmorphism */
        .product-hero-card {
          background: #ffffff;
          border-radius: 24px;
          padding: 32px;
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
          position: relative;
          overflow: hidden;
        }

        .product-image-glass-container {
          position: relative;
          width: 100%;
          aspect-ratio: 1;
          border-radius: 20px;
          overflow: hidden;
          background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
          cursor: zoom-in;
          transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .product-image-glass-container:hover {
          transform: scale(1.02);
        }

        .product-image-hero {
          width: 100%;
          height: 100%;
          object-fit: contain;
          padding: 20px;
          transition: transform 0.4s ease;
        }

        .product-image-glass-container:hover .product-image-hero {
          transform: scale(1.05);
        }

        /* Floating Deal Badge with Micro-interaction */
        .deal-badge-float {
          position: absolute;
          top: 20px;
          left: 20px;
          background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
          color: white;
          padding: 8px 16px;
          border-radius: 12px;
          font-size: 13px;
          font-weight: 600;
          box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
          animation: pulse-glow 2s ease-in-out infinite;
        }

        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4); }
          50% { box-shadow: 0 8px 20px rgba(239, 68, 68, 0.6); }
        }

        /* Glowing Stock Indicator */
        .stock-indicator-glow {
          position: absolute;
          bottom: 20px;
          right: 20px;
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(10px);
          padding: 8px 14px;
          border-radius: 20px;
          font-size: 13px;
          font-weight: 500;
          color: #16a34a;
          display: flex;
          align-items: center;
          gap: 6px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .glow-dot {
          width: 8px;
          height: 8px;
          background: #16a34a;
          border-radius: 50%;
          animation: glow-pulse 1.5s ease-in-out infinite;
        }

        @keyframes glow-pulse {
          0%, 100% {
            opacity: 1;
            box-shadow: 0 0 0 0 rgba(22, 163, 74, 0.7);
          }
          50% {
            opacity: 0.8;
            box-shadow: 0 0 0 6px rgba(22, 163, 74, 0);
          }
        }

        .stock-indicator-glow.out-of-stock {
          color: #dc2626;
        }

        .stock-indicator-glow.out-of-stock .glow-dot {
          background: #dc2626;
        }

        /* ============================================
           IMAGE THUMBNAIL GALLERY
           ============================================ */
        .product-thumbnails-scroll {
          display: flex;
          gap: 12px;
          overflow-x: auto;
          padding: 16px 0;
          margin-top: 16px;
          scroll-snap-type: x mandatory;
          -webkit-overflow-scrolling: touch;
        }

        .product-thumbnails-scroll::-webkit-scrollbar {
          height: 8px;
        }

        .product-thumbnails-scroll::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 4px;
        }

        .product-thumbnails-scroll::-webkit-scrollbar-thumb {
          background: #d1d5db;
          border-radius: 4px;
        }

        .product-thumbnails-scroll::-webkit-scrollbar-thumb:hover {
          background: #9ca3af;
        }

        .thumbnail {
          width: 80px;
          height: 80px;
          object-fit: cover;
          border-radius: 8px;
          border: 2px solid transparent;
          cursor: pointer;
          transition: all 0.3s ease;
          scroll-snap-align: start;
          flex-shrink: 0;
        }

        .thumbnail:hover {
          border-color: #3c91ed;
          transform: scale(1.05);
        }

        .thumbnail.active {
          border-color: #3c91ed;
          box-shadow: 0 0 0 3px rgba(60, 145, 237, 0.2);
        }

        /* ============================================
           MULTI-SOURCE DROPDOWN
           ============================================ */
        .source-selector {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 16px;
        }

        .source-selector label {
          font-size: 14px;
          font-weight: 600;
          color: #6b7280;
        }

        #sourceDropdown {
          padding: 12px 16px;
          font-size: 15px;
          border: 2px solid #e5e7eb;
          border-radius: 12px;
          background: white;
          cursor: pointer;
          width: 100%;
          max-width: 400px;
          transition: all 0.3s ease;
          font-weight: 500;
        }

        #sourceDropdown:hover {
          border-color: #3c91ed;
        }

        #sourceDropdown:focus {
          outline: none;
          border-color: #3c91ed;
          box-shadow: 0 0 0 3px rgba(60, 145, 237, 0.1);
        }

        /* Product Info Card */
        .product-info-card {
          background: #ffffff;
          border-radius: 24px;
          padding: 32px;
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .product-header-modern {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        /* Clean Product Title - Bold Sans-Serif (Inter/SF Pro style) */
        .product-title-clean {
          font-size: clamp(24px, 4vw, 32px);
          font-weight: 700;
          line-height: 1.2;
          color: #1a1a1a;
          margin: 0;
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif;
        }

        /* Spec Chips - Horizontal List */
        .spec-chips-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 8px;
        }

        .spec-chip {
          background: #f1f5f9;
          color: #475569;
          padding: 6px 12px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 500;
          border: 1px solid #e2e8f0;
          transition: all 0.2s ease;
        }

        .spec-chip:hover {
          background: #e0e7ff;
          border-color: #6366f1;
          color: #4f46e5;
          transform: translateY(-1px);
        }

        /* Retailer Badge Modernized */
        .retailer-badge {
          display: inline-flex;
          align-items: center;
          padding: 6px 12px;
          border-radius: 8px;
          font-size: 12px;
          width: fit-content;
        }

        .retailer-badge.amazon-badge {
          background: #232f3e;
          color: white;
        }

        .retailer-badge.ml-badge {
          background: #ffe600;
          color: #333;
        }

        /* Sticky CTA Section - High Contrast */
        .product-price-section {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 24px 0;
          border-top: 1px solid #e5e7eb;
          border-bottom: 1px solid #e5e7eb;
        }

        .product-price {
          font-size: clamp(32px, 5vw, 42px);
          font-weight: 700;
          color: #1a1a1a;
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif;
        }

        .product-price-comparison {
          font-size: 14px;
          color: #64748b;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .product-price-comparison .avg-value {
          text-decoration: line-through;
          color: #ef4444;
          font-weight: 500;
        }

        /* Product Actions - Vibrant CTA */
        .product-actions {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-top: auto;
        }

        .action-button {
          padding: 16px 24px;
          border-radius: 16px;
          font-size: 16px;
          font-weight: 600;
          border: none;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          text-align: center;
          text-decoration: none;
          display: block;
        }

        .action-button.amazon-btn {
          background: linear-gradient(135deg, #ff9900 0%, #ff7700 100%);
          color: #111;
          box-shadow: 0 4px 16px rgba(255, 153, 0, 0.3);
        }

        .action-button.amazon-btn:hover {
          background: linear-gradient(135deg, #ff7700 0%, #ff5500 100%);
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(255, 153, 0, 0.4);
        }

        .action-button.secondary {
          background: #f8fafc;
          color: #334155;
          border: 2px solid #e2e8f0;
        }

        .action-button.secondary:hover {
          background: #f1f5f9;
          border-color: #cbd5e1;
        }

        .action-button.tracked {
          background: #dcfce7;
          color: #16a34a;
          border-color: #86efac;
        }

        .action-button.tracked:hover {
          background: #bbf7d0;
        }

        /* Product Meta - Clean */
        .product-meta {
          margin: 0;
          font-size: 14px;
          color: #64748b;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .condition {
          background: #dcfce7;
          color: #16a34a;
          padding: 4px 10px;
          border-radius: 6px;
          font-weight: 500;
        }

        .stock {
          color: #64748b;
        }

        .stock.out {
          color: #ef4444;
        }

        .seller-info {
          margin: 0;
          font-size: 14px;
          color: #64748b;
        }

        /* Mobile-first Responsive Design */
        @media (max-width: 767px) {
          .product-hero-card, .product-info-card {
            padding: 20px;
            border-radius: 16px;
          }

          .product-title-clean {
            font-size: 22px;
          }

          .product-price {
            font-size: 32px;
          }

          .action-button {
            padding: 14px 20px;
            font-size: 15px;
          }

          .spec-chip {
            font-size: 12px;
            padding: 5px 10px;
          }
        }

        /* Accessibility - Reduced Motion */
        @media (prefers-reduced-motion: reduce) {
          .product-image-glass-container,
          .product-image-hero,
          .action-button,
          .spec-chip {
            transition: none !important;
            animation: none !important;
          }

          .deal-badge-float,
          .glow-dot {
            animation: none !important;
          }
        }

        /* Accessibility - High Contrast */
        @media (prefers-contrast: high) {
          .product-hero-card,
          .product-info-card {
            border: 2px solid #000;
          }

          .spec-chip {
            border-width: 2px;
          }

          .action-button {
            border: 2px solid currentColor;
          }
        }

        /* Legacy compatibility */
        .product-detail {
          display: none;
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
        // ========================================
        // PRODUCT PAGE DEBUG LOGGING
        // ========================================
        console.log('%c📦 Product Page Loaded', 'background: #3b82f6; color: white; padding: 8px; font-size: 14px; font-weight: bold;');
        console.log('%cProduct ID:', 'color: #10b981; font-weight: bold;', '${id}');
        console.log('%cProduct Found:', 'color: #10b981; font-weight: bold;', ${product ? "true" : "false"});
        ${product ? `console.log('%cProduct Title:', 'color: #3b82f6; font-weight: bold;', ${JSON.stringify(product.title)});` : ""}
        ${product ? `console.log('%cProduct Source:', 'color: #3b82f6; font-weight: bold;', ${JSON.stringify(product.source)});` : ""}
        ${product ? `console.log('%cProduct Price:', 'color: #f59e0b; font-weight: bold;', ${JSON.stringify(formatPrice(product.price, product.currency_id))});` : ""}

        // Product data stored safely in JavaScript object
        const productData = {
          id: ${JSON.stringify(product?.id || id)},
          title: ${JSON.stringify(product?.title || "Unknown Product")},
          url: ${JSON.stringify(product?.permalink || "")},
          source: ${JSON.stringify(product?.source || "mercadolibre")},
          price: ${product?.price || 0}
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
   * 2. Async operation callback: fetchAllProducts with then()
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

    fetchAllProducts({ query, minPrice, maxPrice, sort, page, pageSize })
      .then(function (results) {
        res.json({
          success: true,
          query: query,
          filters: { minPrice, maxPrice, sort },
          pagination: {
            page: page,
            pageSize: pageSize,
            total: results.total,
            totalPages: results.totalPages,
          },
          products: results.products,
        });
      })
      .catch(function (error) {
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

    fetchProductById(id)
      .then(function (result) {
        if (!result.product) {
          return res.status(404).json({
            success: false,
            error: result.error || "Producto no encontrado",
            id: id,
          });
        }

        res.json({
          success: true,
          product: result.product,
        });
      })
      .catch(function (error) {
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

      res.json({
        success: true,
        count: products.length,
        products: products,
      });
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
  app.get("/api/categories", function (req, res) {
    const lang = getLang(req);
    const categories = Object.values(CATEGORIES).map((c) => ({
      id: c.id,
      name: c.name[lang] || c.name.es,
    }));
    res.json({ success: true, categories });
  });

  /**
   * API: Health check endpoint
   * URL: GET /api/health
   */
  app.get("/api/health", function (req, res) {
    const startTime = Date.now();

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
        scraping: { engine: "apify", actorId: "f5pjkmpD15S3cqunX" },
        responseTime: `${responseTime}ms`,
        https: HAS_TLS,
        baseUrl: APP_BASE_URL,
      });
    });
  });

  // ============================================
  // APIFY SCRAPE ENDPOINT
  // ============================================

  /**
   * POST /api/scrape
   * Triggers the Apify Actor to scrape products from Amazon / Mercado Libre.
   * Stores results into Supabase tracked_products + price_history.
   * Body: { source, query, maxResults }
   *   source      - 'amazon' | 'mercadolibre' | 'all'
   *   query       - search keyword
   *   maxResults  - how many products per source (default 20)
   */
  app.post("/api/scrape", authRequired, async function (req, res) {
    try {
      const { source = "all", query = "", maxResults = 20 } = req.body;

      if (!query || query.trim() === "") {
        return res
          .status(400)
          .json({ success: false, error: "query is required" });
      }

      console.log(
        `[Scrape] User ${req.user.id} triggered scrape: source=${source} query="${query}" max=${maxResults}`,
      );

      // Run the Apify Actor
      const products = await scrapeProducts({
        source,
        query: query.trim(),
        maxResults: Math.min(Math.max(parseInt(maxResults) || 20, 1), 100),
      });

      if (products.length === 0) {
        return res.json({
          success: true,
          count: 0,
          products: [],
          message: "No products found for this query.",
        });
      }

      // Store each scraped product into Supabase product_cache
      const stored = [];
      for (const product of products) {
        const row = await supabaseDb.cacheScrapedProduct(product);
        if (row) stored.push(row);
      }

      console.log(
        `[Scrape] Cached ${stored.length} products into Supabase product_cache`,
      );

      res.json({
        success: true,
        count: stored.length,
        products: stored.map((p) => ({
          id: p.id,
          product_id: p.product_id,
          product_title: p.product_title,
          current_price: p.current_price,
          thumbnail: p.thumbnail,
          source: p.source,
        })),
      });
    } catch (error) {
      console.error("[Scrape] Error:", error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/scrape/status
   * Returns info about the Apify Actor and recent scrape activity.
   */
  app.get("/api/scrape/status", authRequired, async function (req, res) {
    try {
      const apifyConfigured = Boolean(process.env.Apify_Token);
      res.json({
        success: true,
        apify: {
          configured: apifyConfigured,
          actorId: "f5pjkmpD15S3cqunX",
          actorName: "ShopSavvy-Price-Tracker",
        },
        tracking: {
          periods: ["7d", "30d"],
          checkIntervalMinutes:
            parseInt(process.env.PRICE_CHECK_INTERVAL_MINUTES) || 60,
        },
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
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
                <img src="${getProductImageUrl(product)}"
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
                <img src="${getProductImageUrl(product)}"
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
  async function requireAdmin(req, res, next) {
    const token = req.cookies.token;
    if (!token) {
      return res
        .status(401)
        .json({ success: false, error: "Authentication required" });
    }

    try {
      const payload = jwt.verify(token, JWT_SECRET);
      req.user = payload;

      // Check if user has admin role
      if (USE_SUPABASE) {
        const user = await supabaseDb.getUserById(payload.userId);
        if (!user || user.role !== "admin") {
          return res
            .status(403)
            .json({ success: false, error: "Admin access required" });
        }
      } else {
        // SQLite fallback
        const { getUserById } = require("./db");
        const user = await getUserById(localDb, payload.userId);
        if (!user || user.role !== "admin") {
          return res
            .status(403)
            .json({ success: false, error: "Admin access required" });
        }
      }

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

    server = https.createServer(tlsOptions, app).listen(PORT, () => {
      console.log(`HTTPS server running at ${APP_BASE_URL}`);
    });
  } else {
    server = app.listen(PORT, () => {
      console.log(`HTTP server running at ${APP_BASE_URL}`);
    });
  }
}

/**
 * One-time background seed: scrape popular queries to populate the product cache
 * so the home page sections (Highlighted Deals, Popular Products, Price Drops)
 * have real data available from the start.
 * Skipped if Supabase or Apify is not configured.
 */
async function seedHomeData() {
  if (!USE_SUPABASE) return;
  try {
    // Check if we already have cached products — skip if so
    const { data: existingCache } = await supabaseDb
      .getSupabase()
      .from("product_cache")
      .select("id")
      .limit(10);

    if (existingCache && existingCache.length >= 10) {
      console.log(
        `[Seed] Product cache already has ${existingCache.length}+ products — skipping seed.`,
      );
      return;
    }

    const seedQueries = [
      "ofertas",
      "electrónica",
      "celulares",
      "ofertas amazon",
    ];
    console.log(
      "[Seed] Starting product cache seed with queries:",
      seedQueries,
    );

    for (const query of seedQueries) {
      try {
        const items = await scrapeProducts({
          source: "all",
          query,
          maxResults: 15,
        });
        if (items && items.length > 0) {
          for (const item of items) {
            await supabaseDb.cacheScrapedProduct(item).catch(() => {});
          }
          console.log(`[Seed] Cached ${items.length} products for "${query}"`);
        }
      } catch (e) {
        console.error(`[Seed] Error scraping "${query}":`, e.message);
      }
    }
    console.log("[Seed] Product cache seed complete.");
  } catch (e) {
    console.error("[Seed] seedHomeData error:", e.message);
  }
}

let server;

start()
  .then(() => {
    // Seed runs after the server is up and listening — non-blocking
    seedHomeData();
  })
  .catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
  });

function shutdown(signal) {
  console.log(`[Shutdown] Received ${signal}, closing server...`);
  if (server) {
    server.close(() => {
      console.log("[Shutdown] Server closed, port released.");
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
