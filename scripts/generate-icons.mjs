import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const svgPath = path.join(__dirname, 'icon-source.svg');
const publicDir = path.join(__dirname, '..', 'public');
const svgBuffer = readFileSync(svgPath);

const targets = [
  { file: 'pwa-192.png', size: 192 },
  { file: 'pwa-512.png', size: 512 },
  { file: 'maskable-512.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180 },
];

for (const { file, size } of targets) {
  await sharp(svgBuffer, { density: 384 })
    .resize(size, size)
    .flatten({ background: '#4f46e5' })
    .png()
    .toFile(path.join(publicDir, file));
  console.log(`wrote ${file} (${size}x${size})`);
}
