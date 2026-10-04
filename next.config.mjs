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
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.paypal.com https://www.sandbox.paypal.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://api-m.paypal.com https://api-m.sandbox.paypal.com https://api.printify.com; frame-src https://www.paypal.com https://www.sandbox.paypal.com;",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
  // The legacy static storefront (store.html, /assets, /legal, products.json)
  // ships as-is from public/ and is served at the root path.
  async redirects() {
    return [
      { source: "/", destination: "/store.html", permanent: true },
      { source: "/index.html", destination: "/store.html", permanent: true },
    ];
  },
};

export default nextConfig;
