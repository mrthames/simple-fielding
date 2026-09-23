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
   - pop-ups in the infield: **middle infielders** (SS, 2B) over the corners (3B, 1B); corners over the catcher
     away from the plate; **the pitcher never takes a pop-up** — they point and yell, and let a fielder catch it;
   - bunts: corners charge the lines, the pitcher takes the middle, the catcher takes anything right in front of the plate.
2. **The throw goes where the lead runner is trying to go.** With a runner on 2nd, a single is thrown home.
   With a runner on 1st, it's thrown to 3rd. With nobody on, it goes to 2nd to keep the batter at 1st.
3. **Every base that might get a play has somebody on it.** When the usual fielder is busy, a substitute takes it:
   2B covers 1st when 1B is the cutoff; SS covers 3rd when 3B is the cutoff; **P covers home** when C leaves it.
4. **A long throw has a middle man.** On a single, one **cutoff**, lined up between the ball and the base.
   On an extra-base hit, a **relay** goes out toward the ball with a **trailer** about 15 feet behind them.
5. **Every throw is backed up.** Somebody stands beyond the base, in line with the throw. Everybody left over
   backs up the ball.

---

## 1. Ground balls in the infield

| Situation | Throw | Who covers | Backups |
|---|---|---|---|
| Nobody on | 1st | 1B at the bag. Ball to the left side → 2B covers 2nd; right side → SS covers 2nd | C runs down the line to back up 1st. RF backs up 1st. LF and CF back up the fielder. |
| **Ball to the right side** (1B fields it) | 1st | **P runs to 1st**: to the line, then up it, and takes the throw on the bag | C, RF back up 1st |
| Runner on 1st, < 2 outs | 2nd, then 1st (double play) | Ball to SS/3B → **2B covers 2nd**. Ball to 2B/1B → **SS covers 2nd**. Comebacker → SS | CF backs up 2nd, RF backs up 1st |
| Runners on 1st & 2nd, < 2 outs | 3B steps on 3rd if 3B fields it; otherwise 2nd, then 1st | as above | LF backs up 3rd |
| Bases loaded, < 2 outs | **Home** (C steps on the plate), then 1st | C at home | P backs up home |
| Runner on 2nd or 3rd, no force | **Look the runner back**, then 1st | C stays home | |
| Runners on 1st & 3rd, < 2 outs | 2nd, then 1st | | Note: the run may score — trading a run for two outs is often right early in a game. Ask your coach. |
| **Two outs** | The **easiest out**: the forced base closest to the fielder | | Everybody runs on contact |

## 2. Singles to the outfield

| Runners | Throw to | Cutoff | Covers | Backups |
|---|---|---|---|---|
| Nobody on | 2nd | **SS** on a ball to the left side, **2B** on the right | The other middle infielder covers 2nd; 3B at 3rd; 1B makes sure the batter touches 1st, then covers it | **P backs up 2nd**; C backs up 1st; nearest outfielder backs up the fielder; the far corner outfielder backs up 2nd |
| Runner on 1st | 3rd | **SS** from any field | 2B covers 2nd, 3B covers 3rd, 1B covers 1st, C home | **P backs up 3rd** (foul territory, in line with the throw); LF backs up 3rd on a ball to center or right |
| Runner on 2nd (or 1st & 2nd) | Home | **3B** from left field (SS covers 3rd); **1B** from center or right (2B covers 1st, SS covers 2nd) | C at home — the catcher calls "Cut!" or lets it through | **P backs up home**, behind the catcher |
| Runner on 3rd only | 2nd | as for nobody on | | The run scores easily; keep the batter at 1st |

The youth convention used here is that 1B cuts off throws home from center and right, and 3B from left.
Some programmes use the pitcher as the cutoff instead. The app doesn't, because at this age the pitcher
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

## 5. Pop-ups in the infield

Priority: outfielders coming in > SS > 2B > 3B > 1B > C. The pitcher points and yells but doesn't catch it.
Everybody else covers a base. The nearest outfielder comes in behind the infielder and calls them off if
it's an easy catch.

## 6. Foul balls

| Ball | Fielder | Other jobs |
|---|---|---|
| Pop-up behind or beside the plate | **C** — off with the mask, find the ball, toss the mask away from where you're going, turn your back to the field | **P covers home** |
| Pop-up near the 1st-base line | **1B** (C helps call it) | 2B covers 1st; P covers home |
| Pop-up near the 3rd-base line | **3B** (C helps call it) | SS covers 3rd; P covers home |
| Deep, down the lines | LF or RF | watch the fence |
| Ground ball rolling foul | Let it roll — touching it in fair territory makes it fair | Everybody back to their spot |

A caught foul ball is an out, and runners can tag up.

## 7. Bunts

| Runners | Fielders | Covers | Throw |
|---|---|---|---|
| Nobody on | 1B and 3B charge; P comes off the mound; C takes anything in front of the plate | **2B covers 1st**; SS covers 2nd | 1st — take the sure out |
| Runner on 1st | same | 2B covers 1st, SS covers 2nd | 1st (youth: the sure out) |
| Runner on 2nd | 3B decides whether to charge | **SS covers 3rd**, 2B covers 1st | 1st |
| Bases loaded, catcher fields it | C | | Step on home, then throw to 1st |

## 8. Steals

| Play | Throw | Covers | Backups |
|---|---|---|---|
| Steal of 2nd — **right-handed batter** | C to 2nd | **2B covers** | SS backs up behind the bag; CF charges in; P gets out of the throwing lane |
| Steal of 2nd — **left-handed batter** | C to 2nd | **SS covers** | 2B backs up; CF charges in |
| Steal of 3rd | C to 3rd | 3B covers | LF charges in; SS covers 2nd |
| **1st & 3rd double steal** (cut play) | C throws toward 2nd | **2B cuts in front of the bag**; SS covers 2nd; 3B yells "Four!" if the runner breaks home | P backs up home; CF backs up 2nd |

Who covers 2nd: batters usually pull the ball, so the fielder on the pull side stays put. Righty → 2B covers;
lefty → SS covers.

1st & 3rd is where teams differ most: throw through, fake to 3rd, throw back to the pitcher, or hold the
ball. The app shows the cut play.

## 9. Passed balls and wild pitches

- **C** turns, sprints to the ball, and yells where it is.
- **P sprints to cover home** — always, with a runner on 3rd — points to the ball, and yells "Here!"
- Throw to the base the lead runner is heading for. Everybody else covers their base.

## 10. Leads and pickoffs

**Where leads are allowed.** Little League baseball on a 60 ft field does not allow leadoffs: a runner can't
leave the base until the pitch reaches the batter. 50/70, travel ball and older divisions allow leadoffs.
Softball runners can leave when the pitcher releases the ball. The app has a setting for this, and it changes
when runners start to move.

| Play | What happens | Jobs |
|---|---|---|
| **Primary lead** (baseball, leadoffs on) | The runner takes a lead before the pitch; the pitcher, from the stretch, throws over | **1B holds the runner** at the bag; 2B cheats toward 1st; RF charges in to back up the pickoff |
| **Secondary lead** | The runner shuffles off as the pitch is thrown; the catcher back-picks to 1st | 1B sneaks back to the bag after the pitch; RF and 2B back up; P steps out of the lane |
| **Softball look-back rule** | Once the pitcher has the ball in the circle, a runner off the base must go back or advance immediately | P faces the runner and runs at them if they hesitate; 1B gets back to the bag; RF backs up |

---

## Not yet in the app

Rundowns (pickles), infield-in positioning, and bunt defences beyond the basic one (the wheel play, for
example). A quiz mode ("Where does the shortstop go?") and a coach's play-drawing tool are planned.
