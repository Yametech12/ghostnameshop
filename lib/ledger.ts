/**
 * Durable order ledger on Upstash Redis (REST — serverless-safe).
 *
 * Why this exists: if the Printify call fails after a customer has paid, the
 * payment must never be lost. Every state transition is written here first,
 * so an unfulfilled payment always shows up as `paid`/`fulfilling` and can be
 * retried or handled manually.
 *
 * Race safety (#94): status transitions are atomic compare-and-set via a
 * Redis Lua script. Only these transitions are legal:
 *   created → paid → fulfilling → fulfilled
 *   any → manual_review
 * A concurrent double-capture/webhook race can therefore never downgrade a
 * record (e.g. fulfilled back to paid) or double-append events.
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

/** Truncated key for logs — a ledger key is bearer-equivalent, never log it whole. */
export function shortKey(key: string): string {
  return key.slice(0, 8);
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

/**
 * Atomic status transition (compare-and-set). Returns the fresh record on
 * success, or null when the key is missing / the transition is illegal.
 */
const TRANSITION_SCRIPT = `
local raw = redis.call("GET", KEYS[1])
if not raw then return -1 end
local rec = cjson.decode(raw)
local from = rec["status"]
local to = ARGV[1]
local ok = false
if to == "manual_review" then
  ok = true
elseif from == "created" and to == "paid" then
  ok = true
elseif from == "paid" and to == "fulfilling" then
  ok = true
elseif from == "fulfilling" and to == "fulfilled" then
  ok = true
end
if not ok then return 0 end
rec["status"] = to
rec["updatedAt"] = ARGV[2]
if ARGV[3] ~= "" then
  local patch = cjson.decode(ARGV[3])
  local pp = rec["paypal"]
  if type(pp) ~= "table" then pp = {} end
  for k, v in pairs(patch) do pp[k] = v end
  rec["paypal"] = pp
end
if ARGV[4] ~= "" then
  rec["printify"] = cjson.decode(ARGV[4])
end
local ev = cjson.decode(ARGV[5])
local events = rec["events"]
if type(events) ~= "table" then events = {} end
events[#events + 1] = ev
rec["events"] = events
redis.call("SET", KEYS[1], cjson.encode(rec), "EX", tonumber(ARGV[6]))
return 1
`;

async function transition(
  key: string,
  to: LedgerRecord["status"],
  opts: {
    event: string;
    detail?: string;
    paypal?: LedgerRecord["paypal"];
    printify?: NonNullable<LedgerRecord["printify"]>;
  }
): Promise<LedgerRecord | null> {
  const event = JSON.stringify({ at: now(), event: opts.event, detail: opts.detail });
  let res: number;
  try {
    res = await redis().eval<number>(
      TRANSITION_SCRIPT,
      [PREFIX + key],
      [
        to,
        now(),
        opts.paypal ? JSON.stringify(opts.paypal) : "",
        opts.printify ? JSON.stringify(opts.printify) : "",
        event,
        String(TTL_SECONDS),
      ]
    );
  } catch (err) {
    console.error("[ledger] transition script failed", shortKey(key), err);
    return null;
  }
  if (res === 1) return getLedger(key);
  if (res === 0) {
    console.warn(`[ledger] illegal transition to "${to}" rejected`, shortKey(key));
  }
  return null;
}

/** Mark paid (from capture endpoint or verified webhook). Never downgrades manual_review/fulfilled. */
export async function recordPaid(key: string, paypal: LedgerRecord["paypal"], detail?: string): Promise<LedgerRecord | null> {
  return transition(key, "paid", { event: "paid", detail, paypal });
}

/** Mark fulfillment started. */
export async function recordFulfilling(key: string, detail?: string): Promise<LedgerRecord | null> {
  return transition(key, "fulfilling", { event: "fulfilling", detail });
}

/** Mark fulfilled with the Printify order id. */
export async function recordFulfilled(key: string, printify: NonNullable<LedgerRecord["printify"]>): Promise<LedgerRecord | null> {
  return transition(key, "fulfilled", {
    event: "fulfilled",
    detail: `printify order ${printify.orderId}`,
    printify,
  });
}

/** Park for manual handling (unmapped variant, Printify error, etc.). */
export async function recordManualReview(key: string, detail: string): Promise<LedgerRecord | null> {
  return transition(key, "manual_review", { event: "manual_review", detail });
}

/** Attach a capture id to an existing record (webhook path). No status change. */
export async function attachCapture(key: string, captureId: string): Promise<LedgerRecord | null> {
  const raw = await redis().get<ParsedLedger>(PREFIX + key);
  if (!raw) return null;
  const rec = parseLedger(raw);
  rec.paypal = { ...rec.paypal, captureId };
  rec.events = [...rec.events, { at: now(), event: "capture_linked", detail: captureId }];
  rec.updatedAt = now();
  await redis().set(PREFIX + key, JSON.stringify(rec), { ex: TTL_SECONDS });
  return rec;
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
