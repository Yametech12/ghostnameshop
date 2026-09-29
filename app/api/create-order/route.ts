import { NextResponse } from "next/server";
import { resolveCart } from "@/lib/catalog";
import { createPayPalOrder } from "@/lib/paypal";
import { newLedgerKey, recordCreated } from "@/lib/ledger";
import { estimateMargin, round2 } from "@/lib/pricing";
import type { CartLine } from "@/lib/types";

export const runtime = "nodejs";

function parseLines(input: unknown): CartLine[] | null {
  if (!Array.isArray(input) || input.length === 0 || input.length > 10) return null;
  const lines: CartLine[] = [];
  for (const raw of input) {
    if (typeof raw !== "object" || raw === null) return null;
    const { id, size, qty } = raw as Record<string, unknown>;
    if (typeof id !== "string" || !/^[pa]\d+$/.test(id)) return null;
    if (typeof size !== "string" || !/^(S|M|L|XL|OS)$/.test(size)) return null;
    const q = Math.floor(Number(qty));
    if (!Number.isFinite(q) || q < 1 || q > 2) return null;
    lines.push({ id, size, qty: q });
  }
  return lines;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const lines = parseLines((body as { items?: unknown } | null)?.items);
  if (!lines) {
    return NextResponse.json({ error: "Invalid cart lines" }, { status: 400 });
  }

  const resolved = await resolveCart(lines);
  if (resolved.lines.length === 0 || resolved.total <= 0) {
    return NextResponse.json({ error: "Cart is empty or unpurchasable" }, { status: 400 });
  }

  const ledgerKey = newLedgerKey();
  try {
    await recordCreated({ key: ledgerKey, lines, resolved });
  } catch (err) {
    console.error("[create-order] ledger write failed", err);
    return NextResponse.json({ error: "Store ledger unavailable — try again shortly." }, { status: 503 });
  }

  try {
    const order = await createPayPalOrder(resolved, ledgerKey);
    const margin = estimateMargin(resolved);
    console.log("[create-order]", ledgerKey, "total", resolved.total, "margin", margin.margin);
    return NextResponse.json({
      orderId: order.id,
      ledgerKey,
      totals: {
        subtotal: round2(resolved.subtotal),
        shipping: resolved.shipping,
        total: resolved.total,
      },
      lines: resolved.lines.map((l) => ({
        id: l.id,
        size: l.size,
        qty: l.qty,
        name: l.name,
        unitAmount: l.unitAmount,
        lineTotal: l.lineTotal,
      })),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[create-order] paypal failed", ledgerKey, detail);
    return NextResponse.json(
      { error: "Could not start PayPal checkout. Try again in a moment." },
      { status: 502 }
    );
  }
}
