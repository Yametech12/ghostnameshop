import { NextResponse } from "next/server";
import { verifyWebhook, getPayPalOrder } from "@/lib/paypal";
import {
  attachCapture,
  getLedger,
  indexCapture,
  ledgerKeyForCapture,
  recordPaid,
  shortKey,
} from "@/lib/ledger";
import { fulfillOrder } from "@/lib/fulfill";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 1024 * 1024; // 1MB — PayPal webhook events are a few KB

/**
 * Webhook entry point. PayPal retries non-2xx deliveries, so this handler
 * must be idempotent: paid/fulfilled records short-circuit to 200.
 */
export async function POST(request: Request) {
  const ip = clientIp(request);
  const rl = await rateLimit("paypal-webhook", ip, 600, 60);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Rate limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  // Reject oversized payloads before buffering the body.
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Webhook payload too large" }, { status: 400 });
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Webhook payload too large" }, { status: 400 });
  }
  if (!raw || !raw.trim()) {
    return NextResponse.json({ error: "Empty webhook event" }, { status: 400 });
  }

  // 1. Authenticate the webhook — reject anything unsigned. The RAW body is
  // verified (not a re-serialized object) so legitimate events pass.
  try {
    const valid = await verifyWebhook(request.headers, raw);
    if (!valid) {
      console.warn("[webhook] signature verification failed");
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
    }
  } catch (err) {
    // Missing webhook id / PayPal outage: 500 so PayPal retries later.
    console.error("[webhook] verification error", err);
    return NextResponse.json({ error: "Verification unavailable" }, { status: 500 });
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!event || typeof event !== "object") {
    return NextResponse.json({ error: "Empty webhook event" }, { status: 400 });
  }

  const type = String(event.event_type ?? "");
  const resource = (event.resource ?? {}) as Record<string, unknown>;
  const resourceId = String(resource.id ?? "");

  // 2. PAYMENT.CAPTURE.COMPLETED — the money moved.
  if (type === "PAYMENT.CAPTURE.COMPLETED") {
    const customId = String(resource.custom_id ?? "");
    const captureId = resourceId;
    let key = customId || (await ledgerKeyForCapture(captureId).catch(() => null)) || "";

    let rec = key ? await getLedger(key).catch(() => null) : null;
    if (!rec) {
      // Paid but no ledger record (e.g. expired key): log loudly for manual review.
      console.error("[webhook] PAID order with no ledger record", captureId, customId);
      return NextResponse.json({ ok: true, note: "no ledger record — flagged in logs" });
    }

    // Idempotent: already paid/fulfilled → ack.
    if (rec.status === "paid" || rec.status === "fulfilling" || rec.status === "fulfilled") {
      if (!rec.paypal.captureId && captureId) await attachCapture(key, captureId).catch(() => {});
      return NextResponse.json({ ok: true, status: rec.status });
    }

    // Cross-check amount against PayPal's own record of the order.
    const orderId = String((resource.supplementary_data as { related_ids?: { order_id?: string } } | undefined)?.related_ids?.order_id ?? "");
    if (orderId) {
      try {
        const pp = await getPayPalOrder(orderId);
        const amt = pp.purchase_units?.[0]?.payments?.captures?.[0]?.amount;
        if (amt && amt.currency_code === "USD" && Number(amt.value) !== rec.totals.total) {
          await recordPaid(key, { captureId, amount: amt.value, currency: amt.currency_code, status: "AMOUNT_MISMATCH" });
          return NextResponse.json({ ok: true, note: "amount mismatch — manual review" });
        }
      } catch (err) {
        console.warn("[webhook] paypal order cross-check failed", orderId, err);
      }
    }

    rec = (await recordPaid(key, {
      captureId,
      amount: typeof resource.amount === "object" && resource.amount !== null
        ? String((resource.amount as { value?: string }).value ?? "")
        : undefined,
      currency: typeof resource.amount === "object" && resource.amount !== null
        ? String((resource.amount as { currency_code?: string }).currency_code ?? "")
        : undefined,
      status: "COMPLETED",
      payerEmail: typeof resource.payer === "object" && resource.payer !== null
        ? String((resource.payer as { email_address?: string }).email_address ?? "")
        : undefined,
    })) ?? rec;
    await indexCapture(captureId, key).catch(() => {});

    const shipping = resource.shipping as Parameters<typeof fulfillOrder>[1];
    const payerEmail = rec.paypal.payerEmail ?? "";
    await fulfillOrder(rec, shipping, payerEmail);
    return NextResponse.json({ ok: true });
  }

  // 3. CHECKOUT.ORDER.COMPLETED — fallback safety net for capture edge cases.
  if (type === "CHECKOUT.ORDER.COMPLETED") {
    const customId = String(
      (resource.purchase_units as Array<{ custom_id?: string }> | undefined)?.[0]?.custom_id ?? ""
    );
    const rec = customId ? await getLedger(customId).catch(() => null) : null;
    if (rec && rec.status === "created") {
      await recordPaid(customId, { orderId: resourceId, status: "COMPLETED" }).catch(() => {});
      console.warn("[webhook] CHECKOUT.ORDER.COMPLETED without capture event", resourceId, shortKey(customId));
    }
    return NextResponse.json({ ok: true });
  }

  // 4. Refunds / disputes / everything else — ack, nothing to fulfill.
  return NextResponse.json({ ok: true, ignored: type });
}
