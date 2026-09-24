/*
 * The fielding trainer: courses, lessons, and how an answer is graded.
 *
 * Baseball and softball are separate tracks. Each is a ladder of stages a player climbs as they move up, from their
 * first season to 13U/14U and beyond; each stage plays on one of the app's levels (a league key from field.js) and
 * has a few lessons. The order and the coaching words follow the published youth programs: Little League's tee-ball
 * and coaching curriculum (ready position, "alligator" hands, "Ball, Base, Backup", call it), Little League
 * Softball, and the Positive Coaching Alliance's approach to feedback. One idea per lesson, a few plays each.
 *
 * A lesson is a short read (intro), then steps:
 *   { type: 'play', scenario: 'name', pos }       a play from the library (scenarios.js) as a given position: it
 *                                                  starts, freezes at the decision, and the learner drags their
 *                                                  player the way they'd go, or taps "Stay here"
 *   { type: 'play', runners, outs, event, pos }    the same, spelled out
 *   { type: 'choice', q, options: [{ t, right, why }], pos? }   a question with one right answer
 * Lessons list the positions they're for (positions), so a learner can pick "shortstop" and see what matters to them.
 */
(function (root) {
  'use strict';

  const ALL = ['all'];
  const IF = ['P', 'C', '1B', '2B', 'SS', '3B'], OF = ['LF', 'CF', 'RF'];
  const play = (scenario, pos, extra) => Object.assign({ type: 'play', scenario, pos }, extra || {});
  const q = (text, options, pos) => ({ type: 'choice', q: text, options, pos });
  const right = (t, why) => ({ t, right: true, why });
  const wrong = (t, why) => ({ t, why });

  // Talking on defense: the same habits at every age, said the way that age says them.
  const talk = (id, older) => ({
    id, title: 'Talk on defense', positions: ALL,
    intro: [
      'Good defenses talk before every pitch. Hold up fingers and say the outs: "One out!" Say where the runners are and where the play is: "Runner on first, play\'s at second!"',
      older
        ? 'The shortstop runs the infield and the center fielder runs the outfield: they say the outs, move people, and take charge. The catcher sees everything, so the catcher tells the cutoff what to do: "Cut!", "Cut two!", or nothing to let it through.'
        : 'The shortstop and the center fielder are the leaders: they remind everyone of the outs and where to throw.',
      'When a teammate makes an error, pick them up: "Next one\'s yours!" Everybody misses sometimes. And the umpire\'s call is the call. Play the next pitch.',
    ],
    steps: [
      q('Before the pitch, what should every fielder know?', [
        wrong('Who\'s batting next', 'Handy, but it won\'t tell you where to throw.'),
        right('How many outs, and where the runners are', 'Yes: that tells you where the play is before the ball is ever hit.'),
        wrong('The score', 'The outs and the runners decide where you throw, not the score.'),
      ]),
      q('It\'s your job to take charge of the infield. Which position is that?', [
        right('Shortstop', 'Yes: the shortstop sees the whole infield and calls out the outs and the play.'),
        wrong('First base', 'First base is busy holding the base. The shortstop leads the infield.'),
        wrong('Right field', 'Right field is in the outfield; the center fielder leads out there.'),
      ], 'SS'),
      q('Your second baseman just let a grounder through. What do you say?', [
        wrong('"You should have had that."', 'That makes the next one harder. Pick them up instead.'),
        right('"Shake it off, next one\'s yours!"', 'Yes: good teammates pick each other up. Everybody misses one.'),
        wrong('Nothing, and look away', 'Say something: it helps more than you\'d think.'),
      ]),
      q('The umpire calls the runner safe, and you\'re sure they were out. What now?', [
        wrong('Argue with the umpire', 'Players don\'t argue calls. That\'s for the coach, and only politely.'),
        right('Get back to your spot and get ready for the next pitch', 'Yes: the call is the call. Play the next pitch.'),
        wrong('Throw your glove', 'Never. Respect the umpire and your teammates.'),
      ]),
    ].concat(older ? [
      q('You\'re the catcher. The throw home won\'t get the runner, but the batter is heading for second. What do you yell to the cutoff?', [
        right('"Cut two!"', 'Yes: the cutoff catches it and throws to second for the out you can still get.'),
        wrong('Nothing', 'Silence means "let it go through" to the plate.'),
        wrong('"Home!"', 'The run is scoring. Get the out at second instead.'),
      ], 'C'),
    ] : []),
  });

  // Start here: what everything on the field means, before the first lesson. The same for both tracks, with that
  // track's own easy play at the end.
  const orientation = (id, level) => ({
    id: 'start', title: 'Start here', ages: 'everyone', level,
    lessons: [{
      id, title: 'How lessons work', positions: ALL,
      intro: [
        'Each lesson is a few plays. You\'re one of the fielders. The play starts, then stops right when you\'d have to decide where to go. Here\'s what you\'ll see.',
        { icon: 'target', text: 'A dotted white circle is where the ball is going.' },
        { icon: 'through', text: 'A finer dotted line and circle: where the ball ends up if it gets past the infield.' },
        { icon: 'you', text: 'You: the player with the gold ring and "YOU" over them. Drag yourself the way you\'d run. If your job is to stay put, tap "Stay here".' },
        { icon: 'fielder', text: 'Blue circles are your teammates on defense, with their position on them.' },
        { icon: 'runner', text: 'Red circles are runners. B is the batter, running to first.' },
        { icon: 'field', text: 'After you answer, the play finishes and every job shows in color. Yellow: gets the ball.' },
        { icon: 'cutoff', text: 'Orange: the cutoff or relay, lined up for the throw.' },
        { icon: 'cover', text: 'Green: covers a base.' },
        { icon: 'backup', text: 'Purple: backs somebody up.' },
        { icon: 'hold', text: 'Gray: stays ready where they are.' },
        { icon: 'route', text: 'A dotted line in a player\'s color is where they run.' },
        { icon: 'look', text: 'The soft light wedge shows where a player is looking.' },
        { icon: 'answer', text: 'Your guess is a filled circle: green if you\'re right, yellow if close, red if not. The dashed green circle is the right spot.' },
        'You don\'t have to be exact. Heading the right way is what counts. You can go back or try any step again.',
      ],
      steps: [
        q('What does the dotted white circle show?', [
          right('Where the ball is going', 'Yes. Watch it: it tells you whether the ball is coming to you.'),
          wrong('Where I should run', 'That\'s yours to figure out! The dotted circle is where the ball is going.'),
          wrong('Where the batter is', 'The batter is the red B. The dotted circle is where the ball is going.'),
        ]),
        q('Which player are you?', [
          wrong('The one with a red circle', 'Red circles are the runners.'),
          right('The one with the gold ring and "YOU"', 'Yes: drag that one.'),
          wrong('Whoever is closest to the ball', 'Not always! You\'re the one with the gold ring and "YOU".'),
        ]),
        q('After the play, a player has a green ring. What\'s their job?', [
          wrong('Gets the ball', 'That\'s yellow.'),
          right('Covers a base', 'Yes: green covers a base.'),
          wrong('Backs somebody up', 'That\'s purple.'),
        ]),
        play('Grounder to short, nobody on', 'SS'),
      ],
    }],
  });

  const TRACKS = {
    baseball: {
      title: 'Baseball',
      stages: [
        orientation('bb-start', 'littleLeague'),
        {
          id: 'bb-tball', title: 'T-ball', ages: '4-6', level: 'littleLeague',
          lessons: [
            {
              id: 'bb-t-ready', title: 'Get ready', positions: ALL,
              intro: [
                'Before every hit, get in your ready position: feet apart, knees bent, glove out in front, eyes on the batter.',
                'Be on the balls of your feet so you can move fast when the ball is hit.',
              ],
              steps: [
                q('What does a ready fielder look like?', [
                  wrong('Standing tall with the glove at the side', 'Too slow: you can\'t move fast standing straight up.'),
                  right('Feet apart, knees bent, glove out front, eyes on the batter', 'Yes! That\'s the ready position.'),
                  wrong('Sitting on the grass', 'Stay on your feet and ready, every pitch.'),
                ]),
                q('When do you get in your ready position?', [
                  right('Before every hit', 'Yes: every single one.'),
                  wrong('Only when the ball comes to me', 'Too late by then. Get ready before every hit.'),
                  wrong('Only in the last inning', 'Every hit, every inning.'),
                ]),
              ],
            },
            {
              id: 'bb-t-alligator', title: 'Alligator hands', positions: IF,
              intro: [
                'To field a ground ball, get in front of it. Glove down and out in front of you, and your other hand on top like an alligator\'s mouth: chomp!',
                'Move your feet to the ball. Don\'t reach for it from the side.',
              ],
              steps: [
                play('Grounder to short, nobody on', 'SS'),
                q('Where is your glove when you field a grounder?', [
                  right('Down on the ground, out in front of you', 'Yes: glove down, out front, and chomp with your other hand.'),
                  wrong('Up by your chest', 'The ball\'s on the ground: get your glove down.'),
                  wrong('Off to the side', 'Move your feet so the ball comes right to the middle of you.'),
                ]),
                play('Comebacker to the pitcher', 'P'),
              ],
            },
            {
              id: 'bb-t-first', title: 'Get it to first', positions: ['1B', 'SS', '2B', '3B'],
              intro: [
                'Nobody on base? Field it and throw it to first. The first baseman runs to the base and waits for the throw.',
                'Look at your target, step toward it, and throw.',
              ],
              steps: [
                play('Grounder to short, nobody on', '1B'),
                play('Grounder to short, nobody on', 'SS'),
              ],
            },
            {
              id: 'bb-t-callit', title: 'Call it', positions: ALL,
              intro: [
                'When a ball is popped up and you can catch it, yell "I got it! I got it!" loud, before you catch it.',
                'If a teammate calls it first, get out of their way.',
              ],
              steps: [
                q('A pop-up is coming right to you. What do you do first?', [
                  right('Yell "I got it! I got it!"', 'Yes: call it loud, then catch it.'),
                  wrong('Catch it quietly', 'Call it first, so nobody runs into you.'),
                  wrong('Wait for someone else', 'If it\'s yours, call it and take it.'),
                ]),
                play('Pop-up between 3rd and short', 'SS'),
                play('Pop-up between 3rd and short', '3B'),
              ],
            },
          ],
        },
        {
          id: 'bb-coach', title: 'Coach pitch', ages: '7-8', level: 'littleLeague',
          lessons: [
            {
              id: 'bb-c-cover', title: 'Cover your base', positions: ['1B', '2B', 'SS', '3B'],
              intro: [
                'When the ball isn\'t hit to you, you still have a job: run to your base and get ready for the throw.',
                'Look at the base and sprint to it. Then turn and give the thrower a target with your glove.',
              ],
              steps: [
                play('Grounder to short, nobody on', '1B'),
                play('Double play: runner on 1st, grounder to short', '2B'),
                play('Runners on 1st & 2nd, grounder to 3rd', 'SS'),
              ],
            },
            {
              id: 'bb-c-force', title: 'Force out: step on it', positions: ['1B', '2B', 'SS', '3B'],
              intro: [
                'When a runner has to run, because the batter is coming behind them, you don\'t have to tag them. Just step on the base before they get there. That\'s a force out.',
                'The base means safe. Off the base, a runner who doesn\'t have to run can be tagged.',
              ],
              steps: [
                q('Runner on first. The ball is hit to the second baseman, who throws to second. What does the shortstop covering second do?', [
                  wrong('Tag the runner', 'No tag needed: the runner has to run, so it\'s a force.'),
                  right('Step on second base with the ball', 'Yes: a force out. Just step on the base.'),
                  wrong('Throw to home', 'The play is at second.'),
                ]),
                play('Double play: runner on 1st, grounder to 2nd', 'SS'),
                play('Bases loaded — force at home', 'C'),
              ],
            },
            {
              id: 'bb-c-throwin', title: 'Outfield: throw it in', positions: OF.concat(['SS', '2B']),
              intro: [
                'When the ball gets to the outfield, don\'t hold it. Throw it in to the infielder who comes out to you with their arms up. That\'s the cutoff.',
                'Hit the cutoff chest-high, so the ball gets back to the infield fast.',
              ],
              steps: [
                play('Single to left, nobody on', 'LF'),
                play('Single to left, nobody on', 'SS'),
                play('Single to right, nobody on', '2B'),
              ],
            },
            {
              id: 'bb-c-priority', title: 'Who takes the pop-up?', positions: ALL,
              intro: [
                'Two players under one ball? The one who calls it takes it. And an outfielder running in has the better look, so an outfielder calls off an infielder.',
                'The middle infielders take it over the corners, and the center fielder over the other outfielders.',
              ],
              steps: [
                play('Pop-up behind 2nd — who takes it?', '2B'),
                play('Pop-up behind 2nd — who takes it?', 'CF'),
                play('Shallow fly — outfielder calls off the infielder', 'SS'),
                q('You\'re the shortstop running out, and the center fielder yells "I got it!" What do you do?', [
                  wrong('Keep going and catch it', 'The outfielder coming in has it. Listen for the call.'),
                  right('Peel off and let the center fielder take it', 'Yes: the outfielder coming in has priority.'),
                  wrong('Yell "I got it!" louder', 'Once it\'s called, let them have it.'),
                ], 'SS'),
              ],
            },
            talk('bb-c-talk', false),
          ],
        },
        {
          id: 'bb-minors', title: 'Kid pitch', ages: '9-10', level: 'littleLeague',
          lessons: [
            {
              id: 'bb-m-jobs', title: 'Ball, base, backup', positions: ALL,
              intro: [
                'On every ball in play, all nine fielders move. One player gets the ball. Somebody covers the base the ball is going to. Everyone else backs somebody up, in case the ball gets away.',
                'Nobody stands and watches. If the ball isn\'t coming to you, ask yourself: which base do I cover, or who do I back up?',
              ],
              steps: [
                play('Grounder to short, nobody on', '1B'),
                play('Grounder to short, nobody on', 'RF'),
                play('Single to left, nobody on', 'SS'),
                play('Single to left, nobody on', '2B'),
                q('The ball is hit to the shortstop. You\'re the right fielder. What do you do?', [
                  wrong('Stay where I am and watch', 'Nobody watches. If the throw to first gets past the first baseman, somebody has to be there.'),
                  right('Run in behind first base to back up the throw', 'Yes: if the throw gets away, you\'re there to stop it.'),
                  wrong('Run to second base', 'The second baseman covers second. Your job is behind first.'),
                ], 'RF'),
              ],
            },
            {
              id: 'bb-m-backup', title: 'Back it up', positions: ['C', 'P', 'LF', 'CF', 'RF'],
              intro: [
                'A backup stands 20 to 25 feet behind the base, in line with the throw. If the ball gets past, you stop it before the runner can take another base.',
                'Get there early, and stay in foul territory if you\'re backing up first.',
              ],
              steps: [
                play('Grounder to short, nobody on', 'C'),
                play('Grounder to short, nobody on', 'RF'),
                play('Single to left, runner on 1st', 'P'),
              ],
            },
            {
              id: 'bb-m-pitcher', title: 'Pitcher, cover first', positions: ['P', '1B'],
              intro: [
                'On any ball hit to the right side, the pitcher runs to first base right away. If the first baseman fields it, the pitcher covers the base.',
                'Run to a spot a few steps up the line, then turn and run along it to the bag, so you don\'t collide with the runner.',
              ],
              steps: [
                play('Grounder to 1st — pitcher covers!', 'P'),
                play('Grounder to 1st — pitcher covers!', '1B'),
              ],
            },
            {
              id: 'bb-m-steal', title: 'Steal: who covers second', positions: ['2B', 'SS', 'CF', 'C'],
              intro: [
                'When a runner steals second, one middle infielder covers the base and the other backs up. Many teams go by the batter: the player on the side the batter usually hits to stays home.',
                'The center fielder charges in behind second, in case the throw gets through.',
              ],
              steps: [
                play('Steal of 2nd — right-handed batter', '2B'),
                play('Steal of 2nd — right-handed batter', 'SS'),
                play('Steal of 2nd — left-handed batter', 'SS'),
                play('Steal of 2nd — right-handed batter', 'CF'),
              ],
            },
            {
              id: 'bb-m-passed', title: 'Passed ball: pitcher covers home', positions: ['P', 'C'],
              intro: [
                'When the pitch gets past the catcher with a runner on third, the catcher chases it and the pitcher sprints in to cover home.',
                'Catcher: yell "Here!" as you go. Pitcher: set up in front of the plate, glove down, ready for the tag.',
              ],
              steps: [
                play('Passed ball, runner on 3rd', 'P'),
                play('Passed ball, runner on 3rd', 'C'),
              ],
            },
            {
              id: 'bb-m-cutoff', title: 'Line up the throw', positions: ['1B', '3B', 'SS', '2B', 'C', 'CF', 'LF', 'RF'],
              intro: [
                'On a hit with a runner trying to score, the cutoff gets in a straight line between the ball and home plate, arms up, so the outfielder has a target.',
                'Here the first baseman is the cutoff on a throw home from center or right, and the third baseman on a throw from left.',
              ],
              steps: [
                play('Single to center, runner on 2nd', '1B'),
                play('Single to left, runner on 2nd', '3B'),
                play('Single to center, runner on 2nd', 'CF'),
              ],
            },
            talk('bb-m-talk', false),
          ],
        },
        {
          id: 'bb-majors', title: 'Majors', ages: '11-12', level: 'littleLeague',
          lessons: [
            {
              id: 'bb-j-relay', title: 'Relays on the deep ball', positions: ['SS', '2B', 'LF', 'CF', 'RF', '1B'],
              intro: [
                'When the ball gets past the outfielders, the relay infielder runs out toward the ball and lines up between it and the base the throw is going to.',
                'The shortstop takes it on the left side, the second baseman on the right. The other middle infielder trails behind the relay, in case of a bad throw.',
              ],
              steps: [
                play('Double in the left-center gap', 'SS'),
                play('Double in the right-center gap', '2B'),
                play('Double down the left-field line', 'LF'),
              ],
            },
            {
              id: 'bb-j-where', title: 'Where\'s the throw?', positions: IF,
              intro: [
                'Know where you\'re throwing before the pitch. Usually it\'s the lead runner, the one closest to scoring, if you have time.',
                'With two outs, take the easiest out. Any out ends the inning.',
              ],
              steps: [
                q('Two outs, runners on first and second. A grounder to the third baseman, right next to third base. What\'s the play?', [
                  right('Step on third', 'Yes: the easiest out, and it ends the inning.'),
                  wrong('A long throw to first', 'Any out ends it, so take the closest one.'),
                  wrong('Throw home', 'Nobody is forced at home. Step on third.'),
                ], '3B'),
                play('Two outs — take the easy out', '3B'),
                play('Runners on 1st & 2nd, grounder to 3rd', '3B'),
                play('Runner on 2nd — look them back', 'SS'),
              ],
            },
            {
              id: 'bb-j-dp', title: 'Turn two', positions: ['SS', '2B', '1B'],
              intro: [
                'Runner on first, a grounder to the middle: get the lead runner at second first, then throw to first for two.',
                'On a ball to short, the second baseman covers second. On a ball to second, the shortstop covers. The first out matters most: make sure of it.',
              ],
              steps: [
                play('Double play: runner on 1st, grounder to short', '2B'),
                play('Double play: runner on 1st, grounder to 2nd', 'SS'),
                play('Double play: runner on 1st, grounder to short', '1B'),
              ],
            },
            {
              id: 'bb-j-bunt', title: 'Bunt coverage', positions: ['1B', '3B', 'P', '2B', 'SS', 'C'],
              intro: [
                'On a bunt, the first and third basemen charge in and the pitcher comes off the mound. The second baseman covers first and the shortstop covers second.',
                'The catcher sees it all, so the catcher calls who takes it and where to throw.',
              ],
              steps: [
                play('Bunt down the 3rd-base line', '3B'),
                play('Bunt down the 1st-base line', '2B'),
                play('Bunt to the pitcher, runner on 1st', 'SS'),
                play('Bunt with a runner on 2nd', '3B'),
              ],
            },
            {
              id: 'bb-j-rundown', title: 'Rundowns', positions: IF,
              intro: [
                'A runner caught between bases: run hard at them with the ball held up, and drive them back toward the base they came from.',
                'The fielder at that base steps up and yells "Now!". One short throw, then the tag. Fewer throws, fewer mistakes.',
              ],
              steps: [
                q('A runner is caught between first and second. Which way do you chase them?', [
                  right('Back toward first, the base they came from', 'Yes: if it goes wrong, they\'re still where they started.'),
                  wrong('Toward second', 'Then a mistake gives them an extra base.'),
                  wrong('It doesn\'t matter', 'It does: run them back.'),
                ]),
                play('Rundown between 1st and 2nd', 'SS'),
                play('Rundown between 3rd and home', 'C'),
              ],
            },
            talk('bb-j-talk', true),
          ],
        },
        {
          id: 'bb-13u', title: '13U and up', ages: '13+', level: 'intermediate',
          lessons: [
            {
              id: 'bb-s-hold', title: 'Leads and pickoffs', positions: ['1B', 'P', 'C', 'RF'],
              intro: [
                'From 50/70 up, runners lead off. The first baseman holds the runner on: foot on the bag, glove up as a target for the pickoff throw.',
                'On a catcher\'s back-pick to first, the first baseman gets back to the bag and the right fielder backs it up.',
              ],
              steps: [
                play('Primary lead — pickoff at 1st', '1B'),
                play('Secondary lead — catcher back-pick', '1B'),
                play('Secondary lead — catcher back-pick', 'RF'),
              ],
            },
            {
              id: 'bb-s-13', title: 'First and third', positions: ['C', 'SS', '2B', 'P', '3B'],
              intro: [
                'Runners on first and third, and the runner on first steals. Teams decide before the pitch: throw through to second, cut it, or throw back to the pitcher.',
                'Whatever the call, the fielders at second watch the runner on third. If they break for home, the ball goes home.',
              ],
              steps: [
                play('1st & 3rd double steal', 'SS'),
                play('1st & 3rd double steal', '2B'),
              ],
            },
            {
              id: 'bb-s-tandem', title: 'Tandem relays', positions: ['SS', '2B', 'LF', 'RF', '3B'],
              intro: [
                'On a 90 ft field, a ball in the corner is a long way from home. Two infielders go out: the relay and a trailer 15 to 20 feet behind, so a bad throw doesn\'t get away.',
              ],
              steps: [
                play('Double down the left-field line — tandem relay', 'SS', { level: 'junior90' }),
                play('Double down the left-field line — tandem relay', '2B', { level: 'junior90' }),
                play('Double down the right-field line — tandem relay', '2B', { level: 'junior90' }),
              ],
            },
            {
              id: 'bb-s-tag', title: 'Cutoffs on a tag-up', positions: ['1B', '3B', 'CF', 'RF', 'C'],
              intro: [
                'A fly ball with a runner on third: the outfielder catches it moving toward home and throws through the cutoff. The catcher decides: let it through, or "Cut!"',
              ],
              steps: [
                play('Tag from 3rd — medium fly to center', '1B', { level: 'junior90' }),
                play('Tag from 3rd — medium fly to center', 'CF', { level: 'junior90' }),
                play('Tag from 2nd — fly to right', '3B', { level: 'junior90' }),
              ],
            },
            talk('bb-s-talk', true),
          ],
        },
      ],
    },
    softball: {
      title: 'Softball',
      stages: [
        orientation('sb-start', 'softball10'),
        {
          id: 'sb-8u', title: '8U', ages: '6-8', level: 'softball8',
          lessons: [
            {
              id: 'sb-8-ready', title: 'Get ready', positions: ALL,
              intro: [
                'Before every pitch, get in your ready position: feet apart, knees bent, glove out in front, eyes on the batter.',
                'Softball bases are close, so the ball gets to you fast. Be ready every pitch.',
              ],
              steps: [
                q('What does a ready fielder look like?', [
                  wrong('Standing tall with the glove at the side', 'Too slow: you can\'t move fast standing straight up.'),
                  right('Feet apart, knees bent, glove out front, eyes on the batter', 'Yes! That\'s the ready position.'),
                  wrong('Kneeling in the dirt', 'Stay on your feet and ready.'),
                ]),
              ],
            },
            {
              id: 'sb-8-triangle', title: 'Glove out front', positions: IF,
              intro: [
                'To field a ground ball, get in front of it with your feet wide and your glove out in front, making a triangle with your feet. Cover it with your other hand.',
              ],
              steps: [
                play('Grounder to short, nobody on', 'SS'),
                play('Comebacker to the pitcher', 'P'),
              ],
            },
            {
              id: 'sb-8-first', title: 'Get it to first', positions: ['1B', 'SS', '2B', '3B'],
              intro: [
                'Nobody on? Field it and throw it to first. The first baseman gets to the bag and gives a target.',
              ],
              steps: [
                play('Grounder to short, nobody on', '1B'),
                play('Grounder to short, nobody on', 'SS'),
              ],
            },
            {
              id: 'sb-8-callit', title: 'Call it', positions: ALL,
              intro: [
                'If you can catch a pop-up, yell "I got it! I got it!" before you catch it. If someone else calls it, get out of the way.',
              ],
              steps: [
                q('A pop-up is coming right to you. What do you do first?', [
                  right('Yell "I got it! I got it!"', 'Yes: call it loud, then catch it.'),
                  wrong('Catch it quietly', 'Call it first, so nobody runs into you.'),
                  wrong('Wait for someone else', 'If it\'s yours, call it and take it.'),
                ]),
                play('Pop-up between 3rd and short', 'SS'),
              ],
            },
          ],
        },
        {
          id: 'sb-10u', title: '10U', ages: '9-10', level: 'softball10',
          lessons: [
            {
              id: 'sb-10-jobs', title: 'Ball, base, backup', positions: ALL,
              intro: [
                'On every ball in play, all nine fielders move. One gets the ball, somebody covers the base, everyone else backs up.',
                'In softball the bases are close and runners are fast, so move the moment the ball is hit.',
              ],
              steps: [
                play('Grounder to short, nobody on', '1B'),
                play('Grounder to short, nobody on', 'RF'),
                play('Single to left, nobody on', 'SS'),
              ],
            },
            {
              id: 'sb-10-circle', title: 'Get it to the circle', positions: ['P', 'SS', '2B', 'CF'],
              intro: [
                'After a play, get the ball back to the pitcher in the circle. Once the pitcher has it in the circle, runners have to go right back or straight ahead: that\'s the look-back rule.',
                'A runner who stops or changes direction is out.',
              ],
              steps: [
                q('The play is over and you have the ball in the outfield. Where does it go?', [
                  right('To the pitcher in the circle', 'Yes: that shuts the runners down.'),
                  wrong('Hold on to it', 'Holding it lets runners keep going.'),
                  wrong('To the catcher', 'Get it to the circle.'),
                ]),
                play('Look-back — runner off 3rd goes straight back', 'P'),
                play('Look-back — runner off 3rd stops: out by rule', 'P'),
              ],
            },
            {
              id: 'sb-10-steal', title: 'Steal: who covers', positions: ['SS', '2B', 'CF', 'C', '3B'],
              intro: [
                'When a runner steals second, one middle infielder covers the base and the center fielder backs it up.',
                'On a steal of third, the third baseman covers and the left fielder backs up.',
              ],
              steps: [
                play('Steal of 2nd — shortstop covers', 'SS'),
                play('Steal of 2nd — shortstop covers', 'CF'),
                play('Steal of 3rd', '3B'),
              ],
            },
            {
              id: 'sb-10-passed', title: 'Passed ball: pitcher covers home', positions: ['P', 'C'],
              intro: [
                'When the pitch gets past the catcher with a runner on third, the catcher chases it and the pitcher runs in to cover home.',
              ],
              steps: [
                play('Passed ball, runner on 3rd — pitcher covers home', 'P'),
                play('Passed ball, runner on 3rd — pitcher covers home', 'C'),
              ],
            },
            {
              id: 'sb-10-bunt', title: 'Bunt!', positions: ['1B', '3B', 'P', '2B', 'SS', 'C'],
              intro: [
                'Bunts come often in softball. The first and third basemen charge, the second baseman covers first, and the shortstop covers second. The catcher calls where the throw goes.',
                'Decide before the pitch where you\'ll go if it\'s bunted, so you don\'t freeze.',
              ],
              steps: [
                play('Sacrifice bunt, runners on 1st & 2nd', '3B'),
                play('Sacrifice bunt, runners on 1st & 2nd', '2B'),
                play('Drag bunt by a slapper — first baseman crashes', '1B'),
              ],
            },
            talk('sb-10-talk', false),
          ],
        },
        {
          id: 'sb-12u', title: '12U', ages: '11-12', level: 'softball',
          lessons: [
            {
              id: 'sb-12-backpick', title: 'Back-picks', positions: ['C', '1B', '3B', 'RF', 'LF'],
              intro: [
                'Runners take a lead after every pitch, so the catcher throws behind them: the back-pick. The first or third baseman gets to the bag, and the outfielder on that side backs it up.',
              ],
              steps: [
                play('Catcher back-pick at 1st', '1B'),
                play('Catcher back-pick at 1st', 'RF'),
                play('Catcher back-pick at 3rd', '3B'),
              ],
            },
            {
              id: 'sb-12-slap', title: 'Slapper up', positions: ['SS', '3B', '1B', '2B'],
              intro: [
                'A slapper is running as they hit. The corners come in, and the shortstop reads it: a soft slap to the left side means charge hard.',
                'Take the sure out. There\'s rarely time for anything else.',
              ],
              steps: [
                play('Soft slap to the left side — shortstop charges', 'SS'),
                play('Slap in the hole — shortstop backhand', 'SS'),
                play('Slap with a runner on 1st — take the sure out', 'SS'),
              ],
            },
            {
              id: 'sb-12-cutoff', title: 'Cutoffs', positions: ['1B', '3B', 'SS', '2B', 'C', 'LF', 'CF', 'RF'],
              intro: [
                'On a hit with a runner trying to score, the cutoff lines up between the ball and home. The softball field is small, so the cutoff sets up closer to the plate.',
              ],
              steps: [
                play('Single to center, runner on 2nd', '1B'),
                play('Single to left, runner on 2nd', '3B'),
                play('Double in the left-center gap', 'SS'),
              ],
            },
            {
              id: 'sb-12-rundown', title: 'Rundowns', positions: IF,
              intro: [
                'Run the runner back toward the base they came from, ball held high. The fielder at that base steps up and calls for it. One throw, then the tag.',
              ],
              steps: [
                play('Rundown between 1st and 2nd', 'SS'),
                play('Rundown between 3rd and home', 'C'),
              ],
            },
            talk('sb-12-talk', true),
          ],
        },
        {
          id: 'sb-14u', title: '14U and up', ages: '13+', level: 'softball14',
          lessons: [
            {
              id: 'sb-14-dropped', title: 'Dropped third strike', positions: ['C', '1B', 'RF'],
              intro: [
                'When strike three isn\'t caught, the batter can run to first, unless first is taken with fewer than two outs. The catcher gets the ball and throws to first, from the inside of the line so the throw doesn\'t hit the runner.',
              ],
              steps: [
                play('Dropped 3rd strike — throw to 1st from the inside', 'C'),
                play('Dropped 3rd strike — throw to 1st from the inside', '1B'),
                q('Runner on first, one out, and strike three gets away from the catcher. What\'s the play?', [
                  right('No throw: the batter is out', 'Yes: with first taken and fewer than two outs, the batter can\'t run.'),
                  wrong('Throw to first', 'The batter is already out: first base is taken.'),
                  wrong('Throw to second', 'Hold the ball and watch the runner.'),
                ], 'C'),
              ],
            },
            {
              id: 'sb-14-13', title: 'First and third', positions: ['C', 'SS', '2B', 'P'],
              intro: [
                'Runners on first and third, and the runner on first goes. Decide before the pitch: throw through, cut it, or look the runner on third back.',
              ],
              steps: [
                play('1st & 3rd delayed steal', 'SS'),
                play('1st & 3rd delayed steal', 'C'),
              ],
            },
            {
              id: 'sb-14-rotation', title: 'Bunt rotation', positions: ['3B', 'SS', '1B', '2B'],
              intro: [
                'Runners on first and second, sacrifice bunt: some teams rotate. The third baseman crashes, the shortstop rotates to third, and the second baseman covers first.',
              ],
              steps: [
                play('Sacrifice bunt, runners on 1st & 2nd', 'SS', { buntD: 'wheel' }),
                play('Sacrifice bunt, runners on 1st & 2nd', '3B', { buntD: 'wheel' }),
                play('Bunt, runner on 1st — catcher covers 3rd', 'C'),
              ],
            },
            talk('sb-14-talk', true),
          ],
        },
      ],
    },
  };

  /*
   * Grade a guess. start: where the player was when the play froze; want: where the play sends them; guess: where
   * the learner dragged them (their start, for "Stay here"); k: field scale (base distance / 60).
   *   Staying put (the job is a few steps at most): right if the guess stays close too.
   *   Moving: right if the guess heads within about 25 degrees of the right direction and goes roughly the right
   *   distance; close within about 40 degrees; otherwise a miss.
   */
  function grade(start, want, guess, k = 1) {
    const dx = want.x - start.x, dy = want.y - start.y, d = Math.hypot(dx, dy);
    const gx = guess.x - start.x, gy = guess.y - start.y, g = Math.hypot(gx, gy);
    if (d < 8 * k) return g < 10 * k ? 'right' : g < 18 * k ? 'close' : 'miss';
    if (g < 5 * k) return 'miss';
    const angle = Math.acos(Math.max(-1, Math.min(1, (dx * gx + dy * gy) / (d * g)))) * 180 / Math.PI;
    const ratio = g / d;
    if (angle <= 25 && ratio >= 0.45 && ratio <= 1.7) return 'right';
    if (angle <= 40 && ratio >= 0.25 && ratio <= 2.4) return 'close';
    return 'miss';
  }

  function lessons(trackKey) {
    const t = TRACKS[trackKey];
    return t ? t.stages.flatMap((s) => s.lessons.map((l) => Object.assign({ stage: s }, l))) : [];
  }

  const api = { TRACKS, grade, lessons };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Training = api;
})(typeof window !== 'undefined' ? window : globalThis);
