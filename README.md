# Simple Fielding

**Where every fielder goes, on every play.** An interactive whiteboard for youth baseball and softball.
Drag the ball from home plate to wherever it's hit, and all nine fielders move to their jobs: who gets the
ball, who's the cutoff, who covers the base, and who backs it up.

Free, with no ads and no accounts. It's built for an iPad first, works on phones, and has a projector mode
for team meetings.

**Try it:** https://mrthames.github.io/simple-fielding/ — web app at [`/app/`](https://mrthames.github.io/simple-fielding/app/)

A companion to [Simple Pitch Counter](https://github.com/mrthames/simple-pitch-counter).

## What it does

- **Drag to hit.** Pick a grounder, line drive, fly ball, pop-up or bunt, then drag the ball to where it goes.
  Drop it on a fielder and it's caught or fielded; drop it in a gap and it's a hit. A tap anywhere on the field
  works too, which is easier with a mouse on a projector.
- **The defence works itself out.** An engine derives each fielder's job from the situation: runners, outs,
  batter's side and field size. It isn't a fixed library of canned plays. Override the result (caught, single,
  double, triple) to compare.
- **Smooth 2D animation** of fielders, runners and the ball: flight arcs, bounces, throws through the cutoff,
  and "Out!" calls. It has a scrubber, half speed, replay, and chalk-line paths you can turn on or off.
- **Plain-words jobs** for all nine positions, colour-coded by role: gets the ball, cutoff/relay, covers, backs
  up, stays ready. Tap a player or a job to spotlight it.
- **Other plays:** steal of 2nd (coverage by batter hand), steal of 3rd, the 1st & 3rd double steal, passed ball
  or wild pitch, primary lead and pickoff, secondary lead and back-pick, and the softball look-back rule.
- **Forty-five ready-made plays** in the play library, in eight groups, for running a practice. Press `N` for the next one.
- **Fields:** Little League baseball (60 ft, no leadoffs), 50/70 (leadoffs), fastpitch softball.
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
│   ├── js/render.js      SVG drawing and animation playback
│   └── js/app.js         UI: situation, drag-to-hit, playback
├── website/              the companion site (landing, privacy)
├── docs/SCENARIOS.md     the coaching reference
├── tests/                engine unit tests (node:test) and UI tests (Playwright)
├── scripts/              icon generation, screenshot helper
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
npm run icons           # regenerate PNG icons from app/icon.svg
```

## Deployment

Every push to `main` publishes to GitHub Pages (`.github/workflows/pages.yml`): the website at the root
and the app under `/app/`. The tests and the personal-data check run on every push and pull request
(`.github/workflows/test.yml`).

## License

[PolyForm Noncommercial 1.0.0](LICENSE).
