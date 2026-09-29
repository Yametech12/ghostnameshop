# GHOSTNAME — Snipcart Checkout Setup (Owner Checklist)

This deployment now has **two independent checkout paths**:

| Path | Where | Status |
|---|---|---|
| Snipcart hosted cart | `public/store.html` buttons | **Needs your public test key** (below) |
| PayPal (USD) server checkout | `/checkout` page + `/api/*` routes | Live in sandbox (your keys are set) |

The store keeps working even with Snipcart unconfigured — browsing, wishlist, and
the PayPal path are unaffected. When you paste the key, the storefront switches
to Snipcart as the payable cart automatically.

---

## The 8 dashboard steps (AI cannot do these for you)

1. **Register** at https://app.snipcart.com/register — stay in **Test mode**.
2. **Account → Credentials**. Copy the **PUBLIC** Test API key into the single
   constant at the top of `public/store.html`:
   ```js
   var SNIPCART_PUBLIC_KEY = "SET_YOUR_SNIPCART_PUBLIC_KEY";
   ```
   Never paste the **secret** key into the repo, into index.html, or into chat.
3. **Store configuration → Domains & URLs**
   - Default website domain: `ibrahimsidic12-afk.github.io` *(or the real host
     you deploy this repo to — see note below)*
   - Protocol: `https`
   - Allowed domains: that same host
   - `localhost` cannot be crawled — test on the deployed URL only.
4. **Regional settings**: add **USD, EUR, GBP, JPY**. First = default, and it
   must be **USD** (the storefront's default currency is `usd`). A missing
   currency fails validation as "unreachable", not as a price mismatch.
5. **Payment gateway**: fill billing details first, then connect Stripe
   (cards) and/or PayPal. Test mode uses Snipcart test cards — no real charge.
   https://docs.snipcart.com/v3/dashboard/paypal-configuration
6. **Shipping**: enable a flat rate you can afford. **Do not** enable
   "free over 150" unless you confirm it — Snipcart shipping numbers are in the
   *cart currency* (150 means 150 EUR when the cart is EUR).
7. **Crawl the catalog**: open
   `https://<your-host>/ghostnameshop/products.json` *(or the validation URL
   below if you deploy this repo)* and confirm it returns `application/json`
   with `p1` present. Then in the Snipcart dashboard, fetch products from that
   URL.
8. **Place one Test order** on the deployed URL (not localhost). Success = an
   order appears in Snipcart → Orders.

---

## This repo's validation URL (important)

This repo is a **Next.js app**, not the old static repo. The catalog Snipcart
should crawl is served at:

```
https://<your-deployment>/api/products
```

- `public/products.json` carries `"url": "/ghostnameshop/products.json"` for
  compatibility with the original static repo's Pages layout. If you deploy
  **this** repo, either:
  - set `data-item-url` / the JSON `url` fields to `/api/products` and allow
    your host in the Snipcart dashboard, **or**
  - keep `/ghostnameshop/products.json` only if you also deploy under a
    `/ghostnameshop/` subpath.
- The storefront generates `data-item-*` attributes **from the live catalog**,
  so button prices and JSON prices can never drift.

---

## Failure map (when a test order fails)

| Snipcart error | Cause |
|---|---|
| "Couldn't reach the item" | Domain not allowed, default domain empty, or `data-item-url` wrong for that host |
| "Item wasn't found" | `data-item-id` doesn't match the JSON `id` |
| "Price doesn't match" | Button price object ≠ JSON price object, a currency key missing, or JS mutated price after add |

---

## What was intentionally NOT done

- No secret keys anywhere in the repo.
- No invented Mailchimp / Plausible / Snipcart credentials.
- Newsletter forms **fail closed** with a visible message until you set
  `NEWSLETTER_ACTION` in `public/store.html` (one constant, same block).
- Legal pages do not claim free-over-150/DDP/carrier rules — see the TODO in
  `public/legal/shipping.html`; set real rates in the Snipcart dashboard.
- The existing PayPal/Printify/admin features are untouched and keep working;
  this task adds Snipcart as the storefront's payable cart only.
