/**
 * PayPal REST helpers (Node runtime).
 * Docs: https://developer.paypal.com/docs/api/orders/v2/
 */
import { toMoney } from "./pricing";
import type { ResolvedCart } from "./types";

const LIVE_BASE = "https://api-m.paypal.com";
const SANDBOX_BASE = "https://api-m.sandbox.paypal.com";

/**
 * Resolve the API base at REQUEST time, not import time.
 *
 * Why: `next build` runs with NODE_ENV=production and imports every route
 * module. A module-level guard made the build crash whenever PAYPAL_API_BASE
 * was unset or still sandbox (CI, preview deploys). The safety rule is kept:
 * a real production deploy (VERCEL_ENV=production, or NODE_ENV=production on
 * any other host without an explicit sandbox opt-in) must never talk to the
 * sandbox. Set PAYPAL_ALLOW_SANDBOX=1 on staging hosts that run NODE_ENV=production.
 */
function apiBase(): string {
  const base = process.env.PAYPAL_API_BASE || SANDBOX_BASE;
  const isProd =
    process.env.VERCEL_ENV !== undefined
      ? process.env.VERCEL_ENV === "production"
      : process.env.NODE_ENV === "production";
  if (isProd && base !== LIVE_BASE && process.env.PAYPAL_ALLOW_SANDBOX !== "1") {
    throw new Error(
      `PAYPAL_API_BASE must be the live endpoint (${LIVE_BASE}) in production — refusing to talk to ${base}`
    );
  }
  return base;
}

/** Hard timeout per PayPal HTTP call — a hung PayPal must never hang our route. */
const FETCH_TIMEOUT_MS = 15_000;
/** Transient-failure retries: network errors and HTTP 5xx only, exponential backoff. */
const RETRY_MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * fetch with a hard timeout and retry on transient failures.
 * Retries network errors/timeouts and HTTP 5xx (max 3 attempts, backoff
 * 500ms → 1s → 2s). Never retries 4xx — those are caller/validation errors.
 * Safe for capture POSTs: PayPal capture is idempotent per order (a retried
 * capture returns the existing capture state or ORDER_ALREADY_CAPTURED),
 * so retries cannot double-charge.
 */
async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= RETRY_MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (res.status >= 500 && attempt < RETRY_MAX_ATTEMPTS) {
        await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt < RETRY_MAX_ATTEMPTS) {
        await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
      }
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(`PayPal request failed after ${RETRY_MAX_ATTEMPTS} attempts: ${String(lastErr)}`);
}

/** Module-level OAuth token cache — honors PayPal's expires_in, refreshes 60s early. */
let tokenCache: { token: string; expiresAt: number } | null = null;
/** In-flight token fetch — concurrent callers await the same promise (no thundering herd). */
let tokenInFlight: Promise<string> | null = null;

function clearTokenCache(): void {
  tokenCache = null;
}

async function fetchNewToken(): Promise<string> {
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Error("PayPal credentials missing (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET)");
  const auth = Buffer.from(`${id}:${secret}`).toString("base64");
  const res = await fetchWithRetry(`${apiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`PayPal OAuth failed: ${await res.text()}`);
  const data = (await res.json()) as { access_token: string; expires_in?: number };
  if (typeof data.access_token !== "string" || !data.access_token) {
    throw new Error("PayPal OAuth returned no access token");
  }
  const ttlSec = typeof data.expires_in === "number" && data.expires_in > 0 ? data.expires_in : 3600;
  tokenCache = { token: data.access_token, expiresAt: Date.now() + ttlSec * 1000 };
  return tokenCache.token;
}

async function getAccessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.token;
  }
  if (!tokenInFlight) {
    tokenInFlight = fetchNewToken().finally(() => {
      tokenInFlight = null;
    });
  }
  return tokenInFlight;
}

async function paypalFetch(path: string, init: RequestInit, retryOn401 = true): Promise<unknown> {
  const token = await getAccessToken();
  const res = await fetchWithRetry(`${apiBase()}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  // One 401 retry with a fresh token — the cached token may have been revoked.
  if (res.status === 401 && retryOn401) {
    clearTokenCache();
    return paypalFetch(path, init, false);
  }
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
        description: "GHOSTNAME WORLDWIDE order",
        amount: { currency_code: "USD", value: toMoney(resolved.total), breakdown: {
          item_total: { currency_code: "USD", value: toMoney(resolved.subtotal) },
          shipping: { currency_code: "USD", value: toMoney(resolved.shipping) },
        } },
        items: resolved.lines.map((l) => ({
          name: `${l.name} (${l.color}, ${l.size})`,
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
  const result = (await paypalFetch("/v2/checkout/orders", {
    method: "POST",
    body: JSON.stringify(body),
  })) as { id?: unknown; status?: unknown };
  if (typeof result?.id !== "string" || !result.id) {
    throw new Error("PayPal order creation returned no order id");
  }
  return { id: result.id, status: typeof result.status === "string" ? result.status : "" };
}

export interface PayPalCaptureResult {
  id: string;
  status: string;
  payer?: { email_address?: string };
  purchase_units?: Array<{
    /** Our ledger key — set as custom_id at order creation; binds order ↔ checkout. */
    custom_id?: string;
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

/**
 * Verify a webhook really came from PayPal — never trust raw POSTs.
 *
 * @param rawBody the RAW request body string, passed through untouched as
 *   webhook_event. Re-serializing a parsed object can change byte-level
 *   details and fail verification for legitimate webhooks.
 * @throws when the verification API itself errors — the route must 500 so
 *   PayPal retries the delivery.
 * @returns false ONLY when PayPal explicitly reports verification_status !== "SUCCESS".
 */
export async function verifyWebhook(headers: Headers, rawBody: string): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) throw new Error("PAYPAL_WEBHOOK_ID missing");
  const res = await fetchWithRetry(`${apiBase()}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await getAccessToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      auth_algo: headers.get("paypal-auth-algo"),
      cert_url: headers.get("paypal-cert-url"),
      transmission_id: headers.get("paypal-transmission-id"),
      transmission_sig: headers.get("paypal-transmission-sig"),
      transmission_time: headers.get("paypal-transmission-time"),
      webhook_id: webhookId,
      webhook_event: rawBody,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`PayPal webhook verification API failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { verification_status?: string };
  return data.verification_status === "SUCCESS";
}
