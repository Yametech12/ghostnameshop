/**
 * Server catalog — single source of truth for prices.
 * Reads public/products.json (the same file the static storefront hydrates
 * from), then applies live admin overrides from Redis (dashboard edits), so
 * checkout always charges exactly what the storefront shows.
 */
import catalogJson from "@/public/products.json";
import { printifyFor } from "./catalog-map";
import { getProductOverrides } from "./admin-data";
import { round2, shippingFor } from "./pricing";
import type { CartLine, PrintifyLine, ResolvedCart, ResolvedLine, SizeKey } from "./types";

export interface CatalogItem {
  id: string;
  name: string;
  cat: string;
  price: { usd: number };
  tag: string;
  fabric?: string;
}

const items = catalogJson as unknown as Array<
  Omit<CatalogItem, "price"> & { price: Record<string, number> }
>;

const VALID: SizeKey[] = ["S", "M", "L", "XL", "OS"];

/** Resolve a browser cart against the server catalog — never trust client prices. */
export async function resolveCart(lines: CartLine[]): Promise<ResolvedCart> {
  // Admin dashboard edits (name/price/sold-out) live on top of products.json.
  let overrides: Record<
    string,
    { name?: string; price?: number; soldOut?: boolean; tag?: string }
  > = {};
  try {
    overrides = await getProductOverrides();
  } catch {
    // If Redis is down, fall back to the base catalog rather than failing checkout.
  }

  const resolved: ResolvedLine[] = [];
  for (const line of lines) {
    const base = items.find((p) => p.id === line.id);
    if (!base) continue; // silently drop unknown ids
    const o = overrides[base.id] ?? {};

    const name = o.name ?? base.name;
    const unitPrice = typeof o.price === "number" ? o.price : base.price.usd;
    const tag = o.soldOut ? "SOLD OUT" : (o.tag ?? base.tag);
    if (tag === "SOLD OUT") continue;

    const size = (VALID.includes(line.size as SizeKey) ? line.size : "M") as SizeKey;
    const qty = Math.max(1, Math.min(2, Math.floor(line.qty) || 1)); // terms: cap 2/style
    const fulfillment: PrintifyLine | null = printifyFor(base.id, size);
    resolved.push({
      id: base.id,
      size,
      qty,
      name,
      unitAmount: unitPrice,
      unitCost: fulfillment?.cost ?? 0,
      lineTotal: round2(unitPrice * qty),
      fulfillment:
        fulfillment ?? { productId: "", variantId: 0, unmapped: true, cost: 0 },
    });
  }
  const subtotal = round2(resolved.reduce((s, l) => s + l.lineTotal, 0));
  const shipping = resolved.length ? shippingFor(subtotal) : 0;
  const total = round2(subtotal + shipping);
  return { lines: resolved, subtotal, shipping, total };
}
