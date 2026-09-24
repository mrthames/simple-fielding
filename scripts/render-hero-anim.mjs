// Bakes the homepage hero animation: website/images/hero-play.svg, also inlined into website/index.html.
//
// The app's engine and renderer run once, here, at build time (in a headless browser): they plan the
// play and draw the field. This script then turns the play's timeline into CSS keyframes. The homepage
// gets plain markup: no JavaScript, crisp at any size, about 7 KB gzipped, and it holds still on the
// final positions for anyone who has "reduce motion" turned on.
//
// Why inlined and not <img src="…svg">: Chromium doesn't run CSS animations inside an SVG loaded as an
// image. Inlined, everything is namespaced (#hero-field, sf- prefixes) so it can't clash with the page.
//
//   node scripts/render-hero-anim.mjs
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'website/images/hero-play.svg');
const HOME = path.join(ROOT, 'website/index.html');

// The play: a single to left field, nobody on. Simple, and every job in it is a textbook one.
const PLAY = { runners: { first: false, second: false, third: false }, event: { kind: 'ground', at: { x: -80, y: 135 } } };
const HOLD = 3.0;      // seconds to hold on the final positions
const FADE = 0.7;      // fade out and back in between loops

// ---------------------------------------------------------------- get the play and the field
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 760, height: 1400 } });
await page.goto(pathToFileURL(path.join(ROOT, 'app/index.html')).href);
const data = await page.evaluate((play) => {
  const sf = window.SimpleFielding;
  sf.state.runners = play.runners;
  sf.runEvent(play.event);
  sf.seekEnd();
  const plan = sf.state.plan;
  const svg = document.getElementById('field');
  // The static field: everything except the layers that move or change per play.
  const clone = svg.cloneNode(true);
  for (const g of clone.querySelectorAll('[class^="layer-"]')) g.remove();
  const roles = {};
  for (const p in plan.assignments) roles[p] = plan.assignments[p].role;
  // Chalk paths as the app draws them.
  const paths = [...svg.querySelectorAll('.layer-paths path')].map((p) => ({ d: p.getAttribute('d'), cls: p.getAttribute('class') }));
  const marks = [...svg.querySelectorAll('.layer-marks circle')].map((c) => ({ cx: c.getAttribute('cx'), cy: c.getAttribute('cy'), r: c.getAttribute('r'), cls: c.getAttribute('class') }));
  const cs = getComputedStyle(document.documentElement);
  const vars = {};
  for (const v of ['--foul-grass', '--grass-a', '--grass-b', '--dirt', '--track', '--chalk', '--r-field', '--r-cutoff', '--r-cover', '--r-backup', '--r-hold', '--team', '--runner', '--throw']) vars[v] = cs.getPropertyValue(v).trim();
  return {
    viewBox: svg.getAttribute('viewBox'), field: clone.innerHTML, title: plan.title,
    tracks: plan.timeline.tracks, duration: plan.timeline.duration, roles, runners: plan.runners.map((r) => r.id),
    paths, marks, vars,
  };
}, PLAY);
await browser.close();
if (data.title !== 'Single to left field') throw new Error('unexpected play: ' + data.title);

// ---------------------------------------------------------------- sampling
const smooth = (f) => f * f * (3 - 2 * f);
function sample(keys, t, ease) {
  if (t <= keys[0].t) return keys[0];
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], k = keys[i];
    if (t <= k.t) {
      let f = (t - a.t) / ((k.t - a.t) || 1);
      if (ease) f = smooth(f);
      const ao = a.o ?? 1, ko = k.o ?? 1;
      return { x: a.x + (k.x - a.x) * f, y: a.y + (k.y - a.y) * f, h: (a.h || 0) + ((k.h || 0) - (a.h || 0)) * f, o: ao + (ko - ao) * f };
    }
  }
  return keys[keys.length - 1];
}

const D = data.duration;
const L = D + HOLD + FADE;                 // one loop
const pct = (t) => +(t / L * 100).toFixed(2);
const f1 = (n) => +n.toFixed(1);

// Keyframes for an actor, dropping frames where nothing changed (a still actor needs two frames, not eighty).
function keyframes(name, keys, { ease, step, transform }) {
  const frames = [];
  for (let t = 0; t <= D + 1e-9; t += step) frames.push([t, transform(sample(keys, t, ease))]);
  frames.push([D, transform(sample(keys, D, ease))]);
  const kept = frames.filter((f, i) => i === 0 || i === frames.length - 1 || f[1] !== frames[i - 1][1] || f[1] !== frames[i + 1][1]);
  const last = kept[kept.length - 1][1];
  const body = kept.map(([t, tr]) => `${pct(t)}%{${tr}}`).join('') + `100%{${last}}`;
  return { css: `@keyframes ${name}{${body}}`, end: last };
}

// ---------------------------------------------------------------- actors
const at = (p) => `transform:translate(${f1(p.x)}px,${f1(-p.y)}px)`;
const css = [];
const actors = [];
const POS = ['P', 'C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF'];

POS.forEach((pos, i) => {
  const k = keyframes('sf-f' + i, data.tracks[pos], { ease: true, step: 0.1, transform: at });
  css.push(k.css);
  actors.push(`<g class="player role-${data.roles[pos]}" style="animation-name:sf-f${i};${k.end}"><circle r="7.5" class="ring"/><circle r="6" class="body"/><text y="0.2">${pos}</text></g>`);
});
data.runners.forEach((id, i) => {
  const keys = data.tracks['runner:' + id];
  const k = keyframes('sf-r' + i, keys, { ease: false, step: 0.1, transform: (p) => `${at(p)};opacity:${+(p.o ?? 1).toFixed(2)}` });
  css.push(k.css);
  actors.push(`<g class="runner" style="animation-name:sf-r${i};${k.end}"><circle r="5"/><text y="0.2">${id === 'batter' ? 'B' : 'R'}</text></g>`);
});
// The ball: position, height (drawn as a lift above its shadow) and size.
{
  const keys = data.tracks.ball;
  const shadow = keyframes('sf-bs', keys, { ease: false, step: 0.05, transform: at });
  const ball = keyframes('sf-bb', keys, { ease: false, step: 0.05, transform: (p) => {
    const h = p.h || 0;
    const r = 2.4 + Math.min(h, 90) * 0.04;
    return `transform:translate(${f1(p.x)}px,${f1(-p.y - h * 0.45)}px) scale(${+r.toFixed(2)})`;
  } });
  css.push(shadow.css, ball.css);
  actors.push(`<ellipse class="ball-shadow" rx="2.2" ry="1.1" style="animation-name:sf-bs;${shadow.end}"/>`);
  actors.push(`<use href="#sf-ball" x="-1" y="-1" width="2" height="2" class="ball" style="animation-name:sf-bb;${ball.end}"/>`);
}

// The baseball, inlined as a symbol; the field's own ids get the same prefix.
const ballSvg = readFileSync(path.join(ROOT, 'app/img/baseball.svg'), 'utf8');
const ballInner = ballSvg.slice(ballSvg.indexOf('>') + 1, ballSvg.lastIndexOf('</svg>'))
  .replace(/id="face"/g, 'id="sf-bface"').replace(/url\(#face\)/g, 'url(#sf-bface)');
const field = data.field
  .replace(/id="mow"/g, 'id="sf-mow"').replace(/url\(#mow\)/g, 'url(#sf-mow)')
  .replace(/id="arrow"/g, 'id="sf-arrow"').replace(/url\(#arrow\)/g, 'url(#sf-arrow)');

// ---------------------------------------------------------------- the SVG
const [vx, vy] = data.viewBox.split(/\s+/).map(Number);
const vars = Object.entries(data.vars).map(([k, v]) => `${k}:${v}`).join(';');
const fadeIn = pct(0.35), holdEnd = pct(D + HOLD), fadeOut = pct(D + HOLD + FADE * 0.8);
const R = '#hero-field';
const FONT = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';

const style = [
  `${R}{${vars}}`,
  `${R} .chalk{stroke:var(--chalk);stroke-width:.9}`,
  `${R} .fence{fill:none;stroke:#1f3b2a;stroke-width:3}`,
  `${R} .backstop{fill:none;stroke:#2a3b4d;stroke-width:2}`,
  `${R} .box{fill:none;stroke:var(--chalk);stroke-width:.5;opacity:.8}`,
  `${R} .bag{fill:#fff}`,
  `${R} .mound{fill:var(--dirt);stroke:rgba(0,0,0,.12);stroke-width:.6}`,
  `${R} .circle-chalk{fill:none;stroke:var(--chalk);stroke-width:.7}`,
  `${R} .player .body{fill:var(--team);stroke:#fff;stroke-width:1.1}`,
  `${R} .player .ring{fill:none;stroke:transparent;stroke-width:2.2}`,
  `${R} .player text,${R} .runner text{fill:#fff;font:800 5.4px ${FONT};text-anchor:middle;dominant-baseline:middle}`,
  `${R} .runner circle{fill:var(--runner);stroke:#fff;stroke-width:1}`,
  `${R} .runner text{font-size:4.6px}`,
  `${R} .role-field .ring{stroke:var(--r-field)}`,
  `${R} .role-cutoff .ring,${R} .role-relay .ring,${R} .role-trail .ring{stroke:var(--r-cutoff)}`,
  `${R} .role-cover .ring{stroke:var(--r-cover)}`,
  `${R} .role-backup .ring{stroke:var(--r-backup)}`,
  `${R} .path{fill:none;stroke-width:1.1;stroke-dasharray:3 2.4;stroke-linecap:round;opacity:.85}`,
  `${R} .dest{fill:none;stroke-width:.9;stroke-dasharray:1.5 1.2}`,
  `${R} .path.role-field,${R} .dest.role-field{stroke:var(--r-field)}`,
  `${R} .path.role-cutoff,${R} .dest.role-cutoff,${R} .path.role-relay,${R} .path.role-trail{stroke:var(--r-cutoff)}`,
  `${R} .path.role-cover,${R} .dest.role-cover{stroke:var(--r-cover)}`,
  `${R} .path.role-backup,${R} .dest.role-backup{stroke:var(--r-backup)}`,
  `${R} .path.role-hold,${R} .dest.role-hold{stroke:var(--r-hold)}`,
  `${R} .lineup{fill:none;stroke:#fff;stroke-width:.8;stroke-dasharray:1 2.5;stroke-linecap:round;opacity:.9}`,
  `${R} .ball-shadow{fill:#000;opacity:.3}`,
  `${R} .anim>*{animation-duration:${L.toFixed(2)}s;animation-iteration-count:infinite;animation-timing-function:linear}`,
  `${R} .actors{animation:sf-loopfade ${L.toFixed(2)}s linear infinite}`,
  `@keyframes sf-loopfade{0%{opacity:0}${fadeIn}%{opacity:1}${holdEnd}%{opacity:1}${fadeOut}%{opacity:0}100%{opacity:0}}`,
  `${R} .title rect{fill:rgba(11,28,58,.88)}`,
  `${R} .title text{fill:#fff;font:800 7px ${FONT};dominant-baseline:middle}`,
  ...css,
  `@media (prefers-reduced-motion:reduce){${R} .anim>*,${R} .actors{animation:none!important}}`,
].join('\n');

const svg = `<svg id="hero-field" xmlns="http://www.w3.org/2000/svg" viewBox="${data.viewBox}" role="img" aria-label="Animated play: ${data.title}. The left fielder fields it, the shortstop is the cutoff, the second baseman covers 2nd, and everyone else backs up.">
<!-- Generated by scripts/render-hero-anim.mjs from Simple Fielding's own engine and renderer. Do not edit by hand. -->
<style>
${style}
</style>
<defs><symbol id="sf-ball" viewBox="0 0 100 100">${ballInner}</symbol></defs>
${field}
<g class="actors">
<g class="chalk-paths">${data.paths.map((p) => `<path d="${p.d}" class="${p.cls}"/>`).join('')}${data.marks.map((m) => `<circle cx="${m.cx}" cy="${m.cy}" r="${m.r}" class="${m.cls}"/>`).join('')}</g>
<g class="anim">
${actors.join('\n')}
</g>
</g>
<g class="title" transform="translate(${vx + 6},${vy + 6})"><rect width="${data.title.length * 4.05 + 12}" height="14" rx="4"/><text x="6" y="7.4">${data.title}</text></g>
</svg>
`;
writeFileSync(OUT, svg);

// ---------------------------------------------------------------- inline into the homepage
const home = readFileSync(HOME, 'utf8');
const A = '<!-- hero:start -->', B = '<!-- hero:end -->';
if (!home.includes(A) || !home.includes(B)) throw new Error('website/index.html is missing the hero markers');
const inline = svg.replace('<svg id="hero-field" ', '<svg id="hero-field" class="hero-svg" ').trim();
writeFileSync(HOME, home.slice(0, home.indexOf(A) + A.length) + '\n' + inline + '\n' + home.slice(home.indexOf(B)));
console.log(`wrote hero-play.svg and inlined it in index.html — ${data.title}, ${D.toFixed(1)}s play, ${L.toFixed(1)}s loop, ${(Buffer.byteLength(svg) / 1024).toFixed(1)} KB`);
