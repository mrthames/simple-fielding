# Simple Fielding — Change Log

---

## [2026-09-23] v0.1.1 — Right fielder no longer runs to home plate

### Fixes
- **Outfielders backing up a base on an infield play.** They stood "beyond the base, in line with the throw". A throw from the second baseman to 1st runs almost straight at home plate, so the right fielder ran to the plate. Outfielders now back up 1st and 3rd from foul territory behind the bag on their own side, and 2nd from the outfield grass behind it. Found testing on a phone.
- **Play title hidden on phones.** The pinned header covered the top of the field once the page scrolled. Below the side-by-side layout, the header now scrolls with the page.

### Tests
- Regression test for the grounder to the second baseman, and a sweep across every library play: no outfielder ends up closer to home than the bases.

---

## [2026-09-23] v0.1.0 — First playable

**Pre-release.** The web app, the companion site, and the play engine.

### App
- Drag the ball from home plate to anywhere on the field, or tap a spot. Hit types: grounder, line drive, fly ball, pop-up, bunt.
- Result override: let the app decide, caught, single, double, triple.
- The situation: runners (tap the bases on the field or the mini diamond), outs, batter righty or lefty.
- A play engine that works out every fielder's job — who fields it, the cutoff or the relay and the trailer, base coverage, backups — for ground balls, singles, extra-base hits, fly balls and tag-ups, infield and foul pop-ups, bunts, steals of 2nd and 3rd, the 1st & 3rd double steal, passed balls, primary and secondary leads, and the softball look-back rule.
- Smooth 2D animation of fielders, runners and the ball, with throws routed through the cutoff, and "Out!" and "Caught!" calls.
- Playback: play/pause/replay, a scrubber, half speed, and a switch for the paths.
- A job list in plain words for all nine positions, colour-coded by role. Tap a player or a job to spotlight it.
- A play library with 45 plays in 8 groups; `N` or → moves to the next.
- Fields: Little League baseball 60 ft (no leadoffs), 50/70 (leadoffs), fastpitch softball. A leadoff setting.
- Projector mode, keyboard shortcuts, light and dark panels, and an installable web app manifest.

### Website
- Landing page, privacy page, support section.

### Engineering
- 22 engine tests (`node:test`) and 9 Playwright UI tests at iPad and phone sizes.
- CI: personal-data check, engine tests, and UI tests on every push. Deploys to GitHub Pages from `main`.
