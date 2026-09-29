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
  const { token, shopId } = assertEnv();
  const res = await fetch(`${BASE}/shops/${shopId}/orders.json`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
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
