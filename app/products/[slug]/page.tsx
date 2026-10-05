import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import type { Metadata } from "next";

type Product = {
  id: string;
  name: string;
  price: { usd: number; eur: number; gbp: number; jpy: number };
  sizes: string[];
  colors: string[];
  img: string;
  images?: Record<string, string>;
  fabric: string;
  desc: string;
  tag?: string;
  cat?: string;
};

function loadProducts(): Product[] {
  const file = path.join(process.cwd(), "public", "products.json");
  try {
    const raw = fs.readFileSync(file, "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function findProduct(slug: string): Product | undefined {
  return loadProducts().find((p) => p.id === slug);
}

type Params = { slug: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = findProduct(slug);
  return {
    title: product ? product.name : "Product not found",
    description: product
      ? `${product.desc} ${product.fabric}. $${product.price.usd} USD.`
      : undefined,
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const product = findProduct(slug);

  if (!product) {
    return (
      <main
        style={{
          padding: 48,
          background: "#0A0A0A",
          color: "#FFFFFF",
          minHeight: "100vh",
          fontFamily: "'Inter', sans-serif",
        }}
      >
        <h1>Product not found</h1>
        <p>
          <Link href="/store.html">Back to the store</Link>
        </p>
      </main>
    );
  }

  const hasPlusSizes =
    product.sizes.includes("2XL") || product.sizes.includes("3XL");

  return (
    <main
      style={{
        padding: 48,
        background: "#0A0A0A",
        color: "#FFFFFF",
        minHeight: "100vh",
        fontFamily: "'Inter', sans-serif",
        maxWidth: 960,
        margin: "0 auto",
      }}
    >
      <p>
        <Link href="/store.html">← Back to the store</Link>
      </p>
      <h1>{product.name}</h1>
      {product.img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/${product.img}`}
          alt={product.name}
          style={{ maxWidth: "100%", height: "auto" }}
        />
      ) : null}
      <p style={{ fontSize: 20, fontWeight: 600 }}>
        ${product.price.usd}
        {hasPlusSizes ? " (+$2 for 2XL · +$5 for 3XL)" : ""}
      </p>
      <p>{product.desc}</p>
      <p>Fabric: {product.fabric}</p>
      <p>Sizes: {product.sizes.join(", ")}</p>
      <p>Colors: {product.colors.join(", ")}</p>
      <p>
        <Link href={`/store.html#/product/${product.id}`}>
          View in the lookbook
        </Link>
      </p>
    </main>
  );
}
