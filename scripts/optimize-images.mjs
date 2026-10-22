#!/usr/bin/env node
/**
 * GHOSTNAME WORLDWIDE — dev-time image pipeline.
 *
 * Generates, from the JPEG masters in assets/images/:
 *   - <name>_960w.webp / <name>_1600w.webp  (web performance)
 *   - hero_streetwear_fw26_*.webp           (hero backdrop)
 *
 * sharp is a devDependency only. The committed .webp outputs are what the
 * static site consumes at runtime — production never touches sharp.
 *
 * Run:  bun run optimize:images   (or: node scripts/optimize-images.mjs)
 */
import sharp from "sharp";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// public/assets/images — the old "../assets/images/" pointed at a folder that does not exist.
const DIR = fileURLToPath(new URL("../public/assets/images/", import.meta.url));
const files = (await readdir(DIR)).filter((f) => f.endsWith(".jpg"));

for (const f of files) {
  const base = f.replace(/\.jpg$/, "");
  if (base.startsWith("hero_")) {
    await sharp(join(DIR, f))
      .resize(1920, null, { withoutEnlargement: true })
      .webp({ quality: 78 })
      .toFile(join(DIR, `${base}.webp`));
    console.log(`hero  ${base}.webp`);
  } else {
    for (const w of [960, 1600]) {
      await sharp(join(DIR, f))
        .resize(w, null, { withoutEnlargement: true })
        .webp({ quality: 78 })
        .toFile(join(DIR, `${base}_${w}w.webp`));
    }
    console.log(`product  ${base}_{960,1600}w.webp`);
  }
}
console.log("done.");
