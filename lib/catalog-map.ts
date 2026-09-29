/**
 * Printify mapping — the bridge between storefront SKUs and Printify.
 *
 * HOW TO FILL THIS IN (one-time, ~10 minutes):
 *  1. In Printify, publish each product to your store. Copy its product id
 *     from the dashboard URL: printify.com/app/product/<PRODUCT_ID>/…
 *  2. For each storefront product, list the Printify variant ids:
 *       curl -H "Authorization: Bearer $PRINTIFY_API_TOKEN" \
 *         "https://api.printify.com/v1/products/<PRODUCT_ID>/variants.json"
 *  3. Put the ids below (size + color → variantId). Until a product is mapped
 *     here, checkout still works — the order is recorded as `manual_review`
 *     in the ledger instead of auto-fulfilled.
 */

export interface PrintifyVariant {
  size: string;
  color: string;
  /** Numeric variant id from the Printify catalog/variants API. */
  variantId: number;
  /** Your production cost for margin tracking (USD). */
  cost: number;
}

export interface PrintifyMapping {
  /** Printify product id (from the dashboard URL). */
  productId: string;
  /** Blueprint id for reference (from the Printify catalog). */
  blueprintId?: number;
  printProviderId?: number;
  /** One variant per size/color combination you sell. */
  variants: PrintifyVariant[];
}

export const COLOR = "Black" as const;

export const PRINTIFY: Record<string, PrintifyMapping> = {
  // ── Replace the placeholder ids with your real Printify ids ──
  p1: {
    productId: "PRINTIFY_PRODUCT_ID_FOR_PHANTOM_HOODIE",
    blueprintId: 0,
    printProviderId: 0,
    variants: [
      { size: "S", color: COLOR, variantId: 0, cost: 0 },
      { size: "M", color: COLOR, variantId: 0, cost: 0 },
      { size: "L", color: COLOR, variantId: 0, cost: 0 },
      { size: "XL", color: COLOR, variantId: 0, cost: 0 },
    ],
  },
  p2: {
    productId: "6aba1e38855344491704d840", // Alien Mask Graphic Tee (White) — blueprint 5345, provider 99
    blueprintId: 5345,
    printProviderId: 99,
    variants: [
      { size: "S", color: "White", variantId: 0, cost: 0 }, // enable + map when added in Printify
      { size: "M", color: "White", variantId: 243987, cost: 20.51 },
      { size: "L", color: "White", variantId: 0, cost: 0 },
      { size: "XL", color: "White", variantId: 0, cost: 0 },
    ],
  },
  p3: {
    productId: "PRINTIFY_PRODUCT_ID_FOR_CARGO_PANTS",
    variants: [
      { size: "S", color: COLOR, variantId: 0, cost: 0 },
      { size: "M", color: COLOR, variantId: 0, cost: 0 },
      { size: "L", color: COLOR, variantId: 0, cost: 0 },
      { size: "XL", color: COLOR, variantId: 0, cost: 0 },
    ],
  },
  p4: {
    productId: "PRINTIFY_PRODUCT_ID_FOR_BOMBER_JACKET",
    variants: [
      { size: "S", color: COLOR, variantId: 0, cost: 0 },
      { size: "M", color: COLOR, variantId: 0, cost: 0 },
      { size: "L", color: COLOR, variantId: 0, cost: 0 },
      { size: "XL", color: COLOR, variantId: 0, cost: 0 },
    ],
  },
  p5: {
    productId: "PRINTIFY_PRODUCT_ID_FOR_KNIT_BEANIE",
    variants: [{ size: "OS", color: COLOR, variantId: 0, cost: 0 }],
  },
  p6: {
    productId: "PRINTIFY_PRODUCT_ID_FOR_ZIP_VEST",
    variants: [
      { size: "S", color: COLOR, variantId: 0, cost: 0 },
      { size: "M", color: COLOR, variantId: 0, cost: 0 },
      { size: "L", color: COLOR, variantId: 0, cost: 0 },
      { size: "XL", color: COLOR, variantId: 0, cost: 0 },
    ],
  },
  a1: {
    productId: "PRINTIFY_PRODUCT_ID_FOR_SPECTRE_LONGSLEEVE",
    variants: [
      { size: "S", color: COLOR, variantId: 0, cost: 0 },
      { size: "M", color: COLOR, variantId: 0, cost: 0 },
      { size: "L", color: COLOR, variantId: 0, cost: 0 },
      { size: "XL", color: COLOR, variantId: 0, cost: 0 },
    ],
  },
  a2: {
    productId: "PRINTIFY_PRODUCT_ID_FOR_MIRAGE_TRACKPANTS",
    variants: [
      { size: "S", color: COLOR, variantId: 0, cost: 0 },
      { size: "M", color: COLOR, variantId: 0, cost: 0 },
      { size: "L", color: COLOR, variantId: 0, cost: 0 },
      { size: "XL", color: COLOR, variantId: 0, cost: 0 },
    ],
  },
  a3: {
    productId: "PRINTIFY_PRODUCT_ID_FOR_WRAITH_OVERSHIRT",
    variants: [
      { size: "S", color: COLOR, variantId: 0, cost: 0 },
      { size: "M", color: COLOR, variantId: 0, cost: 0 },
      { size: "L", color: COLOR, variantId: 0, cost: 0 },
      { size: "XL", color: COLOR, variantId: 0, cost: 0 },
    ],
  },
};

/** Look up the Printify line for a storefront product + size. */
export function printifyFor(id: string, size: string) {
  const m = PRINTIFY[id];
  if (!m) return null;
  const v = m.variants.find((x) => x.size === size) ?? null;
  if (!v) return null;
  const unmapped =
    m.productId.startsWith("PRINTIFY_PRODUCT_ID_FOR_") || v.variantId === 0;
  return {
    productId: m.productId,
    variantId: v.variantId,
    sku: undefined,
    unmapped,
    cost: v.cost,
  };
}
