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

  function geometry(leagueKey) {
    const L = LEAGUES[leagueKey] || LEAGUES.littleLeague;
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
      fenceMax: Fmax,
      fenceAt,
      fenceDir,
      fenceProfile: profile,
      // The dirt ends a little behind the base paths; anything past this is outfield grass.
      infieldEdge: 2 * s + 25 * k,
      grassRadius: L.mound + 38 * k,
      backstop: -25 * k,
      ready: {
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
    if (run.first && outs < 2) {
      r['2B'] = { x: 16 * k, y: 2 * geo.side - 10 * k };
      r.SS = { x: -16 * k, y: 2 * geo.side - 10 * k };
    }
    if (run.first && !run.second && situation && situation.leadoffs) {
      r['1B'] = { x: geo.side - 2 * k, y: geo.side + 2 * k };
    }
    // Softball bunt/slap alignment: with a runner on 1st and less than two outs, the corners come in to
    // 30-40 ft from the plate and the second baseman shades toward 1st to cover it on the bunt.
    if (geo.league.sport === 'softball' && run.first && outs < 2) {
      r['1B'] = geo.onLine(1, 38 * k, 5 * k);
      r['3B'] = geo.onLine(-1, 38 * k, 5 * k);
      r['2B'] = { x: 26 * k, y: 2 * geo.side - 12 * k };
    }
    return r;
  }

  function isFair(p) {
    return p.y >= 0 && Math.abs(p.x) <= p.y;
  }

  const api = { LEAGUES, POSITIONS, NAMES, PLAYERS, BASE_NAMES, BASE_ORDER, geometry, readyPositions, isFair, angleOf };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Field = api;
})(typeof window !== 'undefined' ? window : globalThis);
