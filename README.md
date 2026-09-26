# GHOSTNAME WORLDWIDE

Faceless.Fearless.Forever.

Premium anonymous streetwear. Static storefront — no framework, no build step required, deployable anywhere.

## Project Overview

The storefront is a single `index.html` with embedded CSS and JavaScript. Product data lives in **`products.json`**, which doubles as the **Snipcart JSON-crawler validation file** — Snipcart's servers fetch it to verify real prices at checkout. The brand mark is a faceless ski mask: anonymous by design, worn worldwide.

## Commerce (Snipcart)

Checkout is powered by [Snipcart](https://snipcart.com): hosted cart, real payments (card / Apple Pay / Google Pay), inventory, and order confirmation emails.

1. Create a free Snipcart account → dashboard → **API keys**.
2. Copy your **public** key into `index.html` (search for `SET_YOUR_SNIPCART_PUBLIC_KEY`).
3. In the Snipcart dashboard, set your **default website domain** and allow your deployment domain(s) under *Store configuration → Domains & URLs* — the JSON crawler fetches `products.json` from there to validate orders.
4. Test mode first: every order runs against the key prefix (`Mjcx...` test keys start with `Mj`), switch the key to go live.

Until a key is set, the site stays fully browsable and the cart explains what's missing — no broken buy buttons.

Prices: `products.json` publishes **fixed price points in USD / EUR / GBP / JPY**. The currency switcher changes both the displayed prices *and* the currency Snipcart charges — a customer never sees one currency and pays another.

## Newsletter

Both newsletter forms POST to an email-platform embedded-form endpoint (Mailchimp-style `subscribe/post?u=…&id=…`) — no backend needed. Replace the placeholder action in the boot block of `index.html` (search for `NEWSLETTER_ACTION`) with your audience's values, or swap in a Buttondown / ConvertKit form URL.

Analytics (Plausible, cookieless) load **only** after a visitor accepts cookies; the footer's *Cookie Preferences* reopens the banner anytime.

Social cards, sitemap URLs and the canonical tag use `https://ghostnameworldwide.com/` — swap in your real domain (search for `ghostnameworldwide.com` across `index.html`, `robots.txt`, `sitemap.xml` and the `legal/` pages).

## Features

- Full-screen hero (WebP + preload) with drifting ghost typography
- Fixed navigation using difference blend mode, with a sampled readability fallback
- Featured Drop and Archive product grids, category filters, live search
- Product detail modal with gallery, size selector, quantity stepper
- Snipcart-powered cart & hosted checkout; local mirror cart for display
- Wishlist, recently-viewed, currency switcher (real multi-currency pricing)
- Cookie consent that actually gates analytics; ESP-wired newsletter forms
- Legal pages: [shipping](legal/shipping.html), [returns](legal/returns.html), [privacy](legal/privacy.html), [terms](legal/terms.html)
- `robots.txt`, `sitemap.xml`, canonical URL, 1200×630 PNG social card (`summary_large_image`)
- Accessible: skip link, focus traps, ARIA labels, reduced-motion support

## Local Preview

```bash
npm run dev          # zero-dependency node server on 0.0.0.0:$PORT (default 3000)
```

or any static server (e.g. `python3 -m http.server 8000`).

## Maintenance

```bash
node scripts/optimize-images.mjs   # regenerate WebP derivatives after swapping JPEGs (needs: bun add -d sharp)
bun run og                         # regenerate assets/og-image.png (pure stdlib Python)
bun run build                      # assemble a deployable dist/
```

## Deployment

Static files, zero configuration — Netlify Drop, `npx vercel`, or GitHub Pages from `main` / root. `products.json`, `assets/`, `legal/`, `robots.txt` and `sitemap.xml` must ship alongside `index.html`.

## License

MIT — see [LICENSE](LICENSE).

GHOSTNAME WORLDWIDE. Est. 2026.
