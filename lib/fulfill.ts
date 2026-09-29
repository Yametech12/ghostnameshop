/**
 * Fulfillment orchestrator.
 *
 * Contract: a payment is NEVER lost. Every path ends in exactly one of:
 *  - fulfilled      → Printify order created
 *  - manual_review  → problem recorded in the ledger for manual handling
 * The caller (webhook or capture route) just awaits fulfillOrder().
 */
import { createPrintifyOrder } from "./printify";
import { recordFulfilled, recordFulfilling, recordManualReview } from "./ledger";
import type { LedgerRecord } from "./types";

/** PayPal SHIPPING.PAYER address fields → Printify address_to. */
interface WebhookAddress {
  name?: { full_name?: string };
  address?: Record<string, string>;
}

export function addressFromWebhookShipping(shipping: WebhookAddress | undefined, email: string) {
  const addr = shipping?.address ?? {};
  const full = shipping?.name?.full_name ?? "";
  const parts = full.trim().split(/\s+/);
  return {
    first_name: parts[0] ?? "",
    last_name: parts.slice(1).join(" ") || "-",
    email,
    country: addr.country_code ?? "",
    region: addr.admin_area_1 ?? "",
    city: addr.admin_area_2 ?? "",
    address1: addr.address_line_1 ?? "",
    address2: addr.address_line_2 ?? "",
    zip: addr.postal_code ?? "",
  };
}

/**
 * Create the Printify order for a paid ledger record.
 * Unmapped products/variants → manual_review (never throws for that reason).
 */
export async function fulfillOrder(
  rec: LedgerRecord,
  shipping: WebhookAddress | undefined,
  payerEmail: string
): Promise<{ ok: boolean; printifyOrderId?: string; manual?: string }> {
  await recordFulfilling(rec.key, "fulfillment started");

  const mapped = rec.resolved?.lines.filter((l) => !l.fulfillment.unmapped) ?? [];
  if (mapped.length === 0) {
    await recordManualReview(rec.key, "no mapped Printify variants for this cart");
    return { ok: false, manual: "no mapped Printify variants" };
  }
  if (mapped.some((l) => !l.fulfillment.productId || !l.fulfillment.variantId)) {
    await recordManualReview(rec.key, "mapped lines missing product/variant ids");
    return { ok: false, manual: "mapped lines missing ids" };
  }

  try {
    const order = await createPrintifyOrder({
      externalId: rec.key,
      lineItems: mapped.map((l) => ({
        product_id: l.fulfillment.productId,
        variant_id: l.fulfillment.variantId,
        quantity: l.qty,
      })),
      address: addressFromWebhookShipping(shipping, payerEmail),
    });
    await recordFulfilled(rec.key, { orderId: order.id, status: order.status });
    return { ok: true, printifyOrderId: order.id };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    await recordManualReview(rec.key, `printify call failed: ${detail}`);
    return { ok: false, manual: detail };
  }
}
