import { NextResponse } from "next/server";
import { capturePayPalOrder } from "@/lib/paypal";
import {
  getLedger,
  indexCapture,
  ledgerKeyForCapture,
  recordPaid,
} from "@/lib/ledger";
import { fulfillOrder } from "@/lib/fulfill";
import { toMoney } from "@/lib/pricing";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { orderId?: string; ledgerKey?: string };
  try {
    body = (await request.json()) as { orderId?: string; ledgerKey?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { orderId, ledgerKey } = body;
  if (!orderId || !/^([0-9A-Z]+)$/.test(orderId)) {
    return NextResponse.json({ error: "Missing or invalid orderId" }, { status: 400 });
  }

  // Idempotency: if this capture was already processed, don't fulfill twice.
  const existingKey = await ledgerKeyForCapture(orderId).catch(() => null);
  if (existingKey && existingKey !== ledgerKey) {
    return NextResponse.json({ error: "Order already processed" }, { status: 409 });
  }

  let rec = await getLedger(ledgerKey ?? "");
  if (!rec) {
    return NextResponse.json({ error: "Unknown checkout session" }, { status: 404 });
  }
  if (rec.status === "fulfilled" || rec.status === "fulfilling") {
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
    await recordPaid(ledgerKey!, {
      orderId,
      captureId: cap?.id,
      amount: cap?.amount?.value,
      currency: cap?.amount?.currency_code,
      status: "AMOUNT_MISMATCH",
      payerEmail: capture.payer?.email_address,
    });
    return NextResponse.json({ error: "Payment amount mismatch — our team will review this order." }, { status: 409 });
  }

  rec = (await recordPaid(ledgerKey!, {
    orderId,
    captureId: cap.id,
    amount: cap.amount?.value,
    currency: cap.amount?.currency_code,
    status: cap.status,
    payerEmail: capture.payer?.email_address,
  })) ?? rec;

  await indexCapture(orderId, ledgerKey!).catch(() => {});
  if (cap.id) await indexCapture(cap.id, ledgerKey!).catch(() => {});

  const shipping = capture.purchase_units?.[0]?.shipping;
  const result = await fulfillOrder(rec, shipping, capture.payer?.email_address ?? "");
  return NextResponse.json({
    ok: true,
    status: result.ok ? "fulfilled" : "manual_review",
    printifyOrderId: result.printifyOrderId,
  });
}
