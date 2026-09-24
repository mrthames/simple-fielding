/*
 * Field geometry.
 *
 * Everything is in feet. Home plate is the origin, +y points out to center field, +x toward the
 * first-base side. The foul lines are the two 45-degree diagonals, so a ball is fair when |x| <= y.
 *
 * Plain script, no modules: WebViews load the app from file://, where ES modules are blocked.
 * Exposed as window.Field in the browser and as module.exports under Node (for the tests).
 */
(function (root) {
  'use strict';

  const LEAGUES = {
    littleLeague: {
      label: 'Little League baseball',
      short: 'Baseball 60 ft',
      sport: 'baseball',
      base: 60, mound: 46, fence: 200,
      leadoffs: false,
    },
    intermediate: {
      label: 'Baseball 50/70 (leadoffs)',
      short: 'Baseball 70 ft',
      sport: 'baseball',
      base: 70, mound: 50, fence: 225,
      leadoffs: true,
    },
    softball: {
      label: 'Fastpitch softball (12U, 40 ft)',
      short: 'Softball 12U',
      sport: 'softball',
      base: 60, mound: 40, fence: 200,
      leadoffs: false,
    },
    softball10: {
      label: 'Fastpitch softball (10U, 35 ft)',
      short: 'Softball 10U',
      sport: 'softball',
      base: 60, mound: 35, fence: 175,
      leadoffs: false,
    },
    // Fastpitch softball levels past 12U, and 8U coach pitch (see simple-fielding-notes/softball-levels-spec.md).
    softball8: {
      label: 'Fastpitch softball (8U, coach pitch)',
      short: 'Softball 8U',
      sport: 'softball', level: 'youth8',
      base: 60, mound: 35, fence: 150, backstop: -25, arc: 60,
      infield: { '1B': [31.1, 39.6], '2B': [20, 76], SS: [-20, 76], '3B': [-29.7, 38.2] },
      pReady: [15, 36],
      outfield: { corner: 95, cf: 105 },
      leadoffs: false,
      rules: { leave: 'contact', droppedThird: false, stealing: 'none', pitcher: 'adult', circleStop: true },
      tempo: {
        runner: 14.7, fielder: 14, pitchFlight: 0.75, delivery: 0.8, popTime: null,
        youthThrow: { v: 45, carry: 60, vLong: 28 },
        transfer: { inf: 0.55, of: 0.4, relay: 0.15 }, ground: { a: 0.35, v: 45 }, roll: 24, through: 32,
        hang: { fly: [1.2, 100], line: [0.1, 80], pop: [2.2, 200] }, reach: { fly: 40, pop: 40, line: 20 },
        lead: { steal: 0, first: 0, second: 0, third: 0 },
        tagTime: 0.5, sendMargin: 0.5, cutHome: 25, relayReach: null, trail: 15, pBackHome: 18, pBack3: 20,
      },
    },
    softball14: {
      label: 'Fastpitch softball (14U, 43 ft)',
      short: 'Softball 14U',
      sport: 'softball', level: 'junior',
      base: 60, mound: 43, backstop: -25, arc: 60,
      fences: [{ a: 0, ft: 200 }, { a: 22.5, ft: 205 }, { a: 45, ft: 210 }, { a: 67.5, ft: 205 }, { a: 90, ft: 200 }],
      infield: { '1B': [36.1, 43.1], '2B': [23, 80], SS: [-24, 80], '3B': [-33.9, 42.4] },
      dp: { '2B': [26, 73], SS: [-18, 78] },
      outfield: { corner: 140, cf: 155 },
      align: { runnerOnFirst: { '1B': [23.3, 30.4], '3B': [-23.3, 30.4], '2B': [26, 73] },
               slap: { '1B': [24.7, 31.8], '3B': [-21.2, 29.7], '2B': [26, 72], SS: [-32, 76], ofIn: 12 } },
      leadoffs: false,
      rules: { leave: 'release', droppedThird: true, stealing: 'full', pitcher: 'player' },
      tempo: {
        runner: 19.4, fielder: 18, pitchFlight: 0.53, delivery: 0.57, popTime: 2.25, drag: 0.0006,
        arms: { SS: 52, '3B': 52, '2B': 48, '1B': 47, LF: 52, CF: 54, RF: 53, C: 50, P: 46 }, carry: 120, vLong: 45,
        transfer: { inf: 0.55, of: 0.4, relay: 0.1 }, ground: { a: 0.15, v: 64 }, roll: 34, through: 36,
        hang: { fly: [1.6, 105], line: [0.2, 85], pop: [3.0, 200] }, pivot: 0.8, pBack3: 25,
        lead: { steal: 0, first: 9, second: 12, third: 8 },
        tagTime: 0.38, sendMargin: 0.35, cutHome: 30, relayReach: 110, trail: 15, pBackHome: 20,
        bunt: { a: 0.25, v: 35 }, stealFactor: 0.95, backPickExch: 0.7,
      },
    },
    softballHS: {
      label: 'High school softball (NFHS) · 16U–18U',
      short: 'Softball HS',
      sport: 'softball', level: 'hs',
      base: 60, mound: 43, backstop: -25, arc: 60,
      fences: [{ a: 0, ft: 200 }, { a: 22.5, ft: 212 }, { a: 45, ft: 220 }, { a: 67.5, ft: 212 }, { a: 90, ft: 200 }],
      infield: { '1B': [36.8, 43.8], '2B': [25, 83], SS: [-26, 84], '3B': [-33.2, 41.7] },
      dp: { '2B': [24, 76], SS: [-18, 78] },
      outfield: { corner: 148, cf: 165 },
      align: { runnerOnFirst: { '1B': [23.3, 30.4], '3B': [-23.3, 30.4], '2B': [24, 76] },
               slap: { '1B': [24.7, 31.8], '3B': [-21.2, 29.7], '2B': [26, 72], SS: [-32, 76], ofIn: 15 } },
      leadoffs: false,
      rules: { leave: 'release', droppedThird: true, stealing: 'full', pitcher: 'player' },
      tempo: {
        runner: 20.3, fielder: 19, pitchFlight: 0.46, delivery: 0.5, popTime: 2.15, drag: 0.0006,
        arms: { SS: 58, '3B': 58, '2B': 54, '1B': 53, LF: 58, CF: 60, RF: 59, C: 56, P: 52 }, carry: 145, vLong: 50,
        transfer: { inf: 0.55, of: 0.35, relay: 0.08 }, ground: { a: 0.15, v: 68 }, roll: 37, through: 38,
        hang: { fly: [1.8, 108], line: [0.2, 90], pop: [3.3, 190] }, pivot: 0.7, pBack3: 25,
        lead: { steal: 0, first: 10, second: 13, third: 9 },
        tagTime: 0.33, sendMargin: 0.3, cutHome: 30, relayReach: 125, trail: 15, pBackHome: 20,
        bunt: { a: 0.25, v: 35 }, stealFactor: 0.97, backPickExch: 0.65,
      },
    },
    softballCollege: {
      label: 'College softball (NCAA)',
      short: 'Softball college',
      sport: 'softball', level: 'college',
      base: 60, mound: 43, backstop: -28, arc: 60,
      fences: [{ a: 0, ft: 200 }, { a: 22.5, ft: 212 }, { a: 45, ft: 220 }, { a: 67.5, ft: 212 }, { a: 90, ft: 200 }],
      infield: { '1B': [37.5, 44.5], '2B': [26, 86], SS: [-28, 88], '3B': [-32.5, 41.0] },
      dp: { '2B': [24, 78], SS: [-20, 80] },
      outfield: { corner: 155, cf: 172 },
      align: { runnerOnFirst: { '1B': [23.3, 30.4], '3B': [-23.3, 30.4], '2B': [24, 76] },
               slap: { '1B': [24.7, 31.8], '3B': [-21.2, 29.7], '2B': [26, 72], SS: [-32, 76], ofIn: 15 } },
      leadoffs: false,
      rules: { leave: 'release', droppedThird: true, stealing: 'full', pitcher: 'player' },
      tempo: {
        runner: 21.0, fielder: 20, pitchFlight: 0.42, delivery: 0.46, popTime: 1.95, drag: 0.0006,
        arms: { SS: 63, '3B': 62, '2B': 58, '1B': 57, LF: 62, CF: 64, RF: 64, C: 61, P: 55 }, carry: 170, vLong: 56,
        transfer: { inf: 0.5, of: 0.3, relay: 0.06 }, ground: { a: 0.15, v: 72 }, roll: 40, through: 40,
        hang: { fly: [1.9, 110], line: [0.2, 95], pop: [3.5, 175] }, pivot: 0.65, pBack3: 25,
        lead: { steal: 0, first: 11, second: 14, third: 9 },
        tagTime: 0.26, sendMargin: 0.3, cutHome: 30, relayReach: 140, trail: 16, pBackHome: 20,
        bunt: { a: 0.25, v: 35 }, stealFactor: 1.03, backPickExch: 0.55,
      },
    },
    softballPro: {
      label: 'Pro & international softball (AUSL, WBSC)',
      short: 'Softball pro',
      sport: 'softball', level: 'pro',
      base: 60, mound: 43, backstop: -30, arc: 60,
      fences: [{ a: 0, ft: 210 }, { a: 22.5, ft: 220 }, { a: 45, ft: 225 }, { a: 67.5, ft: 220 }, { a: 90, ft: 210 }],
      infield: { '1B': [37.5, 44.5], '2B': [27, 88], SS: [-29, 90], '3B': [-32.5, 41.0] },
      dp: { '2B': [24, 80], SS: [-20, 82] },
      outfield: { corner: 162, cf: 178 },
      align: { runnerOnFirst: { '1B': [23.3, 30.4], '3B': [-23.3, 30.4], '2B': [24, 76] },
               slap: { '1B': [24.7, 31.8], '3B': [-21.2, 29.7], '2B': [26, 72], SS: [-32, 76], ofIn: 15 } },
      leadoffs: false,
      rules: { leave: 'release', droppedThird: true, stealing: 'full', pitcher: 'player' },
      tempo: {
        runner: 21.8, fielder: 21, pitchFlight: 0.38, delivery: 0.42, popTime: 1.85, drag: 0.0006,
        arms: { SS: 67, '3B': 66, '2B': 62, '1B': 60, LF: 66, CF: 68, RF: 68, C: 65, P: 58 }, carry: 185, vLong: 60,
        transfer: { inf: 0.45, of: 0.28, relay: 0.05 }, ground: { a: 0.15, v: 76 }, roll: 42, through: 42,
        hang: { fly: [2.0, 110], line: [0.2, 100], pop: [3.7, 170] }, pivot: 0.6, pBack3: 25,
        lead: { steal: 0, first: 12, second: 15, third: 10 },
        tagTime: 0.22, sendMargin: 0.25, cutHome: 30, relayReach: 150, trail: 18, pBackHome: 20,
        bunt: { a: 0.25, v: 35 }, stealFactor: 1.05, backPickExch: 0.5,
      },
    },

    // 90 ft levels. Depths, speed of play and conventions come from each level's own tables rather than from
    // scaling the 60 ft field (see simple-fielding-notes/levels-of-play-spec.md for the sources).
    junior90: {
      label: 'Baseball 90 ft (13U–14U)',
      short: '13U–14U',
      sport: 'baseball', level: 'junior',
      base: 90, mound: 60.5,
      fences: [{ a: 0, ft: 280 }, { a: 22.5, ft: 320 }, { a: 45, ft: 340 }, { a: 67.5, ft: 320 }, { a: 90, ft: 280 }],
      leadoffs: true, backstop: -35, arc: 95,
      infield: { '1B': [58, 78], '2B': [38, 124], SS: [-40, 124], '3B': [-64, 82] },
      dp: { '2B': [28, 118], SS: [-28, 118] },
      outfield: { corner: 240, cf: 262 },
      tempo: {
        bunt: { a: 0.3, v: 32 },
        runner: 19.4, fielder: 19, pitchFlight: 0.55, delivery: 1.6, popTime: 2.35,
        arms: { SS: 68, '3B': 68, '2B': 64, '1B': 64, LF: 70, CF: 70, RF: 72, C: 65, P: 60 }, carry: 150, vLong: 60,
        transfer: { inf: 0.6, of: 0.4, relay: 0.1 }, ground: { a: 0.15, v: 70 }, roll: 40, through: 40,
        hang: { fly: [1.6, 115], line: [0.4, 115], pop: [3.6, 170] }, pivot: 0.8, pBack3: 38,
        lead: { steal: 9, first: 14, second: 18, third: 10 },
        tagTime: 0.35, sendMargin: 0.35, cutHome: 40, relayReach: 140, trail: 20, pBackHome: 30,
      },
    },
    highSchool: {
      label: 'High school (NFHS)',
      short: 'High school',
      sport: 'baseball', level: 'hs',
      base: 90, mound: 60.5,
      fences: [{ a: 0, ft: 320 }, { a: 22.5, ft: 360 }, { a: 45, ft: 385 }, { a: 67.5, ft: 360 }, { a: 90, ft: 320 }],
      leadoffs: true, backstop: -40, arc: 95,
      infield: { '1B': [60, 80], '2B': [40, 128], SS: [-42, 128], '3B': [-66, 84] },
      dp: { '2B': [30, 122], SS: [-30, 122] },
      outfield: { corner: 260, cf: 285 },
      tempo: {
        bunt: { a: 0.3, v: 32 },
        runner: 20.7, fielder: 20, pitchFlight: 0.46, delivery: 1.5, popTime: 2.15,
        arms: { SS: 77, '3B': 77, '2B': 73, '1B': 73, LF: 80, CF: 80, RF: 82, C: 74, P: 70 }, carry: 200, vLong: 70,
        transfer: { inf: 0.55, of: 0.35, relay: 0.07 }, ground: { a: 0.15, v: 77 }, roll: 43, through: 43,
        hang: { fly: [1.8, 125], line: [0.45, 120], pop: [3.9, 160] }, pivot: 0.7, pBack3: 40,
        lead: { steal: 10, first: 16, second: 22, third: 12 },
        tagTime: 0.3, sendMargin: 0.3, cutHome: 45, relayReach: 160, trail: 20, pBackHome: 32,
      },
    },
    college: {
      label: 'College (NCAA)',
      short: 'College',
      sport: 'baseball', level: 'college',
      base: 90, mound: 60.5,
      fences: [{ a: 0, ft: 330 }, { a: 22.5, ft: 375 }, { a: 45, ft: 400 }, { a: 67.5, ft: 375 }, { a: 90, ft: 330 }],
      leadoffs: true, backstop: -50, arc: 95,
      infield: { '1B': [62, 82], '2B': [42, 134], SS: [-44, 134], '3B': [-68, 87] },
      dp: { '2B': [30, 126], SS: [-30, 126] },
      outfield: { corner: 280, cf: 305 },
      tempo: {
        bunt: { a: 0.3, v: 32 },
        runner: 21.4, fielder: 21, pitchFlight: 0.43, delivery: 1.4, popTime: 2.05,
        arms: { SS: 83, '3B': 83, '2B': 79, '1B': 79, LF: 85, CF: 85, RF: 87, C: 79, P: 75 }, carry: 240, vLong: 80,
        transfer: { inf: 0.5, of: 0.3, relay: 0.05 }, ground: { a: 0.15, v: 83 }, roll: 46, through: 46,
        hang: { fly: [2.0, 130], line: [0.5, 120], pop: [4.2, 150] }, pivot: 0.62, pBack3: 44,
        lead: { steal: 11, first: 17, second: 24, third: 13 },
        tagTime: 0.25, sendMargin: 0.3, cutHome: 45, relayReach: 175, trail: 22, pBackHome: 38,
      },
    },
    pro: {
      label: 'Pro (MLB / minor leagues)',
      short: 'Pro',
      sport: 'baseball', level: 'pro',
      base: 90, mound: 60.5,
      fences: [{ a: 0, ft: 330 }, { a: 22.5, ft: 375 }, { a: 45, ft: 400 }, { a: 67.5, ft: 375 }, { a: 90, ft: 330 }],
      leadoffs: true, backstop: -55, arc: 95,
      infield: { '1B': [64, 84], '2B': [44, 140], SS: [-46, 140], '3B': [-69, 89] },
      dp: { '2B': [30, 128], SS: [-30, 128] },
      outfield: { corner: 302, cf: 320 },
      tempo: {
        bunt: { a: 0.3, v: 32 },
        runner: 22.2, fielder: 22, pitchFlight: 0.4, delivery: 1.35, popTime: 2.0,
        arms: { SS: 86, '3B': 86, '2B': 81, '1B': 78, LF: 86, CF: 88, RF: 90.5, C: 81, P: 78 }, carry: 270, vLong: 85,
        transfer: { inf: 0.45, of: 0.25, relay: 0.05 }, ground: { a: 0.15, v: 87 }, roll: 48, through: 48,
        hang: { fly: [2.2, 130], line: [0.5, 120], pop: [4.5, 150] }, pivot: 0.55, pBack3: 45,
        lead: { steal: 11.6, first: 18, second: 25, third: 14 },
        tagTime: 0.2, sendMargin: 0.25, cutHome: 45, relayReach: 190, trail: 25, pBackHome: 40,
      },
    },
  };

  // Speed of play for the youth fields: what the engine has always used (10-12 year olds). A level's own `tempo`
  // replaces any of these.
  const YOUTH_TEMPO = {
    runner: 17, fielder: 17, pitchFlight: 0.75, delivery: 0.75, popTime: null,
    arms: null, // youth throws use the fixed youth curve (engine.throwTime)
    transfer: { inf: 0.35, of: 0.3, relay: 0.1 }, ground: { a: 0.3, v: 60 }, roll: 30, through: 45,
    hang: { fly: [1.5, 110], line: [0.1, 95], pop: [2.6, 200] },
    reach: { fly: 55, pop: 55, line: 28 },
    lead: { steal: 8, first: 8, second: 8, third: 8 },
    tagTime: 0.4, sendMargin: 0.4, cutHome: null, relayReach: null, trail: 18, pBackHome: 22, pivot: null, pBack3: 30,
    bunt: { a: 0.4, v: 20 }, stealFactor: null, backPickExch: null,
  };

  const POSITIONS = ['P', 'C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF'];

  const NAMES = {
    P: 'Pitcher', C: 'Catcher', '1B': 'First base', '2B': 'Second base', SS: 'Shortstop',
    '3B': 'Third base', LF: 'Left field', CF: 'Center field', RF: 'Right field',
  };

  // How a sentence refers to the player: "the shortstop", "the left fielder".
  const PLAYERS = {
    P: 'pitcher', C: 'catcher', '1B': 'first baseman', '2B': 'second baseman', SS: 'shortstop',
    '3B': 'third baseman', LF: 'left fielder', CF: 'center fielder', RF: 'right fielder',
  };

  const BASE_NAMES = { home: 'home', first: '1st', second: '2nd', third: '3rd' };
  const BASE_ORDER = ['home', 'first', 'second', 'third', 'home'];

  /*
   * The outfield fence. A league (or a ballpark) gives either one distance, for a round fence, or a profile:
   * points of { a, ft }, where `a` is the angle in degrees from the 1st-base line (0) through straightaway
   * center (45) to the 3rd-base line (90). Distances between the points are interpolated smoothly.
   */
  function fenceProfile(L) {
    if (L.fences && L.fences.length) return L.fences.slice().sort((p, q) => p.a - q.a);
    return [{ a: 0, ft: L.fence }, { a: 90, ft: L.fence }];
  }
  function angleOf(p) {
    return Math.atan2(p.y, p.x) * 180 / Math.PI - 45;
  }
  function fenceAtAngle(profile, a) {
    const A = Math.max(0, Math.min(90, a));
    if (A <= profile[0].a) return profile[0].ft;
    for (let i = 1; i < profile.length; i++) {
      const p = profile[i - 1], q = profile[i];
      if (A <= q.a) {
        // Cosine easing: walls curve between the published distances instead of kinking at each one.
        const t = (A - p.a) / (q.a - p.a || 1);
        const e = (1 - Math.cos(t * Math.PI)) / 2;
        return p.ft + (q.ft - p.ft) * e;
      }
    }
    return profile[profile.length - 1].ft;
  }

  const PARKS = ((typeof module !== 'undefined' && module.exports) ? require('./parks.js') : root.Parks || {}).PARKS || [];

  // The parks that go with a field: big-league parks for the 90 ft levels, the Series fields for Little League.
  function parksFor(leagueKey) {
    const L = LEAGUES[leagueKey];
    if (!L || L.sport !== 'baseball') return [];
    if (L.base === 90) return PARKS.filter((p) => p.for === 'pro');
    if (leagueKey === 'littleLeague') return PARKS.filter((p) => p.for === 'littleLeague');
    return [];
  }

  function geometry(leagueKey, parkKey) {
    const base = LEAGUES[leagueKey] || LEAGUES.littleLeague;
    const park = parkKey ? parksFor(leagueKey).find((p) => p.key === parkKey) : null;
    const L = park ? Object.assign({}, base, { fences: park.fence }) : base;
    const profile = fenceProfile(L);
    const fenceAt = (p) => fenceAtAngle(profile, angleOf(p));
    const fenceDir = (a) => fenceAtAngle(profile, a);
    const b = L.base;
    const s = b / Math.SQRT2;
    const k = b / 60;
    // The distance to straightaway center: what depths and scale are measured against.
    const F = fenceDir(45);
    const Fmax = Math.max(...profile.map((p) => p.ft));
    const softball = L.sport === 'softball';
    // A point `along` feet from home up a baseline, `inside` feet into fair territory.
    const polar = (a, r) => {
      const t = (a + 45) * Math.PI / 180;
      return { x: Math.cos(t) * r, y: Math.sin(t) * r };
    };
    const tempo = Object.assign({}, YOUTH_TEMPO, L.tempo || {});
    if (L.sport === 'softball' && !L.tempo) tempo.runner = 18;
    // A level with its own tempo works out catch reach from hang time (engine.catchReach), unless it sets its own.
    if (L.tempo && !L.tempo.reach) tempo.reach = null;
    const P2 = (xy) => ({ x: xy[0], y: xy[1] });
    // Outfielders at a level's own depth, but never closer than 30 ft to this park's wall.
    const ofAt = (a, depth) => polar(a, Math.min(depth, fenceDir(a) - 30));
    const onLine = (sign, along, inside) => ({ x: sign * (along - inside) / Math.SQRT2, y: (along + inside) / Math.SQRT2 });
    // Outfielders play shallower in softball: about two thirds of the way to the fence, not 85%.
    const of = softball ? 0.8 : 1;

    const bases = {
      home: { x: 0, y: 0 },
      first: { x: s, y: s },
      second: { x: 0, y: 2 * s },
      third: { x: -s, y: s },
    };

    return {
      league: L,
      key: leagueKey,
      base: b,
      side: s,
      bases,
      mound: { x: 0, y: L.mound },
      fence: F,
      park: park ? park.key : null,
      tempo,
      // Older levels (13U-14U baseball and up, 14U softball and up) play by their own tables and speed; the
      // youth fields keep the numbers the engine was built on. 90 ft baseball adds a few rules of its own.
      older: !!(L.tempo && L.level !== 'youth8'),
      big: !!(L.tempo && L.base === 90),
      rules: Object.assign({ leave: L.sport === 'softball' ? 'release' : 'pitch', droppedThird: true, stealing: 'full', pitcher: 'player' }, L.rules || {}),
      fenceMax: Fmax,
      fenceAt,
      fenceDir,
      fenceProfile: profile,
      // The dirt ends a little behind the base paths; anything past this is outfield grass.
      infieldEdge: L.arc ? L.mound + L.arc : 2 * s + 25 * k,
      grassRadius: L.mound + 38 * k,
      backstop: L.backstop || -25 * k,
      dp: L.dp ? { '2B': P2(L.dp['2B']), SS: P2(L.dp.SS) } : null,
      ready: L.infield ? {
        P: L.pReady ? P2(L.pReady) : { x: 0, y: L.mound },
        C: { x: 0, y: -5 },
        '1B': P2(L.infield['1B']), '2B': P2(L.infield['2B']), SS: P2(L.infield.SS), '3B': P2(L.infield['3B']),
        LF: ofAt(75, L.outfield.corner),
        CF: ofAt(45, L.outfield.cf),
        RF: ofAt(15, L.outfield.corner),
      } : {
        P: { x: 0, y: L.mound },
        C: { x: 0, y: -5 },
        // Baseball corners play behind the bag; softball corners play even with it or a step in
        // front, because of the bunt and the slap.
        '1B': softball ? onLine(1, 54 * k, 6 * k) : { x: s - 2 * k, y: s + 14 * k },
        '2B': { x: 22 * k, y: 2 * s - 5 * k },
        SS: { x: -22 * k, y: 2 * s - 5 * k },
        '3B': softball ? onLine(-1, 54 * k, 6 * k) : { x: -s + 2 * k, y: s + 14 * k },
        LF: polar(77, 0.849 * fenceDir(77) * of),
        CF: polar(45, 0.85 * F * of),
        RF: polar(13, 0.849 * fenceDir(13) * of),
      },
      onLine,
    };
  }

  /*
   * Where the fielders stand before the pitch, given who is on base. Middle infielders cheat toward
   * second when a double play is on; the first baseman holds a runner on where leadoffs are allowed.
   */
  function readyPositions(geo, situation) {
    const r = Object.assign({}, geo.ready);
    for (const p in r) r[p] = { x: r[p].x, y: r[p].y };
    const run = (situation && situation.runners) || {};
    const outs = (situation && situation.outs) || 0;
    const k = geo.base / 60;
    const depth = (situation && situation.depth) || 'auto';
    const dpSpots = () => {
      r['2B'] = geo.dp ? { ...geo.dp['2B'] } : { x: 16 * k, y: 2 * geo.side - 10 * k };
      r.SS = geo.dp ? { ...geo.dp.SS } : { x: -16 * k, y: 2 * geo.side - 10 * k };
    };
    if ((depth === 'auto' && run.first && outs < 2) || depth === 'dp') dpSpots();
    if (run.first && !run.second && situation && situation.leadoffs) {
      r['1B'] = { x: geo.side - 2 * k, y: geo.side + 2 * k };
    }
    // Softball bunt/slap alignment: with a runner on 1st and less than two outs, the corners come in to
    // 30-40 ft from the plate and the second baseman shades toward 1st to cover it on the bunt.
    const align = geo.league.align;
    if (geo.league.sport === 'softball' && run.first && outs < 2 && geo.rules.stealing !== 'none') {
      if (align && align.runnerOnFirst) for (const p in align.runnerOnFirst) r[p] = { x: align.runnerOnFirst[p][0], y: align.runnerOnFirst[p][1] };
      else {
        r['1B'] = geo.onLine(1, 38 * k, 5 * k);
        r['3B'] = geo.onLine(-1, 38 * k, 5 * k);
        r['2B'] = { x: 26 * k, y: 2 * geo.side - 12 * k };
      }
    }
    // A slapper at the plate: corners in (crash the bunt, read the slap), SS toward the hole, 2B toward 1st to cover
    // it, and the outfield a few steps in.
    if (geo.league.sport === 'softball' && situation && situation.batter === 'S') {
      const sl = (align && align.slap) || { '1B': [24.7, 31.8], '3B': [-21.2, 29.7], '2B': [24, 70], SS: [-30, 72], ofIn: 10 };
      for (const p of ['1B', '3B', '2B', 'SS']) r[p] = { x: sl[p][0], y: sl[p][1] };
      for (const p of ['LF', 'CF', 'RF']) {
        const d = Math.hypot(r[p].x, r[p].y);
        const f = (d - sl.ofIn * (p === 'RF' ? 0.6 : 1)) / d;
        r[p] = { x: r[p].x * f, y: r[p].y * f };
      }
    }
    // Infield in: everybody on the edge of the grass, even with (or in front of) the baseline, to cut off the run.
    // Corners in: the corners in, the middle infielders at normal depth.
    const B = geo.base, softball = geo.league.sport === 'softball';
    if (depth === 'in' || depth === 'cornersIn') {
      const cornerAlong = (softball ? 0.75 : 0.89) * B;
      r['1B'] = geo.onLine(1, cornerAlong, 6 * k);
      r['3B'] = geo.onLine(-1, cornerAlong, 6 * k);
      if (depth === 'in') {
        r['2B'] = { x: 0.31 * B, y: (softball ? 1.07 : 1.04) * B };
        r.SS = { x: -0.31 * B, y: (softball ? 1.07 : 1.04) * B };
      } else if (geo.ready) {
        r['2B'] = { ...geo.ready['2B'] };
        r.SS = { ...geo.ready.SS };
      }
    }
    // Where the coach put fielders in the scenario builder.
    const start = situation && situation.start;
    if (start) for (const pos of POSITIONS) if (start[pos] && Number.isFinite(start[pos].x)) r[pos] = { x: start[pos].x, y: start[pos].y };
    return r;
  }

  function isFair(p) {
    return p.y >= 0 && Math.abs(p.x) <= p.y;
  }

  const api = { PARKS, parksFor, YOUTH_TEMPO, LEAGUES, POSITIONS, NAMES, PLAYERS, BASE_NAMES, BASE_ORDER, geometry, readyPositions, isFair, angleOf };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Field = api;
})(typeof window !== 'undefined' ? window : globalThis);
