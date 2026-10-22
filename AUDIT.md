# Audit: GHOSTNAME WORLDWIDE

Scope: all of `app/`, `lib/`, `public/store.html`, legal pages, scripts, config.
Limits: the sandbox had no network, so `bun install`, `next build` and a live PayPal/Printify/Redis run were NOT possible. Fixes below were reviewed by hand; the storefront was smoke-tested in headless Chromium (no console errors). **Run `bun install && bun run typecheck && bun run build` and one PayPal sandbox order before deploying.**

## Fixed: breaks money or the build
1. **PayPal buttons could never render** (`app/checkout/page.tsx`). `usePayPalScriptReducer()` was called in the same component that rendered `PayPalScriptProvider`, so it threw. The provider now wraps a child that owns the hook; retry remounts via `key`.
2. **`next build` crashed unless PAYPAL_API_BASE was live** (`lib/paypal.ts`). The sandbox guard ran at import time. It is now checked per request (still refuses sandbox in real production; `PAYPAL_ALLOW_SANDBOX=1` for staging).
3. **Pending payments were never fulfilled** (`capture-order`, `paypal-webhook`). A PENDING capture was stored as `paid`; retries and the later COMPLETED webhook both treated `paid` as done. Now only `paid` + COMPLETED is final; ledger allows a `paid→paid` refresh; amount mismatches never auto-fulfil.
4. **Webhook-first orders always went to manual review**: capture webhooks carry no shipping address. Address and email are now read from the PayPal order.
5. **CSP blocked PayPal's own requests** (`next.config.mjs`): no PayPal host in `connect-src`. Fixed, plus `frame-ancestors`, `base-uri`, `form-action`, dev-only `unsafe-eval`.
6. `NEXT_PUBLIC_PAYPAL_CLIENT_ID` was missing from `.env.example`, so checkout always said "not configured".
7. Storefront ignored admin price edits (it never called `/api/products`), so displayed price could differ from the charged price. Now it refreshes prices and sold-out state from the API, with `products.json` fallback.

## Fixed: security / quality
- Admin cookie was a permanent `sha256(key)`; now an HMAC-signed cookie that expires.
- Admin could set a $0 price; now must be > 0.
- PayPal order description was hard-coded to one product; now generic.
- `/` was a cached **308 permanent** redirect; now a rewrite. Canonical/OG fixed (the OG image URL 404'd; canonical pointed every page at `/`).
- Legal pages loaded Google Fonts (blocked by your own CSP, and a privacy leak); now self-hosted. Legal pages are now linked from the footer (they weren't).
- Product page said "+$3 for 2XL–3XL" (real: +$2 / +$5) and linked to a route that doesn't exist.
- `optimize-images.mjs` pointed at a non-existent folder; `build-static.mjs` produced no `index.html`; `package.json` had a `lint` script with no ESLint.
- Cart drawer: no Escape, focus trap, labels, or `inert`; unescaped `innerHTML` from localStorage; `<a><button>` nesting. All fixed.
- Removed false claims: "Duties are prepaid", "express" shipping, "confirmation email is on its way" (nothing sends one).
- Removed stale Snipcart `CONFIG.md`.

## Needs a decision from you (not changed)
1. **2-units-per-style cap**: `terms.html` promises it and the README says it is enforced, but `resolveCart` allows up to 10 per line. Pick one.
2. **Privacy policy** mentions a newsletter and Plausible analytics; the site has neither. Have it reviewed.
3. **"240 GSM"** is in the copy but not in your catalog data. Verify before launch.
4. `FREE_SHIP`/`SHIP_FLAT` are duplicated in `store.html` and `lib/pricing.ts`. Keep them in sync.
5. `estimateMargin` counts the $12 shipping revenue but not shipping cost (informational only).
6. Rate limiting keys on `x-forwarded-for`; behind a proxy that doesn't set it, all users share one bucket.
7. Admin order list uses `SCAN` capped at ~600 keys; fine now, revisit at scale.
8. `metadata.json` declares a Gemini capability and `products.json` still carries EUR/GBP/JPY prices; both unused.
9. CI only typechecks; add `bun run build` once env is set.
