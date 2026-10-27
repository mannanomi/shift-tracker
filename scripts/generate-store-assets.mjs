// Builds the source images @capacitor/assets turns into every iOS/Android icon and splash size:
//   node scripts/generate-store-assets.mjs && npx @capacitor/assets generate
import sharp from 'sharp';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'assets');
mkdirSync(out, { recursive: true });

const iconSvg = readFileSync(path.join(root, 'scripts', 'icon-source.svg'));
// The mark alone (white coin with the two-tone S) on a transparent background.
const markSvg = Buffer.from(
  iconSvg.toString().replace(/<rect[^>]*\/>/, ''),
);
const BLUE = '#2563EB';
const DARK = '#0f172a';

// iOS / store icon: full-bleed square, no transparency (iOS rounds the corners itself).
await sharp(iconSvg, { density: 768 }).resize(1024, 1024).flatten({ background: BLUE }).png().toFile(path.join(out, 'icon-only.png'));

// Android adaptive icon: background colour + the mark inside the central safe zone (~60%).
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: BLUE } }).png().toFile(path.join(out, 'icon-background.png'));
const mark = await sharp(markSvg, { density: 768 }).resize(620, 620).png().toBuffer();
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: mark, gravity: 'center' }])
  .png()
  .toFile(path.join(out, 'icon-foreground.png'));

// Launch screens: the blue app tile centred on the app's dark background.
const tile = await sharp(Buffer.from(iconSvg.toString().replace('<rect width="512" height="512"', '<rect width="512" height="512" rx="116"')), { density: 768 })
  .resize(560, 560)
  .png()
  .toBuffer();
for (const name of ['splash.png', 'splash-dark.png']) {
  await sharp({ create: { width: 2732, height: 2732, channels: 4, background: DARK } })
    .composite([{ input: tile, gravity: 'center' }])
    .png()
    .toFile(path.join(out, name));
}
console.log('wrote assets/icon-only.png, icon-foreground.png, icon-background.png, splash.png, splash-dark.png');
