# Simple Fielding — Change Log

---

## [2026-09-25] Website — What every position does

- **A page for each of the nine positions** (simplefielding.com/positions/), such as "Shortstop Responsibilities: Where the Shortstop Goes on Every Play". Each page has:
  - what the position does, and its main jobs
  - quick answers to common questions
  - that player's job on every play in the library (all 85), grouped by kind of play, each opening in the app
- **The play lists are generated from the engine** when the site is built, so a page can't say something the app doesn't do. The hand-written answers were each checked against the engine.
- **The homepage** mentions the fielding lessons and links to the positions. The menu and footer have a Positions link everywhere.
- **The app page** has a real title, description and share preview.
- The site is verified in Google Search Console.

---

## [2026-09-25] v0.36.0 — Nobody lets a ground ball by without trying

- **A ground ball into the outfield now passes through the infield on the way.** If its path comes within a step and a dive of an infielder, that infielder goes hard after it. It gets by them, and they get up and go to their job. Before, a grounder dragged into center right past the shortstop was played as if the shortstop wasn't there.
  - The play is titled "Through the infield — single to …" and the summary says whose glove it got past.
  - The ball is still a clean single at full speed. The dive changes who moves first, not how the play turns out.
  - Balls in the holes (between first and second, or between short and third) still get through untouched. Balls up the middle pass the pitcher.
- The library's ground-ball singles show the dive too, and so do the homepage animations.

---

## [2026-09-25] v0.35.3 — Read out loud, fixed

- **Read now speaks on iPad and iPhone.** It used to stop the voice and start it again in the same instant, which Safari and every iPad browser silently ignore. It now stops only what's actually playing, and waits a moment first.
- **You can tell it's working.** The button says **Stop** while it reads (tap to stop), and goes back to Read when it's done. It asks for an English voice by name.
- **If nothing is heard**, it says what to check: on iPhone and iPad, Silent Mode (the switch, or the Action button) mutes the built-in voice.
- **Lessons can read out loud too.** The speaker in the lesson bar reads the step: what happened, the question, and the choices. It's for players who can't read yet.

---

## [2026-09-25] v0.35.2 — Lessons stay in 2D

- **The 3D button is hidden during a lesson** and comes back when you leave it. A lesson's markers (where the ball is going, YOU, your guess and the right spot) are drawn on the 2D field. 3D and VR lessons will come as their own feature, where you point to where you'd run instead of dragging.

---

## [2026-09-25] v0.35.1 — Where your progress is kept

- **The fielding lessons say where your progress is kept**, at the bottom of the list. It's in this browser, on this device. Clearing the browser's cache and data for the website removes it, and so does closing a private or incognito window.
- **Settings says the same for everything the app keeps**: your team's names, My plays, lesson progress and your settings. There's no account, so export My plays if you want a backup.

---

## [2026-09-25] v0.35.0 — Start here, and a way back

- **"Start here: How lessons work"** opens both courses. It shows a small picture of everything on the field and what it means:
  - the dotted white circle is where the ball is going
  - the finer dotted line is where it ends up if it gets through
  - your player: a gold ring with "YOU" over it
  - teammates are blue, runners red, and B is the batter
  - the role colors: yellow, orange, green, purple and gray
  - routes, and where players are looking
  - after you answer: your guess (green, yellow or red) and the right spot
  Then three quick questions and an easy play.
- **Every play says what happened and the situation** before it asks where you go. For example: "A ground ball to the left side. 0 outs · Nobody on", "A slap toward the 3rd-base line", "A bunt toward the 1st-base line", "Stealing 2nd. 0 outs · Runner on 1st". The question tells you whether the ball is on the ground or in the air, and where it's headed.
- **Go back, or try a step again.** Every result has "Try it again" (even when you got it right) and "‹ Back" to the step before; questions and plays have "‹ Back" too. Only your first try at each step counts toward the lesson's score.
- **Your player stands out:** a gold ring and a "YOU" tag, so it can't be mistaken for the ball's dotted white circle.

---

## [2026-09-25] v0.34.0 — Fielding lessons

- **Learn**, a new button at the top, holds fielding lessons in **two separate courses, baseball and softball**. Each is a ladder of stages as a player moves up:
  - **Baseball:** T-ball, coach pitch, kid pitch, Majors, 13U and up.
  - **Softball:** 8U, 10U, 12U, 14U and up.
- **Filter by position**: pick "SS" to see what a shortstop needs to know, at every stage.
- **How a lesson works:**
  - A short read, in the words youth coaches use: "alligator hands", "Ball, base, backup", "I got it!".
  - Then plays where you're one fielder. The play starts and **freezes at the moment you'd decide**. You **drag yourself the way you'd run**, or tap **Stay here**.
  - You're graded on heading the right way (about 25° counts, and "close" counts too), not on an exact spot.
  - Then you watch the play, with your job in plain words. Try again or move on.
  - Some lessons are questions: calling the ball, where the throw goes.
- **Talking on defense and sportsmanship** are lessons at every stage:
  - saying the outs and where the runners are
  - the shortstop and center fielder leading
  - the catcher's cutoff calls
  - picking up a teammate after an error
  - respecting the umpire
- **Built on published programs**: Little League's tee-ball and coaching curriculum, Little League Softball, the ABCA's cutoff system and the Positive Coaching Alliance. Little League Majors keeps its no-leadoff rule: leads and pickoffs start at 13U.
- **Scores are saved on the device only**, and a finished lesson shows a check mark.

---

## [2026-09-25] v0.33.0 — Ask first: tap a player to see their job

- **While a play asks "Where does everybody go?", tap a player** to see their job card and their route, with the other routes still hidden. Tap another player to see theirs.
- **No more dragging players to answer here.** It read as "move this player", which was confusing when a player's job was to stay put. Dragging to answer is moving to the fielding trainer that's coming next, where it's the whole point.
- With chalk paths turned off in Settings, tapping a player shows just that player's route too.

---

## [2026-09-25] v0.32.1 — A new field starts a clean slate

- **Changing the level or the park resets the play:**
  - no runners and no outs, with a righty up and every call on Auto
  - a fresh play builder
  Before, a runner's lead set up on a pro field carried over to Little League, where the builder showed a lead slider that no longer did anything.
- **No pickoff where nobody can lead off.** On a Little League 60 ft field (no leadoffs) and at 8U, the builder doesn't offer a pickoff. Runners can still steal once the pitch reaches the batter.

---

## [2026-09-25] v0.32.0 — Base paths and mowing

- **Base paths run parallel all the way**, in 2D and 3D. The dirt is an even 3 ft either side of each line. Outside the line, it runs from the plate past the bag to where the infield dirt ends. Before, the infield grass started further out at home plate, so the dirt narrowed toward the bases, and there was no dirt outside the line past the bag.
- **Mowed grass in 3D**: a checkerboard of lighter and darker squares running with the foul lines. The 2D infield grass is striped now too, like the outfield.

---

## [2026-09-25] v0.31.0 — Every play says what actually happens

An audit ran every play in the library at every level (810 in all), checking that each play's name and summary agree with who's out and who's safe. It found:

- **Summaries promised double plays the clock didn't give.** "Bases loaded — force at home" at Little League said "a double play!", but the catcher's throw to 1st is a step behind the batter. Summaries now say what happens: one out, or none, and why.
- **The force at home was thrown even when it couldn't win.** In softball the runner from 3rd leaves with the pitch, and from double-play depth the throw home is late. The fielder now takes the double play at 2nd and 1st instead, and says why.
- **"Bases loaded — force at home" now has the infield in**, the way it's played, with the ball hit at the drawn-in second baseman. The force at home is made at every level.
- **A library play now sets up its whole situation.** The batter (righty unless the play says otherwise), infield depth and the defensive calls reset with each play. Before, a slapper or "infield in" from one play carried into the next and changed its outcome.
- **Sacrifice bunts: the corner charges when the batter squares around**, before contact, so the out at 1st is made. At Little League the batter had been beating it.
- **When the batter beats a throw to 1st**, the summary says so (a slapper's running start, an 8U arm) instead of implying the out.

The audit now runs on every push (`npm run audit`). The outcomes that are right but look odd are listed with their reasons in `tests/audit-expected.json`: a slapper beating the throw, and a double play that's a step late at 13U–14U and in softball.

---

## [2026-09-25] v0.30.1 — 3D follows the field you picked

- **Fixed: the 3D view kept the old field** after the level or park was changed while 3D was off. A 90 ft play was then drawn on the old diamond, so second base and the runner showed up out in center field, and the scoreboard still named the old level. The 3D field is now rebuilt whenever it comes back on.
- **Wrigley Field** has its ivy-covered brick wall: about 11½ ft high, and ivy green.

---

## [2026-09-25] v0.30.0 — When the play's over, everyone stops

- **Fielders stop when the play ends.** Once the last catch, throw or call has happened, everyone eases to a stop within about half a second instead of running out the rest of their route. A backup who wasn't needed (right field coming in behind 1st on a routine grounder, say) is shown on the way, facing where they were going, not arriving long after the out.
- **The chalk paths still show the whole route** to each player's spot, and the job list still says where they go. The quiz still grades against the full spot.
- In 2D and 3D alike. The homepage animations are re-rendered to match.

---

## [2026-09-25] v0.29.0 — 3D, round three: calls, gear, and players who move like people

- **OUT! and SAFE! over the runner** the moment the play decides it, including a batter caught on a fly, and "Doubled off!".
- **More human players**: a real torso, tapered arms and legs with calves and knees, a nose and ears, and bigger gloves.
- **Movement that doesn't glide**:
  - strides lengthen with speed, so the feet keep pace with the ground
  - a walk turns into a run, then a sprint, with more knee drive, arm swing and lean
  - starts, stops and turns ease in
  - runners face where they're going and turn their head to the ball
  - fielders take a small step in as the pitch arrives, and breathe while they wait
  - every player has a soft shadow
- **The batter tosses the bat** aside after the swing, end over end, and it lies where it lands.
- **Real gear**:
  - the catcher has a helmet with a cage mask, a chest protector, shin guards with knee caps, and a catcher's mitt
  - the umpire has a mask and a padded chest
- **A trail behind the ball**, so you can follow it through the air or along the ground. The ball itself is closer to real size again (about twice as big).
- **The scoreboard is bigger, with larger type**, laid out to read from behind the plate: the count and outs, the inning, the pitch count, the bases, and the score.
- Still light: about 350 draw calls and 50,000 triangles for the whole field, all drawn on your device.

---

## [2026-09-25] v0.28.0 — 3D, round two: rounder players, an umpire and a scoreboard

- **Rounder, smoother players**, more early-2000s than '90s:
  - rounded limbs, a real torso and head, eyes, and dark undershirt sleeves
  - a baseball emblem on the blue jerseys and a diamond on the red ones
  - each fielder's scorebook number on the back (1 pitcher through 9 right field)
- **Caps sit on the head**: a proper crown with a button and a curved brim, instead of a flat box.
- **The home-plate umpire** sets up in the slot between the catcher and the batter, and stands up once the ball is in play.
- **A scoreboard** beyond the right-center fence shows:
  - the level and a line score
  - ball, strike and out lamps, with the play's outs lit
  - the inning and a pitch count
  - which bases are taken
- **The base paths run the same width all the way** to 1st and 3rd, instead of narrowing to a point at the plate.
- **The foul lines start at the front corner of the batter's box** instead of running through it, and **the running lane** is chalked on the second half of the way to 1st.
- **Walls have their real heights** where a park is known for one: Fenway's 37-foot Green Monster, Oracle Park's 24-foot right-field wall.
- **Name tags ride on each player's head**, so they sit just above it at any distance and follow a crouching catcher.
- **A bigger ball**, about three times real size, so it's easy to follow on a phone.

---

## [2026-09-25] v0.27.0 — 3D players that move like ballplayers

- **Real players in the 3D view**, built low-poly in the style of a late-'90s baseball game: blue defense in caps and gloves, red offense in batting helmets.
  - They **run** with a stride that matches their speed, turning their head to watch the ball.
  - Fielders wait in a **ready crouch**, get **down for a grounder**, take a **liner at the chest** and reach **overhead for a fly or pop-up**, then **wind up and throw**.
  - The **catcher squats** behind the plate. The **pitcher follows through** on the pitch.
  - **The batter stands in the box on the correct side** (righty, lefty or slapper), **swings** at contact, drops the bat and runs. On a steal or pickoff, a batter still stands in.
  - Players are sized to the level: about 6 ft from high school up, smaller for younger kids.
- **The ball flies the way it was hit, at true height**: a grounder hops lower and lower, a liner stays flat, fly balls and pop-ups arc high, and throws carry on a gentle arc. Its shadow fades as it climbs.
- **The diamond is to scale**:
  - Home plate is the real 17-inch pentagon.
  - The bases are 15 inches (18 in the pros).
  - The batter's boxes are 4 x 6 ft (3 x 6 on youth fields, 3 x 7 in softball).
  - The catcher's box, the rubber and a 10-inch mound all match their level.
- **Name tags stay the same size on screen**, near or far.
- It's all drawn on your device: nothing new to download, and a frame takes about a millisecond.

---

## [2026-09-25] v0.26.0 — The level and field, on the field

- **The color key on the field now names the level and field** the play is shown at: "Little League · 60 ft bases", "College softball · 60 ft bases", "MLB · Red Sox — Fenway Park". A play on the screen, or on a projector, says what level it's played at, without opening Settings.

---

## [2026-09-25] v0.25.1 — Reset clears the look cones

- **Reset now clears where players were looking.** The cones stayed on the field, frozen where the last play left them, until the next play started.

---

## [2026-09-25] Website — the app on an iPad

- **The homepage opens on the app itself**, in an iPad frame, playing the same single to left field: the toolbar, the field and everybody's job listed beside it. It's filmed frame by frame from the real app (`npm run hero:video`), so it always matches what the app does. It's a 390 KB looping video; visitors with reduce motion turned on see the final positions as a still.
- **The field animation moved down** to "A whiteboard that moves", above the color key, and is re-baked with the current field (fence distances included).

---

## [2026-09-25] Housekeeping — GitHub Pages retired

- **GitHub Pages is retired**: simplefielding.com is the one home for the site and the app. The Pages workflow is removed and the Pages site is turned off.
- **The repository's history was rewritten** to take out a description of the server's layout (a folder path and the hosting software's name). No code changed; commit IDs did.

---

## [2026-09-25] v0.25.0 — VR (first version), and dimmed hit choices

- **Enter VR** (in the 3D view, only where the browser supports headsets: Quest's browser, or a PC browser with SteamVR).
  - The field is life-size and you stand in it. By default you're behind home plate. Pick a player in the View menu first to ride along with them.
  - Your head does the looking.
  - The controller's trigger plays or replays the play.
  - The iPad and other screens are unchanged.
  - **Not yet tested in a headset**: this is the first version, and it needs a try on real hardware.
- **Hit choices dim** while a steal, pickoff or other non-hit play is on screen, since they don't apply to it. They still work if you pick one.

---

## [2026-09-25] v0.24.0 — My plays is a playlist

- **Next play steps through My plays** when a saved play is open. Save tonight's plays, open the first, and click through them in order, in projector mode or on the iPad. The open play is highlighted in the list. Shift+→ and Shift+← (or N) step with a keyboard.
- **▲ ▼ in My plays** set the order.

---

## [2026-09-25] v0.23.1 — Full screen stays put while you draw

- **iPad (Chrome, Safari, any browser there) drawing on the whiteboard in projector mode could drop out of full screen.** Two fixes:
  - While drawing or in projector mode, the app now ignores the browser's own gestures: pinch, double-tap zoom, swipe-to-scroll and the press-and-hold menu. Drawing and dragging are unaffected.
  - If the browser still leaves full screen by itself (a web page can't block every system control), projector mode stays on. Your next tap goes straight back to full screen, and a **Back to full screen** button shows in the meantime.
- **A small ✕** in projector mode leaves it on purpose. On a laptop, Esc still leaves projector mode as before.
- Full screen uses the older prefixed browser calls too, where a browser still needs them.

---

## [2026-09-25] v0.23.0 — Read it out loud

- **Read** (on each play) speaks the play for kids who can't read the job list yet. It uses the device's built-in voice: no internet needed, nothing sent anywhere.
  - It reads the play's name, what happens, then each player's job, using your team's names ("Maya, shortstop…").
  - If a player is spotlit, it reads just their job.
  - While a play waits at the hit, it asks the question instead of giving away the answer.
  - Tap Read again to stop.
- **Settings → Read each play out loud** reads every play as it starts.

---

## [2026-09-25] v0.22.0 — Timeline markers, ¼× speed, and plainer words for kids

- **Timeline markers:** a tick under the timeline for each catch, throw, out and safe, in their colors. Tap one to jump just before that moment.
- **¼× speed** for walking young players through a play. On a phone, one speed button cycles 1× → ½× → ¼×.
- **Plainer words on 60 ft fields:** the cutoff home lines up "just in front of the pitcher's mound, in line with home", not "36 feet in front of the plate", and the trailer stands "about six big steps behind" the relay.
- **The first baseman takes 1st unassisted** at 13U–14U and up when they field it close enough to beat the runner, and waves the pitcher off.

---

## [2026-09-25] v0.21.0 — Quiz: drag a player to answer

- While a play waits at the hit (**Ask first**), drag any fielder to where you think they go.
  - The app checks the answer against where the play sends them: **Yes!** (green), **Close** (yellow) or **Not quite** (red).
  - It marks your guess and the right spot with a line between them, spotlights that player, and plays the answer.
  - A running score counts how many a player has gotten right this session.
- Kids can quiz themselves; coaches can hand the iPad around the dugout.

---

## [2026-09-25] v0.20.0 — Rundowns

- **Rundowns** between 1st and 2nd, 2nd and 3rd, or 3rd and home. The textbook way:
  - The fielder with the ball runs hard at the runner, ball up, and drives them back toward the base they came from.
  - The fielder at that base steps up and yells "Now!".
  - One short throw, then the tag.
  - Backups stand behind both bases.
  - Everyone's job is spelled out, with notes on why you run them back, why fake throws fool your own teammate, and getting out of the lane after you throw (obstruction).
- New **Rundown** button and a **Rundowns** group in the play list.
- Share links fit more kinds of play. Older links still open exactly as before.
- The homepage describes what's new: every level, real ballparks, the builder, saving and sharing, softball, infield depth, rundowns and 3D.

---

## [2026-09-25] v0.19.1 — TV captions

- **Projector mode on a wide screen** (a TV, or a mirrored iPad or laptop via AirPlay or a Chrome Cast tab) shows the play's summary and its first teaching note in the margin beside the field, so the room gets the lesson as well as the animation. Tap a player and their job card shows there instead.

---

## [2026-09-25] v0.19.0 — "Cut 2", and the lefty's head start

- **"Cut 2"** (13U–14U and up, baseball and softball). On a single with a runner scoring from 2nd and 1st base open behind them, the batter rounds 1st and takes off for 2nd on the throw home.
  - If the throw would beat the runner, it goes home and the batter takes 2nd.
  - If the runner is going to score easily, the catcher yells **"Cut 2!"**, and the cutoff catches the throw and fires to 2nd to try to get the batter.
  - The clock decides both.
- **Left-handed hitters** stand in the 1st-base-side box and get out of it a step sooner (13U–14U and up).

---

## [2026-09-25] v0.18.0 — Defensive calls: 1st & 3rd, and bunt defense

- **1st & 3rd defense** (in the Steals card): **Auto · Through · Cut · To P · To 3rd**.
  - **Auto** uses the cut play for youth, and throws through from 13U–14U up. With two outs it's always through.
  - **Through:** the catcher throws to 2nd. If the runner on 3rd breaks on the throw, the throw goes home from 2nd.
  - **Cut:** the second baseman cuts it in front of 2nd.
  - **To P:** the catcher throws back to the pitcher, and the runner from 1st takes 2nd for free.
  - **To 3rd:** the catcher throws behind the runner at 3rd.
- **Bunt defense** (shown when Bunt is picked): **Auto · Standard · Wheel · 1B crash**.
  - **Standard:** the third baseman holds 3rd for the force, and the shortstop holds 2nd.
  - **Wheel** (softball: rotation): both corners crash on the pitch, and the shortstop rotates to 3rd.
  - **1B crash:** the first baseman breaks early with a runner on 1st.
- **With a called defense, and at every level from 13U–14U up,** the defense goes after the lead runner when the clock says the throw beats them. Otherwise it takes the out at 1st.
- The calls carry into saved plays and share links.

---

## [2026-09-25] v0.17.0 — Infield depth

- **Infield: Auto · DP · In · Corners in**, in the Situation card. This was the coach review's top missing option.
  - **Auto** is what the app always did: double-play depth with a runner on 1st and less than two outs, normal otherwise.
  - **DP** puts the middle infielders at double-play depth.
  - **In** brings the whole infield to the edge of the grass. With a runner on 3rd and less than two outs, a ground ball is thrown home, the runner goes on contact, and the clock decides the play at the plate.
  - **Corners in** brings the corners in and leaves the middle back. A ball to the corners goes home; a ball to the middle infielders takes the sure out at 1st.
- Depth carries into saved plays, share links and the builder.

---

## [2026-09-25] v0.16.0 — 3D, and seeing the play through a player's eyes

- **3D view** (the **3D** button on the control bar). The same play, timeline and field in 3D: the park's real wall shape with its distances, the mound or the pitching circle, bases, foul poles, and the coach on the rubber at 8U.
  - Players stand on rings in their job's color.
  - Your team's names float above the players.
  - The ball flies with its real arc.
- **Cameras:**
  - **Behind home plate**
  - **Overhead**
  - **Be the player:** ride with any fielder or runner at eye height, looking where the engine says they're looking. See the cutoff turn from the outfielder to the base, or a runner find the third-base coach.
- **Play, pause, the ½× speed and the timeline slider** all work in 3D. Drag left or right on the 3D view to scrub.
- **Hitting a new ball** and the **whiteboard** stay in 2D. Opening the whiteboard switches back.
- **Loads only when you turn 3D on.** 3D uses Three.js (MIT license), bundled with the app so it also works offline and in the native apps later. The choice is remembered.

---

## [2026-09-25] v0.15.1 — Fixes from the fastpitch review

A review by a D-I softball defensive coach and a 10U/12U rec and travel coach ran over 16,000 plays across the new softball levels.

- **Sacrifice bunts are outs again.** Bunts roll at each level's own speed, and a fielder charging a bunt or a slow roller meets the ball on its way in instead of waiting where it stops. At 90 ft, whoever can get to the bunt first (pitcher, catcher or a corner) fields it.
- **Soft slaps** go to whoever can charge them first; nobody backs up 20 ft to reach one. A slow ball or a slap takes the sure out at 1st unless a middle infielder fields it near 2nd. On slaps the second baseman covers 1st, as on bunts.
- **Steals:** each softball level has its own steal speed, so 14U and high school steals are close instead of easy. The double steal uses the shortstop to cover in softball.
- **Back-picks:**
  - The catcher's throw on a back-pick uses each level's own time, so they happen at high school and college.
  - Softball runners can take bigger leads in the builder.
  - With the corners in, the second baseman sneaks in behind the runner at 1st, and the shortstop covers 3rd.
- **The squeeze** sends the runner on 3rd on the pitch.
- **A corner who catches a line drive** steps on their own bag instead of throwing to it.
- **8U:** the builder has no leads, passed balls or steals. A leftover baseball pickoff setting plays as a pitch in softball.
- **The right fielder** comes in a little against a slapper.
- **Changed on purpose, and worth knowing:**
  - Youth softball steals of 2nd are now covered by the shortstop, so some that were safe are now out.
  - 90 ft catchers' throws use the real distance to 2nd, which makes them a hair slower.
  - Youth bunts are also met on the way in.

---

## [2026-09-25] v0.15.0 — Where everyone is looking, and runners who read the ball

- **Vision cones.** A soft cone from each player shows where they're looking, moment by moment:
  - **Fielders** watch the batter until contact, then the ball. With the ball in hand, they look where they're about to throw. A cutoff watches the outfielder, catches it, then turns to the base.
  - **Runners** look where they're going. The batter looks down the line at 1st. Rounding 1st, a runner finds the ball. From 2nd to 3rd, the eyes go to the third-base coach; from 3rd, to the plate.
  - **A runner who's waiting**, tagging up or holding, watches the ball.
  - **Spotlight** a player to see only their cone, highlighted.
  - Turn them off in Settings → **Show where players look**. The same data will aim the camera for the planned "be the player" 3D view.
- **Runners read fly balls:**
  - **A caught fly** with fewer than two outs: a runner who isn't tagging goes partway, then gets back to the bag when it's caught.
  - **A fly that drops:** runners wait partway until it lands, then run.
  - **A line drive into a gap:** they hesitate only a beat.
  - **Two outs:** everybody still runs on contact.

---

## [2026-09-25] v0.14.0 — Look-back, delayed steal, dropped third strike

- **Softball look-back plays.** The catcher returns the ball to the pitcher in the circle, and the runner off the base:
  - goes straight back
  - stops, and is **out by rule** with no throw
  - breaks for home, and the pitcher throws home
  - drifts off 1st with a runner on 3rd, while the pitcher runs at her with eyes on 3rd
  Each shows a note that the rule's wording differs between USA Softball / NFHS and NCAA. The softball "Look-back rule" button now plays the look-back itself.
- **1st & 3rd delayed steal.** The runner on 1st breaks as the catcher throws back to the pitcher, and the pitcher looks the runner on 3rd back before throwing to 2nd. The clock decides.
- **Dropped third strike**, baseball and softball:
  - **1st open, or two outs:** the catcher throws to 1st. The first baseman calls "Inside!" or "Outside!" depending on where the ball went.
  - **Bases loaded, two outs:** the catcher steps on home.
  - **1st occupied with fewer than two outs:** the batter is simply out ("don't throw").
  - Leagues that don't play the rule (8U, many 10U) hide it.
- **Builder:** a new pitch result, **Strike 3 in the dirt**. Tap where the ball ends up.
- **New softball plays:** 4 look-back, 1 delayed steal and 4 dropped third strike situations. All of it carries through share links.

---

## [2026-09-25] v0.13.0 — Every fastpitch level

- **Five new softball fields:**
  - **8U** (coach pitch)
  - **14U** (43 ft)
  - **High school · 16U–18U** (NFHS)
  - **College** (NCAA)
  - **Pro & international** (AUSL, WBSC)
- The 10U and 12U fields play exactly as before.
- **Each level has its own speed of play:** runner speed (slappers included), arm strength (a softball slows down more than a baseball), pop time, pitch speed, grounder speed, hang time, leads off the base at the release, tag time, and when to send a runner. Each also has its own positioning and fences. A routine grounder to short is an out from 14U up; a slapper beats it.
- **Slappers:** a new **Slapper** batter (10U and up) starts running from the left box. The defense sets the slap alignment: corners in, shortstop to the hole, second baseman toward 1st, outfield in.
- **The shortstop covers 2nd on softball steals.**
- **8U:**
  - A coach pitches, drawn on the rubber, and the player pitcher fields from beside the circle.
  - Runners leave on contact, so there are no steals or leads, and the steal plays and builder options are hidden.
  - Throws are sized for 7–8 year olds.
- **No pickoff in the softball builder:** pitchers don't throw over. The catcher's back-pick is there instead.
- **13 new softball plays:** slaps (soft, hard, in the hole, drag bunt, with a runner on 1st), bunts (1st & 2nd, squeeze, the catcher covering 3rd), steals, back-picks at 1st and 3rd, and a passed ball.
- **Slow rollers and soft slaps are really slow now.** The v0.9.1 slow roller had only moved where the ball went.
- **The Baseball / Softball switch** remembers the last field for each sport.
- **Softball fields and slappers carry through share links.**
- **Not yet:** look-back variations, the delayed steal, the dropped third strike, and bunt defenses with runners on 1st and 2nd.

---

## [2026-09-25] v0.12.0 — Draw what happened, and make a copy

- **Draw what happened, step by step** (Build a play → ✎). This works like the whiteboard, but records steps.
  - Move fielders, runners and the ball to where they were at each moment, and tap **+ Step** for the next one.
  - Each step has a length (½ to 3 s) and an optional caption. "Out" and "Safe" captions show in their colors; anything else shows as a note, like "Error!" or "Should cover 2nd".
  - Faint trails show where everyone was a step ago. **Finish ▶** plays it back smoothly.
  - The app doesn't judge a drawn play: it shows exactly what you drew, mistakes and all. You can still draw on top with the pen and arrows.
- **Edit** any play the app worked out: it becomes steps you can change, to show what you'd rather see.
- **Make a copy** of a saved play in My plays, to start a new one from it.
- **Saving a play you opened from My plays** offers **Save changes** or **Save as a new play**. Keep "What happened" and "What we want" side by side.
- Drawn plays fit in share links too (a few steps come to about 230 characters). The pen drawing stays on the device.

---

## [2026-09-25] v0.11.0 — Build a play: leads, steals, pickoffs and passed balls

- **Plays / Build a play** switch at the top of the controls. Build hides the play list and gives you the pieces:
  - **What happens**: a pitch the catcher catches, a pitch that gets by (passed ball or wild pitch), a pickoff, or a ball in play.
  - **Each runner's lead**, with a slider, and whether they're **stealing** or **holding**. Runners show off the bag at their lead.
  - **The pickoff throw** goes to whichever base you choose.
  - **A passed ball goes where you tap**, behind or beside the plate.
  - **Drag any fielder** to where they start: infield in, a first baseman holding the runner, a shift. This works for balls in play too.
  - **Set play ▶** runs it. The app works out everyone's response.
- **The clock decides steals, pickoffs and back-picks.** Pickoffs and back-picks used to end "Safe!" every time; now a bigger lead turns safe into out.
  - A runner diving back takes time to react and get going from a standstill.
  - A runner coming back from a secondary lead also has to stop and turn.
  - The tag has to beat their hand to the bag.
- **When nobody is stealing,** the catcher back-picks the runner a throw can beat, or throws the ball back to the pitcher.
- **New plays:**
  - a double steal (the throw goes to 3rd, for the lead runner)
  - a runner breaking for home on a caught pitch
- **Passed balls:** runners who weren't stealing read the ball, and hold if the catcher gets to it quickly.
- **Saving and sharing** carry everything you built: leads, who's stealing, where the ball went and where the fielders started. Opening a built play puts it back in the builder, ready to change.

---

## [2026-09-25] v0.10.0 — Save and share plays

- **Save** any play (a list play, one you dragged, one from a link) with a name. It shows under **★ My plays** at the top of the play list.
- **Share** makes a short link that holds the whole play: the field and park, runners, outs, batter, where the ball went, and its name. A play is about 15–20 characters plus its name. The play lives after the `#` in the link, which browsers never send to the server, so nothing is stored or logged anywhere. On a phone it opens the share sheet; elsewhere it copies the link.
- **Opening a link** sets up the field and situation and runs the play.
- **My plays** (from the list, or Settings): open, share, rename or delete a play.
  - **Export backup** downloads one small file with every saved play, and your team.
  - **Import** reads a backup back in. It skips plays you already have, and asks before replacing your team.
- Saved plays live on this device. The app says so, and suggests sharing or exporting to keep a copy, because clearing the browser's data removes them. It also asks the browser to keep its storage.

---

## [2026-09-25] v0.9.1 — Fixes from the pro-level review

A review by a pro field coordinator and a high school coach ran 70,560 plays across the new levels and parks. Youth plays are unchanged.

- **Fly balls:** catches at 90 ft levels are now worked out from hang time. The high school, college and pro fields had been using the youth catch distances, so a 4.7 s fly 58 ft from the center fielder fell in for a double. Line drives hang longer.
- **Infielders** field grounders just behind the dirt and go out for pops they can reach. An outfielder coming in still calls them off.
- **The 1st & 3rd cut play** works at high school and up. Only throws from the outfield go through a cutoff.
- **Triples:** a ball off a short wall, like Fenway's left field, is a double, not a triple. The triple timer counts the batter's speed rounding the bases.
- **A double or triple stays in the park,** and the 90 ft plays follow each field's own fences. A gap double is a gap double at 13U–14U and in every park.
- **Base running:** runners aren't sent to make the first or third out at 3rd. With two outs they're sent home more readily.
- **Steals:** the middle infielder covering 2nd breaks as the pitch crosses the plate, not after the catch.
- **Double plays** use each level's time to turn the pivot, so 13U–14U often gets only the lead runner.
- **Backups:** the pitcher backs up 3rd deeper at older levels.
- **Wording:** the catcher's calls at 90 ft are "Cut", "Cut 2", or nothing to let the throw through. Fewer youth-only phrases appear at pro.
- **List plays:** the slow roller, deep in the hole, 1st to 3rd and the pop-up between the first baseman, second baseman and right fielder are placed more realistically.

---

## [2026-09-25] v0.9.0 — High school, college and pro fields, and real ballparks

### Levels of play
- **Four new fields**, all 90 ft: **13U–14U**, **High school (NFHS)**, **College (NCAA)** and **Pro (MLB / minor leagues)**. The field sets the speed of play, where fielders stand and how far out the cutoffs go:
  - **Runners**: about 4.9 s home to 1st at 13U–14U, 4.6 at high school, 4.3 at pro.
  - **Throws**: each position has its own arm strength. A shortstop throws about 86 mph and a right fielder about 90 at pro. Long throws lose speed past each level's carry.
  - **Catchers**: steals are decided by the pitcher's time to the plate plus the catcher's pop time. At pro that's 1.35 s plus 2.0 s, so an average steal is safe by a step.
  - **Balls in the air**: hang time, grounder speed, leads, tag time and when a coach sends a runner are all set per level.
  - **Catchable fly balls** are worked out from hang time and the fielder's speed, not from a fixed reach.
  - **Positions** come from each level's own depths, not a scaled-up Little League field: middle infielders at about 147 ft at pro, and double-play depth with a runner on 1st.
  - **Cutoffs and relays**: the cutoff home stands about 45 ft from the plate. The relay goes out as far as its own throw can reach, with the trailer 20–25 ft behind (a tandem relay). A single cutoff lets a good throw go through.
  - **Base running**: runners tag up on shorter flies, and taggers and stealers get a running start. A ball in the corner takes a moment to dig out.
- **15 new plays for 90 ft fields**, listed first when one is chosen: double-play depth (6-4-3, 4-6-3, 5-4-3), deep in the hole, slow roller, plays at the plate, 1st to 3rd, tandem relays down both lines and in the gap, a triple, tag-ups, and a pop-up between the first baseman, second baseman and right fielder. The other plays scale to each field: infield spots with the bases, outfield spots with the fence.
- The youth fields play exactly as before.

### Ballparks
- **Settings → Ballpark**: all 30 Major League parks, plus the Athletics' Oakland Coliseum, the Giants' Candlestick Park and the Rays' 2025 home, for the 90 ft fields. The two **Little League World Series** stadiums (225 ft) are available for Little League. Each park is listed by team and park name only, with no logos or branding.
- **Parks draw their real shape** from published distances: Fenway's short left and deep center-field corner, Oracle Park's 415 ft right-center alley. The engine uses the wall in the ball's direction for home runs, extra bases and backups.
- **Every field shows its left-field, center and right-field distances on the warning track.**
- Players, runners, the ball and the chalk lines draw larger on big fields, so they stay readable.
- Parks are saved in replay links.

---

## [2026-09-25] v0.8.1 — One mode, the question in the title, Next on the field

- **Basic mode is off.** There's one app again, with everything in it. The play list stays in the panel (it replaces the Plays button).
- **Ask first is on by default**, and smaller. "Where does everybody go?" is a line under the play's name in the title card, and Play is only on the control bar, so the whole field stays in view.
- **The ball's target is always marked**: a dashed circle where it's fielded or lands, visible before Play even with the paths hidden. A ball that got through also shows its roll as a finer dotted line to a finer dotted circle where it ends up.
- **Next play** appears at the top right of the field when a play ends.
- The pulsing "got through" ring has no label now; how to use it is in Settings.
- The play list shows a cut-off last row, a fade and **Show all 45 plays**, so it's clear there's more.
- The color key is centered. On a phone, the situation line sits in the title card.

---

## [2026-09-25] v0.8.0 — Basic and Coach modes, grounders that get through, a coach's flow

### Basic and Coach modes
- **Basic** (the default on a first visit) is for players: a quick-pick list of every play, the runners, the outs, baseball or softball, and drag-the-ball. It hides the team, the whiteboard, the batter, how the hit turns out, steals and pickoffs, and the field size.
- **Coach** has everything. Switch in Settings, or from the link at the bottom of the panel. The choice is remembered.

### Grounders that get through
- After a ground ball, a dashed ring marks where the infielder tried for it. **Drag from the ring to where the ball rolled**: the infielder dives, gets up and goes to their job, and everyone plays it as a ball that got through.
- Choosing **Single**, **Double** or **Triple** on a grounder at an infielder now does the same on the ball's line. It used to be ignored.

### How a coach runs it (from a coach's-eye review)
- **Ask first**: stops at the hit with the paths hidden, so a coach can ask "where do you go?" before anything moves. Press Play to show the answer. Key: A.
- **Tapping the field no longer throws away a paused play.** A tap only hits the ball on an empty field.
- **Changing runners or outs re-runs the same hit**, so you can flip between variations.
- **The situation is on the field** (outs, runners, a lefty batting), including in projector mode, and a play from the list keeps its name as the title.
- **Next ›** on screen in projector mode.
- Wording: "Let the app decide" → "Normal play"; "No hit — other plays" → "Steals, passed balls & pickoffs". The secondary lead is hidden in softball.

### Fixes from the guides review
- **1st & 3rd with two outs**: the note said a tag at 2nd always beats the run. It doesn't; the run counts if it scores before the tag. Fixed.
- **Infield fly** note now covers ordinary effort, caught or not, and when runners must tag.
- **Bases-loaded bunt**: one player covers 3rd (the shortstop; the third baseman reads the bunt), the catcher steps on home, then throws to 1st, and the note matches the play.
- The guides were corrected throughout, and every guide play now opens on the baseball field it was written for.

---

## [2026-09-24] v0.7.0 — Adversarial review fixes

Two independent reviews ran the engine through about 1,000 situations: a professional baseball defensive coordinator and a fastpitch softball coach. Both called it not production-ready. This release fixes every critical and major finding, and the minor ones, each with a regression test (`tests/review.test.js`). The reports are kept in the private notes.

### Safety
- **Nobody runs or stands in the batter-runner's lane.** Covering 1st, the pitcher, or anyone else, gets to the line a few steps short and runs up the *inside* (fair side), taking the inside of the bag. On bunts, the first and third basemen charge on the fair side of their lines.
- **Nobody parks on a base path.** The cutoff to 3rd stands 25–40 ft from the base, clear of the path the runner is rounding. On pickoffs the second baseman stays at their depth, off the 1st–2nd line.
- **Home plate tag plays**: set up in front of the plate, leave the runner a path to the back of it, and sweep the tag. No blocking the plate (Little League collision rules). A force at home still stands on the plate.
- **On the 1st & 3rd cut play**, the pitcher circles around the 1st-base side to back up home, and never crosses the plate.
- **On a pop in front of the plate**, the pitcher steps aside instead of running through the catcher.

### Fielding
- **Pop-up priority by direction**, not a flat list. The corners take pops in front of them; the shortstop and second baseman take pops behind the corners (the shortstop when it's close); the catcher takes pops near the plate; an outfielder coming in beats an infielder going out; the pitcher never takes one. **Line drives** go to whoever is in the ball's path, runners freeze, and the throw goes behind the lead runner.
- **Bunts**: the shortstop covers 2nd on every bunt (it was being left open). The catcher covers 3rd when the third baseman charges with a runner on 1st. Bases loaded with less than two outs: the force at home.
- **Outfield backups**: on a ball to center, only the near corner backs up; the far corner backs up a base instead of running across the outfield. No two fielders ever end on the same spot.
- **Foul flies**: out of play means out of play (no catches beyond the fence or behind the backstop). A deep foul fly with a runner on 3rd allows a tag-up, with a note about letting it drop late in a close game.
- **Two outs**: everybody runs on contact. **1st & 3rd with two outs**: throw through to 2nd.
- The **infield fly rule** is explained when it applies. With a runner on 2nd, the shortstop covers 3rd when the third baseman fields a grounder. The home cutoff distance scales with the field.

### Safe or out, by the clock
- Plays were being decided by rule of thumb: every steal was an out, and runners were held on almost every single. Now every runner's arrival is timed against the ball's, with youth-realistic speeds: throws that lose speed past about 90 ft, an outfielder setting their feet, a cutoff catching and turning, and runners who are faster once they're rounding a base. **Force outs need the catch; tag plays also need the tag.** A runner is held only when the throw would clearly beat them. There are **"Safe!"** calls now, and runners are resolved lead runner first, so a trailing runner never passes the one ahead.
- A runner on 2nd scores on a clean single, a deep fly with a runner on 3rd scores, and a triple is a triple.

### Softball
- **Runners leave on the pitcher's release**, both on steals and on balls in play.
- **Softball positions**: the corners play even with the bag and come in to 30–40 ft with a runner on 1st (bunt and slap threat), the second baseman shades toward 1st, and outfielders play shallower.
- **The second baseman covers 1st** when the first baseman fields the ball.
- **The look-back rule** is built around the lead runner, and the pitcher *holds* the ball; a throw releases the look-back.
- **A 10U field** (35 ft pitching distance). The leadoffs setting is hidden for softball, and job text says "circle", not "mound".

### App
- A **color key on the field**: in the corner in side-by-side layouts, and as a strip between the field and the timeline in portrait on a phone.
- The **timeline thumb is a fader**: a rectangular cap with grip ridges.
- The **favicon** is always the navy icon.

### Docs and guides
- `docs/SCENARIOS.md` is rewritten to match, with new sections on safe/out timing and softball. The pop-up, bunt, steal, pitcher and cutoff guides are corrected; one new play was added to the pop-up guide.

---

## [2026-09-24] v0.6.1 — The timeline slider works

- **Fix:** dragging the timeline slider did nothing; the thumb snapped back on every move. Its handler paused the play *before* reading the slider, and pausing redraws the slider at the old time. It has been broken since v0.1 and was found testing in Helium and on iPhone. A new test drags the slider itself.

---

## [2026-09-24] v0.6.0 — Scrub through a play

- **Drag on the field to scrub.** Drag left or right anywhere on the field, except from home plate, and the play moves back and forth under your finger: the width of the field is the whole play. Press and hold also works, and shows the scrub bar before you move. A drag from home plate still hits the ball, and a tap still hits it where you tap.
- **A timeline slider you can grab**: bigger thumb and track, and it fills as the play runs.
- **Arrow keys** step through a play a quarter second at a time. Shift+arrows (or `N`) move between library plays.

---

## [2026-09-24] v0.5.2 — A way back to the website

- The **logo in the app's header** now goes back to the Simple Fielding homepage, which is where people reach for it. Settings also has a "Back to the Simple Fielding website" link. Both are hidden when the app runs inside the native shells, where there's no website to go back to.

---

## [2026-09-24] Website — the hero plays the play

- **The homepage hero is now animated**: the single to left field plays out (the ball, the left fielder, the cutoff, the covers and backups), holds on the final positions, and loops.
- **Baked at build time, not the live app.** `scripts/render-hero-anim.mjs` runs the app's engine once and converts the play's timeline into CSS keyframes. The homepage loads no JavaScript for it; the markup is about 7 KB gzipped, crisp at any size, and inlined, because Chromium doesn't run animations inside an SVG loaded with `<img>`.
- Holds still for visitors with "reduce motion" turned on. Clicking it opens the app.
- Replaces the still image and its script.

---

## [2026-09-24] v0.5.1 — A gear for Settings

### Fix
- The Settings button's icon looked like a sun. It's now a gear: Lucide's "settings" icon (ISC License, credited in the README).

---

## [2026-09-24] v0.5.0 — Softball field, cleaner backups, and a truthful hero

### App
- **Baseball / Softball switch** on the Situation card. Softball now draws as a softball field: an all-dirt infield, an 8 ft chalked pitching circle with a flat rubber, and no mound. Switching back to Baseball returns to whichever baseball field you used last (60 ft or 50/70).
- **Outfield backups no longer stack.** An outfielder backing up another now stands behind and off to their own side, so two backups never share a spot. Near the fence, they back up from the side. This was found in the first tester report's log.
- **The far outfielder backs up 2nd from the grass** (shallow right-center or left-center), not from the infield dirt by 1st.
- **On bunts**, the outfielders back up bases (center fielder behind 2nd, left fielder behind 3rd) instead of running in toward the plate.

### Website
- **Hero image rendered from the app** (`scripts/render-hero.mjs`): the real field and engine at the end of a simple play, a single to left with nobody on. It replaces the hand-drawn picture, whose infield was the wrong shape.
- **Same fonts as Simple Pitch Counter's site**: DM Serif Display for headings, DM Sans for body text, the gold uppercase label, and an italic accent line in the headline. Share images re-rendered to match.

### Tests
- New engine tests: outfield backups never stand on the fielder or each other, and outfielders backing up 2nd stay on the grass. 44 data and engine tests; 38 UI runs.

---

## [2026-09-24] Website — simplefielding.com, guides, search

### Website
- **Hosted at simplefielding.com** (self-hosted), with the site at the root and the app at `/app/`. `scripts/deploy-nas.sh` publishes it. GitHub Pages keeps a copy for now.
- **Seven guides** at `/articles/`: cutoffs and relays, who covers 2nd on a steal, bunt defense, backing up bases, pop-up priority, a 30-minute practice plan, and the pitcher's defensive jobs (which links to Simple Pitch Counter). Each has **Watch this play** buttons that open the exact play in the app.
- **Checked against the engine.** `scripts/build-site.mjs` runs every play in every guide through the play engine and fails if the app doesn't do what the article says. CI runs it on every push.
- **Search:** `sitemap.xml`, `robots.txt`, canonical URLs, page titles and descriptions, Open Graph share images (1200×630, one per guide), and structured data (WebApplication, Article, BreadcrumbList, FAQPage). Clean URLs (`/privacy/`, `/articles/<slug>/`); the old `privacy.html` redirects.
- Homepage: a guides section, a Guides link in the header, and "coming soon" to the App Store and Google Play.

---

## [2026-09-23] v0.4.2 — The field stays put

### Layout
- **The field never scrolls away.** On phones and portrait iPads, the header, the field and the Play/Reset bar stay fixed on screen, and only the controls below them scroll. The field is sized to the screen: up to about half the height when stacked, and all of the left side when side by side.
- **Phones turned sideways** get the side-by-side layout (field left, controls right) instead of a thin strip of field.
- Running a play from the library or the "other plays" buttons scrolls the controls to the play's write-up. Tapping a player scrolls the job list to their job. The field doesn't move either way.

---

## [2026-09-23] v0.4.1 — American English

### Fix
- The play library said "Plays to practise". It's an American app: now "Plays to practice". The same sweep fixed "colour", "defence", "centre", "programmes" and "grey" across the app, the website, the coaching reference and the docs.

---

## [2026-09-23] v0.4.0 — Tester reports and a play log

### For testing
- **Play log.** Every play the app runs is recorded on the device (the last 50): version, field, situation, the exact input (hit type, drop point in feet, forced result), who fielded it, where the throw went, every job, and what each runner did (held, out). Positions only, never player names.
- **Replay links.** Each play has a code, and `…/app/#replay=r1…` reopens exactly that play. The engine is deterministic, so a replay is identical.
- **Tester mode** (tap the version number in Settings five times, or open `…/app/#tester=<address>`). It adds a red **Report** button next to Reset, or press `F`. Write what should have happened, tag the players involved, and send. The report and the play's log go to a Google Sheet through a small Apps Script (`tools/feedback-apps-script.gs`). With no address set, the report is copied instead.
- The Sheet address is stored on the tester's device only and never committed to the repo.

### Tests
- 5 play-log tests: replay codes round-trip, a replay gives the identical play, bad codes are ignored, the log keeps 50. 42 data and engine tests in all.
- 3 UI tests: tester mode unlock, a report posted to a stand-in endpoint with the right contents, replay links. 38 UI runs.

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
- **Pen** and **Arrow:** freehand chalk, and arrows that follow the curve you draw. Five colors and an eraser.
- **Apple Pencil and styluses:** the Pencil always draws and a finger always moves, so there's no tool switching. Pressure sets the line width. Touches are ignored while the Pencil is down, for palm rejection. Coalesced pointer events keep strokes smooth.
- **Undo / redo** (also Ctrl/⌘+Z), **Clear** the drawing, **Reset** everyone to where they started.
- The drawing stays on top of the play after **Done**, so you can replay the animation under it, until the next play runs.
- Keyboard: `W` whiteboard, `M` move, `D` pen, `A` arrow, `E` eraser.

### Look
- Matches Simple Pitch Counter: its navy header, iOS system colors (blue, green, amber, purple, red), 12 and 18 px corner radii, and the system font. The app is light-only, like Simple Pitch Counter.
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
- A job list in plain words for all nine positions, color-coded by role. Tap a player or a job to spotlight it.
- A play library with 45 plays in 8 groups; `N` or → moves to the next.
- Fields: Little League baseball 60 ft (no leadoffs), 50/70 (leadoffs), fastpitch softball. A leadoff setting.
- Projector mode, keyboard shortcuts, light and dark panels, and an installable web app manifest.

### Website
- Landing page, privacy page, support section.

### Engineering
- 22 engine tests (`node:test`) and 9 Playwright UI tests at iPad and phone sizes.
- CI: personal-data check, engine tests, and UI tests on every push. Deploys to GitHub Pages from `main`.
