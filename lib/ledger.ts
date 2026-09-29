/**
 * Durable order ledger on Upstash Redis (REST — serverless-safe).
 *
 * Why this exists: if the Printify call fails after a customer has paid, the
 * payment must never be lost. Every state transition is written here first,
 * so an unfulfilled payment always shows up as `paid`/`fulfilling` and can be
 * retried or handled manually.
 *
 * Env: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
 */
import { Redis } from "@upstash/redis";
import { randomBytes } from "node:crypto";
import type { CartLine, LedgerRecord, ResolvedCart } from "./types";

let client: Redis | null = null;

function redis(): Redis {
  if (!client) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) throw new Error("Upstash Redis env missing (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN)");
    client = new Redis({ url, token });
  }
  return client;
}

const PREFIX = "gn:order:";
/** Ledger retention: ~1 year (Upstash free tier friendly). */
const TTL_SECONDS = 60 * 60 * 24 * 365;

export function newLedgerKey(): string {
  return `ord_${Date.now().toString(36)}_${randomBytes(6).toString("hex")}`;
}

function now(): string {
  return new Date().toISOString();
}

/** Create the ledger entry at checkout time (before any payment). */
export async function recordCreated(params: {
  key: string;
  lines: CartLine[];
  resolved: ResolvedCart;
}): Promise<void> {
  const rec: LedgerRecord = {
    key: params.key,
    status: "created",
    lines: params.lines,
    resolved: params.resolved,
    totals: {
      subtotal: params.resolved.subtotal,
      shipping: params.resolved.shipping,
      total: params.resolved.total,
    },
    paypal: {},
    events: [{ at: now(), event: "created", detail: "checkout intent recorded" }],
    createdAt: now(),
    updatedAt: now(),
  };
  await redis().set(PREFIX + params.key, JSON.stringify(rec), { ex: TTL_SECONDS });
}

async function mutate(
  key: string,
  fn: (rec: LedgerRecord) => LedgerRecord
): Promise<LedgerRecord | null> {
  const raw = await redis().get<ParsedLedger>(PREFIX + key);
  if (!raw) return null;
  const rec = parseLedger(raw);
  const next = fn(rec);
  next.updatedAt = now();
  await redis().set(PREFIX + key, JSON.stringify(next), { ex: TTL_SECONDS });
  return next;
}

/** Mark paid (from capture endpoint or verified webhook). */
export async function recordPaid(key: string, paypal: LedgerRecord["paypal"], detail?: string): Promise<LedgerRecord | null> {
  return mutate(key, (rec) => ({
    ...rec,
    status: "paid",
    paypal: { ...rec.paypal, ...paypal },
    events: [...rec.events, { at: now(), event: "paid", detail }],
  }));
}

/** Mark fulfillment started. */
export async function recordFulfilling(key: string, detail?: string): Promise<LedgerRecord | null> {
  return mutate(key, (rec) => ({
    ...rec,
    status: "fulfilling",
    events: [...rec.events, { at: now(), event: "fulfilling", detail }],
  }));
}

/** Mark fulfilled with the Printify order id. */
export async function recordFulfilled(key: string, printify: NonNullable<LedgerRecord["printify"]>): Promise<LedgerRecord | null> {
  return mutate(key, (rec) => ({
    ...rec,
    status: "fulfilled",
    printify,
    events: [...rec.events, { at: now(), event: "fulfilled", detail: `printify order ${printify.orderId}` }],
  }));
}

/** Park for manual handling (unmapped variant, Printify error, etc.). */
export async function recordManualReview(key: string, detail: string): Promise<LedgerRecord | null> {
  return mutate(key, (rec) => ({
    ...rec,
    status: "manual_review",
    events: [...rec.events, { at: now(), event: "manual_review", detail }],
  }));
}

/** Attach a capture id to an existing record (webhook path). */
export async function attachCapture(key: string, captureId: string): Promise<LedgerRecord | null> {
  return mutate(key, (rec) => ({
    ...rec,
    paypal: { ...rec.paypal, captureId },
    events: [...rec.events, { at: now(), event: "capture_linked", detail: captureId }],
  }));
}

export async function getLedger(key: string): Promise<LedgerRecord | null> {
  const raw = await redis().get<ParsedLedger>(PREFIX + key);
  return raw ? parseLedger(raw) : null;
}

/** Reverse-index capture id → ledger key (webhooks arrive with the capture id). */
export async function indexCapture(captureId: string, key: string): Promise<void> {
  await redis().set(`gn:capture:${captureId}`, key, { ex: TTL_SECONDS });
}

export async function ledgerKeyForCapture(captureId: string): Promise<string | null> {
  return (await redis().get<string>(`gn:capture:${captureId}`)) ?? null;
}

type ParsedLedger = LedgerRecord;

function parseLedger(raw: unknown): LedgerRecord {
  if (typeof raw === "string") return JSON.parse(raw) as LedgerRecord;
  return raw as LedgerRecord;
}
