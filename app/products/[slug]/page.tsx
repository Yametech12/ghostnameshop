import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import type { Metadata } from "next";
import { getProductOverrides } from "@/lib/admin-data";
import { sizePriceAdjust } from "@/lib/catalog";
import type { SizeKey } from "@/lib/types";

export const dynamic = "force-dynamic";

type Product = {
  id: string;
  name: string;
  price: { usd: number };
  sizes: string[];
  colors: string[];
  img: string;
  images?: Record<string, string>;
  fabric?: string;
  desc: string;
  tag?: string;
  cat?: string;
};

function loadProducts(): Product[] {
  const file = path.join(process.cwd(), "public", "products.json");
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** Base catalog + live admin edits, so this page shows the price checkout will charge. */
async function findProduct(slug: string): Promise<(Product & { soldOut: boolean }) | undefined> {
  const base = loadProducts().find((p) => p.id === slug);
  if (!base) return undefined;
  let o: Awaited<ReturnType<typeof getProductOverrides>>[string] | undefined;
  try {
    o = (await getProductOverrides())[slug];
  } catch {
    /* Redis unavailable: show the base catalog rather than failing the page */
  }
  const tag = o?.soldOut ? "SOLD OUT" : (o?.tag ?? base.tag);
  return {
    ...base,
    name: o?.name ?? base.name,
    fabric: o?.fabric ?? base.fabric,
    price: { usd: typeof o?.price === "number" ? o.price : base.price.usd },
    tag,
    soldOut: tag === "SOLD OUT",
  };
}

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const product = await findProduct(slug);
  if (!product) return { title: "Product not found", robots: { index: false } };
  return {
    title: product.name,
    description: `${product.desc}${product.fabric ? ` ${product.fabric}.` : ""} $${product.price.usd} USD.`,
    alternates: { canonical: `/products/${product.id}` },
  };
}

const wrap: React.CSSProperties = {
  padding: "48px 24px",
  minHeight: "100vh",
  maxWidth: 960,
  margin: "0 auto",
};

export default async function ProductPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const product = await findProduct(slug);

  if (!product) {
    return (
      <main style={wrap}>
        <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 400, textTransform: "uppercase" }}>
          Product not found
        </h1>
        <p>
          <Link href="/#shop">Back to the shop</Link>
        </p>
      </main>
    );
  }

  const plus = product.sizes.filter((s) => sizePriceAdjust(s as SizeKey) > 0);
  const plusNote = plus
    .map((s) => `${s} $${(product.price.usd + sizePriceAdjust(s as SizeKey)).toFixed(2)}`)
    .join(" · ");

  return (
    <main style={wrap}>
      <p>
        <Link href="/#shop" style={{ color: "var(--mut)" }}>
          ← Back to the shop
        </Link>
      </p>
      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 400,
          letterSpacing: "0.03em",
          textTransform: "uppercase",
          fontSize: "clamp(2rem, 5vw, 3.2rem)",
          margin: "16px 0",
        }}
      >
        {product.name}
      </h1>
      {product.img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/${product.img}`}
          alt={product.name}
          width={1200}
          height={1200}
          style={{ maxWidth: "100%", height: "auto", borderRadius: 14, border: "1px solid var(--line)" }}
        />
      ) : null}
      <p style={{ fontSize: 22, fontWeight: 700 }}>
        ${product.price.usd.toFixed(2)}
        {plusNote ? <span style={{ color: "var(--mut)", fontSize: 14, fontWeight: 400 }}> · {plusNote}</span> : null}
      </p>
      {product.soldOut ? <p style={{ color: "#ff7a7a" }}>Sold out</p> : null}
      <p>{product.desc}</p>
      {product.fabric ? <p>Fabric: {product.fabric}</p> : null}
      <p>Sizes: {product.sizes.join(", ")}</p>
      <p>Colors: {product.colors.join(", ")}</p>
      <p>
        <Link href="/#shop" style={{ color: "var(--acc)", fontWeight: 700 }}>
          Choose a size and add to cart
        </Link>
      </p>
    </main>
  );
}
