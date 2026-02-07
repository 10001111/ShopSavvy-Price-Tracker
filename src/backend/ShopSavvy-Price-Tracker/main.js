const { Actor } = require("apify");
const { CheerioCrawler, PlaywrightCrawler } = require("crawlee");

// Wrap everything in an async IIFE with top-level error handling.
// The .then() pattern swallows errors on Apify's LIMITED_PERMISSIONS runtime.
(async () => {
  try {
    await Actor.init();

    const input = await Actor.getInput() || {};
    const {
      source = "all",
      query = "",
      productUrls = [],
      maxResults = 20,
    } = input;

    console.log("[ShopSavvy Actor] Input:", JSON.stringify({ source, query, productUrls, maxResults }));

    const dataset = await Actor.openDataset();
    const requestQueue = await Actor.openRequestQueue();

    // ============================================
    // BUILD URLS TO SCRAPE
    // ============================================
    const scrapeAmazon = source === "amazon" || source === "all";
    const scrapeML = source === "mercadolibre" || source === "all";

    if (productUrls.length > 0) {
      // Direct URLs for price re-checks
      for (const url of productUrls) {
        const label = url.includes("amazon.com") ? "AMAZON_PRODUCT" : "ML_PRODUCT";
        await requestQueue.addRequest({ url, label });
      }
    } else {
      if (scrapeAmazon && query) {
        await requestQueue.addRequest({
          url: `https://www.amazon.com.mx/s?k=${encodeURIComponent(query)}&tag=hydramzkw0mx-20`,
          label: "AMAZON_SEARCH",
        });
      }
      if (scrapeML && query) {
        await requestQueue.addRequest({
          url: `https://www.mercadolibre.com.mx/buscar/${encodeURIComponent(query)}`,
          label: "ML_SEARCH",
        });
      }
    }

    // ============================================
    // CRAWLEE HANDLERS
    // ============================================
    let amazonCount = 0;
    let mlCount = 0;

    const crawler = new CheerioCrawler({
      requestQueue,
      maxRequestsPerCrawl: maxResults * 4,

      async requestHandler({ request, $ }) {
        const { label } = request;
        console.log(`[ShopSavvy Actor] Processing: ${label} – ${request.url}`);

        // ------------------------------------------
        // AMAZON SEARCH RESULTS PAGE
        // ------------------------------------------
        if (label === "AMAZON_SEARCH") {
          const productLinks = [];
          $("div[data-component-type='s-search-result']").each((i, el) => {
            if (amazonCount + productLinks.length >= maxResults) return;
            const asin = $(el).attr("data-asin");
            if (asin) {
              productLinks.push(`https://www.amazon.com.mx/dp/${asin}?tag=hydramzkw0mx-20`);
            }
          });

          console.log(`[ShopSavvy Actor] Amazon search found ${productLinks.length} product links`);

          for (const url of productLinks) {
            await requestQueue.addRequest({ url, label: "AMAZON_PRODUCT" });
          }
        }

        // ------------------------------------------
        // AMAZON PRODUCT PAGE
        // ------------------------------------------
        else if (label === "AMAZON_PRODUCT") {
          if (amazonCount >= maxResults) return;

          const title = $("#productTitle").text().trim();
          if (!title) {
            console.log("[ShopSavvy Actor] Amazon product page – no title found, skipping");
            return;
          }

          // Price – try multiple selectors
          let price = null;
          const priceText =
            $("#a-price .a-price-whole").first().text().trim() ||
            $(".a-price .a-offscreen").first().text().trim() ||
            $("#price_block_yourPrice .a-price-whole").first().text().trim();
          if (priceText) {
            price = parseFloat(priceText.replace(/[^0-9.]/g, ""));
          }

          // Images
          const images = [];
          const mainImage = $("#landingImage").attr("src") || $("#himgui-img").attr("src");
          if (mainImage) images.push(mainImage);
          $(".a-thumb-inner img").each((i, el) => {
            const src = $(el).attr("src");
            if (src && !images.includes(src)) images.push(src);
          });

          // Bullet points as description
          const bullets = [];
          $("#feature-bullets li .a-size-base").each((i, el) => {
            const text = $(el).text().trim();
            if (text) bullets.push(text);
          });

          // Seller information
          const seller = $("#merchant-info a").first().text().trim() ||
                        $("#tabular-buybox .tabular-buybox-text[role='row']:contains('Vendido por')").next().text().trim() ||
                        "Amazon";

          // Rating (e.g., "4.5 de 5 estrellas")
          const ratingText = $("#acrPopover").attr("title") ||
                            $("i[data-hook='average-star-rating'] span.a-icon-alt").text().trim() ||
                            $("#acrCustomerReviewText").prev().find(".a-icon-alt").text().trim();
          const rating = parseFloat(ratingText) || null;

          // Review count (e.g., "1,234 calificaciones")
          const reviewText = $("#acrCustomerReviewText").text().trim() ||
                            $("span[data-hook='total-review-count']").text().trim();
          const reviewCount = reviewText ? parseInt(reviewText.replace(/[^0-9]/g, "")) : 0;

          // Available quantity / stock status
          let availableQuantity = 0;
          let stockStatus = "unknown";

          // Check availability text
          const availText = $("#availability span, #availability_feature_div span").text().trim().toLowerCase();

          if (availText.includes("en stock") || availText.includes("disponible")) {
            stockStatus = "in_stock";
            // Try to extract quantity from text like "Quedan 5 en stock"
            const qtyMatch = availText.match(/(\d+)\s*(disponible|en stock|quedan)/i);
            if (qtyMatch) {
              availableQuantity = parseInt(qtyMatch[1]);
            } else {
              // If no specific number, assume good stock
              availableQuantity = 10;
            }
          } else if (availText.includes("agotado") || availText.includes("no disponible")) {
            stockStatus = "out_of_stock";
            availableQuantity = 0;
          } else if (availText.includes("pronto") || availText.includes("próximamente")) {
            stockStatus = "coming_soon";
            availableQuantity = 0;
          } else {
            // Default: assume available
            stockStatus = "in_stock";
            availableQuantity = 5;
          }

          // Sold quantity (Amazon doesn't expose this directly, estimate from review count)
          // Rough heuristic: ~3-5% of buyers leave reviews
          const soldQuantity = reviewCount > 0 ? Math.round(reviewCount * 25) : 0;

          const asinMatch = request.url.match(/\/dp\/([A-Z0-9]{10})/);
          const asin = asinMatch ? asinMatch[1] : null;

          // Only store if we have valid price and title
          if (title && asin && price && price > 0) {
            await dataset.pushData({
              source: "amazon",
              id: `AMZN-${asin}`,
              asin,
              title,
              price,
              currency: "MXN",
              images,
              thumbnail: images[0] || null,
              description: bullets.join("\n"),
              seller,
              rating,
              review_count: reviewCount,
              available_quantity: availableQuantity,
              sold_quantity: soldQuantity,
              stock_status: stockStatus,
              condition: "new",
              url: request.url,
              scrapedAt: new Date().toISOString(),
            });
            amazonCount++;
            console.log(`[ShopSavvy Actor] Stored Amazon MX product #${amazonCount}:`);
            console.log(`  Title: ${title.slice(0, 60)}`);
            console.log(`  Price: $${price} MXN`);
            console.log(`  Rating: ${rating}/5 (${reviewCount} reviews)`);
            console.log(`  Stock: ${availableQuantity} available (${stockStatus})`);
            console.log(`  Sold: ~${soldQuantity} units (estimated)`);
            console.log(`  Seller: ${seller}`);
          } else {
            console.log(`[ShopSavvy Actor] Skipped Amazon MX product (missing price or invalid): ${title?.slice(0, 60)}`);
          }
        }

        // ------------------------------------------
        // MERCADO LIBRE SEARCH RESULTS PAGE
        // ------------------------------------------
        else if (label === "ML_SEARCH") {
          const productLinks = [];

          // Debug: Log page title and check if we got blocked
          const pageTitle = $("title").text();
          console.log(`[ShopSavvy Actor] ML page title: "${pageTitle}"`);

          // Check if we're being blocked or captcha'd
          if (pageTitle.toLowerCase().includes("captcha") ||
              pageTitle.toLowerCase().includes("robot") ||
              $("body").text().toLowerCase().includes("verificación de seguridad")) {
            console.log(`[ShopSavvy Actor] ⚠️ ML BLOCKED: Captcha or security check detected`);
            console.log(`[ShopSavvy Actor] Suggestion: Mercado Libre may be blocking automated requests`);
            return;
          }

          // Try multiple selector strategies
          const selectors = [
            "a[href*='/item/']",                    // Original selector
            "a.ui-search-link",                     // Search result links
            ".ui-search-result__content a",         // Product card links
            ".ui-search-item__group a[href*='ML']", // Item group links
            "a[href*='/p/ML']"                      // Product page links
          ];

          for (const selector of selectors) {
            $(selector).each((i, el) => {
              if (mlCount + productLinks.length >= maxResults) return;
              let href = $(el).attr("href");
              if (href && (href.includes("/item/") || href.includes("/p/ML"))) {
                if (href.startsWith("/")) href = "https://www.mercadolibre.com.mx" + href;
                // Strip query params for dedup
                const clean = href.split("?")[0].split("#")[0];
                if (!productLinks.includes(clean) && clean.match(/ML[A-Z]?\d+/)) {
                  productLinks.push(clean);
                }
              }
            });

            if (productLinks.length > 0) {
              console.log(`[ShopSavvy Actor] ML selector "${selector}" found ${productLinks.length} links`);
              break;
            }
          }

          console.log(`[ShopSavvy Actor] ML search found ${productLinks.length} product links total`);

          // Debug: If no links found, log available links for inspection
          if (productLinks.length === 0) {
            const allLinks = [];
            $("a[href]").each((i, el) => {
              const href = $(el).attr("href");
              if (href) allLinks.push(href);
            });
            console.log(`[ShopSavvy Actor] Total links on page: ${allLinks.length}`);
            console.log(`[ShopSavvy Actor] Sample links:`, allLinks.slice(0, 10));
          }

          for (const url of productLinks) {
            await requestQueue.addRequest({ url, label: "ML_PRODUCT" });
          }
        }

        // ------------------------------------------
        // MERCADO LIBRE PRODUCT PAGE
        // ------------------------------------------
        else if (label === "ML_PRODUCT") {
          if (mlCount >= maxResults) return;

          const title =
            $("h1.ui-pdp-title").text().trim() ||
            $(".ui-pdp-title").first().text().trim() ||
            $("h1").first().text().trim();
          if (!title) {
            console.log("[ShopSavvy Actor] ML product page – no title, skipping");
            return;
          }

          // Price
          let price = null;
          const priceStr = $(".ui-pdp-price__whole").first().text().trim();
          if (priceStr) {
            price = parseFloat(priceStr.replace(/[^0-9]/g, ""));
          }

          const currencyEl = $(".ui-pdp-price__currency").first().text().trim();
          const currency = currencyEl || "MXN";

          // Images
          const images = [];
          $(".ui-pdp-gallery img, .slippery img").each((i, el) => {
            const src = $(el).attr("src") || $(el).attr("data-src");
            if (src && !images.includes(src) && !src.includes("placeholder")) {
              images.push(src.replace(/\d+x\d+/, "800x800"));
            }
          });
          if (images.length === 0) {
            const mainImg = $(".ui-pdp-gallery__main img").first().attr("src");
            if (mainImg) images.push(mainImg);
          }

          // Seller information
          const seller =
            $(".ui-pdp-seller__header__title").text().trim() ||
            $(".ui-pdp-seller__link__name").text().trim() ||
            $(".ui-box-component__title").text().trim() ||
            "Unknown";

          const description = $(".ui-pdp-description__content, .ui-pdp-description p, .section--description p").text().trim();

          // Rating (e.g., "4.5")
          const ratingText = $(".ui-pdp-review__rating").text().trim() ||
                            $(".ui-pdp-rating__average").text().trim() ||
                            $(".ui-review-capability__rating__label").text().trim();
          const rating = parseFloat(ratingText) || null;

          // Review count (e.g., "(1234)")
          const reviewText = $(".ui-pdp-review__amount").text().trim() ||
                            $(".ui-pdp-review__quantity").text().trim() ||
                            $(".ui-pdp-reviews__rating__summary__total").text().trim();
          const reviewCount = reviewText ? parseInt(reviewText.replace(/[^0-9]/g, "")) : 0;

          // Available quantity (stock)
          let availableQuantity = 0;
          const qtyText = $(".ui-pdp-stock-information__quantity").text().trim() ||
                         $(".ui-pdp-buybox__quantity__available").text().trim() ||
                         $("span:contains('disponible')").text().trim() ||
                         $("span:contains('stock')").text().trim();

          if (qtyText) {
            const qtyMatch = qtyText.match(/(\d+)\s*(disponible|stock|unidade)/i);
            if (qtyMatch) {
              availableQuantity = parseInt(qtyMatch[1]);
            } else {
              // If text mentions "disponible" but no number, assume good stock
              availableQuantity = 10;
            }
          } else {
            // Check if explicitly out of stock
            const stockText = $(".ui-pdp-stock-information, .ui-pdp-buybox__quantity").text().toLowerCase();
            if (stockText.includes("sin stock") || stockText.includes("agotado")) {
              availableQuantity = 0;
            } else {
              // Assume available if listed
              availableQuantity = 5;
            }
          }

          // Sold quantity (e.g., "500+ vendidos")
          const soldText = $(".ui-pdp-subtitle").text().trim() ||
                          $(".ui-pdp-sold").text().trim() ||
                          $("span:contains('vendido')").text().trim();
          let soldQuantity = 0;
          if (soldText) {
            // Extract number from text like "500 vendidos" or "1k vendidos"
            const soldMatch = soldText.match(/(\d+\.?\d*)\s*k?\s*(vendido|sold)/i);
            if (soldMatch) {
              soldQuantity = parseFloat(soldMatch[1]);
              if (soldText.toLowerCase().includes('k')) {
                soldQuantity *= 1000;
              }
            }
          }

          // Stock status
          let stockStatus = "in_stock";
          if (availableQuantity === 0) {
            stockStatus = "out_of_stock";
          } else if (availableQuantity < 5) {
            stockStatus = "low_stock";
          }

          const condition =
            $(".ui-pdp-condition").text().trim().toLowerCase().includes("nuevo") ? "new" : "used";

          const idMatch = request.url.match(/\/(ML[A-Z]?\d+)/);
          const mlId = idMatch ? idMatch[1] : `ML-${Date.now()}-${mlCount}`;

          // Only store if we have valid price and title
          if (title && price && price > 0) {
            await dataset.pushData({
              source: "mercadolibre",
              id: mlId,
              title,
              price,
              currency,
              images,
              thumbnail: images[0] || null,
              description,
              seller,
              rating,
              review_count: reviewCount,
              available_quantity: availableQuantity,
              sold_quantity: soldQuantity,
              stock_status: stockStatus,
              condition,
              url: request.url,
              scrapedAt: new Date().toISOString(),
            });
            mlCount++;
            console.log(`[ShopSavvy Actor] Stored ML product #${mlCount}:`);
            console.log(`  Title: ${title.slice(0, 60)}`);
            console.log(`  Price: $${price} ${currency}`);
            console.log(`  Rating: ${rating}/5 (${reviewCount} reviews)`);
            console.log(`  Stock: ${availableQuantity} available (${stockStatus})`);
            console.log(`  Sold: ${soldQuantity} units`);
            console.log(`  Seller: ${seller}`);
          } else {
            console.log(`[ShopSavvy Actor] Skipped ML product (missing price or invalid): ${title?.slice(0, 60)}`);
          }
        }
      },

      errorHandler: async ({ request, error }) => {
        console.error(`[ShopSavvy Actor] Error on ${request.url}: ${error.message}`);
      },
    });

    await crawler.run();

    console.log(`[ShopSavvy Actor] Done. Amazon: ${amazonCount}, ML: ${mlCount}`);
    await Actor.exit();

  } catch (err) {
    // Log before exit so we can see the crash reason in run logs
    console.error("[ShopSavvy Actor] FATAL:", err.message);
    console.error(err.stack);
    await Actor.exit({ exitCode: 1 });
  }
})();
