import { NextResponse } from "next/server";
import { capturePayPalOrder, getPayPalOrder } from "@/lib/paypal";
import {
  getLedger,
  indexCapture,
  ledgerKeyForCapture,
  recordPaid,
  shortKey,
} from "@/lib/ledger";
import { fulfillOrder } from "@/lib/fulfill";
import { toMoney } from "@/lib/pricing";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const ip = clientIp(request);
  const rl = await rateLimit("capture-order", ip, 60, 3600);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many capture attempts — try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Missing request body" }, { status: 400 });
  }
  const { orderId, ledgerKey } = body as { orderId?: unknown; ledgerKey?: unknown };
  if (typeof orderId !== "string" || !/^([0-9A-Z]+)$/.test(orderId)) {
    return NextResponse.json({ error: "Missing or invalid orderId" }, { status: 400 });
  }
  if (typeof ledgerKey !== "string" || !/^ord_[a-z0-9_]+$/.test(ledgerKey)) {
    return NextResponse.json({ error: "Missing or invalid ledgerKey" }, { status: 400 });
  }

  // Bind the PayPal order to this checkout session: the order's custom_id
  // (set at creation) must equal our ledger key, or this is a foreign order.
  let ppOrder;
  try {
    ppOrder = await getPayPalOrder(orderId);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[capture-order] paypal order lookup failed", orderId, detail);
    return NextResponse.json({ error: "Could not verify PayPal order. Try again in a moment." }, { status: 502 });
  }
  const boundKey = ppOrder.purchase_units?.[0]?.custom_id;
  if (boundKey !== ledgerKey) {
    console.warn("[capture-order] order/ledger binding mismatch", orderId, shortKey(ledgerKey));
    return NextResponse.json({ error: "Order does not belong to this checkout session" }, { status: 409 });
  }

  // Idempotency: if this capture was already processed, don't fulfill twice.
  let existingKey: string | null = null;
  try {
    existingKey = await ledgerKeyForCapture(orderId);
  } catch (err) {
    console.error("[capture-order] ledger read failed", err);
    return NextResponse.json({ error: "Store ledger unavailable — try again shortly." }, { status: 503 });
  }
  if (existingKey && existingKey !== ledgerKey) {
    return NextResponse.json({ error: "Order already processed" }, { status: 409 });
  }

  let rec;
  try {
    rec = await getLedger(ledgerKey);
  } catch (err) {
    console.error("[capture-order] ledger read failed", shortKey(ledgerKey), err);
    return NextResponse.json({ error: "Store ledger unavailable — try again shortly." }, { status: 503 });
  }
  if (!rec) {
    return NextResponse.json({ error: "Unknown checkout session" }, { status: 404 });
  }
  if (rec.status === "paid" || rec.status === "fulfilled" || rec.status === "fulfilling") {
    return NextResponse.json({ ok: true, status: rec.status });
  }

  let capture;
  try {
    capture = await capturePayPalOrder(orderId);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[capture-order] capture failed", orderId, detail);
    // Ledger stays "created" — webhook/capture retry path can still complete it.
    return NextResponse.json({ error: "Payment capture failed. If you were charged, contact support." }, { status: 502 });
  }

  const cap = capture.purchase_units?.[0]?.payments?.captures?.[0];
  const paid = toMoney(rec.totals.total);
  // Cross-check the captured amount against the server-recomputed total.
  if (!cap || cap.amount?.currency_code !== "USD" || cap.amount?.value !== paid) {
    console.error("[capture-order] amount mismatch", orderId, cap?.amount, "expected", paid);
    try {
      await recordPaid(ledgerKey, {
        orderId,
        captureId: cap?.id,
        amount: cap?.amount?.value,
        currency: cap?.amount?.currency_code,
        status: "AMOUNT_MISMATCH",
        payerEmail: capture.payer?.email_address,
      });
    } catch (err) {
      console.error("[capture-order] ledger write failed", shortKey(ledgerKey), err);
      return NextResponse.json({ error: "Store ledger unavailable — try again shortly." }, { status: 503 });
    }
    return NextResponse.json({ error: "Payment amount mismatch — our team will review this order." }, { status: 409 });
  }

  try {
    rec = (await recordPaid(ledgerKey, {
      orderId,
      captureId: cap.id,
      amount: cap.amount?.value,
      currency: cap.amount?.currency_code,
      status: cap.status,
      payerEmail: capture.payer?.email_address,
    })) ?? rec;
  } catch (err) {
    console.error("[capture-order] ledger write failed", shortKey(ledgerKey), err);
    return NextResponse.json({ error: "Store ledger unavailable — try again shortly." }, { status: 503 });
  }

  try {
    await indexCapture(orderId, ledgerKey);
    if (cap.id) await indexCapture(cap.id, ledgerKey);
  } catch (err) {
    console.error("[capture-order] capture index failed", shortKey(ledgerKey), err);
    return NextResponse.json({ error: "Store ledger unavailable — try again shortly." }, { status: 503 });
  }

  const shipping = capture.purchase_units?.[0]?.shipping;
  const result = await fulfillOrder(rec, shipping, capture.payer?.email_address ?? "");
  return NextResponse.json({
    ok: true,
    status: result.ok ? "fulfilled" : "manual_review",
    printifyOrderId: result.printifyOrderId,
  });
}
