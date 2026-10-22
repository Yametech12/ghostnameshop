/**
 * Static-only fallback build: emits the storefront + static assets to out/
 * without any Next.js server (checkout/API routes are excluded).
 * For full commerce you need `next build` + `next start` (or a host that
 * runs the Node server).
 */
import { mkdir, cp, rm, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const OUT = join(ROOT, "out");

if (existsSync(OUT)) await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
await cp(join(ROOT, "public"), OUT, { recursive: true });
// Next serves "/" through a rewrite; a plain static host needs a real index.html.
await copyFile(join(OUT, "store.html"), join(OUT, "index.html"));
console.log("out/ ready (static storefront only — API routes not included).");
