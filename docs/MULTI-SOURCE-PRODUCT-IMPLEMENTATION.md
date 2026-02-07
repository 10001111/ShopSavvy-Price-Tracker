# Multi-Source Product Implementation

**Date**: 2026-02-06  
**Status**: 🚧 In Progress

---

## ✅ COMPLETED - Phase 1: Backend Multi-Source Support

### What Was Done:

1. **Completely rewrote `fetchProductById()` function** (lines ~1678-1840)
   - Now searches BOTH Amazon and Mercado Libre simultaneously
   - Returns an object with:
     - `product`: Primary product (prefers one with stock)
     - `sources.amazon`: Amazon version (if available)
     - `sources.mercadolibre`: Mercado Libre version (if available)
     - `hasMultipleSources`: Boolean indicating if both are available

2. **Enhanced product data extraction**:
   - ✅ Parses `images` array properly (JSON string → array)
   - ✅ Extracts `available_quantity` (stock count)
   - ✅ Extracts `sold_quantity` (how many sold)
   - ✅ Extracts `rating` and `review_count`
   - ✅ Handles both `current_price` and `price` fields
   - ✅ Returns ALL product images, not just thumbnail

3. **Smart fallback logic**:
   - Searches `product_cache` by exact ID first
   - Falls back to `tracked_products` if not found
   - Uses fuzzy search as last resort
   - Groups results by source automatically

---

## 🚧 TODO - Phase 2: Frontend Multi-Source Display

### Next Steps:

#### 1. Update Product Page HTML (server.js line ~6356)

**Current**: Shows only ONE source  
**Needed**: Show dropdown when both sources available

**HTML Structure Needed**:
```html
<!-- Source Dropdown (shows when hasMultipleSources=true) -->
<div class="source-selector">
  <select id="sourceDropdown" onchange="switchSource()">
    <option value="amazon" ${currentSource === 'amazon' ? 'selected' : ''}>
      🛒 View on Amazon
    </option>
    <option value="mercadolibre" ${currentSource === 'mercadolibre' ? 'selected' : ''}>
      🛒 View on Mercado Libre
    </option>
  </select>
</div>

<!-- Dynamic Retailer Badge (changes with dropdown) -->
<div id="retailerBadge" class="retailer-badge">
  <!-- Amazon or ML logo here -->
</div>
```

#### 2. Image Gallery Component

**Current**: Single image  
**Needed**: Scrollable thumbnail gallery

**HTML Structure**:
```html
<!-- Main Image -->
<div class="product-image-hero-container">
  <img id="mainProductImage" src="${product.images[0]}" />
</div>

<!-- Thumbnail Gallery (scrollable) -->
<div class="product-thumbnails-scroll">
  ${product.images.map((img, idx) => `
    <img 
      src="${img}" 
      class="thumbnail ${idx === 0 ? 'active' : ''}" 
      onclick="changeMainImage('${img}', ${idx})"
    />
  `).join('')}
</div>
```

#### 3. JavaScript for Source Switching

```javascript
<script>
  const productSources = ${JSON.stringify(result.sources)};
  let currentSource = '${product.source}';

  function switchSource() {
    const dropdown = document.getElementById('sourceDropdown');
    currentSource = dropdown.value;
    
    const productData = productSources[currentSource];
    
    // Update price
    document.getElementById('productPrice').textContent = 
      formatPrice(productData.price, productData.currency_id);
    
    // Update stock status
    document.getElementById('stockStatus').textContent = 
      productData.available_quantity > 0 
        ? '✓ In Stock (' + productData.available_quantity + ' available)'
        : '✗ Out of Stock';
    
    // Update sold count
    document.getElementById('soldCount').textContent = 
      productData.sold_quantity + '+ sold';
    
    // Update view button URL
    document.getElementById('viewButton').href = productData.permalink;
    
    // Update retailer badge
    const badge = document.getElementById('retailerBadge');
    if (currentSource === 'amazon') {
      badge.innerHTML = '<img src="amazon-logo.svg" alt="Amazon" />';
    } else {
      badge.innerHTML = '<img src="ml-logo.png" alt="Mercado Libre" />';
    }
    
    // Update images
    updateImageGallery(productData.images);
  }
  
  function updateImageGallery(images) {
    document.getElementById('mainProductImage').src = images[0];
    
    const thumbnailContainer = document.querySelector('.product-thumbnails-scroll');
    thumbnailContainer.innerHTML = images.map((img, idx) => `
      <img src="${img}" class="thumbnail ${idx === 0 ? 'active' : ''}" 
           onclick="changeMainImage('${img}', ${idx})" />
    `).join('');
  }
  
  function changeMainImage(imgSrc, idx) {
    document.getElementById('mainProductImage').src = imgSrc;
    document.querySelectorAll('.thumbnail').forEach((thumb, i) => {
      thumb.classList.toggle('active', i === idx);
    });
  }
</script>
```

#### 4. CSS for Image Gallery & Dropdown

```css
/* Source Dropdown Selector */
.source-selector {
  margin: 20px 0;
}

#sourceDropdown {
  padding: 12px 20px;
  font-size: 16px;
  border: 2px solid #e0e0e0;
  border-radius: 12px;
  background: white;
  cursor: pointer;
  width: 100%;
  max-width: 300px;
}

#sourceDropdown:hover {
  border-color: #3c91ed;
}

/* Thumbnail Gallery */
.product-thumbnails-scroll {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding: 16px 0;
  margin-top: 16px;
  scroll-snap-type: x mandatory;
}

.product-thumbnails-scroll::-webkit-scrollbar {
  height: 8px;
}

.product-thumbnails-scroll::-webkit-scrollbar-thumb {
  background: #d1d5db;
  border-radius: 4px;
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
```

---

## 🎯 Phase 3: Product Card Dual Badges

Update product cards in search results to show BOTH badges when available on both platforms.

**Current**:
```html
<span class="source-badge amazon">Amazon</span>
<!-- OR -->
<span class="source-badge ml">Mercado Libre</span>
```

**Needed**:
```html
<!-- When available on BOTH -->
<div class="source-badges-multi">
  <span class="source-badge amazon">Amazon</span>
  <span class="source-badge ml">ML</span>
</div>

<!-- When available on ONE -->
<span class="source-badge ${product.source === 'amazon' ? 'amazon' : 'ml'}">
  ${product.source === 'amazon' ? 'Amazon' : 'Mercado Libre'}
</span>
```

**Logic Needed in `renderProductCard()`**:
```javascript
// Check if product exists on both sources
const hasAmazon = product.sources?.amazon !== null;
const hasMercadoLibre = product.sources?.mercadolibre !== null;

let sourceBadge = '';
if (hasAmazon && hasMercadoLibre) {
  sourceBadge = `
    <div class="source-badges-multi">
      <span class="source-badge amazon">Amazon</span>
      <span class="source-badge ml">ML</span>
    </div>
  `;
} else if (hasAmazon) {
  sourceBadge = '<span class="source-badge amazon">Amazon</span>';
} else {
  sourceBadge = '<span class="source-badge ml">Mercado Libre</span>';
}
```

---

## 🔧 Implementation Checklist

### Backend ✅
- [x] Modify `fetchProductById()` to search both sources
- [x] Return `sources` object with amazon + mercadolibre
- [x] Extract all product images (not just thumbnail)
- [x] Parse `sold_quantity` and `available_quantity`
- [x] Handle rating and review count

### Frontend Product Page 🚧
- [ ] Add source dropdown (only shows when `hasMultipleSources=true`)
- [ ] Add image gallery with scrollable thumbnails
- [ ] Add JavaScript for source switching
- [ ] Update price, stock, and sold count dynamically
- [ ] Change "View on X" button URL when source changes
- [ ] Update retailer badge when source changes

### Frontend Search Results 🚧
- [ ] Modify `renderProductCard()` to detect multi-source products
- [ ] Show dual badges when available on both platforms
- [ ] Show single badge when available on one platform
- [ ] Fix stock display (no more "Out of Stock" when in stock)
- [ ] Show correct price (no more $0.00)
- [ ] Display sold count ("X+ sold")
- [ ] Display available count ("X available")

### Category System 🚧
- [ ] Make category clicks trigger Apify scraping
- [ ] Convert category → search query using keywords
- [ ] Store results in `product_cache`
- [ ] Display products to user

---

## 📊 Example Data Flow

**User clicks on iPhone 14 Pro product**:

1. `fetchProductById('ML-12345')` is called
2. Function searches both sources:
   - Finds in Amazon: `price=$899, stock=5, sold=287`
   - Finds in ML: `price=$850, stock=0, sold=145`
3. Returns:
```json
{
  "product": { ...Amazon data... },  // Primary (has stock)
  "sources": {
    "amazon": { price: 899, available_quantity: 5, sold_quantity: 287, ... },
    "mercadolibre": { price: 850, available_quantity: 0, sold_quantity: 145, ... }
  },
  "hasMultipleSources": true
}
```
4. Product page displays:
   - Dropdown: "View on Amazon ▼" (user can switch to ML)
   - Price: $899 USD
   - Stock: "✓ In Stock (5 available)"
   - Sold: "287+ sold"
   - Badge: Amazon logo
5. User selects "Mercado Libre" from dropdown:
   - Price updates: $850 MXN
   - Stock updates: "✗ Out of Stock"
   - Sold updates: "145+ sold"
   - Badge updates: Mercado Libre logo

---

## 🚀 Next Steps

**I need to**:
1. Update the product page HTML to use the new `sources` data
2. Add the source dropdown component
3. Add the image gallery component
4. Add JavaScript for dynamic switching
5. Update product cards to show dual badges

**Should I continue with the implementation now?**

This will involve modifying the product page route (starting at line ~6356) to add all the HTML, CSS, and JavaScript components listed above.
