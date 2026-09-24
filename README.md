# Simple Fielding

**Where every fielder goes, on every play.** An interactive whiteboard for youth baseball and softball.
Drag the ball from home plate to wherever it's hit, and all nine fielders move to their jobs: who gets the
ball, who's the cutoff, who covers the base, and who backs it up.

Free, with no ads and no accounts. It's built for an iPad first, works on phones, and has a projector mode
for team meetings.

**Try it:** https://simplefielding.com (the web app is at [`/app/`](https://simplefielding.com/app/)). A copy is on [GitHub Pages](https://mrthames.github.io/simple-fielding/).

A companion to [Simple Pitch Counter](https://github.com/mrthames/simple-pitch-counter).

## What it does

- **Drag to hit.** Pick a grounder, line drive, fly ball, pop-up or bunt, then drag the ball to where it goes.
  Drop it on a fielder and it's caught or fielded; drop it in a gap and it's a hit. A tap anywhere on the field
  works too, which is easier with a mouse on a projector.
- **The defense works itself out.** An engine derives each fielder's job from the situation: runners, outs,
  batter's side and field size. It isn't a fixed library of canned plays. Override the result (caught, single,
  double, triple) to compare.
- **Smooth 2D animation** of fielders, runners and the ball: flight arcs, bounces, throws through the cutoff,
  and "Out!" calls. It has a scrubber, half speed, replay, and chalk-line paths you can turn on or off.
- **Plain-words jobs** for all nine positions, color-coded by role: gets the ball, cutoff/relay, covers, backs
  up, stays ready. Tap a player or a job to spotlight it.
- **Other plays:** steal of 2nd (coverage by batter hand), steal of 3rd, the 1st & 3rd double steal, passed ball
  or wild pitch, primary lead and pickoff, secondary lead and back-pick, and the softball look-back rule.
- **Forty-five ready-made plays** in the play library, in eight groups, for running a practice. Press `N` for the next one.
- **Fields:** Little League baseball (60 ft, no leadoffs), 50/70 (leadoffs), fastpitch softball.
- **Whiteboard mode** (`W`): freeze any play, or the starting positions, and change it by hand. Drag fielders,
  runners and the ball, and draw chalk lines and arrows on top. An Apple Pencil or stylus always draws and a
  finger always moves, and pressure sets the line width. It has undo/redo, clear and reset, and the drawing
  stays over the play when you replay it.
- **Your team** (`T`): add players and drag them into positions, or press and hold a fielder to name them. The
  field can show position, first name, last name, initials or number, so a coach can talk to their own
  players. Stored on the device only.
- **Projector mode** (`P`): full screen, with the field only.

[`docs/SCENARIOS.md`](docs/SCENARIOS.md) is the coaching reference: every play, every job, and the youth
conventions the app follows where coaches disagree.

## Project structure

```
simple-fielding/
├── app/                  the web app (and, later, the payload for the iOS and Android shells)
│   ├── index.html
│   ├── css/app.css
│   ├── js/field.js       field geometry, in feet
│   ├── js/engine.js      the play engine: situation + batted ball → every fielder's job → timeline
│   ├── js/scenarios.js   the play library
│   ├── js/team.js        the roster: players, positions, label styles (stored on the device)
│   ├── js/teamui.js      the Team sheet, drag-and-drop, the press-and-hold position editor
│   ├── js/playlog.js     the play log and replay codes (used by tester reports)
│   ├── js/render.js      SVG drawing and animation playback
│   └── js/app.js         UI: situation, drag-to-hit, playback
├── website/              the companion site: homepage, guides, privacy (guides are generated, see below)
├── content/              guide sources (content/articles/*.html) and the share-image template
├── docs/SCENARIOS.md     the coaching reference
├── tests/                engine unit tests (node:test) and UI tests (Playwright)
├── marketing/icon-layers/ icon layers for Icon Composer (Liquid Glass) and a monochrome version
├── scripts/              icon and baseball generation, screenshot helper
├── tools/feedback-apps-script.gs  receives tester reports into a Google Sheet
└── tools/check-for-personal-data.sh
```

No framework and no build step. The scripts are classic `<script>` files rather than ES modules, because
native WebView shells load the app from `file://`, where modules are blocked. This is the same approach
as Simple Pitch Counter.

## Running it

```bash
npm install
npm start               # serves app/ on http://localhost:3344
npm test                # engine tests + Playwright UI tests
npm run icons           # regenerate PNG icons from app/icon.svg and app/icon-dark.svg
npm run site            # rebuild the guides, sitemap and robots.txt (checks every play against the engine)
npm run site:og         # ...and re-render the share images
npm run hero            # re-bake the homepage hero animation from the engine
```

## Testing on a device

Tester mode adds a **Report** button to every play. Tap the version number in Settings five times to turn it on. A
report carries what the tester says should have happened, plus a log of the play and a `#replay=` link that
reopens it exactly. Reports go to a Google Sheet through `tools/feedback-apps-script.gs` (setup steps are at the
top of that file), or are copied to the clipboard if no address is set.

## Deployment

**simplefielding.com** is served from the NAS: `bash scripts/deploy-nas.sh` (connection details come from the
environment, never the repo). Every push to `main` also publishes to GitHub Pages (`.github/workflows/pages.yml`): the website at the root
and the app under `/app/`. The tests and the personal-data check run on every push and pull request
(`.github/workflows/test.yml`).

## License

The settings gear icon is from [Lucide](https://lucide.dev) (ISC License, Copyright (c) Lucide Contributors).


[PolyForm Noncommercial 1.0.0](LICENSE).
