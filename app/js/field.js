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
      label: 'Fastpitch softball',
      short: 'Softball 60 ft',
      sport: 'softball',
      base: 60, mound: 40, fence: 200,
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

  function geometry(leagueKey) {
    const L = LEAGUES[leagueKey] || LEAGUES.littleLeague;
    const b = L.base;
    const s = b / Math.SQRT2;
    const k = b / 60;
    const F = L.fence;

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
      // The dirt ends a little behind the base paths; anything past this is outfield grass.
      infieldEdge: 2 * s + 25 * k,
      grassRadius: L.mound + 38 * k,
      backstop: -25 * k,
      ready: {
        P: { x: 0, y: L.mound },
        C: { x: 0, y: -5 },
        '1B': { x: s - 2 * k, y: s + 14 * k },
        '2B': { x: 22 * k, y: 2 * s - 5 * k },
        SS: { x: -22 * k, y: 2 * s - 5 * k },
        '3B': { x: -s + 2 * k, y: s + 14 * k },
        LF: { x: -0.45 * F, y: 0.72 * F },
        CF: { x: 0, y: 0.85 * F },
        RF: { x: 0.45 * F, y: 0.72 * F },
      },
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
    return r;
  }

  function isFair(p) {
    return p.y >= 0 && Math.abs(p.x) <= p.y;
  }

  const api = { LEAGUES, POSITIONS, NAMES, PLAYERS, BASE_NAMES, BASE_ORDER, geometry, readyPositions, isFair };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Field = api;
})(typeof window !== 'undefined' ? window : globalThis);
