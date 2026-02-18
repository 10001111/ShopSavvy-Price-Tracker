const { Actor } = require("apify");
const { CheerioCrawler } = require("crawlee");

// ============================================
// CATEGORY DETECTION FUNCTION
// ============================================
function detectCategory(title) {
  if (!title) return "uncategorized";

  const titleLower = title.toLowerCase();

  // Phones (highest priority)
  if (
    titleLower.match(
      /iphone|samsung galaxy|google pixel|motorola|oneplus|xiaomi|smartphone|celular/,
    )
  )
    return "phones";

  // Computers
  if (
    titleLower.match(
      /macbook|laptop|gaming laptop|desktop|pc|chromebook|computadora|portátil/,
    )
  )
    return "computers";

  // Electronics
  if (
    titleLower.match(
      /smart tv|television|televisión|headphones|airpods|speaker|nintendo switch|playstation|xbox|ipad|tablet|kindle|camera|drone|smartwatch|audífonos/,
    )
  )
    return "electronics";

  // Toys
  if (
    titleLower.match(
      /lego|playmobil|hot wheels|barbie|funko pop|nerf|juguete|muñeca|board game|puzzle|action figure|toy/,
    )
  )
    return "toys";

  // Clothing
  if (
    titleLower.match(
      /nike|adidas|puma|under armour|shoes|sneakers|zapatos|tenis|hoodie|jacket|jeans|shirt|camisa/,
    )
  )
    return "clothing";

  // Home & Kitchen
  if (
    titleLower.match(
      /kitchenaid|instant pot|ninja|dyson|vacuum|aspiradora|mixer|batidora|toaster|coffee maker|bed|mattress|pillow|sofa|chair|table/,
    )
  )
    return "home-kitchen";

  // Beauty
  if (
    titleLower.match(
      /maybelline|l'oreal|neutrogena|cerave|dove|makeup|maquillaje|lipstick|mascara|shampoo|champú|perfume|skincare/,
    )
  )
    return "beauty";

  return "uncategorized";
}

// Wrap everything in an async IIFE with top-level error handling.
// The .then() pattern swallows errors on Apify's LIMITED_PERMISSIONS runtime.
(async () => {
  try {
    await Actor.init();

    const input = (await Actor.getInput()) || {};
    const { query = "", productUrls = [], maxResults = 20 } = input;

    console.log(
      "[ShopSavvy Actor] Input:",
      JSON.stringify({ query, productUrls, maxResults }),
    );

    const dataset = await Actor.openDataset();
    const requestQueue = await Actor.openRequestQueue();

    // ============================================
    // BUILD URLS TO SCRAPE
    // ============================================
    if (productUrls.length > 0) {
      // Direct URLs for price re-checks
      for (const url of productUrls) {
        await requestQueue.addRequest({ url, label: "AMAZON_PRODUCT" });
      }
    } else {
      if (query) {
        await requestQueue.addRequest({
          url: `https://www.amazon.com.mx/s?k=${encodeURIComponent(query)}&tag=hydramzkw0mx-20`,
          label: "AMAZON_SEARCH",
        });
      }
    }

    // ============================================
    // CRAWLEE HANDLERS
    // ============================================
    let amazonCount = 0;

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
              productLinks.push(
                `https://www.amazon.com.mx/dp/${asin}?tag=hydramzkw0mx-20`,
              );
            }
          });

          console.log(
            `[ShopSavvy Actor] Amazon search found ${productLinks.length} product links`,
          );

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
            console.log(
              "[ShopSavvy Actor] Amazon product page – no title found, skipping",
            );
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
          const mainImage =
            $("#landingImage").attr("src") || $("#himgui-img").attr("src");
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
          const seller =
            $("#merchant-info a").first().text().trim() ||
            $(
              "#tabular-buybox .tabular-buybox-text[role='row']:contains('Vendido por')",
            )
              .next()
              .text()
              .trim() ||
            "Amazon";

          // Rating (e.g., "4.5 de 5 estrellas")
          const ratingText =
            $("#acrPopover").attr("title") ||
            $("i[data-hook='average-star-rating'] span.a-icon-alt")
              .text()
              .trim() ||
            $("#acrCustomerReviewText")
              .prev()
              .find(".a-icon-alt")
              .text()
              .trim();
          const rating = parseFloat(ratingText) || null;

          // Review count (e.g., "1,234 calificaciones")
          const reviewText =
            $("#acrCustomerReviewText").text().trim() ||
            $("span[data-hook='total-review-count']").text().trim();
          const reviewCount = reviewText
            ? parseInt(reviewText.replace(/[^0-9]/g, ""))
            : 0;

          // Available quantity / stock status
          let availableQuantity = 0;
          let stockStatus = "unknown";

          // Check availability text
          const availText = $(
            "#availability span, #availability_feature_div span",
          )
            .text()
            .trim()
            .toLowerCase();

          if (
            availText.includes("en stock") ||
            availText.includes("disponible")
          ) {
            stockStatus = "in_stock";
            const qtyMatch = availText.match(
              /(\d+)\s*(disponible|en stock|quedan)/i,
            );
            if (qtyMatch) {
              availableQuantity = parseInt(qtyMatch[1]);
            } else {
              availableQuantity = 10;
            }
          } else if (
            availText.includes("agotado") ||
            availText.includes("no disponible")
          ) {
            stockStatus = "out_of_stock";
            availableQuantity = 0;
          } else if (
            availText.includes("pronto") ||
            availText.includes("próximamente")
          ) {
            stockStatus = "coming_soon";
            availableQuantity = 0;
          } else {
            stockStatus = "in_stock";
            availableQuantity = 5;
          }

          // Sold quantity (estimated from review count)
          const soldQuantity =
            reviewCount > 0 ? Math.round(reviewCount * 25) : 0;

          const asinMatch = request.url.match(/\/dp\/([A-Z0-9]{10})/);
          const asin = asinMatch ? asinMatch[1] : null;

          if (title && asin && price && price > 0) {
            const category = detectCategory(title);

            await dataset.pushData({
              source: "amazon",
              id: `AMZN-${asin}`,
              asin,
              title,
              price,
              currency: "MXN",
              category,
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
            console.log(
              `[ShopSavvy Actor] Stored Amazon MX product #${amazonCount}:`,
            );
            console.log(`  Title: ${title.slice(0, 60)}`);
            console.log(`  Category: ${category}`);
            console.log(`  Price: $${price} MXN`);
            console.log(`  Rating: ${rating}/5 (${reviewCount} reviews)`);
            console.log(
              `  Stock: ${availableQuantity} available (${stockStatus})`,
            );
            console.log(`  Sold: ~${soldQuantity} units (estimated)`);
            console.log(`  Seller: ${seller}`);
          } else {
            console.log(
              `[ShopSavvy Actor] Skipped Amazon MX product (missing price or invalid): ${title?.slice(0, 60)}`,
            );
          }
        }
      },

      errorHandler: async ({ request, error }) => {
        console.error(
          `[ShopSavvy Actor] Error on ${request.url}: ${error.message}`,
        );
      },
    });

    await crawler.run();

    console.log(`[ShopSavvy Actor] Done. Amazon: ${amazonCount}`);
    await Actor.exit();
  } catch (err) {
    console.error("[ShopSavvy Actor] FATAL:", err.message);
    console.error(err.stack);
    await Actor.exit({ exitCode: 1 });
  }
})();
