// Regenerates every Varagh brand raster from the master artwork in
//   apps/web/brand/icon-source.png   (the gradient V + card-fan app icon)
// Run after replacing the source art:  pnpm --filter @varagh/web gen:icons
//
// The source is a 1254² PNG: a rounded-square gradient icon on opaque black.
// We trim the black border, round the corners to transparent for the regular
// icons/favicon, and produce a full-bleed (corner-filling) variant for the
// Android "maskable" purpose. Outputs to apps/web/public.
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, "..", "public");
const SOURCE = join(here, "..", "brand", "icon-source.png");
await mkdir(pub, { recursive: true });

// Trim the flat black frame so the rounded gradient tile fills the canvas.
const trimmed = await sharp(SOURCE).trim({ threshold: 20 }).png().toBuffer();
const SIZE = 1024;

// Full-bleed gradient square: crop ~7% inward so the artwork's rounded edge and
// its dark outer shadow bleed off-frame, leaving pure opaque gradient to every
// edge with the mark safely centred. This is the maskable (Android) variant.
const maskable = await sharp(trimmed)
  .resize(Math.round(SIZE * 1.14), Math.round(SIZE * 1.14), { fit: "fill" })
  .extract({
    left: Math.round(SIZE * 0.07),
    top: Math.round(SIZE * 0.07),
    width: SIZE,
    height: SIZE,
  })
  .png()
  .toBuffer();

// Standard icon: re-round the clean full-bleed square → crisp gradient corners
// with transparency outside (no dark fringe).
const radius = Math.round(SIZE * 0.225);
const mask = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}"><rect width="${SIZE}" height="${SIZE}" rx="${radius}" ry="${radius}"/></svg>`,
);
const rounded = await sharp(maskable)
  .composite([{ input: mask, blend: "dest-in" }])
  .png()
  .toBuffer();

const png = (buf, size) => sharp(buf).resize(size, size).png().toBuffer();
const write = (name, buf) => writeFile(join(pub, name), buf);

// Canonical scalable-ish source for the Logo component + OG.
await write("icon.png", await png(rounded, 512));

// PWA icons.
await write("icon-192.png", await png(rounded, 192));
await write("icon-512.png", await png(rounded, 512));
await write("icon-maskable-192.png", await png(maskable, 192));
await write("icon-maskable-512.png", await png(maskable, 512));

// Apple touch icon — needs an opaque background (iOS adds its own mask).
await write("apple-touch-icon.png", await png(maskable, 180));

// Favicons.
await write("favicon-16.png", await png(rounded, 16));
await write("favicon-32.png", await png(rounded, 32));
const ico = await pngToIco([await png(rounded, 16), await png(rounded, 32), await png(rounded, 48)]);
await write("favicon.ico", ico);

console.log("Brand assets written to apps/web/public");
