# Language-Based Currency Auto-Detection 🌐💱

**Date**: 2026-02-07  
**Feature**: Automatic currency selection based on site language

---

## 🎯 Overview

The website now automatically detects the site language and sets the default currency accordingly:

- **🇺🇸 English (en)** → Default currency: **USD** (US Dollars)
- **🇲🇽 Spanish (es)** → Default currency: **MXN** (Mexican Pesos)

Users can still manually toggle between currencies using the currency toggle button.

---

## ✅ Implementation Details

### 1. **Language Detection**

The site language is read from the HTML `lang` attribute:

```javascript
const siteLang = document.documentElement.lang || 'en';
```

This corresponds to:
- English site: `<html lang="en">`
- Spanish site: `<html lang="es">`

### 2. **Currency Auto-Selection**

Based on detected language:

```javascript
let currentCurrency = siteLang === 'es' ? 'MXN' : 'USD';
```

| Language | Default Currency | Symbol |
|----------|------------------|--------|
| English (en) | USD | $ |
| Spanish (es) | MXN | $ |

### 3. **Dynamic UI Elements**

All currency-related UI elements adapt to the language:

#### Currency Toggle Button
```html
<!-- English site -->
<span id="currencyLabel">USD</span>
<input type="hidden" name="currency" value="USD" />

<!-- Spanish site -->
<span id="currencyLabel">MXN</span>
<input type="hidden" name="currency" value="MXN" />
```

#### Price Slider Ranges
```html
<!-- English site (USD) -->
<input id="minPrice" type="range" 
  min="0" max="2500" step="25" />

<!-- Spanish site (MXN) -->
<input id="minPrice" type="range" 
  min="0" max="50000" step="500" />
```

---

## 📊 Price Slider Ranges by Currency

### USD (English Site)
- **Range**: $0 - $2,500 USD
- **Step**: $25
- **Use case**: US market pricing

### MXN (Spanish Site)
- **Range**: $0 - $50,000 MXN
- **Step**: $500
- **Use case**: Mexican market pricing

**Conversion Rate**: 1 USD ≈ 20.5 MXN

---

## 🔄 Currency Toggle Behavior

### Initial State

**English Site**:
```
Currency: USD
Price Range: $0 - $2,500
Slider: 0 to 2500 with step 25
```

**Spanish Site**:
```
Moneda: MXN
Rango de Precio: $0 - $50,000
Slider: 0 a 50000 con paso 500
```

### After Toggle

Users can click the currency toggle button to switch:

- **English site**: USD → MXN → USD → ...
- **Spanish site**: MXN → USD → MXN → ...

The slider ranges and all product prices automatically convert.

---

## 🛠️ Technical Implementation

### File Modified
`src/backend/server.js`

### Changes Made

#### 1. Language-Based Currency Detection (Line ~4181)
```javascript
// Auto-detect currency based on site language
// English (en) → USD | Spanish (es) → MXN
const siteLang = document.documentElement.lang || 'en';
let currentCurrency = siteLang === 'es' ? 'MXN' : 'USD';
```

#### 2. Dynamic Currency Toggle Button (Line ~3056)
```javascript
<span class="currency-label" id="currencyLabel">
  ${lang === "es" ? "MXN" : "USD"}
</span>
<input type="hidden" name="currency" id="currencyInput" 
  value="${lang === "es" ? "MXN" : "USD"}" />
```

#### 3. Dynamic Price Sliders (Line ~3064)
```javascript
<input id="minPrice" name="minPrice" type="range" 
  min="0" 
  max="${lang === "es" ? "50000" : "2500"}" 
  step="${lang === "es" ? "500" : "25"}" 
  value="${minPrice}" />
```

#### 4. Currency Initialization (Line ~4275)
```javascript
function initializeCurrency() {
  console.log('💱 Initializing Currency:', currentCurrency);
  console.log('🌐 Site Language:', siteLang);
  
  // Update all price displays to match the default currency
  updateAllPriceDisplays();
  
  console.log('✅ Currency initialized successfully');
}

// Run on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeCurrency);
} else {
  initializeCurrency();
}
```

---

## 🧪 Testing the Feature

### Test Scenario 1: English Site
1. Visit: `http://localhost:3000/?lang=en` or click 🇺🇸 English
2. **Expected**: 
   - Currency toggle shows "USD"
   - Price sliders range from $0 to $2,500
   - Product prices display in USD

### Test Scenario 2: Spanish Site
1. Visit: `http://localhost:3000/?lang=es` or click 🇲🇽 Español
2. **Expected**:
   - Currency toggle shows "MXN"
   - Price sliders range from $0 to $50,000
   - Product prices display in MXN

### Test Scenario 3: Currency Toggle
1. On English site, click currency toggle button
2. **Expected**: Switches from USD to MXN
3. All prices convert (multiply by ~20.5)
4. Slider ranges update to MXN scale

### Test Scenario 4: Language Switch
1. Start on English site (USD)
2. Switch to Spanish: Click 🇲🇽 Español in header
3. **Expected**: Page reloads, currency auto-switches to MXN
4. Switch back to English: Click 🇺🇸 English
5. **Expected**: Page reloads, currency auto-switches to USD

---

## 🎨 User Experience Flow

### English User Journey
```
1. User visits site → Auto-detected as English
2. Currency defaults to USD
3. Sees prices like "$499.00"
4. Can toggle to MXN if interested in Mexico pricing
```

### Spanish User Journey
```
1. Usuario visita sitio → Auto-detectado como Español
2. Moneda por defecto es MXN
3. Ve precios como "$9,999.00"
4. Puede cambiar a USD si le interesa precio en dólares
```

---

## 💡 Smart Features

### 1. **Persistent Language Choice**
When users switch language via the language dropdown:
- Language preference is saved in session
- Currency auto-updates to match new language
- Slider ranges adjust automatically

### 2. **Real-Time Price Conversion**
All product prices update instantly when toggling currency:
```javascript
// Example conversion
Product in database: $9,999 MXN

English site (USD): $487.80 (9999 × 0.049)
Spanish site (MXN): $9,999.00 (original)
```

### 3. **Intelligent Slider Scaling**
Slider ranges match typical pricing for each market:
- USD: $0-$2,500 (reasonable for US market)
- MXN: $0-$50,000 (equivalent to ~$2,439 USD)

---

## 🔍 Console Logs for Debugging

When the page loads, you'll see:
```
💱 Initializing Currency: USD (or MXN)
🌐 Site Language: en (or es)
✅ Currency initialized successfully
```

When toggling currency:
```
💱 Currency Toggled: MXN
💵 Converting sliders from USD to MXN
📊 Min: $100 → $2,050 MXN
📊 Max: $1,500 → $30,750 MXN
🎯 Updating all price displays
[Currency] Converted 9999 MXN to $9,999.00 (MXN)
```

---

## 📝 Code Locations

| Feature | File | Line(s) |
|---------|------|---------|
| Language detection | `server.js` | ~4181 |
| Currency auto-select | `server.js` | ~4182 |
| Currency toggle HTML | `server.js` | ~3056-3060 |
| Price slider ranges | `server.js` | ~3064-3076 |
| Currency initialization | `server.js` | ~4275-4290 |
| Toggle function | `server.js` | ~4190-4240 |
| Price conversion | `server.js` | ~4242-4270 |

---

## ✨ Benefits

### For Users
✅ No manual currency selection needed  
✅ Automatic localization based on language  
✅ Prices in familiar currency by default  
✅ Easy toggle to compare currencies  

### For Business
✅ Better UX for international users  
✅ Matches user expectations per market  
✅ Reduces confusion about pricing  
✅ Supports both US and Mexico markets  

---

## 🚀 Future Enhancements

Potential improvements:
1. **Browser Locale Detection**: Use `navigator.language` as fallback
2. **Geolocation**: Auto-detect country via IP
3. **Cookie Persistence**: Remember user's manual currency choice
4. **Multi-Currency Support**: Add EUR, CAD, etc.
5. **Live Exchange Rates**: Fetch real-time conversion rates

---

## 🎉 Summary

The language-based currency feature provides:
- ✅ **Automatic currency detection** based on site language
- ✅ **Smart defaults**: USD for English, MXN for Spanish
- ✅ **Dynamic UI adaptation**: Sliders, toggles, prices
- ✅ **Seamless user experience** with manual override option

Users get the right currency automatically, with the freedom to switch anytime!
