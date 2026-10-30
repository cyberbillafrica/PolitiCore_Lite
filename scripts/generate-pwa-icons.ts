/*
 * ============================================================
 * PWA ICON GENERATOR — FROM THE ADMIN-UPLOADED LOGO
 * ============================================================
 *
 * Reads `site_settings/general.logoUrl` with the Firebase Admin SDK
 * and writes the four install icons under `public/icons/`:
 *
 *   icon-192.png            192x192, rounded plate
 *   icon-512.png            512x512, rounded plate
 *   icon-maskable-512.png   512x512, full-bleed green, 20% safe area
 *   apple-touch-icon.png    180x180, full-bleed green
 *
 * The logo is CONTAINED on the brand-green plate: the full mark stays
 * visible and the plate fills the remainder. Maskable and Apple icons
 * are full-bleed because Android's adaptive mask and iOS's rounded
 * corners clip anything at the edge.
 *
 * Source handling:
 *   - `data:image/...;base64,...` — legacy inline value (currently what
 *     the live settings document holds). Decoded locally, no fetch.
 *   - `http(s)://...` — Cloudinary (normal case). Fetched, with the
 *     response status checked.
 *   - empty / unreadable — falls back to the BRANDING monogram so a
 *     brand-new clone still ships valid icons.
 *
 * Usage:
 *   npm run generate:icons              # write the PNGs
 *   npm run generate:icons -- --dry-run # report the detected source only
 *
 * sharp is a devDependency, so no ad-hoc install is needed. Re-run this
 * after uploading a client logo in Admin -> Settings, then rebuild and
 * redeploy (the PNGs are static assets baked into the deployment).
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import sharp from "sharp";

import { connectAdmin } from "./lib/campaign-access-admin";

dotenv.config({ path: ".env.local" });

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "icons");

const monogram = (process.env.NEXT_PUBLIC_BRAND_MONOGRAM ?? "").trim() || "PC";
const green =
  (process.env.NEXT_PUBLIC_BRAND_PRIMARY_COLOR ?? "").trim() || "#008751";

type SourceKind = "data-url" | "http" | "monogram";

interface LogoSource {
  kind: SourceKind;
  buffer: Buffer | null;
}

/** Classify the stored value without performing any I/O. */
export function detectLogoSource(raw: string | null | undefined): SourceKind {
  const value = (raw ?? "").trim();

  if (value.startsWith("data:image/")) return "data-url";
  if (/^https?:\/\//i.test(value)) return "http";
  return "monogram";
}

/** Decode a data URL into bytes; null when malformed or empty. */
function decodeDataUrl(value: string): Buffer | null {
  const comma = value.indexOf(",");
  if (comma === -1) return null;

  const meta = value.slice(0, comma);
  const payload = value.slice(comma + 1);

  try {
    const buffer = meta.includes(";base64")
      ? Buffer.from(payload, "base64")
      : Buffer.from(decodeURIComponent(payload), "utf8");

    return buffer.length > 0 ? buffer : null;
  } catch {
    return null;
  }
}

async function loadLogo(raw: string | null | undefined): Promise<LogoSource> {
  const value = (raw ?? "").trim();
  const kind = detectLogoSource(value);

  if (kind === "data-url") {
    const buffer = decodeDataUrl(value);
    if (buffer) return { kind, buffer };

    console.warn("Stored data URL could not be decoded; using monogram.");
    return { kind: "monogram", buffer: null };
  }

  if (kind === "http") {
    try {
      const response = await fetch(value);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length === 0) throw new Error("empty response body");

      return { kind, buffer };
    } catch (error) {
      console.warn(
        `Logo fetch failed (${error instanceof Error ? error.message : error}); using monogram.`,
      );
      return { kind: "monogram", buffer: null };
    }
  }

  return { kind: "monogram", buffer: null };
}

/** The monogram plate, used when no logo is available. */
function monogramSvg(size: number): string {
  const fontSize = size * 0.44;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${green}"/>
  <text x="50%" y="50%" dy="0.35em" text-anchor="middle"
        font-family="Arial, Helvetica, 'Segoe UI', sans-serif"
        font-size="${fontSize}" font-weight="800"
        fill="#ffffff">${monogram}</text>
</svg>`;
}

/** Rounded alpha mask for the "any" icons. */
function roundedMask(size: number): Buffer {
  const radius = Math.round(size * 0.19);

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="#ffffff"/>
</svg>`,
  );
}

interface IconTarget {
  file: string;
  size: number;
  /** Fraction of the canvas kept clear on each side (safe area). */
  padding: number;
  rounded: boolean;
}

const targets: IconTarget[] = [
  { file: "icon-192.png", size: 192, padding: 0.08, rounded: true },
  { file: "icon-512.png", size: 512, padding: 0.08, rounded: true },
  {
    file: "icon-maskable-512.png",
    size: 512,
    padding: 0.2,
    rounded: false,
  },
  { file: "apple-touch-icon.png", size: 180, padding: 0.1, rounded: false },
];

async function renderIcon(
  logo: Buffer | null,
  target: IconTarget,
): Promise<Buffer> {
  const plate = sharp({
    create: {
      width: target.size,
      height: target.size,
      channels: 4,
      background: green,
    },
  });

  const inner = Math.round(target.size * (1 - target.padding * 2));

  const mark = logo
    ? await sharp(logo)
        .resize({
          width: inner,
          height: inner,
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer()
    : Buffer.from(monogramSvg(target.size));

  const composed = await plate
    .composite([{ input: mark, gravity: "centre" }])
    .png({ compressionLevel: 9 })
    .toBuffer();

  if (!target.rounded) return composed;

  return sharp(composed)
    .ensureAlpha()
    .composite([{ input: roundedMask(target.size), blend: "dest-in" }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");

  const { db, projectId } = await connectAdmin();
  const snap = await db.collection("site_settings").doc("general").get();
  const stored = snap.exists ? (snap.data()?.logoUrl as string | undefined) : "";

  const detected = detectLogoSource(stored);
  const storedLength = (stored ?? "").length;

  console.log(`project:        ${projectId}`);
  console.log(
    `logoUrl:        ${stored ? `${storedLength} chars` : "(empty)"}`,
  );
  console.log(`detected source: ${detected}`);

  if (dryRun) {
    console.log("\nDry run — no files written.");
    for (const target of targets) {
      console.log(
        `  ${target.file}: ${target.size}x${target.size}, padding ${target.padding * 100}%, ${target.rounded ? "rounded" : "full-bleed"}`,
      );
    }
    return;
  }

  const logo = await loadLogo(stored);

  // Reuse the detected/loaded kind in the output so a failed fetch is
  // never reported as a successful logo generation.
  console.log(`logo source:    ${logo.kind}`);

  await mkdir(outDir, { recursive: true });

  for (const target of targets) {
    const png = await renderIcon(logo.buffer, target);
    await writeFile(join(outDir, target.file), png);
    console.log(
      `wrote ${target.file}: ${target.size}x${target.size}, ${png.length} bytes`,
    );
  }

  if (logo.kind === "monogram") {
    /*
     * The SVG is only a faithful source while the PNGs are the
     * monogram. With a client logo the source of truth is Firestore +
     * this script, so no misleading SVG is written.
     */
    await writeFile(join(outDir, "icon-source.svg"), monogramSvg(512));
    console.log("wrote icon-source.svg (monogram fallback)");
  }
}

main().catch((error) => {
  console.error("PWA icon generation failed:", error);
  process.exit(1);
});
