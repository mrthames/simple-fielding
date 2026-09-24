/*
 * The scenario library: ready-made plays a coach can tap through at practice.
 * Each one is a situation plus an event, exactly what the drag-to-hit UI would produce.
 * Coordinates are for the 60 ft field; the engine scales them for other fields.
 */
(function (root) {
  'use strict';

  const none = { first: false, second: false, third: false };
  const on = (...bases) => Object.assign({}, none, ...bases.map((b) => ({ [b]: true })));

  const GROUPS = [
    {
      name: 'Ground balls',
      items: [
        { name: 'Grounder to short, nobody on', runners: on(), outs: 0, event: { kind: 'ground', at: { x: -24, y: 78 } } },
        { name: 'Grounder to 1st — pitcher covers!', runners: on(), outs: 0, event: { kind: 'ground', at: { x: 30, y: 62 } } },
        { name: 'Double play: runner on 1st, grounder to short', runners: on('first'), outs: 0, event: { kind: 'ground', at: { x: -22, y: 76 } } },
        { name: 'Double play: runner on 1st, grounder to 2nd', runners: on('first'), outs: 1, event: { kind: 'ground', at: { x: 22, y: 76 } } },
        { name: 'Runners on 1st & 2nd, grounder to 3rd', runners: on('first', 'second'), outs: 0, event: { kind: 'ground', at: { x: -38, y: 52 } } },
        { name: 'Bases loaded — force at home', runners: on('first', 'second', 'third'), outs: 0, event: { kind: 'ground', at: { x: 20, y: 74 } } },
        { name: 'Runner on 2nd — look them back', runners: on('second'), outs: 0, event: { kind: 'ground', at: { x: -24, y: 78 } } },
        { name: 'Two outs — take the easy out', runners: on('first', 'second'), outs: 2, event: { kind: 'ground', at: { x: -36, y: 50 } } },
        { name: 'Comebacker to the pitcher', runners: on('first'), outs: 0, event: { kind: 'ground', at: { x: 2, y: 40 } } },
      ],
    },
    {
      name: 'Singles',
      items: [
        { name: 'Single to left, nobody on', runners: on(), outs: 0, event: { kind: 'ground', at: { x: -80, y: 135 } } },
        { name: 'Single to center, nobody on', runners: on(), outs: 0, event: { kind: 'ground', at: { x: -8, y: 150 } } },
        { name: 'Single to right, nobody on', runners: on(), outs: 0, event: { kind: 'ground', at: { x: 80, y: 135 } } },
        { name: 'Single to left, runner on 1st', runners: on('first'), outs: 0, event: { kind: 'ground', at: { x: -80, y: 135 } } },
        { name: 'Single to right, runner on 1st', runners: on('first'), outs: 1, event: { kind: 'ground', at: { x: 82, y: 132 } } },
        { name: 'Single to left, runner on 2nd', runners: on('second'), outs: 1, event: { kind: 'ground', at: { x: -80, y: 135 } } },
        { name: 'Single to center, runner on 2nd', runners: on('second'), outs: 0, event: { kind: 'ground', at: { x: 10, y: 150 } } },
        { name: 'Single to right, runner on 2nd', runners: on('second'), outs: 0, event: { kind: 'ground', at: { x: 82, y: 132 } } },
      ],
    },
    {
      name: 'Doubles & triples',
      items: [
        { name: 'Double down the left-field line', runners: on(), outs: 0, event: { kind: 'line', at: { x: -118, y: 128 }, result: 'double' } },
        { name: 'Double in the left-center gap', runners: on(), outs: 0, event: { kind: 'line', at: { x: -52, y: 172 }, result: 'double' } },
        { name: 'Double in the right-center gap', runners: on(), outs: 0, event: { kind: 'line', at: { x: 52, y: 172 }, result: 'double' } },
        { name: 'Double down the right-field line', runners: on(), outs: 0, event: { kind: 'line', at: { x: 118, y: 128 }, result: 'double' } },
        { name: 'Double to left-center, runner on 1st', runners: on('first'), outs: 0, event: { kind: 'line', at: { x: -52, y: 172 }, result: 'double' } },
        { name: 'Triple to the right-field corner', runners: on(), outs: 0, event: { kind: 'fly', at: { x: 128, y: 138 }, result: 'triple' } },
      ],
    },
    {
      name: 'Fly balls & pop-ups',
      items: [
        { name: 'Fly ball to left, nobody on', runners: on(), outs: 0, event: { kind: 'fly', at: { x: -90, y: 146 } } },
        { name: 'Tag up from 3rd — fly to center', runners: on('third'), outs: 0, event: { kind: 'fly', at: { x: 0, y: 172 } } },
        { name: 'Tag up from 2nd — fly to right', runners: on('second'), outs: 1, event: { kind: 'fly', at: { x: 92, y: 148 } } },
        { name: 'Pop-up behind 2nd — who takes it?', runners: on('first'), outs: 0, event: { kind: 'pop', at: { x: 6, y: 102 } } },
        { name: 'Pop-up between 3rd and short', runners: on(), outs: 1, event: { kind: 'pop', at: { x: -32, y: 70 } } },
        { name: 'Shallow fly — outfielder calls off the infielder', runners: on(), outs: 0, event: { kind: 'pop', at: { x: -45, y: 118 } } },
      ],
    },
    {
      name: 'Foul balls',
      items: [
        { name: 'Foul pop behind the plate', runners: on('first'), outs: 0, event: { kind: 'pop', at: { x: -12, y: -14 } } },
        { name: 'Foul pop near the 1st-base line', runners: on(), outs: 0, event: { kind: 'pop', at: { x: 52, y: 30 } } },
        { name: 'Foul pop near the 3rd-base line', runners: on('second'), outs: 1, event: { kind: 'pop', at: { x: -55, y: 34 } } },
      ],
    },
    {
      name: 'Bunts',
      items: [
        { name: 'Bunt down the 3rd-base line', runners: on(), outs: 0, event: { kind: 'bunt', at: { x: -18, y: 26 } } },
        { name: 'Bunt to the pitcher, runner on 1st', runners: on('first'), outs: 0, event: { kind: 'bunt', at: { x: 2, y: 30 } } },
        { name: 'Bunt down the 1st-base line', runners: on('first'), outs: 0, event: { kind: 'bunt', at: { x: 18, y: 26 } } },
        { name: 'Bunt with a runner on 2nd', runners: on('second'), outs: 0, event: { kind: 'bunt', at: { x: -16, y: 24 } } },
        { name: 'Bunt right in front of the plate', runners: on(), outs: 1, event: { kind: 'bunt', at: { x: 2, y: 9 } } },
      ],
    },
    {
      name: 'Steals & leads',
      items: [
        { name: 'Steal of 2nd — right-handed batter', runners: on('first'), outs: 0, batter: 'R', event: { kind: 'steal2' } },
        { name: 'Steal of 2nd — left-handed batter', runners: on('first'), outs: 0, batter: 'L', event: { kind: 'steal2' } },
        { name: 'Steal of 3rd', runners: on('second'), outs: 1, event: { kind: 'steal3' } },
        { name: '1st & 3rd double steal', runners: on('first', 'third'), outs: 0, event: { kind: 'firstThirdSteal' } },
        { name: 'Primary lead — pickoff at 1st', runners: on('first'), outs: 0, leadoffs: true, event: { kind: 'primaryLead' } },
        { name: 'Secondary lead — catcher back-pick', runners: on('first'), outs: 0, leadoffs: true, event: { kind: 'secondaryLead' } },
      ],
    },
    {
      name: 'Passed balls',
      items: [
        { name: 'Passed ball, runner on 3rd', runners: on('third'), outs: 0, event: { kind: 'passedBall' } },
        { name: 'Wild pitch, runner on 1st', runners: on('first'), outs: 1, event: { kind: 'passedBall' } },
      ],
    },
    {
      // Written in real feet for a 90 ft field (abs), and only listed on the 90 ft levels.
      name: '90 ft: depth, relays and tags',
      levels: ['junior90', 'highSchool', 'college', 'pro'],
      abs: true,
      items: [
        { name: 'Double-play depth — 6-4-3', runners: on('first'), outs: 0, event: { kind: 'ground', at: { x: -38, y: 132 } } },
        { name: 'Double-play depth — 4-6-3', runners: on('first'), outs: 1, event: { kind: 'ground', at: { x: 36, y: 132 } } },
        { name: '5-4-3 around the horn', runners: on('first'), outs: 0, event: { kind: 'ground', at: { x: -66, y: 95 } } },
        { name: 'Deep in the hole at short', runners: on(), outs: 1, event: { kind: 'ground', at: { x: -80, y: 118 } } },
        { name: 'Slow roller — charge it', runners: on(), outs: 0, event: { kind: 'ground', at: { x: -34, y: 58 }, slow: true } },
        { name: 'Single to center, runner on 2nd — play at the plate', runners: on('second'), outs: 1, event: { kind: 'ground', at: { x: -10, y: 255 }, result: 'single' } },
        { name: 'Single to right, runner on 1st — 1st to 3rd?', runners: on('first'), outs: 0, event: { kind: 'ground', at: { x: 115, y: 190 }, result: 'single' } },
        { name: 'Single to left, 1st & 2nd — third baseman cuts', runners: on('first', 'second'), outs: 1, event: { kind: 'ground', at: { x: -125, y: 215 }, result: 'single' } },
        { name: 'Double down the left-field line — tandem relay', runners: on('first'), outs: 0, event: { kind: 'line', at: { x: -205, y: 222 }, result: 'double' } },
        { name: 'Double down the right-field line — tandem relay', runners: on('first'), outs: 1, event: { kind: 'line', at: { x: 205, y: 222 }, result: 'double' } },
        { name: 'Gap double, left-center — tandem to 3rd', runners: on(), outs: 0, event: { kind: 'line', at: { x: -140, y: 310 }, result: 'double' } },
        { name: 'Triple to the right-center gap', runners: on(), outs: 0, event: { kind: 'fly', at: { x: 150, y: 330 }, result: 'triple' } },
        { name: 'Tag from 3rd — medium fly to center', runners: on('third'), outs: 1, event: { kind: 'fly', at: { x: 0, y: 285 } } },
        { name: 'Tag from 2nd — fly to right', runners: on('second'), outs: 0, event: { kind: 'fly', at: { x: 150, y: 255 } } },
        { name: 'Pop-up in the triangle — 1B, 2B, RF', runners: on(), outs: 1, event: { kind: 'pop', at: { x: 82, y: 170 } } },
      ],
    },
  ];

  // A flat list, handy for "next scenario".
  const ALL = [];
  GROUPS.forEach((g) => g.items.forEach((it) => ALL.push(Object.assign({ group: g.name, levels: g.levels, abs: g.abs }, it))));
  // Whether a play belongs on this field.
  const fits = (sc, leagueKey) => !sc.levels || sc.levels.includes(leagueKey);

  const api = { GROUPS, ALL, fits };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Scenarios = api;
})(typeof window !== 'undefined' ? window : globalThis);
