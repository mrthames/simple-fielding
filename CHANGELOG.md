# Simple Fielding — Change Log

---

## [2026-09-23] v0.3.1 — Runners hold up when the throw beats them

### Fix
- **Runners ran home after the ball was already there.** Found testing on a phone: with runners on 1st and 2nd, two outs, and a double to right-center, the runner from 1st kept running home after the relay throw had beaten him to the plate. Now, after any ball to the outfield, a runner the throw would beat stops at the last base, the way a third-base coach would hold them. They take a turn, see the throw, and go back, with a "Holds at 3rd" call on the field. If another runner is already coming into that base, the runner has to keep going and is out at the plate. A note explains why: a good relay keeps runs off the board.

### Tests
- The reported play as a regression test, plus a sweep across every library play: no runner reaches a base after the throw got there first.

---

## [2026-09-23] v0.3.0 — Your team on the field

### Team
- A **Team** sheet: add players with first name, last name and number. They start on the bench.
- **Drag and drop** players onto the nine positions, laid out like the field. It works with a finger, an Apple Pencil or a mouse. Drop onto a filled position to swap; drop on the bench to sit someone. Without dragging, tap a player and then a position.
- **Press and hold a fielder on the field** to pick a player from the roster, type a one-off name, or set it back to just the position.
- **Show on the field:** position (the default), first name, last name, initials, or number. Names appear on a tag under the circle; initials and numbers go inside it.
- The job list and the spotlight card use the name: "Shortstop · Maya R.".
- Saved on the device only. Nothing is uploaded and there's no account; these are children's names.
- Keyboard: `T` opens the team.

### Fixes
- On narrow phones the header drops the wordmark so all the buttons fit.

### Tests
- 10 new tests for the roster data (assigning, swapping, one-off names, label styles, bad data in storage). 35 data and engine tests in all.
- 3 new UI tests: drag to a position, tap to a position with the name in the job list (surviving a reload), and press-and-hold naming. 32 UI runs.

---

## [2026-09-23] v0.2.0 — Whiteboard mode, and the Simple Pitch Counter look

### Whiteboard
- A **Whiteboard** button freezes whatever is on the field, whether a play mid-animation or the starting positions. You can then change it by hand.
- **Move:** drag any fielder, runner or the ball anywhere. Tap a base to add or remove a runner.
- **Pen** and **Arrow:** freehand chalk, and arrows that follow the curve you draw. Five colours and an eraser.
- **Apple Pencil and styluses:** the Pencil always draws and a finger always moves, so there's no tool switching. Pressure sets the line width. Touches are ignored while the Pencil is down, for palm rejection. Coalesced pointer events keep strokes smooth.
- **Undo / redo** (also Ctrl/⌘+Z), **Clear** the drawing, **Reset** everyone to where they started.
- The drawing stays on top of the play after **Done**, so you can replay the animation under it, until the next play runs.
- Keyboard: `W` whiteboard, `M` move, `D` pen, `A` arrow, `E` eraser.

### Look
- Matches Simple Pitch Counter: its navy header, iOS system colours (blue, green, amber, purple, red), 12 and 18 px corner radii, and the system font. The app is light-only, like Simple Pitch Counter.
- **The baseball** from the Simple Pitch Counter logo, redrawn as a vector (`app/img/baseball.svg`), is now the ball you drag and the ball in flight.
- **New icon:** a flat-art infield on the navy, with the ball's path chalked toward left field. Light and dark versions, 1024 px store masters, and layers for Apple's Icon Composer (Liquid Glass) plus a monochrome version for tinted and themed icons (`marketing/icon-layers/`).
- The website uses the same palette.

### Fixes
- The center fielder backs up 2nd from behind the bag on an infield double play, instead of from beside the shortstop.
- The drag hint no longer covers the ball at home plate on phones.

### Tests
- 25 engine tests (a new one for the center fielder's backup of 2nd). 13 UI tests (4 new for the whiteboard), 26 runs across iPad and phone sizes.

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
