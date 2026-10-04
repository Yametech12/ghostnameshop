/**
 * Money helpers — all amounts are USD, fixed to 2 decimals.
 *
 * Margin rule: every price must stay comfortably above
 * Printify cost + Printify shipping + PayPal fee (~3.49% + $0.49 US domestic;
 * cross-border fees are higher). The ledger keeps unit costs so you can audit
 * margins per order.
 */
import type { ResolvedLine } from "./types";

export function toMoney(v: number): string {
  return (Math.round(v * 100) / 100).toFixed(2);
}

/** Round to 2-decimal number (not string) for server-side math. */
export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Simple flat shipping table (USD). Tune freely — server-side source of truth. */
const SHIPPING_TABLE = {
  /** Free worldwide express over this subtotal. */
  freeOver: 150,
  /** Flat rate below the threshold. */
  flat: 12,
} as const;

export function shippingFor(subtotal: number): number {
  return subtotal >= SHIPPING_TABLE.freeOver ? 0 : SHIPPING_TABLE.flat;
}

/** Consistent USD currency code. */
export const CURRENCY = "USD" as const;

export function lineTotalFor(line: ResolvedLine): number {
  return round2(line.unitAmount * line.qty);
}

/**
 * Sales tax for an order. Currently 0 — GHOSTNAME has no sales-tax nexus in
 * any US state yet.
 * TODO(nexus): when the business establishes nexus (physical presence or
 * economic thresholds crossed in a state), compute destination-based tax here
 * via a tax provider (e.g. Stripe Tax / Avalara) using the PayPal shipping
 * address, and add the tax line to the PayPal order breakdown.
 */
export function taxFor(_subtotal: number): number {
  return 0;
}

/**
 * Rough margin report for a resolved cart (informational, logged to ledger).
 * PayPal US domestic reference: 3.49% + $0.49 fixed fee.
 */
export function estimateMargin(resolved: {
  lines: ResolvedLine[];
  subtotal: number;
  shipping: number;
  total: number;
}): { production: number; paypalFee: number; margin: number } {
  const production = round2(
    resolved.lines.reduce((s, l) => s + l.unitCost * l.qty, 0)
  );
  const paypalFee = round2(resolved.total * 0.0349 + 0.49);
  const margin = round2(
    resolved.total - production - (resolved.shipping === 0 ? 12 : 0) - paypalFee
  );
  return { production, paypalFee, margin };
}
