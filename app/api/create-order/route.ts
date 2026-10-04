import { NextResponse } from "next/server";
import { resolveCart } from "@/lib/catalog";
import { createPayPalOrder } from "@/lib/paypal";
import { newLedgerKey, recordCreated, shortKey } from "@/lib/ledger";
import { estimateMargin, round2 } from "@/lib/pricing";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { redis } from "@/lib/admin-data";
import type { CartLine } from "@/lib/types";

export const runtime = "nodejs";

const IDEM_PREFIX = "gn:idem:";
const IDEM_RESP_PREFIX = "gn:idem-resp:";
const IDEM_TTL = 86400; // 24h — matches PayPal's order approval window

function parseLines(input: unknown): CartLine[] | null {
  if (!Array.isArray(input) || input.length === 0 || input.length > 10) return null;
  const lines: CartLine[] = [];
  for (const raw of input) {
    if (typeof raw !== "object" || raw === null) return null;
    const { id, size, qty } = raw as Record<string, unknown>;
    if (typeof id !== "string" || !/^([pa]\d+|gt-[a-z0-9-]+)$/.test(id)) return null;
    if (typeof size !== "string" || !/^(XS|S|M|L|XL|2XL|3XL)$/.test(size)) return null;
    const q = Math.floor(Number(qty));
    if (!Number.isFinite(q) || q < 1 || q > 10) return null;
    lines.push({ id, size, qty: q });
  }
  return lines;
}

/** Client-supplied idempotency key (header preferred, body fallback), sanitized. */
function idempotencyKey(request: Request, body: unknown): string | null {
  const raw =
    request.headers.get("idempotency-key")?.trim() ||
    (typeof body === "object" && body !== null
      ? String((body as { idempotencyKey?: unknown }).idempotencyKey ?? "").trim()
      : "");
  return /^[A-Za-z0-9_-]{8,128}$/.test(raw) ? raw : null;
}

export async function POST(request: Request) {
  const ip = clientIp(request);
  const rl = await rateLimit("create-order", ip, 20, 3600);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many checkout attempts — try again later." },
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

  const lines = parseLines((body as { items?: unknown }).items);
  if (!lines) {
    return NextResponse.json({ error: "Invalid cart lines" }, { status: 400 });
  }

  // Idempotency: a retried request replays the stored response instead of
  // creating a second PayPal order.
  const idem = idempotencyKey(request, body);
  if (idem) {
    try {
      const claimed = await redis().set(`${IDEM_PREFIX}${idem}`, "processing", {
        nx: true,
        ex: IDEM_TTL,
      });
      if (!claimed) {
        const stored = await redis().get(`${IDEM_RESP_PREFIX}${idem}`);
        if (stored) {
          const payload = typeof stored === "string" ? JSON.parse(stored) : stored;
          return NextResponse.json(payload, { status: 200 });
        }
        return NextResponse.json(
          { error: "Duplicate request already in progress" },
          { status: 409 }
        );
      }
    } catch (err) {
      console.warn("[create-order] idempotency check unavailable, proceeding", shortKey(String(idem)), err);
    }
  }
  const releaseIdem = async () => {
    if (idem) await redis().del(`${IDEM_PREFIX}${idem}`).catch(() => {});
  };

  let resolved;
  try {
    resolved = await resolveCart(lines);
  } catch (err) {
    await releaseIdem();
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: detail || "Invalid cart" }, { status: 400 });
  }
  if (resolved.lines.length === 0 || resolved.total <= 0) {
    await releaseIdem();
    return NextResponse.json({ error: "Cart is empty or unpurchasable" }, { status: 400 });
  }

  const ledgerKey = newLedgerKey();
  try {
    await recordCreated({ key: ledgerKey, lines, resolved });
  } catch (err) {
    await releaseIdem();
    console.error("[create-order] ledger write failed", err);
    return NextResponse.json({ error: "Store ledger unavailable — try again shortly." }, { status: 503 });
  }

  try {
    const order = await createPayPalOrder(resolved, ledgerKey);
    const margin = estimateMargin(resolved);
    console.log("[create-order]", shortKey(ledgerKey), "total", resolved.total, "margin", margin.margin);
    const payload = {
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
    };
    if (idem) {
      await redis()
        .set(`${IDEM_RESP_PREFIX}${idem}`, JSON.stringify(payload), { ex: IDEM_TTL })
        .catch((err: unknown) => console.warn("[create-order] idempotency store failed", err));
    }
    return NextResponse.json(payload);
  } catch (err) {
    await releaseIdem();
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[create-order] paypal failed", shortKey(ledgerKey), detail);
    return NextResponse.json(
      { error: "Could not start PayPal checkout. Try again in a moment." },
      { status: 502 }
    );
  }
}
