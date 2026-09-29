import { Redis } from "@upstash/redis";
import type { LedgerRecord } from "./types";

let client: Redis | null = null;

/** Lazy Redis client — never throws at import time. */
export function redis(): Redis {
  if (!client) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) throw new Error("Upstash Redis env missing (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN)");
    client = new Redis({ url, token });
  }
  return client;
}

function parseMaybeJson<T>(raw: unknown): T | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
  return raw as T;
}

export async function getLedger(key: string): Promise<LedgerRecord | null> {
  const raw = await redis().get("gn:order:" + key);
  return parseMaybeJson<LedgerRecord>(raw);
}

/**
 * List all order ledger records, newest first.
 * Uses SCAN — fine at this scale (free-tier friendly).
 */
export async function listOrders(limit = 200): Promise<LedgerRecord[]> {
  const keys: string[] = [];
  let cursor = "0";
  do {
    const [next, batch] = await redis().scan(cursor, { match: "gn:order:*", count: 200 });
    cursor = next;
    keys.push(...batch);
  } while (cursor !== "0" && keys.length < limit * 3);

  const slice = keys.slice(0, limit * 3);
  const results = await Promise.all(slice.map((k) => getLedger(k.replace("gn:order:", ""))));
  const records: LedgerRecord[] = results.filter((r): r is LedgerRecord => r !== null);
  return records
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, limit);
}

export interface ProductDoc {
  id: string;
  name: string;
  cat: string;
  tag: string;
  fabric: string;
  price: number;
  soldOut: boolean;
  sizes: string[];
  updatedAt: string;
}

const OVERRIDES_KEY = "gn:admin:product_overrides";

/** Admin product edits stored in Redis: id → partial doc. Empty map when none. */
export async function getProductOverrides(): Promise<Record<string, Partial<ProductDoc>>> {
  const raw = await redis().get(OVERRIDES_KEY).catch(() => null);
  const parsed = parseMaybeJson<Record<string, Partial<ProductDoc>>>(raw);
  return parsed ?? {};
}

/**
 * Load the admin catalog: base products from public/products.json merged with
 * admin edits stored in Redis. Admin docs win field-by-field.
 */
export async function loadAdminCatalog(): Promise<ProductDoc[]> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const file = await fs.readFile(path.join(process.cwd(), "public/products.json"), "utf8");
  const base = JSON.parse(file) as Array<{
    id: string;
    name: string;
    cat: string;
    tag: string;
    fabric: string;
    price: { usd: number };
  }>;

  const map = await getProductOverrides();

  return base.map((p) => {
    const o = map[p.id] ?? {};
    return {
      id: p.id,
      name: o.name ?? p.name,
      cat: o.cat ?? p.cat,
      tag: o.tag ?? p.tag,
      fabric: o.fabric ?? p.fabric,
      price: typeof o.price === "number" ? o.price : p.price.usd,
      soldOut: o.soldOut ?? p.tag === "SOLD OUT",
      sizes: o.sizes ?? ["S", "M", "L", "XL"],
      updatedAt: o.updatedAt ?? "",
    };
  });
}

/** Persist admin edits for one product (upsert-style). */
export async function saveProductOverride(id: string, doc: Partial<ProductDoc>): Promise<void> {
  const map = await getProductOverrides();
  map[id] = { ...map[id], ...doc, updatedAt: new Date().toISOString() };
  await redis().set(OVERRIDES_KEY, JSON.stringify(map));
}

export async function deleteProductOverride(id: string): Promise<void> {
  const map = await getProductOverrides();
  delete map[id];
  await redis().set(OVERRIDES_KEY, JSON.stringify(map));
}

/** Compute dashboard stats from ledger records. */
export function computeStats(records: Array<{
  status: string;
  totals: { total: number };
  resolved?: { lines: Array<{ id: string; qty: number; lineTotal: number }> } | null;
  createdAt: string;
}>) {
  const paidStatuses = new Set(["paid", "fulfilling", "fulfilled", "manual_review"]);
  const paid = records.filter((r) => paidStatuses.has(r.status));

  const revenue = paid.reduce((s, r) => s + (r.totals?.total ?? 0), 0);
  const orders = paid.length;

  const unitsSold: Record<string, number> = {};
  const productRevenue: Record<string, number> = {};
  for (const r of paid) {
    for (const l of r.resolved?.lines ?? []) {
      unitsSold[l.id] = (unitsSold[l.id] ?? 0) + l.qty;
      productRevenue[l.id] = (productRevenue[l.id] ?? 0) + l.lineTotal;
    }
  }

  // Revenue per day (last 14 days)
  const days: Array<{ day: string; revenue: number; orders: number }> = [];
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    days.push({ day: fmt(d), revenue: 0, orders: 0 });
  }
  const byDay = new Map(days.map((d) => [d.day, d]));
  for (const r of paid) {
    const bucket = byDay.get(fmt(new Date(r.createdAt)));
    if (bucket) {
      bucket.revenue += r.totals?.total ?? 0;
      bucket.orders += 1;
    }
  }

  return {
    revenue: Math.round(revenue * 100) / 100,
    orders,
    unitsSold,
    productRevenue,
    days,
    statusCounts: records.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    }, {}),
  };
}
