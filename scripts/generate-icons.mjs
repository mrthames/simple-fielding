// Renders the SVG mark to the PNG sizes the web app, website and (later) the native shells need.
import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'node:fs';

const light = readFileSync(new URL('../app/icon.svg', import.meta.url));
const dark = readFileSync(new URL('../app/icon-dark.svg', import.meta.url));
const out = [
  // App Store / Play Store masters, light and dark (iOS 18+ and Android themed icons).
  ['app/icon-1024.png', 1024],
  ['app/icon-1024-dark.png', 1024, dark],
  ['app/apple-touch-icon.png', 180],
  ['app/icon-512.png', 512],
  ['website/apple-touch-icon.png', 180],
  ['website/favicon.png', 64],
  ['website/icon-512.png', 512],
];
mkdirSync(new URL('../website/', import.meta.url), { recursive: true });
for (const [file, size, src] of out) {
  await sharp(src || light, { density: 300 }).resize(size, size).png().toFile(new URL('../' + file, import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
  console.log('wrote', file);
}
