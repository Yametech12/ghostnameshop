/** Shared types for the GHOSTNAME storefront checkout + fulfillment pipeline. */

export type SizeKey = "XS" | "S" | "M" | "L" | "XL" | "2XL" | "3XL";

/** What the browser sends: product id + size + color + quantity. */
export interface CartLine {
  id: string;
  size: string;
  /** Color name matching the catalog (e.g. "Black", "White"). Required — never defaulted. */
  color: string;
  qty: number;
}

/** Server-resolved cart line — prices always come from the server catalog. */
export interface ResolvedLine {
  id: string;
  size: SizeKey;
  /** Validated color name (e.g. "Black", "White"). */
  color: string;
  qty: number;
  name: string;
  /** USD unit retail price. */
  unitAmount: number;
  /** USD unit production cost from Printify mapping (informational). */
  unitCost: number;
  /** Total USD for this line (unitAmount * qty). */
  lineTotal: number;
  /** Printify fulfillment info resolved from catalog-map.ts. */
  fulfillment: PrintifyLine;
}

export interface PrintifyLine {
  productId: string;
  variantId: number;
  /** Printify SKU for this variant, if mapped. */
  sku?: string;
  /** Unmapped fulfillment = order is logged for manual handling. */
  unmapped?: boolean;
  /** Production cost (USD) for margin tracking. */
  cost: number;
}

export interface ResolvedCart {
  lines: ResolvedLine[];
  subtotal: number;
  shipping: number;
  total: number;
}

/** A durable ledger record stored in Upstash Redis. */
export interface LedgerRecord {
  key: string;
  /** checkout intent — paid — fulfilling — fulfilled | manual_review */
  status: "created" | "paid" | "fulfilling" | "fulfilled" | "manual_review";
  lines: CartLine[];
  resolved: ResolvedCart | null;
  /** Canonical USD totals recomputed server-side. */
  totals: { subtotal: number; shipping: number; total: number };
  paypal: {
    orderId?: string;
    captureId?: string;
    amount?: string;
    currency?: string;
    status?: string;
    payerEmail?: string;
  };
  printify?: { orderId: string; status: string };
  /** Free-form audit trail of what happened and when. */
  events: Array<{ at: string; event: string; detail?: string }>;
  createdAt: string;
  updatedAt: string;
}
