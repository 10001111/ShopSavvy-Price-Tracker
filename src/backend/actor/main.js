const { Actor } = require("apify");
const { CheerioCrawler } = require("crawlee");

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
          url: `https://www.amazon.com/s?k=${encodeURIComponent(query)}`,
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
              productLinks.push(`https://www.amazon.com/dp/${asin}`);
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

          const seller = $("#merchant-info a").first().text().trim() || "Amazon";
          const ratingText = $("#ratingLink .a-icon-alt").text().trim();
          const rating = parseFloat(ratingText) || null;

          const asinMatch = request.url.match(/\/dp\/([A-Z0-9]{10})/);
          const asin = asinMatch ? asinMatch[1] : null;

          if (title && asin) {
            await dataset.pushData({
              source: "amazon",
              id: `AMZN-${asin}`,
              asin,
              title,
              price: price || 0,
              currency: "USD",
              images,
              thumbnail: images[0] || null,
              description: bullets.join("\n"),
              seller,
              rating,
              condition: "new",
              url: request.url,
              scrapedAt: new Date().toISOString(),
            });
            amazonCount++;
            console.log(`[ShopSavvy Actor] Stored Amazon product #${amazonCount}: ${title.slice(0, 60)}`);
          }
        }

        // ------------------------------------------
        // MERCADO LIBRE SEARCH RESULTS PAGE
        // ------------------------------------------
        else if (label === "ML_SEARCH") {
          const productLinks = [];

          // Primary selectors
          $("a[href*='/item/']").each((i, el) => {
            if (mlCount + productLinks.length >= maxResults) return;
            let href = $(el).attr("href");
            if (href && href.includes("/item/")) {
              if (href.startsWith("/")) href = "https://www.mercadolibre.com.mx" + href;
              // Strip query params for dedup
              const clean = href.split("?")[0];
              if (!productLinks.includes(clean)) productLinks.push(clean);
            }
          });

          console.log(`[ShopSavvy Actor] ML search found ${productLinks.length} product links`);

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

          const seller =
            $(".ui-pdp-seller__name a, .ui-pdp-seller a").first().text().trim() ||
            $(".ui-pdp-publisher__name").first().text().trim() ||
            "Unknown";

          const description = $(".ui-pdp-description p, .section--description p").text().trim();

          const ratingText = $(".ui-pdp-rating__average").text().trim();
          const rating = parseFloat(ratingText) || null;

          const condition =
            $(".ui-pdp-condition").text().trim().toLowerCase().includes("nuevo") ? "new" : "used";

          const idMatch = request.url.match(/\/(ML[A-Z]?\d+)/);
          const mlId = idMatch ? idMatch[1] : `ML-${Date.now()}-${mlCount}`;

          if (title) {
            await dataset.pushData({
              source: "mercadolibre",
              id: mlId,
              title,
              price: price || 0,
              currency,
              images,
              thumbnail: images[0] || null,
              description,
              seller,
              rating,
              condition,
              url: request.url,
              scrapedAt: new Date().toISOString(),
            });
            mlCount++;
            console.log(`[ShopSavvy Actor] Stored ML product #${mlCount}: ${title.slice(0, 60)}`);
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
