/**
 * PRODUCT SPECIFICATION EXTRACTOR
 * Extracts real specs from Amazon/Mercado Libre API data
 * Handles: RAM, Storage, Screen Size, OS, Brand, Model
 */

/**
 * Extract comprehensive product specifications from title and attributes
 * @param {Object} product - Product object from API
 * @returns {Object} Extracted specifications
 */
function extractProductSpecs(product) {
  const title = (product.title || '').toLowerCase();
  const attributes = product.attributes || [];

  const specs = {
    brand: extractBrand(product),
    model: extractModel(product),
    ram: extractRAM(title, attributes),
    storage: extractStorage(title, attributes),
    screenSize: extractScreenSize(title, attributes),
    os: extractOS(title, attributes),
    processor: extractProcessor(title, attributes),
    color: extractColor(title, attributes),
    condition: extractCondition(product),
    connectivity: extractConnectivity(title, attributes)
  };

  // Clean up null values
  Object.keys(specs).forEach(key => {
    if (!specs[key]) delete specs[key];
  });

  return specs;
}

/**
 * Extract brand name
 */
function extractBrand(product) {
  // Try brand field first
  if (product.brand) return product.brand;

  // Try attributes
  if (product.attributes) {
    const brandAttr = product.attributes.find(attr =>
      attr.id === 'BRAND' || attr.name === 'Marca' || attr.name === 'Brand'
    );
    if (brandAttr) return brandAttr.value_name;
  }

  // Extract from title
  const title = product.title || '';
  const brands = [
    'Apple', 'Samsung', 'Google', 'Motorola', 'Xiaomi', 'Huawei', 'OnePlus',
    'Sony', 'LG', 'Nokia', 'Oppo', 'Vivo', 'Realme', 'Asus', 'Lenovo',
    'HP', 'Dell', 'Acer', 'MSI', 'Razer', 'Microsoft', 'Amazon'
  ];

  for (const brand of brands) {
    if (new RegExp(`\\b${brand}\\b`, 'i').test(title)) {
      return brand;
    }
  }

  return null;
}

/**
 * Extract model number/name
 */
function extractModel(product) {
  const title = product.title || '';

  // iPhone models
  const iPhoneMatch = title.match(/iPhone\s+(\d+\s*(?:Pro|Plus|Max|Mini)?(?:\s+Max)?)/i);
  if (iPhoneMatch) return `iPhone ${iPhoneMatch[1].trim()}`;

  // Samsung Galaxy models
  const galaxyMatch = title.match(/Galaxy\s+([A-Z]\d+|S\d+|Note\s*\d+|Z\s*Flip\s*\d*|Z\s*Fold\s*\d*)/i);
  if (galaxyMatch) return `Galaxy ${galaxyMatch[1].trim()}`;

  // Google Pixel models
  const pixelMatch = title.match(/Pixel\s+(\d+[a-zA-Z]*(?:\s+Pro)?)/i);
  if (pixelMatch) return `Pixel ${pixelMatch[1].trim()}`;

  // MacBook models
  const macbookMatch = title.match(/MacBook\s+(Pro|Air)\s*(M\d+)?(?:\s+(\d+\s*inch))?/i);
  if (macbookMatch) {
    let model = 'MacBook ' + macbookMatch[1];
    if (macbookMatch[2]) model += ' ' + macbookMatch[2];
    return model;
  }

  // Generic model extraction
  const modelMatch = title.match(/\b([A-Z]{1,3}\d{2,4}[A-Z]*)\b/);
  if (modelMatch) return modelMatch[1];

  return null;
}

/**
 * Extract RAM
 */
function extractRAM(title, attributes) {
  // Try attributes first
  const ramAttr = attributes.find(attr =>
    attr.id === 'RAM' || attr.name === 'RAM' || attr.name === 'Memoria RAM'
  );
  if (ramAttr) return ramAttr.value_name;

  // Extract from title
  const ramMatch = title.match(/(\d+)\s*GB\s*(?:de\s*)?(?:RAM|Memory|Memoria)/i);
  if (ramMatch) return `${ramMatch[1]}GB`;

  return null;
}

/**
 * Extract Storage
 */
function extractStorage(title, attributes) {
  // Try attributes first
  const storageAttr = attributes.find(attr =>
    attr.id === 'INTERNAL_MEMORY' ||
    attr.name === 'Almacenamiento' ||
    attr.name === 'Storage' ||
    attr.name === 'Internal Storage'
  );
  if (storageAttr) return storageAttr.value_name;

  // Extract from title (avoid RAM values)
  const storageMatch = title.match(/(\d+(?:\.\d+)?)\s*(GB|TB)\s*(?:SSD|HDD|Storage|ROM|Almacenamiento)?/i);
  if (storageMatch) {
    // Make sure it's not RAM
    const context = title.substring(Math.max(0, storageMatch.index - 20), storageMatch.index + 30);
    if (!/\bRAM\b/i.test(context)) {
      return `${storageMatch[1]}${storageMatch[2].toUpperCase()}`;
    }
  }

  return null;
}

/**
 * Extract Screen Size
 */
function extractScreenSize(title, attributes) {
  // Try attributes first
  const screenAttr = attributes.find(attr =>
    attr.id === 'SCREEN_SIZE' ||
    attr.name === 'Tamaño de pantalla' ||
    attr.name === 'Screen Size'
  );
  if (screenAttr) return screenAttr.value_name;

  // Extract from title
  const screenMatch = title.match(/(\d+(?:\.\d+)?)\s*(?:inch|pulgadas|"|'')/i);
  if (screenMatch) return `${screenMatch[1]}"`;

  return null;
}

/**
 * Extract Operating System
 */
function extractOS(title, attributes) {
  // Try attributes first
  const osAttr = attributes.find(attr =>
    attr.id === 'OPERATING_SYSTEM' ||
    attr.name === 'Sistema operativo' ||
    attr.name === 'Operating System'
  );
  if (osAttr) return osAttr.value_name;

  // Extract from title
  if (/iOS\s*\d+/i.test(title)) {
    const match = title.match(/iOS\s*(\d+)/i);
    return match ? `iOS ${match[1]}` : 'iOS';
  }

  if (/Android\s*\d+/i.test(title)) {
    const match = title.match(/Android\s*(\d+)/i);
    return match ? `Android ${match[1]}` : 'Android';
  }

  if (/Windows\s*\d+/i.test(title)) {
    const match = title.match(/Windows\s*(\d+)/i);
    return match ? `Windows ${match[1]}` : 'Windows';
  }

  if (/macOS/i.test(title)) return 'macOS';
  if (/ChromeOS/i.test(title)) return 'ChromeOS';

  return null;
}

/**
 * Extract Processor
 */
function extractProcessor(title, attributes) {
  // Try attributes first
  const cpuAttr = attributes.find(attr =>
    attr.id === 'PROCESSOR' ||
    attr.name === 'Procesador' ||
    attr.name === 'Processor'
  );
  if (cpuAttr) return cpuAttr.value_name;

  // Apple chips
  const appleMatch = title.match(/\b(M\d+(?:\s+Pro|Max|Ultra)?|A\d+\s*Bionic)\b/i);
  if (appleMatch) return appleMatch[1];

  // Qualcomm Snapdragon
  const snapdragonMatch = title.match(/Snapdragon\s*(\d+)/i);
  if (snapdragonMatch) return `Snapdragon ${snapdragonMatch[1]}`;

  // Intel
  const intelMatch = title.match(/Intel\s*(Core\s*i[3579]|Celeron|Pentium)(?:\s*-?\s*(\d+(?:th|st|nd|rd)?\s*Gen?))?/i);
  if (intelMatch) {
    let cpu = intelMatch[1];
    if (intelMatch[2]) cpu += ' ' + intelMatch[2];
    return cpu;
  }

  // AMD Ryzen
  const amdMatch = title.match(/Ryzen\s*([357])\s*(\d+)/i);
  if (amdMatch) return `Ryzen ${amdMatch[1]} ${amdMatch[2]}`;

  return null;
}

/**
 * Extract Color
 */
function extractColor(title, attributes) {
  // Try attributes first
  const colorAttr = attributes.find(attr =>
    attr.id === 'COLOR' ||
    attr.name === 'Color'
  );
  if (colorAttr) return colorAttr.value_name;

  // Common colors
  const colors = [
    'Black', 'White', 'Silver', 'Gold', 'Rose Gold', 'Space Gray', 'Midnight',
    'Starlight', 'Blue', 'Green', 'Red', 'Purple', 'Pink', 'Yellow', 'Orange',
    'Gray', 'Grey', 'Graphite', 'Bronze', 'Titanium'
  ];

  for (const color of colors) {
    if (new RegExp(`\\b${color}\\b`, 'i').test(title)) {
      return color;
    }
  }

  return null;
}

/**
 * Extract Condition
 */
function extractCondition(product) {
  if (product.condition) {
    return product.condition === 'new' ? 'New' :
           product.condition === 'used' ? 'Used' :
           product.condition;
  }

  const title = (product.title || '').toLowerCase();
  if (/\b(renewed|refurbished|reacondicionado)\b/i.test(title)) return 'Renewed';
  if (/\b(used|usado)\b/i.test(title)) return 'Used';
  if (/\bnew\b/i.test(title)) return 'New';

  return 'New'; // Default to new
}

/**
 * Extract Connectivity (5G, 4G, WiFi, etc.)
 */
function extractConnectivity(title, attributes) {
  const connectivity = [];

  if (/\b5G\b/i.test(title)) connectivity.push('5G');
  else if (/\b4G\b|\bLTE\b/i.test(title)) connectivity.push('4G LTE');

  if (/\bWi-?Fi\s*6E\b/i.test(title)) connectivity.push('Wi-Fi 6E');
  else if (/\bWi-?Fi\s*6\b/i.test(title)) connectivity.push('Wi-Fi 6');
  else if (/\bWi-?Fi\b/i.test(title)) connectivity.push('Wi-Fi');

  if (/\bBluetooth\s*5\b/i.test(title)) connectivity.push('Bluetooth 5.0');
  else if (/\bBluetooth\b/i.test(title)) connectivity.push('Bluetooth');

  return connectivity.length > 0 ? connectivity.join(', ') : null;
}

/**
 * Generate enhanced product title with brand, model, and key specs
 */
function generateEnhancedTitle(product, specs) {
  const parts = [];

  // Brand and Model
  if (specs.brand) parts.push(specs.brand);
  if (specs.model) parts.push(specs.model);

  // Key specs
  if (specs.ram) parts.push(specs.ram);
  if (specs.storage) parts.push(specs.storage);
  if (specs.screenSize) parts.push(specs.screenSize);

  // OS
  if (specs.os) parts.push(specs.os);

  // Connectivity
  if (specs.connectivity && specs.connectivity.includes('5G')) parts.push('5G');

  // Condition
  if (specs.condition && specs.condition !== 'New') parts.push(specs.condition);

  return parts.join(' ') || product.title || 'Product';
}

module.exports = {
  extractProductSpecs,
  generateEnhancedTitle
};
