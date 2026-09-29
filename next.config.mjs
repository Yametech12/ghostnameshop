/** @type {import('next').NextConfig} */
const nextConfig = {
  // The legacy static storefront (store.html, /assets, /legal, products.json)
  // ships as-is from public/ and is served at the root path.
  async redirects() {
    return [
      { source: "/", destination: "/store.html", permanent: false },
      { source: "/index.html", destination: "/store.html", permanent: true },
    ];
  },
};

export default nextConfig;
