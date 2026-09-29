/**
 * Server catalog — single source of truth for prices.
 * Reads public/products.json (the same file the static storefront hydrates
 * from), so there is exactly one place to add inventory or change a price.
 */
import catalogJson from "@/public/products.json";
import { printifyFor } from "./catalog-map";
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

export function getItem(id: string): CatalogItem | null {
  const it = items.find((p) => p.id === id);
  if (!it) return null;
  return { ...it, price: { usd: it.price.usd } };
}

const VALID: SizeKey[] = ["S", "M", "L", "XL", "OS"];

/** Resolve a browser cart against the server catalog — never trust client prices. */
export function resolveCart(lines: CartLine[]): ResolvedCart {
  const resolved: ResolvedLine[] = [];
  for (const line of lines) {
    const item = getItem(line.id);
    if (!item || item.tag === "SOLD OUT") continue; // silently drop invalid lines
    const size = (VALID.includes(line.size as SizeKey) ? line.size : "M") as SizeKey;
    const qty = Math.max(1, Math.min(2, Math.floor(line.qty) || 1)); // terms: cap 2/style
    const fulfillment: PrintifyLine | null = printifyFor(item.id, size);
    resolved.push({
      id: item.id,
      size,
      qty,
      name: item.name,
      unitAmount: item.price.usd,
      unitCost: fulfillment?.cost ?? 0,
      lineTotal: round2(item.price.usd * qty),
      fulfillment:
        fulfillment ?? { productId: "", variantId: 0, unmapped: true, cost: 0 },
    });
  }
  const subtotal = round2(resolved.reduce((s, l) => s + l.lineTotal, 0));
  const shipping = resolved.length ? shippingFor(subtotal) : 0;
  const total = round2(subtotal + shipping);
  return { lines: resolved, subtotal, shipping, total };
}
