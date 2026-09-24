// Draws the baseball used across the app, website and icon: the same ball as the Simple Pitch Counter
// logo (white face, light-gray rim, red chevron stitches), rebuilt as a vector.
//   node scripts/make-baseball.mjs  →  app/img/baseball.svg
import { writeFileSync } from 'node:fs';

const RED = '#C8392B', RIM = '#D5D5D5';
const q = (p0, p1, p2, t) => ({
  x: (1 - t) ** 2 * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x,
  y: (1 - t) ** 2 * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y,
});
const dq = (p0, p1, p2, t) => ({
  x: 2 * (1 - t) * (p1.x - p0.x) + 2 * t * (p2.x - p1.x),
  y: 2 * (1 - t) * (p1.y - p0.y) + 2 * t * (p2.y - p1.y),
});
const f = (n) => n.toFixed(2);

// One seam: a curve with chevrons (the stitches) pointing along it.
function seam(p0, p1, p2, n, dir) {
  let d = `M${f(p0.x)},${f(p0.y)} Q${f(p1.x)},${f(p1.y)} ${f(p2.x)},${f(p2.y)}`;
  let stitches = '';
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const p = q(p0, p1, p2, t), v = dq(p0, p1, p2, t);
    const L = Math.hypot(v.x, v.y); const ux = v.x / L, uy = v.y / L;
    const nx = -uy * dir, ny = ux * dir;
    const a = 5.2, back = 2.2;
    stitches += `M${f(p.x + nx * a - ux * back)},${f(p.y + ny * a - uy * back)} L${f(p.x)},${f(p.y)} L${f(p.x - nx * a - ux * back)},${f(p.y - ny * a - uy * back)} `;
  }
  return { d, stitches };
}

const left = seam({ x: 24, y: 22 }, { x: 50, y: 50 }, { x: 40, y: 92 }, 11, 1);
const right = seam({ x: 62, y: 9 }, { x: 52, y: 52 }, { x: 88, y: 76 }, 11, -1);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs><clipPath id="face"><circle cx="50" cy="50" r="42.5"/></clipPath></defs>
  <circle cx="50" cy="50" r="48" fill="${RIM}"/>
  <circle cx="50" cy="50" r="42.5" fill="#fff"/>
  <g clip-path="url(#face)" fill="none" stroke="${RED}" stroke-linecap="round" stroke-linejoin="round">
    <path d="${left.d} ${right.d}" stroke-width="3.4"/>
    <path d="${left.stitches}${right.stitches}" stroke-width="3"/>
  </g>
</svg>
`;
writeFileSync(new URL('../app/img/baseball.svg', import.meta.url), svg);
console.log('wrote app/img/baseball.svg');
