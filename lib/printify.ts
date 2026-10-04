/**
 * Printify order API (Node runtime).
 * Docs: https://developers.printify.com/
 */
const BASE = "https://api.printify.com/v1";

interface PrintifyAddress {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  country: string;
  region?: string;
  city: string;
  address1: string;
  address2?: string;
  zip: string;
}

function assertEnv(): { token: string; shopId: string } {
  const token = process.env.PRINTIFY_API_TOKEN;
  const shopId = process.env.PRINTIFY_SHOP_ID;
  if (!token || !shopId) throw new Error("Printify credentials missing (PRINTIFY_API_TOKEN / PRINTIFY_SHOP_ID)");
  return { token, shopId };
}

export async function createPrintifyOrder(params: {
  externalId: string;
  lineItems: Array<{ product_id: string; variant_id: number; quantity: number }>;
  address: PrintifyAddress;
}): Promise<{ id: string; status: string }> {
  // HIGH FIX (1000x audit): DRY-RUN GUARD. Printify has no sandbox — a
  // Sandbox PayPal end-to-end test would otherwise create a REAL print order
  // (real print, real charge). Set PRINTIFY_DRY_RUN=1 in Preview/test envs.
  if (process.env.PRINTIFY_DRY_RUN === "1") {
    const dryId = `dry-run-${params.externalId}`;
    console.warn(`[printify] DRY RUN — skipping real API call, returning fake order ${dryId}`);
    return { id: dryId, status: "dry_run" };
  }
  const { token, shopId } = assertEnv();
  const res = await fetch(`${BASE}/shops/${shopId}/orders.json`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    // MEDIUM FIX (1000x audit): 15s timeout — a hung Printify API must not
    // hold a serverless invocation indefinitely.
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({
      external_id: params.externalId,
      line_items: params.lineItems,
      shipping_method: 1, // standard — Printify rates apply
      send_shipping_notification: true,
      address_to: params.address,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Printify order failed (${res.status}): ${text.slice(0, 300)}`);
  const data = JSON.parse(text) as { id: string; status: string };
  return { id: String(data.id), status: data.status };
}
