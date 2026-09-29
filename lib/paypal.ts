/**
 * PayPal REST helpers (Node runtime).
 * Docs: https://developer.paypal.com/docs/api/orders/v2/
 */
import { toMoney } from "./pricing";
import type { ResolvedCart } from "./types";

const BASE = process.env.PAYPAL_API_BASE || "https://api-m.sandbox.paypal.com";

async function getAccessToken(): Promise<string> {
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Error("PayPal credentials missing (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET)");
  const auth = Buffer.from(`${id}:${secret}`).toString("base64");
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`PayPal OAuth failed: ${await res.text()}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

async function paypalFetch(path: string, init: RequestInit): Promise<unknown> {
  const token = await getAccessToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const text = await res.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const detail = typeof body === "object" && body !== null && "message" in body
      ? String((body as { message: unknown }).message)
      : text.slice(0, 300);
    throw new Error(`PayPal ${path} failed (${res.status}): ${detail}`);
  }
  return body;
}

export interface PayPalOrderResult {
  id: string;
  status: string;
}

/** Create a server-side PayPal order from a server-resolved cart. */
export async function createPayPalOrder(resolved: ResolvedCart, ledgerKey: string): Promise<PayPalOrderResult> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const body = {
    intent: "CAPTURE",
    purchase_units: [
      {
        reference_id: "default",
        custom_id: ledgerKey,
        description: "GHOSTNAME WORLDWIDE — FW26 drop",
        amount: { currency_code: "USD", value: toMoney(resolved.total), breakdown: {
          item_total: { currency_code: "USD", value: toMoney(resolved.subtotal) },
          shipping: { currency_code: "USD", value: toMoney(resolved.shipping) },
        } },
        items: resolved.lines.map((l) => ({
          name: `${l.name} (${l.size})`,
          quantity: String(l.qty),
          unit_amount: { currency_code: "USD", value: toMoney(l.unitAmount) },
        })),
      },
    ],
    // USD-only checkout; the customer types their shipping address in PayPal.
    payment_source: { paypal: { experience_context: {
      shipping_preference: "GET_FROM_FILE",
      user_action: "PAY_NOW",
      return_url: `${appUrl}/thank-you`,
      cancel_url: `${appUrl}/checkout`,
    } } },
  };
  return (await paypalFetch("/v2/checkout/orders", {
    method: "POST",
    body: JSON.stringify(body),
  })) as PayPalOrderResult;
}

export interface PayPalCaptureResult {
  id: string;
  status: string;
  payer?: { email_address?: string };
  purchase_units?: Array<{
    payments?: {
      captures?: Array<{ id: string; status: string; amount?: { value: string; currency_code: string } }>;
      authorizations?: Array<{ id: string; status: string }>;
    };
    shipping?: {
      name?: { full_name?: string };
      address?: Record<string, string>;
    };
  }>;
}

/** Capture (finalize) a PayPal order that the buyer approved. */
export async function capturePayPalOrder(orderId: string): Promise<PayPalCaptureResult> {
  return (await paypalFetch(`/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    body: "{}",
  })) as PayPalCaptureResult;
}

/** Fetch an order's current state from PayPal (used for webhook cross-checks). */
export async function getPayPalOrder(orderId: string): Promise<PayPalCaptureResult> {
  return (await paypalFetch(`/v2/checkout/orders/${orderId}`, { method: "GET" })) as PayPalCaptureResult;
}

/** Verify a webhook really came from PayPal — never trust raw POSTs. */
export async function verifyWebhook(headers: Headers, event: unknown): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) throw new Error("PAYPAL_WEBHOOK_ID missing");
  const token = await getAccessToken();
  const res = await fetch(`${BASE}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      auth_algo: headers.get("paypal-auth-algo"),
      cert_url: headers.get("paypal-cert-url"),
      transmission_id: headers.get("paypal-transmission-id"),
      transmission_sig: headers.get("paypal-transmission-sig"),
      transmission_time: headers.get("paypal-transmission-time"),
      webhook_id: webhookId,
      webhook_event: event,
    }),
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { verification_status?: string };
  return data.verification_status === "SUCCESS";
}
