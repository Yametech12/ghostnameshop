# GHOSTNAME WORLDWIDE

Faceless. Fearless. Forever.

Premium anonymous streetwear — Next.js storefront with **server-side PayPal
checkout** and **automatic Printify fulfillment**. USD-only pricing.

## Architecture

```
storefront (public/store.html, 1:1 preserved)
      │  cart handoff via sessionStorage
      ▼
/checkout  (Next.js client page)
      │  POST /api/create-order   → server re-prices cart from public/products.json,
      │                             records ledger intent, creates PayPal order
      ▼
PayPal Buttons → buyer approves (address collected inside PayPal)
      │  POST /api/capture-order → capture, verify amount, record payment
      ▼
app/api/paypal-webhook  ←  PayPal server-to-server events (signature-verified)
      │
      ├─► Upstash Redis ledger  (idempotency + fail-safe audit trail)
      └─► Printify create-order (mapped variants + PayPal-provided address)
            └─► manual_review status if anything fails — no lost payments
```

- `public/store.html` — the original static storefront, preserved 1:1 (Snipcart
  retired; cart is size-aware; hand-off to `/checkout`).
- `app/api/*` — Node-runtime routes: create-order, capture-order, webhook.
- `lib/catalog.ts` — server re-pricing; never trusts client prices.
- `lib/catalog-map.ts` — **fill this in**: Printify product/variant ids.
- `lib/ledger.ts` — Upstash Redis ledger (idempotent state machine).
- `lib/fulfill.ts` — fulfillment orchestrator (fulfilled | manual_review).

## Environment variables

Set in **Settings → Environment** (sandbox) and in deploy env vars (production):

| Key | Purpose |
|---|---|
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | PayPal REST credentials |
| `PAYPAL_API_BASE` | `https://api-m.sandbox.paypal.com` for sandbox, `https://api-m.paypal.com` for live |
| `PAYPAL_WEBHOOK_ID` | Webhook id (PayPal dashboard → webhooks) |
| `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | Public client id for the browser JS SDK |
| `PRINTIFY_API_TOKEN` / `PRINTIFY_SHOP_ID` | Printify API access |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Order ledger (free tier OK) |
| `NEXT_PUBLIC_APP_URL` | Public base URL for PayPal return/cancel |

## Setup steps

1. **PayPal**: create a REST app at developer.paypal.com (sandbox first). Add
   the credentials above. In the PayPal dashboard add a webhook pointing to
   `https://YOUR-DOMAIN/api/paypal-webhook` subscribed to
   `PAYMENT.CAPTURE.COMPLETED` (and `CHECKOUT.ORDER.COMPLETED` as a fallback).
2. **Upstash**: create a free Redis database, copy the REST URL + token.
3. **Printify**: publish your products, then map them in `lib/catalog-map.ts`
   (product ids + variant ids per size). Unmapped products still sell — orders
   land in the ledger as `manual_review` instead of failing.
4. **Prices**: edit `public/products.json` (`price.usd`). Keep retail above
   Printify cost + shipping + PayPal fees (~3.49% + $0.49).

## Fail-safe guarantee

Every payment transitions through the Redis ledger:
`created → paid → fulfilling → fulfilled` (or `manual_review`). If the Printify
call fails after a successful capture, the order stays flagged and contains
everything needed to fulfill manually — no "paid but lost" orders.

## Commands

```bash
bun install        # deps
bun run dev        # Next dev server (binds 0.0.0.0:$PORT via Freebuff preview)
bun run build      # production build
bun run typecheck  # tsc --noEmit
```

## Static-first deployment

The default build (`next build`) requires a Node server (`next start`). If your
host is static-only, run `node scripts/build-static.mjs` to emit `out/`
(storefront + static assets, checkout/API disabled) and point the builder at it.

The storefront, `/assets`, `/legal`, `products.json` also ship unchanged from
`public/` for any static host that can proxy API routes separately.

## Legal

`public/legal/` — shipping, returns, privacy, terms. The 2-units-per-style cap
from the terms is enforced server-side in `lib/catalog.ts`.

MIT — see [LICENSE](LICENSE).
