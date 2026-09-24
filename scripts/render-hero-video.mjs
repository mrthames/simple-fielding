// Films the homepage hero: the whole app, at iPad size, playing the same play as the field animation
// (a single to left, nobody on). Writes website/images/hero-app.mp4 and a still, hero-app.jpg, that is
// the video's poster and what "reduce motion" visitors see.
//
// The app is stepped frame by frame (SimpleFielding.seek), not recorded in real time, so every frame is
// exact and the result is the same on any machine. Needs ffmpeg on the PATH.
//
//   node scripts/render-hero-video.mjs
import { chromium } from '@playwright/test';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VIDEO = path.join(ROOT, 'website/images/hero-app.mp4');
const POSTER = path.join(ROOT, 'website/images/hero-app.jpg');

const PLAY = { runners: { first: false, second: false, third: false }, event: { kind: 'ground', at: { x: -80, y: 135 } } };
const FPS = 30;
const LEAD = 0.8;     // seconds on the ready positions before the pitch
const HOLD = 2.6;     // seconds on the final positions before it loops
const WIDTH = 1180, HEIGHT = 820;   // iPad Air, landscape, in CSS pixels
const OUT_W = 1440;                 // encoded width; the frame shows it at up to ~620 px, so this is sharp on 2x screens

const frames = mkdtempSync(path.join(tmpdir(), 'sf-hero-'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 2, hasTouch: true });
await page.goto(pathToFileURL(path.join(ROOT, 'app/index.html')).href);
const info = await page.evaluate((play) => {
  const sf = window.SimpleFielding;
  sf.state.runners = play.runners;
  sf.runEvent(play.event);
  sf.seek(0);
  // Show the job list beside the field: that's the answer to "where do I go?"
  const panel = document.getElementById('panel');
  const result = document.getElementById('result');
  panel.scrollTop = result.offsetTop - panel.offsetTop - 12;
  return { title: sf.state.plan.title, duration: sf.state.plan.timeline.duration };
}, PLAY);
if (info.title !== 'Single to left field') throw new Error('unexpected play: ' + info.title);

const total = Math.round((LEAD + info.duration + HOLD) * FPS);
for (let i = 0; i < total; i++) {
  const t = Math.min(info.duration, Math.max(0, i / FPS - LEAD));
  await page.evaluate((tt) => window.SimpleFielding.seek(tt), t);
  await page.screenshot({ path: path.join(frames, `f${String(i).padStart(4, '0')}.png`) });
}
await page.evaluate((d) => window.SimpleFielding.seek(d), info.duration);
await page.screenshot({ path: path.join(frames, 'poster.png') });
await browser.close();

const scale = `scale=${OUT_W}:-2:flags=lanczos`;
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(frames, 'f%04d.png'),
  '-vf', scale, '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', VIDEO]);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(frames, 'poster.png'), '-vf', scale, '-q:v', '3', POSTER]);
rmSync(frames, { recursive: true, force: true });

const kb = (f) => (statSync(f).size / 1024).toFixed(0) + ' KB';
console.log(`${info.title}: ${total} frames, ${(total / FPS).toFixed(1)}s loop. hero-app.mp4 ${kb(VIDEO)}, hero-app.jpg ${kb(POSTER)}`);
