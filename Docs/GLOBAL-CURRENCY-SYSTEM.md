# Global Currency System Implementation

## Overview
Implemented a global currency toggle system that converts **ALL** product prices on the page simultaneously. Users can switch between USD and MXN, and their preference persists across page loads.

## Features Implemented

### 1. **Global Currency Toggle**
- Toggle button in search form switches between USD ⇄ MXN
- Affects **all product listings** on the page (search results, homepage deals, carousels)
- Updates price slider ranges to match selected currency
- Persists user preference in localStorage

### 2. **Language-Based Defaults**
- English site → Defaults to USD
- Spanish site → Defaults to MXN
- User can override default by toggling

### 3. **Bidirectional Currency Conversion**
- Detects source currency of each product (stored in database)
- Converts correctly: MXN → USD or USD → MXN
- If source and target currency match, no conversion needed

### 4. **localStorage Persistence**
- User preference saved to `localStorage.preferredCurrency`
- Priority: localStorage → language default → USD
- Preference loads automatically on page refresh

## Technical Implementation

### JavaScript Functions (server.js lines 4204-4390)

#### Currency Constants
```javascript
const MXN_TO_USD = 0.049;  // 1 MXN ≈ $0.049 USD
const USD_TO_MXN = 1 / MXN_TO_USD;  // 1 USD ≈ 20.5 MXN
```

#### Currency Initialization
```javascript
const siteLang = document.documentElement.lang || 'en';
const defaultCurrency = siteLang === 'es' ? 'MXN' : 'USD';
let currentCurrency = localStorage.getItem('preferredCurrency') || defaultCurrency;
```

#### `toggleCurrency()` Function
- Switches global `currentCurrency` variable
- Updates toggle button label
- Saves preference to localStorage
- Converts price slider ranges
- Updates all product prices on page

#### `updateAllPriceDisplays()` Function
- Finds all elements with `data-price` and `data-currency` attributes
- Reads source currency from `data-currency` attribute
- Converts to target currency if different
- Updates displayed price text

#### `formatCurrency()` Function
- Dynamically formats prices based on `currentCurrency`
- Used for price slider labels
- Ensures consistent currency display

#### `initializeCurrency()` Function
- Runs on page load
- Sets currency label and input value
- Initializes price slider ranges for selected currency
- Converts all product prices to match preference

### Product Card Data Attributes

Each product card includes:
```html
<span class="price-current" 
      data-price="673.99" 
      data-currency="MXN">
  $673.99 MXN
</span>
```

- `data-price`: Raw numeric price value
- `data-currency`: Source currency (MXN or USD)

### Price Slider Ranges

Different ranges per currency:
```javascript
const priceRanges = {
  MXN: { min: 0, max: 50000, step: 500 },   // $0 - $50,000 MXN
  USD: { min: 0, max: 2500, step: 25 }      // $0 - $2,500 USD
};
```

## User Experience

### Default Behavior
1. User visits site in English → All prices show in USD
2. User visits site in Spanish → All prices show in MXN

### Manual Toggle
1. User clicks currency toggle button
2. Button label changes: USD → MXN (or vice versa)
3. All product prices on page instantly convert
4. Price slider ranges update to match currency
5. Preference saved to localStorage

### Page Reload
1. Browser loads page
2. Checks localStorage for `preferredCurrency`
3. If found, uses that currency
4. If not found, uses language default
5. All prices display in saved currency

## Console Logging

Debug logs for monitoring:
```javascript
console.log('%c💱 Currency Toggled:', 'color: #10b981; font-weight: bold;', currentCurrency);
console.log('[Currency] Converted', basePrice, sourceCurrency, 'to', formatted, '(' + currentCurrency + ')');
console.log('%c✅ Currency initialized successfully', 'color: #10b981; font-weight: bold;');
```

## Files Modified

### src/backend/server.js
- **Lines 4204-4220**: Moved currency constants and initialization before slider functions
- **Line 4226**: Changed `formatMXN()` to `formatCurrency()` with dynamic currency
- **Line 4249**: Updated `syncRanges()` to use `formatCurrency()`
- **Line 4272**: Added `localStorage.setItem('preferredCurrency', currentCurrency)`
- **Lines 4315-4346**: Updated `updateAllPriceDisplays()` to use `data-price` and `data-currency` attributes
- **Lines 4358-4388**: Enhanced `initializeCurrency()` to set currency label, input, and slider ranges

## Benefits

✅ **Consistent UX**: All prices show in single currency across entire page  
✅ **Smart Defaults**: Language-based defaults match user expectations  
✅ **Persistent**: User preference saved and restored on next visit  
✅ **Accurate**: Bidirectional conversion based on source currency  
✅ **Real-time**: Instant conversion without page reload  
✅ **Flexible**: Works with products in different source currencies  

## Example Scenarios

### Scenario 1: English User
1. Site loads in English (lang="en")
2. Default currency: USD
3. Product with `data-price="673.99" data-currency="MXN"` shows as "$32.88 USD"
4. User toggles to MXN → shows as "$673.99 MXN"

### Scenario 2: Spanish User
1. Site loads in Spanish (lang="es")
2. Default currency: MXN
3. Product with `data-price="49.99" data-currency="USD"` shows as "$1,024.80 MXN"
4. User toggles to USD → shows as "$49.99 USD"

### Scenario 3: Returning User
1. User previously selected USD and closed browser
2. User returns to site
3. localStorage has `preferredCurrency="USD"`
4. Site loads with all prices in USD (regardless of language)

## Future Enhancements

Possible improvements:
- Add more currencies (EUR, CAD, etc.)
- Fetch live exchange rates from API
- Show original price in tooltip
- Add currency symbol to product cards
- Support per-session currency (without localStorage)

---

**Implementation Date**: 2026-02-07  
**Status**: ✅ Complete and tested
