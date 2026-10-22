const isDev = process.env.NODE_ENV !== "production";

/**
 * Content-Security-Policy.
 *
 * - PayPal's JS SDK loads scripts/styles from *.paypal.com, calls *.paypal.com
 *   (connect-src) and renders its checkout inside *.paypal.com iframes. The
 *   previous policy only listed www.paypal.com for scripts and had NO PayPal host
 *   in connect-src, so the SDK's own requests were blocked in the browser.
 * - Printify is only called from the server, so it does not belong in connect-src.
 * - 'unsafe-eval' is added in `next dev` only (React Refresh needs it).
 * - 'unsafe-inline' stays for scripts because store.html and Next both inject
 *   inline scripts; move to nonces later if you want to drop it.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://*.paypal.com https://*.paypalobjects.com`,
  "style-src 'self' 'unsafe-inline' https://*.paypal.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.paypal.com https://*.paypalobjects.com",
  "frame-src https://*.paypal.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://*.paypal.com",
  "frame-ancestors 'none'",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  compress: true,
  images: {
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    optimizePackageImports: ["@paypal/react-paypal-js"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy", value: csp },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
      // Static media rarely changes; let browsers/CDNs reuse it but revalidate weekly.
      {
        source: "/:dir(assets|premium)/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" },
        ],
      },
    ];
  },
  // The storefront (public/store.html + /assets + /premium + /legal) ships as-is
  // from public/. It is served at "/" with a REWRITE, not a redirect:
  //  - the old `permanent: true` 308 from "/" was cached by browsers indefinitely,
  //    so a real home page could never replace it for returning visitors;
  //  - the canonical/OG URL is "/", which a redirect to /store.html contradicted.
  async rewrites() {
    return {
      beforeFiles: [{ source: "/", destination: "/store.html" }],
    };
  },
  async redirects() {
    return [
      { source: "/index.html", destination: "/", permanent: true },
    ];
  },
};

export default nextConfig;
