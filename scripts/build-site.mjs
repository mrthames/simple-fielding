// Builds the website's articles, articles index, privacy page, sitemap, robots.txt and share images.
//
//   node scripts/build-site.mjs            # pages + sitemap + robots
//   node scripts/build-site.mjs --og       # also render the 1200×630 share images (Playwright)
//
// Articles live in content/articles/<slug>.html: a JSON meta block, then the article body.
// Inside the body, <play id="..."></play> becomes a "Watch this play" button that opens that exact play
// in the app (a #replay= link). Every play is run through the engine at build time, and its `expect`
// block must hold — so an article can't say the shortstop is the cutoff unless the app agrees.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://simplefielding.com';
const WEB = path.join(ROOT, 'website');
const Engine = require(path.join(ROOT, 'app/js/engine.js'));
const PlayLog = require(path.join(ROOT, 'app/js/playlog.js'));

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const write = (rel, text) => { const f = path.join(WEB, rel); mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, text); };

// ---------------------------------------------------------------- articles
function readArticles() {
  const dir = path.join(ROOT, 'content/articles');
  return readdirSync(dir).filter((f) => f.endsWith('.html')).map((f) => {
    const raw = readFileSync(path.join(dir, f), 'utf8');
    const m = raw.match(/^<script type="application\/json">\s*([\s\S]*?)\s*<\/script>\s*/);
    if (!m) throw new Error(`${f}: missing the JSON meta block`);
    const meta = JSON.parse(m[1]);
    meta.slug = f.replace(/\.html$/, '');
    meta.body = raw.slice(m[0].length);
    return meta;
  }).sort((a, b) => a.order - b.order);
}

// Check a play against what the article claims, and return its replay link.
// Every play is pinned to a league (Little League baseball unless the play says otherwise), so a softball
// user who follows the link sees the play the article describes, not the softball version of it.
function checkPlay(article, id, p) {
  const situation = Object.assign({ league: 'littleLeague' }, p.situation);
  const plan = Engine.planPlay(situation, p.event);
  const e = p.expect || {};
  const fail = (msg) => { throw new Error(`${article.slug} / play "${id}": ${msg}`); };
  if (e.fielder && plan.fielder !== e.fielder) fail(`fielder is ${plan.fielder}, article says ${e.fielder}`);
  if (e.target && plan.target !== e.target) fail(`throw goes to ${plan.target}, article says ${e.target}`);
  if (e.title && plan.title !== e.title) fail(`title is "${plan.title}", article says "${e.title}"`);
  for (const [pos, role] of Object.entries(e.roles || {})) {
    if (plan.assignments[pos].role !== role) fail(`${pos} is ${plan.assignments[pos].role}, article says ${role}`);
  }
  for (const [pos, base] of Object.entries(e.covers || {})) {
    const a = plan.assignments[pos];
    const end = a.path ? a.path[a.path.length - 1] : a.to;
    const g = plan.geo.bases[base] || { x: 0, y: 0 };
    if (Math.hypot(end.x - g.x, end.y - g.y) > 6) fail(`${pos} doesn't end at ${base}`);
  }
  return `/app/#replay=${PlayLog.encodeReplay(situation, p.event)}`;
}

function renderBody(a) {
  return a.body.replace(/<play id="([^"]+)"><\/play>/g, (_, id) => {
    const p = a.plays && a.plays[id];
    if (!p) throw new Error(`${a.slug}: no play "${id}" in meta`);
    const href = checkPlay(a, id, p);
    return `<a class="play-link" href="${href}"><span class="pl-ball" aria-hidden="true"></span><span><strong>Watch this play</strong><br>${esc(p.label)}</span></a>`;
  });
}

// ---------------------------------------------------------------- shared page chrome
function head({ title, description, url, image, type, jsonld }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="Simple Fielding">
<meta property="og:image" content="${SITE}${image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0b1c3a">
<link rel="icon" type="image/png" href="/favicon.png">
<link rel="icon" type="image/svg+xml" href="/icon.svg">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,300&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/site.css">
${jsonld.map((j) => `<script type="application/ld+json">\n${JSON.stringify(j, null, 2)}\n</script>`).join('\n')}
</head>
<body>
<header class="bar">
  <div class="wrap bar-in">
    <a class="logo" href="/"><img src="/icon.svg" alt="" width="34" height="34"> Simple Fielding</a>
    <nav><a href="/articles/">Guides</a><a class="nav-app" href="/app/">Open the app</a></nav>
  </div>
</header>`;
}

function foot() {
  return `
<section class="support">
  <div class="wrap narrow">
    <h2>Free, and staying that way</h2>
    <p>Simple Fielding is built by a dad with kids in Little League, on his own time. No ads, no accounts, no subscriptions, and nothing tracks you. From the same maker as <a href="https://simplepitchcounter.com">Simple Pitch Counter</a>.</p>
    <a class="bmc" href="https://buymeacoffee.com/thames_" target="_blank" rel="noopener">☕ Buy me a coffee</a>
  </div>
</section>
<footer class="wrap foot">
  <a href="/app/">Open the app</a> · <a href="/articles/">Guides</a> · <a href="/privacy/">Privacy</a> · <a href="https://simplepitchcounter.com">Simple Pitch Counter</a>
  <p>© 2026 Simple Fielding</p>
</footer>
</body>
</html>
`;
}

const PUBLISHER = { '@type': 'Organization', name: 'Simple Fielding', url: SITE, logo: { '@type': 'ImageObject', url: `${SITE}/icon-512.png` } };

function articlePage(a, all) {
  const url = `${SITE}/articles/${a.slug}/`;
  const related = all.filter((x) => x.slug !== a.slug).slice(0, 3);
  const jsonld = [
    {
      '@context': 'https://schema.org', '@type': 'Article',
      headline: a.title, description: a.description, image: `${SITE}/images/og-${a.slug}.png`,
      datePublished: a.date, dateModified: a.updated || a.date,
      author: { '@type': 'Organization', name: 'Simple Fielding', url: SITE }, publisher: PUBLISHER,
      mainEntityOfPage: url,
    },
    {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: 'Guides', item: `${SITE}/articles/` },
        { '@type': 'ListItem', position: 3, name: a.short || a.title, item: url },
      ],
    },
  ];
  if (a.faq) {
    jsonld.push({
      '@context': 'https://schema.org', '@type': 'FAQPage',
      mainEntity: a.faq.map(([q, ans]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: ans } })),
    });
  }
  const faqHtml = a.faq ? `<h2>Quick answers</h2>\n<dl class="faq">${a.faq.map(([q, ans]) => `<dt>${esc(q)}</dt><dd>${esc(ans)}</dd>`).join('')}</dl>` : '';
  return head({ title: `${a.title} | Simple Fielding`, description: a.description, url, image: `/images/og-${a.slug}.png`, type: 'article', jsonld }) + `
<main class="wrap article">
  <p class="crumbs"><a href="/">Home</a> › <a href="/articles/">Guides</a></p>
  <h1>${esc(a.title)}</h1>
  <p class="lede">${esc(a.description)}</p>
  <p class="meta">${esc(a.readTime)} read · <time datetime="${a.date}">${new Date(a.date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</time></p>
  <div class="body">
${renderBody(a)}
${faqHtml}
  </div>
  <aside class="cta">
    <h2>See it move</h2>
    <p>Simple Fielding is a free whiteboard that moves. Drag the ball to where it's hit and watch all nine fielders go where they belong. It works on an iPad, a phone, or a projector.</p>
    <a class="btn" href="/app/">Open Simple Fielding</a>
  </aside>
  <nav class="related" aria-label="More guides">
    <h2>More guides</h2>
    <ul>${related.map((r) => `<li><a href="/articles/${r.slug}/"><strong>${esc(r.short || r.title)}</strong><span>${esc(r.description)}</span></a></li>`).join('')}</ul>
  </nav>
</main>` + foot();
}

function indexPage(all) {
  const url = `${SITE}/articles/`;
  const jsonld = [{
    '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Youth Baseball and Softball Defense Guides', url,
    hasPart: all.map((a) => ({ '@type': 'Article', headline: a.title, url: `${SITE}/articles/${a.slug}/` })),
  }];
  return head({ title: 'Defense Guides for Youth Baseball and Softball Coaches | Simple Fielding', description: 'Plain-English guides to youth baseball and softball defense: cutoffs and relays, who covers second on a steal, bunt defense, backing up bases, pop-up priority, and a practice plan.', url, image: '/images/og-articles.png', type: 'website', jsonld }) + `
<main class="wrap">
  <p class="crumbs"><a href="/">Home</a></p>
  <h1>Guides for coaches, players and parents</h1>
  <p class="lede">Where every fielder goes, and why, in plain English. Each guide links straight to the plays in the app.</p>
  <ul class="cards">
${all.map((a) => `    <li><a href="/articles/${a.slug}/"><img src="/images/og-${a.slug}.png" alt="" width="1200" height="630" loading="lazy"><strong>${esc(a.title)}</strong><span>${esc(a.description)}</span><em>${esc(a.readTime)} read</em></a></li>`).join('\n')}
  </ul>
</main>` + foot();
}

function privacyPage() {
  const src = readFileSync(path.join(ROOT, 'content/privacy.html'), 'utf8');
  return head({ title: 'Privacy | Simple Fielding', description: 'Simple Fielding collects nothing about you: no accounts, no tracking, no ads. Settings and team names stay on your device.', url: `${SITE}/privacy/`, image: '/images/og-home.png', type: 'website', jsonld: [] }) + `
<main class="wrap article">
${src}
</main>` + foot();
}

// ---------------------------------------------------------------- sitemap, robots
function sitemap(all) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    { loc: `${SITE}/`, lastmod: today, priority: '1.0' },
    { loc: `${SITE}/app/`, lastmod: today, priority: '0.9' },
    { loc: `${SITE}/articles/`, lastmod: today, priority: '0.8' },
    ...all.map((a) => ({ loc: `${SITE}/articles/${a.slug}/`, lastmod: a.updated || a.date, priority: '0.7' })),
    { loc: `${SITE}/privacy/`, lastmod: today, priority: '0.2' },
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <priority>${u.priority}</priority>\n  </url>`).join('\n')}
</urlset>
`;
}

// ---------------------------------------------------------------- share images
async function renderOg(all) {
  const { chromium } = await import('@playwright/test');
  const tpl = readFileSync(path.join(ROOT, 'content/og-template.html'), 'utf8');
  const icon = 'data:image/svg+xml;base64,' + Buffer.from(readFileSync(path.join(ROOT, 'app/icon.svg'))).toString('base64');
  const items = [
    { file: 'og-home.png', kicker: 'Free for coaches, players and parents', title: 'Where every fielder goes, and why.' },
    { file: 'og-articles.png', kicker: 'Simple Fielding guides', title: 'Youth baseball and softball defense, in plain English' },
    ...all.map((a) => ({ file: `og-${a.slug}.png`, kicker: 'Simple Fielding guide', title: a.ogTitle || a.short || a.title })),
  ];
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  mkdirSync(path.join(WEB, 'images'), { recursive: true });
  for (const it of items) {
    await page.setContent(tpl.replace('{{ICON}}', icon).replace('{{KICKER}}', esc(it.kicker)).replace('{{TITLE}}', esc(it.title)));
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(WEB, 'images', it.file) });
    console.log('  og', it.file);
  }
  await browser.close();
}

// ---------------------------------------------------------------- go
const all = readArticles();
for (const a of all) write(`articles/${a.slug}/index.html`, articlePage(a, all));
write('articles/index.html', indexPage(all));
write('privacy/index.html', privacyPage());
// The old address keeps working.
write('privacy.html', `<!DOCTYPE html><meta charset="utf-8"><title>Privacy</title><link rel="canonical" href="${SITE}/privacy/"><meta http-equiv="refresh" content="0; url=/privacy/"><a href="/privacy/">Privacy</a>\n`);
write('sitemap.xml', sitemap(all));
write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
console.log(`built ${all.length} articles, index, privacy, sitemap, robots`);
if (process.argv.includes('--og')) await renderOg(all);
if (!existsSync(path.join(WEB, 'images/og-home.png'))) console.log('  (no share images yet: run with --og)');
