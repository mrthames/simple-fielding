/*
 * Ballpark outfield shapes, drawn from published fence distances (team and ballpark sites, Wikipedia infoboxes,
 * ballparksofbaseball.com), as of 2026. Distances are what each park posts; `approx` marks a distance the sources
 * disagree on, or an angle placed by eye from a diagram. `a` is degrees from the 1st-base line (0) through
 * straightaway center (45) to the 3rd-base line (90).
 *
 * Names only, to identify the park: no logos, colors or branding. Simple Fielding is not affiliated with or
 * endorsed by MLB, any MLB club, or Little League Baseball, Inc.
 */
(function (root) {
  'use strict';

  const PARKS = [
  { key: 'orioles-camden', team: "Orioles", park: "Oriole Park at Camden Yards", sport: 'baseball', for: 'pro',
    fence: [{ a: 0, ft: 318 }, { a: 22.5, ft: 373 }, { a: 45, ft: 400, approx: true }, { a: 67.5, ft: 376 }, { a: 90, ft: 333 }] },
  { key: 'redsox-fenway', team: "Red Sox", park: "Fenway Park", sport: 'baseball', for: 'pro',
    fence: [{ a: 0, ft: 302 }, { a: 22.5, ft: 380 }, { a: 35, ft: 420, approx: true }, { a: 45, ft: 390 }, { a: 67.5, ft: 379 }, { a: 90, ft: 310 }] },
  { key: 'yankees-stadium', team: "Yankees", park: "Yankee Stadium", sport: 'baseball', for: 'pro',
    fence: [{ a: 0, ft: 314 }, { a: 22.5, ft: 385 }, { a: 45, ft: 408 }, { a: 67.5, ft: 399 }, { a: 90, ft: 318 }] },
  { key: 'rays-tropicana', team: "Rays", park: "Tropicana Field", sport: 'baseball', for: 'pro',
    fence: [{ a: 0, ft: 322 }, { a: 22.5, ft: 370 }, { a: 45, ft: 404 }, { a: 67.5, ft: 370 }, { a: 90, ft: 315 }] },
  { key: 'bluejays-rogers', team: "Blue Jays", park: "Rogers Centre", sport: 'baseball', for: 'pro',
    fence: [{ a: 0, ft: 328 }, { a: 22.5, ft: 359 }, { a: 30, ft: 372, approx: true }, { a: 45, ft: 400 }, { a: 60, ft: 381, approx: true }, { a: 67.5, ft: 368 }, { a: 90, ft: 328 }] },
  { key: 'whitesox-rate', team: "White Sox", park: "Rate Field", sport: 'baseball', for: 'pro',
    fence: [{ a: 0, ft: 335 }, { a: 22.5, ft: 375 }, { a: 45, ft: 400 }, { a: 67.5, ft: 375 }, { a: 90, ft: 330 }] },
  { key: 'guardians-progressive', team: "Guardians", park: "Progressive Field", sport: 'baseball', for: 'pro',
    fence: [{ a: 0, ft: 325 }, { a: 22.5, ft: 375 }, { a: 45, ft: 400 }, { a: 50, ft: 410, approx: true }, { a: 67.5, ft: 370 }, { a: 90, ft: 325 }] },
  { key: 'tigers-comerica', team: "Tigers", park: "Comerica Park", sport: 'baseball', for: 'pro',
    fence: [{ a: 0, ft: 330 }, { a: 22.5, ft: 365 }, { a: 45, ft: 412 }, { a: 67.5, ft: 370 }, { a: 90, ft: 342 }] },
  { key: 'royals-kauffman', team: "Royals", park: "Kauffman Stadium", sport: 'baseball', for: 'pro',
    fence: [{ a: 0, ft: 330 }, { a: 22.5, ft: 379 }, { a: 45, ft: 410 }, { a: 67.5, ft: 379 }, { a: 90, ft: 330 }] },
  { key: 'twins-target', team: "Twins", park: "Target Field", sport: 'baseball', for: 'pro',
    fence: [{ a: 0, ft: 328 }, { a: 22.5, ft: 367 }, { a: 40, ft: 403, approx: true }, { a: 45, ft: 411 }, { a: 67.5, ft: 377 }, { a: 90, ft: 339 }] },
  { key: 'astros-daikin', team: "Astros", park: "Daikin Park", sport: 'baseball', for: 'pro',
    fence: [{ a: 0, ft: 326 }, { a: 22.5, ft: 370 }, { a: 33, ft: 408, approx: true }, { a: 45, ft: 409 }, { a: 58, ft: 399, approx: true }, { a: 67.5, ft: 366 }, { a: 90, ft: 315 }] },
  { key: 'angels-stadium', team: "Angels", park: "Angel Stadium", sport: 'baseball', for: 'pro',
    fence: [{ a: 0, ft: 350 }, { a: 22.5, ft: 370 }, { a: 45, ft: 396 }, { a: 67.5, ft: 390 }, { a: 90, ft: 347 }] },
  { key: 'athletics-sutter', team: "Athletics", park: "Sutter Health Park", sport: 'baseball', for: 'pro',
    fence: [{ a: 0, ft: 325 }, { a: 22.5, ft: 380, approx: true }, { a: 45, ft: 403 }, { a: 67.5, ft: 380, approx: true }, { a: 90, ft: 330 }] },
  { key: 'mariners-tmobile', team: "Mariners", park: "T-Mobile Park", sport: 'baseball', for: 'pro',
    fence: [{ a: 0, ft: 326 }, { a: 22.5, ft: 381 }, { a: 45, ft: 401 }, { a: 67.5, ft: 378 }, { a: 90, ft: 331 }] },
  { key: 'rangers-globelife', team: "Rangers", park: "Globe Life Field", sport: 'baseball', for: 'pro',
    fence: [{ a: 0, ft: 326 }, { a: 22.5, ft: 374 }, { a: 45, ft: 407 }, { a: 67.5, ft: 372 }, { a: 90, ft: 329 }] },
  { key: 'braves-truist', team: "Braves", park: "Truist Park", sport: 'baseball', for: 'pro',
    fence: [{ a: 0, ft: 325 }, { a: 22.5, ft: 375 }, { a: 45, ft: 400 }, { a: 67.5, ft: 385 }, { a: 90, ft: 335 }] },
  { key: 'marlins-loandepot', team: "Marlins", park: "loanDepot park", sport: 'baseball', for: 'pro',
    fence: [{ a: 0, ft: 335 }, { a: 22.5, ft: 387 }, { a: 45, ft: 400 }, { a: 67.5, ft: 386 }, { a: 90, ft: 344 }] },
  { key: 'mets-citi', team: "Mets", park: "Citi Field", sport: 'baseball', for: 'pro',
    fence: [{ a: 0, ft: 330 }, { a: 22.5, ft: 375 }, { a: 32, ft: 398, approx: true }, { a: 45, ft: 408 }, { a: 58, ft: 385, approx: true }, { a: 67.5, ft: 358 }, { a: 90, ft: 335 }] },
  { key: 'phillies-cbp', team: "Phillies", park: "Citizens Bank Park", sport: 'baseball', for: 'pro',
    fence: [{ a: 0, ft: 330 }, { a: 22.5, ft: 369 }, { a: 45, ft: 401 }, { a: 50, ft: 409, approx: true }, { a: 67.5, ft: 374 }, { a: 90, ft: 329 }] },
  { key: 'nationals-park', team: "Nationals", park: "Nationals Park", sport: 'baseball', for: 'pro',
    fence: [{ a: 0, ft: 335 }, { a: 22.5, ft: 370 }, { a: 45, ft: 402 }, { a: 67.5, ft: 377 }, { a: 90, ft: 337 }] },
  { key: 'cubs-wrigley', team: "Cubs", park: "Wrigley Field", sport: 'baseball', for: 'pro',
    fence: [{ a: 0, ft: 353 }, { a: 22.5, ft: 368 }, { a: 45, ft: 400 }, { a: 67.5, ft: 368 }, { a: 90, ft: 355 }] },
  { key: 'reds-gabp', team: "Reds", park: "Great American Ball Park", sport: 'baseball', for: 'pro',
    fence: [{ a: 0, ft: 325 }, { a: 22.5, ft: 370 }, { a: 45, ft: 404 }, { a: 67.5, ft: 379 }, { a: 90, ft: 328 }] },
  { key: 'brewers-amfam', team: "Brewers", park: "American Family Field", sport: 'baseball', for: 'pro',
    fence: [{ a: 0, ft: 337, approx: true }, { a: 22.5, ft: 374, approx: true }, { a: 45, ft: 400 }, { a: 67.5, ft: 371, approx: true }, { a: 90, ft: 342, approx: true }] },
  { key: 'pirates-pnc', team: "Pirates", park: "PNC Park", sport: 'baseball', for: 'pro',
    fence: [{ a: 0, ft: 320 }, { a: 22.5, ft: 375 }, { a: 45, ft: 399 }, { a: 58, ft: 410, approx: true }, { a: 67.5, ft: 383 }, { a: 90, ft: 325 }] },
  { key: 'cardinals-busch', team: "Cardinals", park: "Busch Stadium", sport: 'baseball', for: 'pro',
    fence: [{ a: 0, ft: 335 }, { a: 22.5, ft: 375 }, { a: 45, ft: 400 }, { a: 67.5, ft: 375 }, { a: 90, ft: 336 }] },
  { key: 'dbacks-chase', team: "Diamondbacks", park: "Chase Field", sport: 'baseball', for: 'pro',
    fence: [{ a: 0, ft: 335 }, { a: 22.5, ft: 376 }, { a: 45, ft: 407 }, { a: 67.5, ft: 376 }, { a: 90, ft: 330 }] },
  { key: 'rockies-coors', team: "Rockies", park: "Coors Field", sport: 'baseball', for: 'pro',
    fence: [{ a: 0, ft: 350 }, { a: 22.5, ft: 375 }, { a: 45, ft: 415 }, { a: 67.5, ft: 390 }, { a: 90, ft: 347 }] },
  { key: 'dodgers-stadium', team: "Dodgers", park: "Dodger Stadium", sport: 'baseball', for: 'pro',
    fence: [{ a: 0, ft: 330 }, { a: 15, ft: 360, approx: true }, { a: 22.5, ft: 375 }, { a: 45, ft: 395 }, { a: 67.5, ft: 375 }, { a: 75, ft: 360, approx: true }, { a: 90, ft: 330 }] },
  { key: 'padres-petco', team: "Padres", park: "Petco Park", sport: 'baseball', for: 'pro',
    fence: [{ a: 0, ft: 322 }, { a: 22.5, ft: 391 }, { a: 45, ft: 396 }, { a: 67.5, ft: 386 }, { a: 90, ft: 336 }] },
  { key: 'giants-oracle', team: "Giants", park: "Oracle Park", sport: 'baseball', for: 'pro',
    fence: [{ a: 0, ft: 309 }, { a: 10, ft: 365, approx: true }, { a: 22.5, ft: 415 }, { a: 45, ft: 391 }, { a: 67.5, ft: 399 }, { a: 80, ft: 354, approx: true }, { a: 90, ft: 339 }] },
  { key: 'giants-candlestick', team: "Giants", park: "Candlestick Park", sport: 'baseball', for: 'pro', historical: true,
    fence: [{ a: 0, ft: 328 }, { a: 22.5, ft: 365 }, { a: 45, ft: 400 }, { a: 67.5, ft: 365 }, { a: 90, ft: 335 }] },
  { key: 'athletics-coliseum', team: "Athletics", park: "Oakland Coliseum", sport: 'baseball', for: 'pro', historical: true,
    fence: [{ a: 0, ft: 330 }, { a: 22.5, ft: 388 }, { a: 45, ft: 400 }, { a: 67.5, ft: 388 }, { a: 90, ft: 330 }] },
  { key: 'rays-steinbrenner', team: "Rays", park: "George M. Steinbrenner Field", sport: 'baseball', for: 'pro', historical: true,
    fence: [{ a: 0, ft: 314 }, { a: 22.5, ft: 385 }, { a: 45, ft: 408 }, { a: 67.5, ft: 399 }, { a: 90, ft: 318 }] },
  { key: 'llws-lamade', team: "Little League World Series", park: "Howard J. Lamade Stadium", sport: 'baseball', for: 'littleLeague',
    fence: [{ a: 0, ft: 225 }, { a: 22.5, ft: 225 }, { a: 45, ft: 225 }, { a: 67.5, ft: 225 }, { a: 90, ft: 225 }] },
  { key: 'llws-volunteer', team: "Little League World Series", park: "Little League Volunteer Stadium", sport: 'baseball', for: 'littleLeague',
    fence: [{ a: 0, ft: 225 }, { a: 22.5, ft: 225 }, { a: 45, ft: 225 }, { a: 67.5, ft: 225 }, { a: 90, ft: 225 }] },
];

  const api = { PARKS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Parks = api;
})(typeof window !== 'undefined' ? window : globalThis);
