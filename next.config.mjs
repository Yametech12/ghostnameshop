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
