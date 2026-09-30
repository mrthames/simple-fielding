// The store images: each screen from store-screenshots.mjs in a device, on Simple Pitch Counter's navy, under a
// headline that says what it shows. The same look as Simple Pitch Counter's App Store images (its marketing/).
// Run from the repo root, after store-screenshots.mjs: node native/scripts/store-frames.mjs
//   in:  marketing/store/raw/<store>/<device>/<scene>.png
//   out: marketing/store/final/<store>/<device>/<scene>.png at the store's exact size, and the Play feature graphic.
//
// Headlines are for coaches and parents (the store listing is Option A: never "for kids"), and don't claim
// "every play".
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const RAW = path.resolve('marketing/store/raw');
const OUT = path.resolve('marketing/store/final');

// [headline, accent word(s), accent color, the line under it]
const CAPTIONS = {
  '1-double-play': ['See the', 'whole play', 'green', 'Who fields it, who covers, who backs it up: all nine at once'],
  '2-relay': ['Cutoffs &', 'relays', 'amber', 'Line up the throw from the outfield, step by step'],
  '3-in-3d': ['Every angle', 'in 3D', 'blue', 'Behind home plate, overhead, or through any fielder’s eyes'],
  '4-errors': ['When it goes', 'wrong', 'amber', 'Bobbles, balls through the legs and wild throws, and what each one costs'],
  '5-lesson': ['Learn', 'your position', 'green', 'Lessons ask your players where to go, then show them'],
  '6-pop-up': ['Who takes', 'the pop-up?', 'blue', 'Priority rules, so nobody collides and nobody watches it drop'],
};
const ACCENT = { green: '#34C759', blue: '#3D8BFF', amber: '#FF9500' };

// [store/device, output width, output height, frame kind, the screen's CSS height of status bar (as captured)]
const FORMATS = [
  ['app-store/ipad-13', 2752, 2064, 'ipad', 24],
  ['app-store/iphone-6.9', 1320, 2868, 'iphone', 62],
  ['google-play/tablet-10', 2560, 1600, 'tablet', 28],
  ['google-play/tablet-7', 1200, 1920, 'tablet', 28],
  ['google-play/phone', 1080, 1920, 'android', 32],
];
// The CSS width each screen was captured at (store-screenshots.mjs), to scale the status bar with it.
const CSS_WIDTH = { 'app-store/ipad-13': 1376, 'app-store/iphone-6.9': 440, 'google-play/tablet-10': 1280, 'google-play/tablet-7': 480, 'google-play/phone': 432 };

const dataUri = (file) => 'data:image/png;base64,' + readFileSync(file).toString('base64');

// White status-bar glyphs: signal, Wi-Fi, battery.
const ICONS = `<svg viewBox="0 0 68 14" height="100%"><g fill="#fff">
  <rect x="0" y="9" width="3" height="5" rx="1"/><rect x="4.5" y="6.5" width="3" height="7.5" rx="1"/>
  <rect x="9" y="4" width="3" height="10" rx="1"/><rect x="13.5" y="1.5" width="3" height="12.5" rx="1"/>
  <path d="M29 3.2a11 11 0 0 1 8 3.3l-1.5 1.6a8.8 8.8 0 0 0-13 0L21 6.5a11 11 0 0 1 8-3.3zm0 4.3a6.6 6.6 0 0 1 4.8 2l-1.5 1.6a4.4 4.4 0 0 0-6.6 0l-1.5-1.6a6.6 6.6 0 0 1 4.8-2zm0 4.3 1.6 1.7h-3.2z"/>
  <rect x="42" y="2" width="22" height="11" rx="3" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.2"/>
  <rect x="44" y="4" width="16" height="7" rx="1.6"/><rect x="65" y="5.5" width="2" height="4" rx="1" fill-opacity=".55"/></g></svg>`;

function slide({ W, H, kind, screen, rawW, rawH, statusCss, cssW, cap }) {
  const land = W > H;
  const [head, accent, color, sub] = cap;
  // Room for the headline, then the biggest device that fits the rest.
  const headH = land ? H * 0.2 : H * 0.215;
  const availW = W * (land ? 0.84 : kind === 'iphone' || kind === 'android' ? 0.8 : 0.86);
  const availH = H - headH - H * (land ? 0.05 : 0.035);
  const bz = { iphone: 0.034, android: 0.03, ipad: 0.028, tablet: 0.03 }[kind];   // bezel, as a share of screen width
  const a = rawW / rawH;
  let sw = Math.min(availW / (1 + 2 * bz), (availH / (1 / a + 2 * bz * 1)));
  const sh = sw / a, b = sw * bz;
  const dw = sw + 2 * b, dh = sh + 2 * b;
  const scale = sw / cssW;                        // CSS px of the captured page -> px here
  const barH = statusCss * scale;                 // the status bar's space at the top of the screen
  const r = { iphone: 0.14, android: 0.09, ipad: 0.035, tablet: 0.03 }[kind] * sw;
  const font = land ? H * 0.062 : W * 0.083;
  const subFont = land ? H * 0.026 : W * 0.029;
  const island = kind === 'iphone'
    ? `<div style="position:absolute;top:${barH * 0.2}px;left:50%;transform:translateX(-50%);width:${sw * 0.29}px;height:${barH * 0.56}px;border-radius:${barH}px;background:#000"></div>` : '';
  const punch = kind === 'android'
    ? `<div style="position:absolute;top:${barH * 0.22}px;left:50%;transform:translateX(-50%);width:${barH * 0.52}px;height:${barH * 0.52}px;border-radius:50%;background:#000"></div>` : '';
  const timeX = kind === 'iphone' ? sw * 0.12 : sw * 0.035;
  const iconsX = kind === 'iphone' ? sw * 0.1 : sw * 0.03;
  const glyphH = kind === 'iphone' ? barH * 0.24 : barH * 0.42;
  const barText = `<div style="position:absolute;top:0;left:0;right:0;height:${barH}px;display:flex;align-items:center;justify-content:space-between;padding:0 ${iconsX}px 0 ${timeX}px;${kind === 'iphone' ? `padding-top:${barH * 0.12}px;` : ''}">
      <span style="color:#fff;font:600 ${glyphH * (kind === 'iphone' ? 1.45 : 1.05)}px Inter,system-ui,sans-serif">9:41</span>
      <span style="height:${glyphH}px;display:flex">${ICONS}</span></div>`;
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;900&display=block" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{width:${W}px;height:${H}px;overflow:hidden}
  body{font-family:Inter,system-ui,sans-serif;background:linear-gradient(175deg,#0a1628 0%,#0f2040 35%,#132a52 65%,#0d1d3a 100%);
    display:flex;flex-direction:column;align-items:center;position:relative}
  .head{height:${headH}px;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;text-align:center;padding:0 ${W * 0.06}px ${H * 0.018}px}
  h1{font-size:${font}px;font-weight:900;line-height:1.02;letter-spacing:-0.01em;color:#fff;text-transform:uppercase}
  h1 .a{color:${ACCENT[color]}}
  p{margin-top:${font * 0.22}px;font-size:${subFont}px;color:rgba(255,255,255,.62);line-height:1.35;max-width:${land ? W * 0.7 : W * 0.86}px}
  .glow{position:absolute;width:${dw * 1.1}px;height:${dw * 1.1}px;border-radius:50%;left:50%;top:${headH + dh / 2}px;transform:translate(-50%,-50%);
    background:radial-gradient(circle,rgba(26,107,255,.16) 0%,transparent 68%)}
  .dev{position:relative;margin-top:${H * 0.012}px;width:${dw}px;height:${dh}px;padding:${b}px;border-radius:${r + b}px;background:#16181c;
    box-shadow:0 0 0 ${Math.max(2, b * 0.12)}px rgba(255,255,255,.08),0 0 ${dw * 0.06}px rgba(26,107,255,.18),0 ${dw * 0.03}px ${dw * 0.09}px rgba(0,0,0,.55)}
  .scr{position:relative;width:${sw}px;height:${sh}px;border-radius:${r}px;overflow:hidden;background:#0b1c3a}
  .scr img{display:block;width:100%;height:100%}
</style></head><body>
  <div class="glow"></div>
  <div class="head"><h1>${land ? `${head} <span class="a">${accent}</span>` : `${head}<br><span class="a">${accent}</span>`}</h1><p>${sub}</p></div>
  <div class="dev"><div class="scr"><img src="${screen}">${barText}${island}${punch}</div></div>
</body></html>`;
}

function featureGraphic(mark) {
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;900&display=block" rel="stylesheet">
<style>*{margin:0;padding:0;box-sizing:border-box}
  body{width:1024px;height:500px;overflow:hidden;font-family:Inter,system-ui,sans-serif;display:flex;align-items:center;gap:48px;padding:0 70px;
    background:linear-gradient(175deg,#0a1628 0%,#0f2040 35%,#132a52 65%,#0d1d3a 100%)}
  img{width:330px;height:330px;filter:drop-shadow(0 18px 40px rgba(0,0,0,.45))}
  h1{font-size:86px;font-weight:900;line-height:.98;color:#fff;text-transform:uppercase;letter-spacing:-0.01em}
  h1 span{color:#34C759}
  p{margin-top:18px;font-size:30px;color:rgba(255,255,255,.7)}</style></head>
<body><img src="${mark}"><div><h1>Simple<br><span>Fielding</span></h1><p>Where to be, and why.</p></div></body></html>`;
}

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
async function render(html, W, H, file) {
  await page.setViewportSize({ width: W, height: H });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file });
  const m = await sharp(file).metadata();
  console.log(path.relative(OUT, file), `${m.width}x${m.height}`);
}

for (const [dev, W, H, kind, statusCss] of FORMATS) {
  const dir = path.join(RAW, dev);
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.png')).sort()) {
    const scene = f.replace(/\.png$/, '');
    const cap = CAPTIONS[scene];
    if (!cap) continue;
    const meta = await sharp(path.join(dir, f)).metadata();
    const html = slide({ W, H, kind, screen: dataUri(path.join(dir, f)), rawW: meta.width, rawH: meta.height, statusCss, cssW: CSS_WIDTH[dev], cap });
    await render(html, W, H, path.join(OUT, dev, f));
  }
}
await render(featureGraphic(dataUri('native/assets/splash-icon.png')), 1024, 500, path.join(OUT, 'google-play', 'feature-graphic.png'));
await browser.close();
