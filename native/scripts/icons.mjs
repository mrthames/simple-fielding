// Renders the store apps' icons and splash from the repo's own artwork: app/icon.svg, app/icon-dark.svg and
// marketing/icon-layers/. Run from the repo root: node native/scripts/icons.mjs
import sharp from 'sharp';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const src = (p) => readFileSync(new URL(p, root));
const out = (p) => new URL(p, root).pathname;
const NAVY = '#172A50';   // the icon's background (1-background.svg)
const S = 1024;

const render = (svg, size = S) => sharp(src(svg), { density: 300 }).resize(size, size).png().toBuffer();

// iOS: full-bleed and opaque. App Store icons may not have an alpha channel at all, even a fully opaque one.
for (const [svg, file] of [['app/icon.svg', 'native/assets/icon.png'], ['app/icon-dark.svg', 'native/assets/icon-dark.png']]) {
  await sharp(await render(svg)).flatten({ background: NAVY }).removeAlpha().png().toFile(out(file));
  console.log('wrote', file);
}

// The field with the ball's chalk path on it, transparent around: the mark without its background.
const mark = await sharp(await render('marketing/icon-layers/2-field.svg'))
  .composite([{ input: await render('marketing/icon-layers/3-chalk.svg') }]).png().toBuffer();

// Android adaptive icon layers: the launcher masks a 108 dp square to a circle or rounded shape and shows about
// the middle two thirds, so the mark is shrunk to sit inside that. The background is a plain color (app.json).
const inset = async (buf, scale) => {
  const size = Math.round(S * scale), pad = Math.round((S - size) / 2);
  return sharp(await sharp(buf).resize(size, size).png().toBuffer())
    .extend({ top: pad, bottom: S - size - pad, left: pad, right: S - size - pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toBuffer();
};
await sharp(await inset(mark, 0.62)).toFile(out('native/assets/android-icon-foreground.png'));
console.log('wrote native/assets/android-icon-foreground.png');
await sharp(await inset(await render('marketing/icon-layers/mono-field.svg'), 0.62)).toFile(out('native/assets/android-icon-monochrome.png'));
console.log('wrote native/assets/android-icon-monochrome.png');

// Splash: the mark on the icon's navy (the color is set in app.json).
await sharp(mark).toFile(out('native/assets/splash-icon.png'));
console.log('wrote native/assets/splash-icon.png');
