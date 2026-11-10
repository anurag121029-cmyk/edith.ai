// Generates the PWA icon PNGs from public/icon.svg (text) with sharp.
// Runs on `postinstall`, so the PNGs exist on every fresh checkout and on
// Vercel at build time without binary files ever being committed to git.
// The PNGs in public/ are build artefacts: they are git-ignored and
// regenerated here. The maskable icon pads the face into the 80% safe zone.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public");
const svg = readFileSync(join(outDir, "icon.svg"));

const targets = [
  { name: "icon-512.png", size: 512 },
  { name: "icon-192.png", size: 192 },
  { name: "apple-touch-icon.png", size: 180 },
];

async function main() {
  mkdirSync(outDir, { recursive: true });
  for (const t of targets) {
    const buf = await sharp(svg, { density: 72 })
      .resize(t.size, t.size)
      .png()
      .toBuffer();
    writeFileSync(join(outDir, t.name), buf);
    console.log(`generated ${t.name} (${t.size}x${t.size})`);
  }
  // Maskable: same face, scaled to 410px (80% of 512) and centred on the
  // dark background, so nothing important is cropped by the mask.
  const face = await sharp(svg, { density: 72 }).resize(410, 410).png().toBuffer();
  const maskable = await sharp({
    create: { width: 512, height: 512, channels: 4, background: "#12122a" },
  })
    .composite([{ input: face, top: 51, left: 51 }])
    .png()
    .toBuffer();
  writeFileSync(join(outDir, "icon-512-maskable.png"), maskable);
  console.log("generated icon-512-maskable.png (512x512)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
