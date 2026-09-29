import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import {
  loadAdminCatalog,
  saveProductOverride,
  deleteProductOverride,
  type ProductDoc,
} from "@/lib/admin-data";

export const runtime = "nodejs";

const CATEGORIES = ["Outerwear", "Tops", "Bottoms", "Accessories"] as const;

function sanitize(doc: unknown): Partial<ProductDoc> | null {
  if (typeof doc !== "object" || doc === null) return null;
  const d = doc as Record<string, unknown>;
  const out: Partial<ProductDoc> = {};

  if (typeof d.name === "string" && d.name.trim()) out.name = d.name.trim().slice(0, 80);
  if (typeof d.cat === "string" && (CATEGORIES as readonly string[]).includes(d.cat)) {
    out.cat = d.cat;
  }
  if (typeof d.tag === "string") out.tag = d.tag.trim().slice(0, 24);
  if (typeof d.fabric === "string") out.fabric = d.fabric.trim().slice(0, 40);
  if (typeof d.price === "number" && Number.isFinite(d.price) && d.price >= 0 && d.price <= 10000) {
    out.price = Math.round(d.price * 100) / 100;
  }
  if (typeof d.soldOut === "boolean") out.soldOut = d.soldOut;
  if (Array.isArray(d.sizes)) {
    const sizes = d.sizes.filter(
      (s): s is string => typeof s === "string" && ["S", "M", "L", "XL", "OS"].includes(s)
    );
    if (sizes.length > 0) out.sizes = sizes;
  }
  return out;
}

function guard(request: Request): boolean {
  return isAdminRequest(request, request.headers.get("cookie"));
}

export async function GET(request: Request) {
  if (!guard(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const products = await loadAdminCatalog();
  return NextResponse.json({ products });
}

export async function POST(request: Request) {
  if (!guard(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
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
    const form = await request.formData();
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

  if (typeof id !== "string" || !/^[pa]\d+$/.test(id)) {
    return NextResponse.json({ error: "Invalid product id" }, { status: 400 });
  }
  if (!doc || Object.keys(doc).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }
  await saveProductOverride(id, doc);

  if (!contentType.includes("application/json")) {
    return NextResponse.redirect(new URL("/admin?saved=" + encodeURIComponent(id), request.url), 303);
  }
  const products = await loadAdminCatalog();
  return NextResponse.json({ ok: true, product: products.find((p) => p.id === id) });
}

export async function DELETE(request: Request) {
  if (!guard(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id || !/^[pa]\d+$/.test(id)) {
    return NextResponse.json({ error: "Invalid product id" }, { status: 400 });
  }
  await deleteProductOverride(id);
  return NextResponse.json({ ok: true });
}
