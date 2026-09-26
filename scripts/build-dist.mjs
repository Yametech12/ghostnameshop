/**
 * Copies the deployable static site into dist/ for static hosting
 * (Netlify / Vercel / GitHub Pages / Freebuff static deploys).
 *
 * Zero dependencies. Run: node scripts/build-dist.mjs
 */
import { mkdir, copyFile, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const DIST = join(ROOT, "dist");

async function copyDir(src, dest) {
  await mkdir(dest, { recursive: true });
  for (const entry of await readdir(src, { withFileTypes: true })) {
    const s = join(src, entry.name);
    const d = join(dest, entry.name);
    if (entry.isDirectory()) await copyDir(s, d);
    else await copyFile(s, d);
  }
}

if (existsSync(DIST)) await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });

// Only ship what a static host needs.
for (const f of ["index.html", "products.json", "robots.txt", "sitemap.xml", "server.js"]) {
  await copyFile(join(ROOT, f), join(DIST, f));
}
await copyDir(join(ROOT, "assets"), join(DIST, "assets"));
await copyDir(join(ROOT, "legal"), join(DIST, "legal"));

console.log("dist/ ready for static deployment.");
