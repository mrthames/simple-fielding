// Audit: every play in the library, at every level, run in the app exactly as tapping it would. For each one it
// checks that what the play says (its name, summary and jobs) agrees with what the clock decides (who's out, who's
// safe). Prints one line per finding, grouped by rule.
//
//   node scripts/audit-plays.mjs            all levels
//   node scripts/audit-plays.mjs pro        one level
//   node scripts/audit-plays.mjs --check    fail on any finding not in tests/audit-expected.json (CI runs this)
//
// Expected findings are real outcomes, not mistakes (a slapper beating the throw, a double play a step late at
// 13U-14U). Each is listed with the reason it's right; the play's summary must say what happens.
import { chromium } from '@playwright/test';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const ONE = process.argv.slice(2).find((a) => !a.startsWith('--'));
const LEVELS = ONE ? [ONE] : ['littleLeague', 'intermediate', 'junior90', 'highSchool', 'college', 'pro',
  'softball8', 'softball10', 'softball', 'softball14', 'softballHS', 'softballCollege', 'softballPro'];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
await page.goto(pathToFileURL(path.join(ROOT, 'app/index.html')).href);
await page.evaluate(() => localStorage.setItem('sf.askFirst', 'false'));
await page.reload();

const findings = [];
let plays = 0;
for (const lg of LEVELS) {
  const rows = await page.evaluate((lg) => {
    const sel = document.getElementById('league');
    sel.value = lg; sel.dispatchEvent(new Event('change'));
    const sf = window.SimpleFielding, S = window.Scenarios;
    const out = [];
    S.ALL.forEach((sc, i) => {
      if (!S.fits(sc, lg)) return;
      sf.runScenario(i);
      const pl = sf.state.plan;
      if (!pl || sf.state.scenarioIndex !== i) return;
      const ev = pl.timeline.events;
      const outs = ev.filter((e) => e.type === 'out').length + ev.filter((e) => e.type === 'catch').length;
      const runners = pl.runners.map((r) => ({ id: r.id, from: r.from, to: r.to, out: !!r.out, forced: !!r.forced }));
      out.push({
        name: sc.name, title: pl.title, summary: pl.summary, kind: sc.event.kind, cls: pl.classification,
        dp: pl.dp || null, throws: pl.throws.map((t) => (t.via ? t.via + '>' : '') + t.to), outs, runners,
        outEvents: ev.filter((e) => e.type === 'out').length, safeEvents: ev.filter((e) => e.type === 'safe').length,
        caught: !!(pl.ball && pl.ball.caught) && ['ground', 'line', 'fly', 'pop', 'bunt'].includes(sc.event.kind),
      });
    });
    return out;
  }, lg);
  for (const r of rows) {
    plays++;
    const tag = `${lg.padEnd(15)} ${r.name}`;
    const lead = r.dp && r.runners.find((x) => x.id !== 'batter' && x.to === r.dp.first);
    const add = (rule, why) => findings.push({ rule, level: lg, name: r.name, line: `${tag}: ${why}` });
    // 1. Went for the lead runner and didn't get them.
    if (r.dp && lead && !lead.out) add('lead-runner-safe', `threw ${r.throws.join(', ')}; the lead runner beat it (${r.runners.filter((x) => x.out).length} out)`);
    // 2. A play named as a double play that doesn't make two outs.
    if (/double play/i.test(r.name) && r.outs < 2) add('dp-named-not-made', `${r.outs} out; ${r.summary}`);
    // 3. Named as a force at a base, but that runner is safe.
    const m = r.name.match(/force at (home|2nd|3rd|1st)/i);
    if (m) {
      const base = { home: 'home', '2nd': 'second', '3rd': 'third', '1st': 'first' }[m[1].toLowerCase()];
      const f = r.runners.find((x) => x.to === base && x.id !== 'batter');
      if (f && !f.out) add('force-named-not-made', `the runner to ${base} is safe`);
    }
    // 4. An infield ground ball or bunt with throws, and nobody out at all.
    if (['ground', 'bunt'].includes(r.kind) && r.throws.length && r.outs === 0 && !/single|hit|through/i.test(r.name)) add('infield-no-out', `threw ${r.throws.join(', ')}; nobody out`);
    // 5. The summary promises a double play the clock doesn't give.
    if (/double play!/i.test(r.summary) && r.outs < 2) add('summary-overpromises', r.summary);
    // 6. Out flags and out calls disagree.
    const flagged = r.runners.filter((x) => x.out).length;
    // (A caught fly puts the batter out with its own call, not a runner flag.)
    if (flagged + (r.caught ? 1 : 0) !== r.outEvents) add('flags-vs-calls', `${flagged} runner(s) flagged out${r.caught ? ' + the batter on the catch' : ''}, ${r.outEvents} out call(s)`);
  }
}
await browser.close();

// Findings that are the right outcome, each with its reason (see tests/audit-expected.json).
const expected = JSON.parse(readFileSync(path.join(ROOT, 'tests/audit-expected.json'), 'utf8'));
const isExpected = (f) => expected.some((e) => e.rule === f.rule && e.name === f.name && (!e.levels || e.levels.includes(f.level)));
const surprises = findings.filter((f) => !isExpected(f));
if (CHECK) {
  console.log(`${plays} plays checked; ${findings.length - surprises.length} expected finding(s), ${surprises.length} new.`);
  for (const f of surprises) console.log(`  [${f.rule}] ${f.line}`);
  process.exit(surprises.length ? 1 : 0);
}
const byRule = {};
for (const f of findings) (byRule[f.rule] = byRule[f.rule] || []).push(f.line + (isExpected(f) ? '   (expected)' : ''));
console.log(`${plays} plays checked across ${LEVELS.length} level(s); ${findings.length} finding(s).`);
for (const [rule, lines] of Object.entries(byRule)) {
  console.log(`\n## ${rule} (${lines.length})`);
  for (const l of lines) console.log('  ' + l);
}
