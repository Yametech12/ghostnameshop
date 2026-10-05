/**
 * Server catalog — single source of truth for prices.
 * Reads public/products.json (the same file the static storefront hydrates
 * from), then applies live admin overrides from Redis (dashboard edits), so
 * checkout always charges exactly what the storefront shows.
 */
import catalogJson from "@/public/products.json";
import { printifyFor, colorsFor } from "./catalog-map";
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
  /** Units on hand; <= 0 means out of stock unless backorders are allowed. */
  stock?: number;
  /** When true, customers may buy even when stock is 0/unknown. */
  allowOutOfStockPurchases?: boolean;
}

const items = catalogJson as unknown as Array<
  Omit<CatalogItem, "price"> & { price: Record<string, number> }
>;

export const VALID: SizeKey[] = ["XS", "S", "M", "L", "XL", "2XL", "3XL"];

/**
 * Retail surcharge for extended sizes. 2XL/3XL cost more to produce, so the
 * $30 base becomes $32 (2XL) / $35 (3XL) — the storefront must show the same math.
 */
export function sizePriceAdjust(size: SizeKey): number {
  if (size === "2XL") return 2;
  if (size === "3XL") return 5;
  return 0;
}

/**
 * Resolve a browser cart against the server catalog — never trust client prices. */
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
    const tag = o.soldOut ? "SOLD OUT" : (o.tag ?? base.tag);
    if (tag === "SOLD OUT") continue;

    // Honor real inventory: out of stock + no backorders = not purchasable.
    // (The tag check above is only the admin's manual kill-switch.)
    const stock = typeof base.stock === "number" ? base.stock : undefined;
    const allowBackorder = base.allowOutOfStockPurchases === true;
    if (typeof stock === "number" && stock <= 0 && !allowBackorder) continue;

    // Never coerce an invalid size to a default — reject the whole cart instead.
    const size = line.size as SizeKey;
    if (!VALID.includes(size)) {
      throw new Error(`Invalid size "${line.size}" for product ${base.id}`);
    }

    // CRITICAL (500x audit): never default color — a wrong default ships the
    // wrong product. Reject the cart if color is missing or invalid.
    const validColors = colorsFor(base.id);
    const colorInput = typeof line.color === "string" ? line.color.trim() : "";
    const color = validColors.find((c) => c.toLowerCase() === colorInput.toLowerCase());
    if (!color) {
      throw new Error(
        `Invalid color "${line.color}" for product ${base.id} — valid: ${validColors.join(", ")}`
      );
    }

    const qty = Math.max(1, Math.min(10, Math.floor(line.qty) || 1)); // terms: cap 10/style
    const basePrice = typeof o.price === "number" ? o.price : base.price.usd;
    const unitPrice = round2(basePrice + sizePriceAdjust(size));
    const fulfillment: PrintifyLine | null = printifyFor(base.id, size, color);
    resolved.push({
      id: base.id,
      size,
      color,
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
