/*
 * Generates the PWA icon set from the product monogram.
 *
 * These are PLACEHOLDER icons: the brand green plate and “PC”
 * monogram are derived from BRANDING defaults, not a client logo.
 * Replace the PNGs (and the source SVGs beside them) at handoff.
 *
 * Usage (sharp is intentionally not a project dependency):
 *   npm i --no-save sharp
 *   node scripts/generate-pwa-icons.mjs
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "icons");

const GREEN = "#008751";
const WHITE = "#ffffff";
const MONOGRAM = "PC";

/**
 * @param {{ size: number, safeArea: number, rounded: boolean }} options
 *   safeArea is the fraction of the canvas kept clear on each side;
 *   maskable icons need >= 0.2 so every mask crop keeps the glyph.
 */
function svg({ size, safeArea, rounded }) {
  const plate = size - size * safeArea * 2;
  const fontSize = plate * 0.44;
  const radius = rounded ? size * 0.19 : 0;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="${GREEN}"/>
  <text x="50%" y="50%" dy="0.35em" text-anchor="middle"
        font-family="Arial, Helvetica, 'Segoe UI', sans-serif"
        font-size="${fontSize}" font-weight="800" letter-spacing="${fontSize * 0.02}"
        fill="${WHITE}">${MONOGRAM}</text>
</svg>`;
}

const targets = [
  { file: "icon-192.png", size: 192, safeArea: 0.08, rounded: true },
  { file: "icon-512.png", size: 512, safeArea: 0.08, rounded: true },
  { file: "icon-maskable-512.png", size: 512, safeArea: 0.2, rounded: false },
  { file: "apple-touch-icon.png", size: 180, safeArea: 0.1, rounded: false },
];

await mkdir(outDir, { recursive: true });

for (const target of targets) {
  const source = svg(target);
  const png = await sharp(Buffer.from(source))
    .png({ compressionLevel: 9 })
    .toBuffer();

  await writeFile(join(outDir, target.file), png);
  console.log(`${target.file}: ${target.size}x${target.size}, ${png.length} bytes`);
}

await writeFile(
  join(outDir, "icon-source.svg"),
  svg({ size: 512, safeArea: 0.08, rounded: true }),
);
await writeFile(
  join(outDir, "icon-maskable-source.svg"),
  svg({ size: 512, safeArea: 0.2, rounded: false }),
);

console.log("Wrote icon-source.svg and icon-maskable-source.svg");
