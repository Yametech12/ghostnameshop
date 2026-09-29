import { NextResponse } from "next/server";
import { getProductOverrides } from "@/lib/admin-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Storefront catalog API: public/products.json with admin edits applied live.
 * The static storefront fetches this first and falls back to products.json.
 */
export async function GET() {
  try {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const file = await fs.readFile(path.join(process.cwd(), "public/products.json"), "utf8");
    const base = JSON.parse(file) as Array<Record<string, unknown>>;

    const overrides = await getProductOverrides();

    const merged = base.map((p) => {
      const o = overrides[String(p.id)];
      if (!o) return p;
      const basePrice = p.price as Record<string, number> | undefined;
      return {
        ...p,
        name: o.name ?? p.name,
        cat: o.cat ?? p.cat,
        fabric: o.fabric ?? p.fabric,
        price: { ...(basePrice ?? {}), usd: o.price ?? basePrice?.usd ?? 0 },
        tag: o.soldOut ? "SOLD OUT" : (o.tag ?? p.tag),
      };
    });

    return NextResponse.json(merged, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[/api/products] failed", err);
    return NextResponse.json({ error: "Catalog unavailable" }, { status: 503 });
  }
}
