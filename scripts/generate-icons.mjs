// Renders the SVG mark to the PNG sizes the web app, website and (later) the native shells need.
import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'node:fs';

const svg = readFileSync(new URL('../app/icon.svg', import.meta.url));
const out = [
  ['app/apple-touch-icon.png', 180],
  ['app/icon-512.png', 512],
  ['website/apple-touch-icon.png', 180],
  ['website/favicon.png', 64],
  ['website/icon-512.png', 512],
];
mkdirSync(new URL('../website/', import.meta.url), { recursive: true });
for (const [file, size] of out) {
  await sharp(svg, { density: 300 }).resize(size, size).png().toFile(new URL('../' + file, import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
  console.log('wrote', file);
}
