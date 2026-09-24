# Defensive scenarios — the coaching reference

This is what Simple Fielding teaches, written out so a coach can check it and argue with a specific line.
The app doesn't look these plays up in a table. Its engine (`app/js/engine.js`) derives each one from
the principles below. `tests/engine.test.js` holds the engine to what is written here.

Coaching sources disagree on details. Where they do, the app uses the **simplest convention common in
youth leagues**, and says so. If your team does it differently, that's fine — teach your way; the rest
of the chart still holds.

Positions: **P** pitcher · **C** catcher · **1B** first base · **2B** second base · **SS** shortstop ·
**3B** third base · **LF** left field · **CF** center field · **RF** right field.

---

## The five principles

1. **Somebody gets the ball.** Whoever is closest, with priority rules:
   - fly balls: **center fielder** over the corner outfielders; **outfielders coming in** over infielders going out;
   - pop-ups in the infield: priority depends on **direction**. The player coming toward the ball beats the player
     going away from it: the corners own pops in front of them, the shortstop and second baseman own pops behind the
     corners (the shortstop when it's close between them), the catcher owns pops near the plate, and an outfielder
     coming in beats an infielder going out. **The pitcher doesn't take a pop-up unless nobody else can get
     there** — they point and yell, and let a fielder catch it;
   - line drives: whoever is in the ball's path;
   - bunts: corners come in along the lines, the pitcher takes the middle, the catcher takes anything right in front of the plate.
2. **The throw goes where the lead runner is trying to go.** With a runner on 2nd, a single is thrown home.
   With a runner on 1st, it's thrown to 3rd. With nobody on, it goes to 2nd to keep the batter at 1st.
3. **Every base that might get a play has somebody on it.** When the usual fielder is busy, a substitute takes it:
   2B covers 1st when 1B is the cutoff; SS covers 3rd when 3B is the cutoff; **P covers home** when C leaves it.
   Nobody covering a base runs through the runner's lane or stands on a base path: covering 1st, come up the
   **inside** (fair side) of the line and take the inside of the bag. At home on a tag play, set up **in front of the
   plate** and leave the runner a path to the back of it; catch, then sweep the tag down.
4. **A long throw has a middle man.** On a single, one **cutoff**, lined up between the ball and the base.
   On an extra-base hit, a **relay** goes out toward the ball with a **trailer** about 15 feet behind them.
5. **Every throw is backed up.** Somebody stands beyond the base, in line with the throw. Everybody left over
   backs up the ball.

---

## 1. Ground balls in the infield

| Situation | Throw | Who covers | Backups |
|---|---|---|---|
| Nobody on | 1st | 1B at the bag. Ball to the left side → 2B covers 2nd; right side → SS covers 2nd | C runs down the line to back up 1st. RF backs up 1st. LF and CF back up the fielder. |
| **Ball to the right side** (1B fields it) | 1st | **P runs to 1st**: to the baseline a few steps short of the bag, up the *inside* of the line, and takes the throw on the inside of the bag. If 1B can beat the runner to the bag, 1B takes it unassisted and waves the pitcher off. *(Softball: many teams have 2B cover 1st whenever 1B leaves it, and P backs it up; the app does that for softball. Many softball leagues use a double (safety) first base: the fielder uses the white half, the runner the colored half.)* | C, RF back up 1st |
| Runner on 1st, < 2 outs | 2nd, then 1st (double play) | Ball to SS/3B → **2B covers 2nd**. Ball to 2B/1B → **SS covers 2nd**. Comebacker → SS | CF backs up 2nd, RF backs up 1st |
| Runners on 1st & 2nd, < 2 outs | 3B steps on 3rd if 3B fields it; otherwise 2nd, then 1st | as above | LF backs up 3rd |
| Bases loaded, < 2 outs | **Home** (C steps on the plate), then 1st | C at home | P backs up home |
| Runner on 2nd or 3rd, no force | **Look the runner back**, then 1st | C stays home | |
| Runners on 1st & 3rd, < 2 outs | 2nd, then 1st | | Note: the run may score — trading a run for two outs is often right early in a game. Ask your coach. |
| **Two outs** | The **easiest out**: the forced base closest to the fielder | | Everybody runs on contact, forced or not |
| Ball to 3B with a runner on 2nd | 1st | **SS covers 3rd** behind the third baseman | |

## 2. Singles to the outfield

| Runners | Throw to | Cutoff | Covers | Backups |
|---|---|---|---|---|
| Nobody on | 2nd | **SS** on a ball to the left side, **2B** on the right | The other middle infielder covers 2nd; 3B at 3rd; 1B makes sure the batter touches 1st, then covers it | **P backs up 2nd**; C backs up 1st; nearest outfielder backs up the fielder; the far corner outfielder backs up 2nd |
| Runner on 1st | 3rd | **SS** from any field | 2B covers 2nd, 3B covers 3rd, 1B covers 1st, C home | **P backs up 3rd** (foul territory, in line with the throw); LF backs up 3rd on a ball to center or right |
| Runner on 2nd (or 1st & 2nd) | Home | **3B** from left field (SS covers 3rd); **1B** from center or right (2B covers 1st, SS covers 2nd) | C at home — the catcher calls "Cut!" or lets it through | **P backs up home**, behind the catcher |
| Runner on 3rd only | 2nd | as for nobody on | | The run scores easily; keep the batter at 1st |

The youth convention used here is that 1B cuts off throws home from center and right, and 3B from left.
Some programs use the pitcher as the cutoff instead. The app doesn't, because at this age the pitcher
backing up home stops more runs.

## 3. Doubles and triples — relays

| Hit | Relay | Trailer | Other jobs |
|---|---|---|---|
| Down the left-field line or into the left-center gap | **SS** | **2B**, about 15 ft behind | 3B covers 3rd; 1B follows the batter and covers 2nd; P backs up 3rd; C home |
| Down the right-field line or into the right-center gap | **2B** | **SS** | same |
| **Runner on 1st** (the runner is trying to score) | as above, lined up with home | | **1B is the cutoff in front of the plate**; P goes halfway between 3rd and home, reads the throw, and backs up that base |

## 4. Fly balls to the outfield

- **Call it** — "I got it! I got it!" — and everyone else stops calling.
- Nobody on: catch, throw to the cutoff at 2nd.
- **Runner on 3rd, < 2 outs, deep fly**: the runner **tags up**. Throw home with the cutoff (3B from left, 1B from
  center and right). P backs up home.
- **Runner on 2nd, deep fly to center or right**: the runner tags for 3rd. Throw to 3rd; SS is the cutoff.
- **Two outs**: the catch ends the inning. Runners run on contact.

## 5. Pop-ups and line drives in the infield

Priority depends on direction, not a fixed list:

- **In front of the corners** (and on the mound): the first or third baseman, coming in. The pitcher points and calls it.
- **Behind the corners, going away** from the plate: the shortstop or second baseman. When it's close between them, the shortstop.
- **Near the plate**: the catcher, behind and beside the plate; the corners up the lines.
- **Shallow outfield**: an outfielder coming in beats an infielder going out; the center fielder beats the corners.

Everybody else covers a base. The nearest outfielder backs up an infielder going out, if they're close enough to matter.
When the catcher takes a pop **behind or beside** the plate, the pitcher covers home; on a pop **in front** of the
plate, the pitcher just steps out of the way.

**Infield fly rule:** with runners on 1st and 2nd (or the bases loaded) and fewer than two outs, the batter is out on a
fair fly ball (not a line drive or a bunt) that an infielder can catch with ordinary effort, whether or not it's caught.
Runners may advance at their own risk: if the ball is caught, they must tag up; if it drops, they don't have to.

**Line drives** belong to whoever is in the ball's path. Runners freeze; if one is caught off the base, throw to the base
they left.

## 6. Foul balls

| Ball | Fielder | Other jobs |
|---|---|---|
| Pop-up behind or beside the plate | **C** — off with the mask, find the ball, toss the mask away from where you're going, turn your back to the field | **P covers home** |
| Pop-up near the 1st-base line | **1B** (C helps call it) | 2B covers 1st; P covers home |
| Pop-up near the 3rd-base line | **3B** (C helps call it) | SS covers 3rd; P covers home |
| Deep, down the lines | LF or RF | watch the fence; with a runner on 3rd and less than two outs, the runner can tag and score, so late in a close game it's often smart to let it drop |
| Over the fence or behind the backstop | nobody | out of play: a dead ball |
| Ground ball rolling foul | Let it roll — touching it in fair territory makes it fair | Everybody back to their spot |

A caught foul ball is an out, and runners can tag up.

## 7. Bunts

| Runners | Fielders | Covers | Throw |
|---|---|---|---|
| Nobody on | 1B and 3B start in when the bat drops into bunting position — under control, glove up, ready if the batter pulls back and swings (younger players wait until the ball is on the ground) — staying on the fair side of their lines; P comes off the mound (the circle, in softball); C takes anything in front of the plate | **2B covers 1st**; SS covers 2nd | 1st — take the sure out |
| Runner on 1st | same | 2B covers 1st, SS covers 2nd | 1st (youth: the sure out) |
| Runner on 2nd | 3B decides whether to charge | **SS covers 3rd**, 2B covers 1st (with runners on 1st & 2nd, 2nd is open — take the sure out) | 1st |
| Bases loaded, < 2 outs | whoever fields it close to the plate | C on the plate | **Force at home**, then 1st |
| Runner on 1st, 3B fields it | 3B | **C covers 3rd** so the runner can't round 2nd into an empty base | 1st |

The corner who doesn't field the bunt gets out of the way: 3B hustles back to 3rd; 1B peels off to the inside, out
of the runner's lane — 2B has 1st. A bunt back to the pitcher goes to 1st, while a comebacker with a runner on 1st
goes to 2nd: a hard-hit ball gets there in time to beat the lead runner, a slow bunt doesn't. With a runner on 2nd,
looking the runner back costs time, and a slow bunt is often a close play at 1st.

Slap defense (SS and 3B splitting the hole, 3B stopping her charge when the batter shows slap) is its own topic,
not covered yet.

## 8. Steals

| Play | Throw | Covers | Backups |
|---|---|---|---|
| Steal of 2nd — **right-handed batter** | C to 2nd | **2B covers** | SS backs up behind the bag; CF charges in; P gets out of the throwing lane |
| Steal of 2nd — **left-handed batter** | C to 2nd | **SS covers** | 2B backs up; CF charges in |
| Steal of 3rd | C to 3rd | 3B covers | LF charges in; SS covers 2nd |
| **1st & 3rd double steal** (cut play) | C throws toward 2nd | **2B cuts in front of the bag**; SS covers 2nd; 3B yells "Four!" if the runner breaks home | P backs up home; CF backs up 2nd |

Who covers 2nd: batters usually pull the ball, so the fielder on the pull side stays put. Righty → 2B covers;
lefty → SS covers. *(Softball: the pull logic flips for a left-handed slapper, who hits to the left side. Most fastpitch
teams keep the shortstop covering 2nd and the second baseman owning 1st, or make a call before every pitch.)*

With **two outs** on 1st & 3rd, many teams throw through to 2nd. It's a tag play, not a force: if the tag beats the
runner from 3rd to the plate, the inning is over and the run doesn't count; if that runner scores first, the run
counts. So the throw has to be quick.

1st & 3rd is where teams differ most: throw through, fake to 3rd, throw back to the pitcher, or hold the
ball. The app shows the cut play.

## 9. Passed balls and wild pitches

- **C** turns, sprints to the ball, and yells where it is.
- **P sprints to cover home** — always, with a runner on 3rd — points to the ball, and yells "Here!" Set up in front
  of the plate, leave the runner the back of it, and sweep the tag.
- Throw to the base the lead runner is heading for. Everybody else covers their base.
- *Softball:* the pitcher is close enough to beat the runner home, so she sprints on the miss, not on the catcher's yell.

## 10. Leads and pickoffs

**Where leads are allowed.** Little League baseball on a 60 ft field does not allow leadoffs: a runner can't
leave the base until the pitch reaches the batter. 50/70, older divisions and many travel organizations allow
leadoffs. Softball runners can leave when the pitcher releases the ball; fastpitch pitchers don't make pickoff throws,
but the catcher back-picks a runner who wanders. Many 10U softball leagues limit stealing (for example, no stealing
home, or one base on a passed ball). The app has a setting for this, and it changes when runners start to move.

| Play | What happens | Jobs |
|---|---|---|
| **Primary lead** (baseball, leadoffs on) | The runner takes a lead before the pitch; the pitcher, from the stretch, throws over | **1B holds the runner** at the bag; 2B cheats toward 1st; RF charges in to back up the pickoff |
| **Secondary lead** | The runner shuffles off as the pitch is thrown; the catcher back-picks to 1st | 1B sneaks back to the bag after the pitch; RF and 2B back up; P steps out of the lane |
| **Softball look-back rule** | Once the pitcher has the ball in the circle, a runner off the base must immediately go back or try for the next base. Stopping or changing direction can be an out; the exact rule varies by league, so check yours | P faces the lead runner and **holds the ball** (a throw releases the look-back) — throw only if she's caught hanging; the base she's off is covered |

---

## Safe or out: the clock decides

The app doesn't decide plays by rule of thumb. Every runner's arrival is timed against the ball's: youth-realistic
running speeds (faster once a runner is rounding a base), throws that lose speed past about 90 feet, and a moment to
set the feet before a throw from the outfield. A **force out** needs only the catch on the bag; a **tag play** also needs
the tag. A runner on a hit is **held** at the last base when the throw would clearly beat them, the way a base coach
would stop them; otherwise they go, and the play is called safe or out. Runners committed on a steal or a passed ball
can't be held.

## Higher levels (13U–14U, high school, college, pro)

The same principles, on a 90 ft field, with each level's own speed of play:

| | 13U–14U | High school | College | Pro |
|---|---|---|---|---|
| Home to 1st | 4.9 s | 4.6 s | 4.45 s | 4.3 s |
| Shortstop's arm | 68 mph | 77 mph | 83 mph | 86 mph |
| Pitcher to the plate + catcher's pop time | 1.60 + 2.35 s | 1.50 + 2.15 s | 1.40 + 2.05 s | 1.35 + 2.00 s |
| Middle infielders (depth from home) | 130 ft | 134 ft | 140 ft | 147 ft |
| Center fielder | 262 ft | 285 ft | 305 ft | 320 ft |

- **Cutoff home**: the third baseman from left, the first baseman from center and right, about 45 ft in front of the
  plate (40 at 13U–14U). The catcher calls it; a good throw goes through.
- **Tandem relay** on balls in a gap or down a line: the relay goes out far enough that their own throw can reach the
  base, and the trailer follows 20–25 ft behind.
- **Double-play depth** with a runner on 1st and less than two outs.
- Not yet: infield in, the wheel play and 1B crash, pickoffs at 2nd, 1st-and-3rd variations, and the batter taking 2nd
  on a throw home ("Cut 2").

Numbers are from Statcast and scouting norms at pro. High school and college are estimates; the full sources are in
the project notes.


## Softball levels (8U through pro)

| | 8U | 14U | High school · 16U–18U | College | Pro / international |
|---|---|---|---|---|---|
| Pitching | a coach (or machine) from 35 ft | 43 ft | 43 ft | 43 ft | 43 ft |
| Home to 1st (right-handed / slapper) | about 4.3 s | 3.3 / 3.1 s | 3.15 / 2.9 s | 3.05 / 2.8 s | 2.95 / 2.65 s |
| Catcher's pop time to 2nd | no steals | 2.25 s | 2.15 s | 1.95 s | 1.85 s |
| Fences (lines / center) | 150 | 200 / 210 | 200 / 220 | 200 / 220 | 210 / 225 |

- **8U:** a coach pitches, and the player "pitcher" fields from beside the circle. Runners leave on contact: no leads,
  no steals. Many leagues stop play once the ball is back in the circle.
- **Runners leave on the pitcher's release** from 10U up, so they're already off the base when the ball is hit.
- **The shortstop covers 2nd on steals** at every softball level (the second baseman owns 1st on bunts and slaps). Some
  teams use the baseball pull rule instead.
- **Slappers:** with a slapper up, the corners come in (charge the bunt, read the slap), the shortstop shades to the
  hole, the second baseman shades toward 1st to cover it, and the outfield comes in a few steps. A routine grounder to
  short is an out from 14U up, and a slapper beats it.
- **No pitcher pickoffs** in softball: the catcher's back-pick and the look-back rule take their place.
- **Cutoff home:** about 30 ft in front of the plate.
- Not yet: look-back variations, the delayed steal, the dropped third strike, and bunt defenses with runners on 1st and
  2nd (standard and rotation).

## Softball

Fastpitch uses the same principles with its own conventions:

- **Runners leave on the pitcher's release** (no leadoffs, but a rolling start), so they're already moving when the
  ball is hit, and steals are often safe at 10U–12U.
- **The corners play even with the bag or in front of it**, and come in to 30–40 feet from the plate with a runner on
  1st and less than two outs (bunt and slap threat). The second baseman shades toward 1st.
- **Outfielders play shallower** (about two thirds of the way to the fence).
- **The second baseman covers 1st** when the first baseman fields the ball. Many leagues use a double (safety)
  first base: the fielder uses the white half, the runner the colored half.
- **The look-back rule** replaces pickoffs from a lead.
- **Fields:** 12U (40 ft pitching distance, 200 ft fence) and 10U (35 ft, 175 ft).

## Not yet in the app

Slap-hitting defense (the left-side box, the running slap, slap alignment), rundowns (pickles), infield-in
positioning, and bunt defenses beyond the basic one (the wheel play, for
example). A quiz mode ("Where does the shortstop go?") and a coach's play-drawing tool are planned.
