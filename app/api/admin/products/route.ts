import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import catalogJson from "@/public/products.json";
import {
  loadAdminCatalog,
  saveProductOverride,
  deleteProductOverride,
  type ProductDoc,
} from "@/lib/admin-data";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const CATEGORIES = ["Outerwear", "Tops", "Bottoms", "Accessories"] as const;
const VALID_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL"] as const;
const ID_RE = /^([pa]\d+|gt-[a-z0-9-]+)$/;

/** Base catalog ids straight from public/products.json (storefront source of truth). */
const BASE_IDS = new Set(
  (catalogJson as Array<{ id: string }>).map((p) => p.id)
);

/** Strip < > so admin-entered text can never inject HTML into the storefront. */
function stripTags(s: string): string {
  return s.replace(/[<>]/g, "");
}

function sanitize(doc: unknown): Partial<ProductDoc> | null {
  if (typeof doc !== "object" || doc === null) return null;
  const d = doc as Record<string, unknown>;
  const out: Partial<ProductDoc> = {};

  if (typeof d.name === "string" && d.name.trim()) out.name = stripTags(d.name.trim()).slice(0, 80);
  if (typeof d.cat === "string" && (CATEGORIES as readonly string[]).includes(d.cat)) {
    out.cat = d.cat;
  }
  if (typeof d.tag === "string") out.tag = stripTags(d.tag.trim()).slice(0, 24);
  if (typeof d.fabric === "string") out.fabric = stripTags(d.fabric.trim()).slice(0, 40);
  if (typeof d.price === "number" && Number.isFinite(d.price) && d.price >= 0 && d.price <= 10000) {
    out.price = Math.round(d.price * 100) / 100;
  }
  if (typeof d.soldOut === "boolean") out.soldOut = d.soldOut;
  if (Array.isArray(d.sizes)) {
    const sizes = d.sizes.filter(
      (s): s is string => typeof s === "string" && (VALID_SIZES as readonly string[]).includes(s)
    );
    if (sizes.length > 0) out.sizes = sizes;
  }
  return out;
}

function guard(request: Request): boolean {
  return isAdminRequest(request, request.headers.get("cookie"));
}

async function checkLimit(request: Request): Promise<NextResponse | null> {
  const rl = await rateLimit("admin/products", clientIp(request), 120, 60);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Rate limited — try again shortly." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }
  return null;
}

export async function GET(request: Request) {
  if (!guard(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await checkLimit(request);
  if (limited) return limited;
  try {
    const products = await loadAdminCatalog();
    return NextResponse.json({ products });
  } catch (err) {
    console.error("[admin/products] catalog load failed", err);
    return NextResponse.json({ error: "Catalog unavailable — try again shortly." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!guard(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await checkLimit(request);
  if (limited) return limited;

  const contentType = request.headers.get("content-type") ?? "";
  let id: string | null = null;
  let doc: Partial<ProductDoc> | null = null;

  if (contentType.includes("application/json")) {
    let body: { id?: string; product?: unknown };
    try {
      body = (await request.json()) as { id?: string; product?: unknown };
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    id = body.id ?? null;
    doc = sanitize(body.product);
  } else {
    // HTML form post from the dashboard product cards.
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: "Invalid form body" }, { status: 400 });
    }
    id = form.get("id") as string | null;
    doc = sanitize({
      name: form.get("name"),
      cat: form.get("cat"),
      price: form.get("price") ? Number(form.get("price")) : undefined,
      fabric: form.get("fabric"),
      tag: form.get("tag"),
      soldOut: form.has("soldOut"), // checkbox: present = checked, absent = unchecked
    });
  }

  if (typeof id !== "string" || !ID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid product id" }, { status: 400 });
  }
  if (!BASE_IDS.has(id)) {
    return NextResponse.json({ error: "Unknown product id" }, { status: 400 });
  }
  if (!doc || Object.keys(doc).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }
  try {
    await saveProductOverride(id, doc);
  } catch (err) {
    console.error("[admin/products] save failed", id, err);
    return NextResponse.json({ error: "Catalog unavailable — try again shortly." }, { status: 503 });
  }

  if (!contentType.includes("application/json")) {
    return NextResponse.redirect(new URL("/admin?saved=" + encodeURIComponent(id), request.url), 303);
  }
  let products;
  try {
    products = await loadAdminCatalog();
  } catch (err) {
    console.error("[admin/products] catalog reload failed", err);
    return NextResponse.json({ error: "Catalog unavailable — try again shortly." }, { status: 503 });
  }
  return NextResponse.json({ ok: true, product: products.find((p) => p.id === id) });
}

export async function DELETE(request: Request) {
  if (!guard(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await checkLimit(request);
  if (limited) return limited;
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id || !ID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid product id" }, { status: 400 });
  }
  if (!BASE_IDS.has(id)) {
    return NextResponse.json({ error: "Unknown product id" }, { status: 400 });
  }
  try {
    await deleteProductOverride(id);
  } catch (err) {
    console.error("[admin/products] delete failed", id, err);
    return NextResponse.json({ error: "Catalog unavailable — try again shortly." }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
