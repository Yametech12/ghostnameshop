/**
 * Printify mapping —— the bridge between storefront SKUs and Printify.
 *
 * Real products (Oct 2026) — Bella+Canvas 3010 Unisex Oversized Boxy Tee via
 * Printify Choice, in shop "My new store" (4053686):
 *   gt-barcode-boxy  "GHOSTNAME® WORLDWIDE — Barcode Boxy Tee"   6ac2f2dd648a20ba5a031598
 *   gt-classic-boxy  "GHOSTNAME® WORLDWIDE — Classic Boxy Tee"   6ac2f2e2210cd1118005b3c7
 *   gt-faceless-boxy "GHOSTNAME® WORLDWIDE — Faceless Boxy Tee"  6ac2f2e91eaed3057e02b810
 *
 * Retail: $30 base XS–XL (+$2 for 2XL, +$5 for 3XL — see sizePriceAdjust
 * in lib/catalog.ts).
 *
 * Until a product is mapped here, checkout still works —— the order is
 * recorded as `manual_review` in the ledger instead of auto-fulfilled.
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

/** @deprecated Do not use as a silent default — color must come from the validated cart. */
export const COLOR = "Black" as const;

/** Colors offered for the boxy tees (default first). */
export const COLORS = ["Black", "White"] as const;

/** Shared Bella+Canvas 3010 variant table (Printify Choice catalog-level ids). */
const BOXY_VARIANTS: PrintifyVariant[] = [
  // Black —— Bella+Canvas 3010
  { size: "XS", color: "Black", variantId: 103517, cost: 18.58 },
  { size: "S", color: "Black", variantId: 103518, cost: 18.58 },
  { size: "M", color: "Black", variantId: 103519, cost: 18.58 },
  { size: "L", color: "Black", variantId: 103520, cost: 18.58 },
  { size: "XL", color: "Black", variantId: 103521, cost: 18.58 },
  { size: "2XL", color: "Black", variantId: 103522, cost: 19.45 },
  { size: "3XL", color: "Black", variantId: 103523, cost: 21.45 },
  // White —— Bella+Canvas 3010
  { size: "XS", color: "White", variantId: 103545, cost: 18.58 },
  { size: "S", color: "White", variantId: 103546, cost: 18.58 },
  { size: "M", color: "White", variantId: 103547, cost: 18.58 },
  { size: "L", color: "White", variantId: 103548, cost: 18.58 },
  { size: "XL", color: "White", variantId: 103549, cost: 18.58 },
  { size: "2XL", color: "White", variantId: 103550, cost: 19.45 },
  { size: "3XL", color: "White", variantId: 103551, cost: 21.45 },
];

export const PRINTIFY: Record<string, PrintifyMapping> = {
  "gt-barcode-boxy": {
    productId: "6ac2f2dd648a20ba5a031598",
    blueprintId: 1382,
    printProviderId: 99,
    variants: BOXY_VARIANTS,
  },
  "gt-classic-boxy": {
    productId: "6ac2f2e2210cd1118005b3c7",
    blueprintId: 1382,
    printProviderId: 99,
    variants: BOXY_VARIANTS,
  },
  "gt-faceless-boxy": {
    productId: "6ac2f2e91eaed3057e02b810",
    blueprintId: 1382,
    printProviderId: 99,
    variants: BOXY_VARIANTS,
  },
};

/**
 * Colors available for a product id (canonical casing, e.g. ["Black", "White"]).
 */
export function colorsFor(id: string): readonly string[] {
  const m = PRINTIFY[id];
  if (!m) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of m.variants) {
    if (!seen.has(v.color)) { seen.add(v.color); out.push(v.color); }
  }
  return out;
}

/**
 * Look up the Printify line for a storefront product + size + color.
 * CRITICAL: color is REQUIRED and must match a variant exactly (case-insensitive).
 * Never silently default — a wrong default ships the wrong product.
 */
export function printifyFor(id: string, size: string, color: string) {
  const m = PRINTIFY[id];
  if (!m) return null;
  const want = color.trim().toLowerCase();
  const v =
    m.variants.find(
      (x) => x.size === size && x.color.toLowerCase() === want
    ) ?? null;
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
