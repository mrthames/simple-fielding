/*
 * Share links and saved plays.
 *
 * A play is packed into a few bytes and written into the link after `#p=`. Browsers never send the part after
 * `#` to the server, so a shared play is never stored or logged anywhere: the link is the play. A play the app
 * answers (field, runners, outs, where the ball went) comes to about 14 characters; a name adds its length.
 *
 * Saved plays ("My plays") live on this device, as a list of names and codes. Share links and the export file
 * are the copies that survive clearing the browser.
 *
 * The lists below are append-only: a new league, kind or result goes on the end, so old links keep working.
 */
(function (root) {
  'use strict';

  const LEAGUES = ['littleLeague', 'intermediate', 'softball', 'softball10', 'junior90', 'highSchool', 'college', 'pro',
    'softball8', 'softball14', 'softballHS', 'softballCollege', 'softballPro'];
  const KINDS = ['ground', 'line', 'fly', 'pop', 'bunt', 'steal2', 'steal3', 'firstThirdSteal', 'passedBall', 'primaryLead', 'secondaryLead', 'pitch', 'drawn', 'lookBack', 'delayedSteal', 'droppedThird', 'rundown', 'script'];
  const ACTIONS = ['return', 'hesitate', 'break', 'drift'];
  const DEPTHS = ['auto', 'normal', 'dp', 'in', 'cornersIn'];
  const D13 = ['auto', 'through', 'cut', 'pitcher', 'third', 'cutSS'];
  const BUNTD = ['auto', 'standard', 'wheel', 'crash'];
  const BASES = ['first', 'second', 'third'];
  const POS = ['P', 'C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF'];
  const RESULTS = [undefined, 'out', 'single', 'double', 'triple', 'error'];
  const ERRORS = ['bobble', 'legs', 'throw'];
  const VERSION = 1;
  const KEY = 'sf.myplays';

  const Field = (typeof module !== 'undefined' && module.exports) ? require('./field.js') : root.Field;

  function toB64url(bytes) {
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    const b64 = typeof btoa !== 'undefined' ? btoa(s) : Buffer.from(s, 'binary').toString('base64');
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function fromB64url(str) {
    let s = str.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bin = typeof atob !== 'undefined' ? atob(s) : Buffer.from(s, 'base64').toString('binary');
    return Array.from(bin, (c) => c.charCodeAt(0));
  }
  const utf8 = (s) => (typeof TextEncoder !== 'undefined' ? Array.from(new TextEncoder().encode(s)) : Array.from(Buffer.from(s, 'utf8')));
  const unutf8 = (b) => (typeof TextDecoder !== 'undefined' ? new TextDecoder().decode(new Uint8Array(b)) : Buffer.from(b).toString('utf8'));

  // Coordinates in half-feet, as signed 16-bit numbers.
  const put16 = (out, v) => { const n = Math.max(-32768, Math.min(32767, Math.round(v * 2))) & 0xffff; out.push(n >> 8, n & 0xff); };
  const get16 = (b, i) => { let n = (b[i] << 8) | b[i + 1]; if (n & 0x8000) n -= 0x10000; return n / 2; };

  // A play built step by step (Build a play, script.js): the title, then each step. Byte 0 of a step is the action
  // (low 3 bits) and what follows it: bit 3 runner orders, bit 4 fielder moves, bit 5 a caption, bit 6 a "safe" call
  // (out is the default), bit 7 a spot (where the ball goes, the catch, or the run).
  const S_ACT = ['pitch', 'pickoff', 'field', 'throw', 'run', 'tag', 'base', 'hold'];
  const S_RES = ['caught', 'hit', 'passed', 'dropped'];
  const S_HIT = ['ground', 'line', 'fly', 'pop', 'bunt'];
  const S_RUN = ['first', 'second', 'third', 'batter'];
  const S_BASE = ['first', 'second', 'third', 'home'];
  function packScript(out, event) {
    const steps = (event.steps || []).slice(0, 40);
    const title = event.title ? utf8(String(event.title).slice(0, 60)).slice(0, 90) : [];
    out.push(title.length); out.push(...title);
    out.push(steps.length);
    for (const st of steps) packStep(out, st);
  }
  function packStep(out, st) {
    const a = Math.max(0, S_ACT.indexOf(st.a));
    const runners = Object.entries(st.runners || {}).filter(([id, o]) => S_RUN.includes(id) && o);
    const moves = Object.entries(st.move || {}).filter(([p, v]) => POS.includes(p) && v && Number.isFinite(v.x));
    const cap = st.cap ? utf8(String(st.cap).slice(0, 40)).slice(0, 60) : [];
    const spot = st.a === 'pitch' ? (st.r === 'hit' ? st.hit && st.hit.at : st.at) : st.at;
    const hasSpot = !!(spot && Number.isFinite(spot.x)) && st.a !== 'pickoff';
    out.push(a | (runners.length ? 8 : 0) | (moves.length ? 16 : 0) | (cap.length ? 32 : 0) | (st.call === 'safe' ? 64 : 0) | (hasSpot ? 128 : 0));
    if (st.a === 'pitch') out.push(Math.max(0, S_RES.indexOf(st.r || 'caught')) | (Math.max(0, S_HIT.indexOf((st.hit || {}).kind)) << 2));
    else if (st.a === 'pickoff') out.push(Math.max(0, S_BASE.indexOf(st.base)));
    else if (st.a === 'field') out.push(Math.max(0, POS.indexOf(st.by)) | (st.call === 'out' ? 16 : 0));
    else if (st.a === 'throw') out.push(Math.max(0, POS.indexOf(st.to)) | ((S_BASE.indexOf(st.fake) + 1) << 4));
    else if (st.a === 'tag') out.push(Math.max(0, S_RUN.indexOf(st.runner)));
    else if (st.a === 'base') out.push(Math.max(0, S_BASE.indexOf(st.base)) | ((S_RUN.indexOf(st.runner) + 1) << 2));
    if (hasSpot) { put16(out, spot.x); put16(out, spot.y); }
    if (runners.length) {
      out.push(runners.length);
      for (const [id, o] of runners) {
        const kind = o.hold ? 0 : o.go ? 1 : 2;
        out.push(S_RUN.indexOf(id) | (kind << 2) | ((o.go ? Math.max(0, S_BASE.indexOf(o.go)) : 0) << 4));
        if (kind === 2) put16(out, (Number(o.stop) || 0) * 10);
      }
    }
    if (moves.length) {
      out.push(moves.length);
      for (const [p, v] of moves) { out.push(POS.indexOf(p)); put16(out, v.x); put16(out, v.y); }
    }
    if (cap.length) { out.push(cap.length); out.push(...cap); }
  }
  function unpackScript(b, i) {
    const tl = b[i++];
    const title = tl ? unutf8(b.slice(i, i + tl)) : '';
    i += tl;
    const n = b[i++];
    const steps = [];
    for (let k = 0; k < n; k++) { const u = unpackStep(b, i); steps.push(u.st); i = u.i; }
    return { title, steps, i };
  }
  function unpackStep(b, i) {
    const h = b[i++];
    const st = { a: S_ACT[h & 7] };
    if (h & 64) st.call = 'safe';
    let spot = null;
    const x = st.a === 'run' || st.a === 'hold' ? null : b[i++];
    if (st.a === 'pitch') { st.r = S_RES[x & 3]; if (st.r === 'hit') st.hit = { kind: S_HIT[(x >> 2) & 7] || 'ground' }; }
    else if (st.a === 'pickoff') st.base = S_BASE[x & 3];
    else if (st.a === 'field') { st.by = POS[x & 15]; if (x & 16) st.call = 'out'; }
    else if (st.a === 'throw') { st.to = POS[x & 15]; const fk = (x >> 4) & 7; if (fk) st.fake = S_BASE[fk - 1]; }
    else if (st.a === 'tag') { st.runner = S_RUN[x & 3]; if (!st.call) st.call = 'out'; }
    else if (st.a === 'base') { st.base = S_BASE[x & 3]; const r = (x >> 2) & 7; if (r) { st.runner = S_RUN[r - 1]; if (!st.call) st.call = 'out'; } }
    if (h & 128) { spot = { x: get16(b, i), y: get16(b, i + 2) }; i += 4; }
    if (spot) { if (st.a === 'pitch' && st.hit) st.hit.at = spot; else st.at = spot; }
    if (h & 8) {
      const m = b[i++];
      st.runners = {};
      for (let j = 0; j < m; j++) {
        const v = b[i++];
        const id = S_RUN[v & 3], kind = (v >> 2) & 3;
        if (kind === 0) st.runners[id] = { hold: true };
        else if (kind === 1) st.runners[id] = { go: S_BASE[(v >> 4) & 3] };
        else { st.runners[id] = { stop: get16(b, i) / 10 }; i += 2; }
      }
    }
    if (h & 16) {
      const m = b[i++];
      st.move = {};
      for (let j = 0; j < m; j++) { const p = POS[b[i]]; st.move[p] = { x: get16(b, i + 1), y: get16(b, i + 3) }; i += 5; }
    }
    if (h & 32) { const cl = b[i++]; st.cap = unutf8(b.slice(i, i + cl)); i += cl; }
    return { st, i };
  }

  // What came after the first Build a play links (2026-10-10), in a block at the very end so an older app opens the
  // main play and ignores the rest: the main play's name, mistakes on throws, and the endings.
  //   0xB1, name, mistakes, endings count, then per ending: name, parent + 1, fork step + 1, steps, mistakes
  //   mistakes: count, then per one: step, kind (bit 0: 0 wild, 1 dropped; bit 1: a spot follows), spot
  const EXTRAS = 0xb1;
  const S_ERR = ['wild', 'dropped'];
  const putText = (out, t, max) => { const u = t ? utf8(String(t).slice(0, max)).slice(0, max * 2) : []; out.push(u.length); out.push(...u); };
  const getText = (b, i) => { const n = b[i++]; return { t: n ? unutf8(b.slice(i, i + n)) : '', i: i + n }; };
  function packMistakes(out, steps) {
    const errs = steps.map((st, k) => [k, st]).filter(([, st]) => st && st.a === 'throw' && S_ERR.includes(st.err));
    out.push(errs.length);
    for (const [k, st] of errs) {
      const miss = st.err === 'wild' && st.miss && Number.isFinite(st.miss.x);
      out.push(k, S_ERR.indexOf(st.err) | (miss ? 2 : 0));
      if (miss) { put16(out, st.miss.x); put16(out, st.miss.y); }
    }
  }
  function unpackMistakes(b, i, steps) {
    const n = b[i++];
    for (let j = 0; j < n; j++) {
      const st = steps[b[i++]], v = b[i++];
      let miss = null;
      if (v & 2) { miss = { x: get16(b, i), y: get16(b, i + 2) }; i += 4; }
      if (st && st.a === 'throw') { st.err = S_ERR[v & 1]; if (miss) st.miss = miss; }
    }
    return i;
  }
  function hasExtras(event) {
    return event.kind === 'script' && !!(event.main || (event.alts && event.alts.length) || (event.steps || []).some((st) => st && st.err));
  }
  function packExtras(out, event) {
    out.push(EXTRAS);
    putText(out, event.main, 40);
    const main = (event.steps || []).slice(0, 40);
    packMistakes(out, main);
    const alts = (event.alts || []).slice(0, 12);
    out.push(alts.length);
    for (const a of alts) {
      const steps = (a.steps || []).slice(0, 40);
      putText(out, a.name, 40);
      out.push((Number.isInteger(a.from) ? a.from : -1) + 1, Math.max(-1, Math.min(254, Number.isInteger(a.at) ? a.at : -1)) + 1);
      out.push(steps.length);
      for (const st of steps) packStep(out, st);
      packMistakes(out, steps);
    }
  }
  function unpackExtras(b, i, event) {
    const nm = getText(b, i); i = nm.i;
    if (nm.t) event.main = nm.t;
    i = unpackMistakes(b, i, event.steps || []);
    const m = b[i++];
    if (m) event.alts = [];
    for (let k = 0; k < m; k++) {
      const an = getText(b, i); i = an.i;
      const from = b[i++] - 1, at = b[i++] - 1;
      const n = b[i++];
      const steps = [];
      for (let j = 0; j < n; j++) { const u = unpackStep(b, i); steps.push(u.st); i = u.i; }
      i = unpackMistakes(b, i, steps);
      event.alts.push({ name: an.t, from, at, steps });
    }
    return i;
  }

  // A drawn play: a table of runners, then each step. The first step lists everyone; later steps list only who
  // moved (or left the field). Actors: 0-8 fielders, 9 the ball, 10+ runners; +128 means "not on the field".
  function packDrawn(out, event) {
    const steps = (event.steps || []).slice(0, 30);
    const ids = [];
    for (const st of steps) for (const r of st.runners || []) if (!ids.find((x) => x.id === r.id)) ids.push({ id: r.id, label: r.label });
    const runners = ids.slice(0, 20);
    out.push(runners.length);
    for (const r of runners) out.push(r.id === 'batter' ? 2 : r.label === 'B' ? 1 : 0);
    out.push(steps.length);
    let prev = null;
    steps.forEach((st, si) => {
      out.push(Math.max(0, Math.min(255, Math.round((Number(st.dur) || 1) * 10))));
      const cap = st.cap ? utf8(String(st.cap).slice(0, 40)).slice(0, 60) : [];
      out.push(cap.length); out.push(...cap);
      const cur = {};
      POS.forEach((p, j) => { cur[j] = st.players[p]; });
      cur[9] = st.ball || { x: 0, y: 1.5 };
      runners.forEach((r, j) => { cur[10 + j] = (st.runners || []).find((x) => x.id === r.id) || null; });
      const entries = [];
      for (const k of Object.keys(cur).map(Number)) {
        const a = cur[k], pa = prev ? prev[k] : undefined;
        if (!a) { if (si === 0 || pa) entries.push([k | 128]); continue; }
        if (si === 0 || !pa || Math.hypot(a.x - pa.x, a.y - pa.y) > 0.4) entries.push([k, a.x, a.y]);
      }
      out.push(entries.length);
      for (const e of entries) { out.push(e[0]); if (e.length > 1) { put16(out, e[1]); put16(out, e[2]); } }
      prev = cur;
    });
  }
  function unpackDrawn(b, i) {
    const nr = b[i++];
    const runners = [];
    for (let j = 0; j < nr; j++) { const v = b[i++]; runners.push(v === 2 ? { id: 'batter', label: 'B' } : { id: 'r' + j, label: v === 1 ? 'B' : 'R' }); }
    const ns = b[i++];
    const steps = [];
    let cur = {};
    for (let si = 0; si < ns; si++) {
      const dur = b[i++] / 10;
      const cl = b[i++];
      const cap = cl ? unutf8(b.slice(i, i + cl)) : '';
      i += cl;
      const n = b[i++];
      cur = Object.assign({}, cur);
      for (let e = 0; e < n; e++) {
        const k = b[i++];
        if (k & 128) { cur[k & 127] = null; continue; }
        cur[k] = { x: get16(b, i), y: get16(b, i + 2) }; i += 4;
      }
      const players = {};
      POS.forEach((p, j) => { players[p] = cur[j] ? { ...cur[j] } : { x: 0, y: 0 }; });
      const st = { dur, cap, players, ball: cur[9] ? { ...cur[9] } : { x: 0, y: 1.5 }, runners: [] };
      runners.forEach((r, j) => { if (cur[10 + j]) st.runners.push({ id: r.id, label: r.label, x: cur[10 + j].x, y: cur[10 + j].y }); });
      steps.push(st);
    }
    return { steps, i };
  }

  /* Pack a play. Returns the code for `#p=`, or null for something a link can't hold. */
  function encode(situation, event, name) {
    const s = situation || {};
    const li = LEAGUES.indexOf(s.league || 'littleLeague');
    const ki = KINDS.indexOf(event && event.kind);
    if (li < 0 || ki < 0) return null;
    const parks = Field.PARKS || [];
    const pi = s.park ? parks.findIndex((p) => p.key === s.park) : -1;
    const nameBytes = name ? utf8(String(name).slice(0, 80)).slice(0, 120) : [];
    const lead = typeof s.leadoffs === 'boolean';
    const moved = s.start ? POS.filter((p) => s.start[p] && Number.isFinite(s.start[p].x)) : [];
    const out = [VERSION];
    // Byte 1: league (low 3 bits, plus bit 3 of the runner byte's neighbor below for leagues 8+), park, name, leadoffs,
    // fielder spots. Leagues past the first eight set bit 7 of the runner byte and use the low bits again.
    out.push((li & 7) | (pi >= 0 ? 8 : 0) | (nameBytes.length ? 16 : 0) | (lead ? 32 : 0) | (lead && s.leadoffs ? 64 : 0) | (moved.length ? 128 : 0));
    if (pi >= 0) out.push(pi);
    const r = s.runners || {};
    out.push((r.first ? 1 : 0) | (r.second ? 2 : 0) | (r.third ? 4 : 0) | ((s.outs || 0) << 3) | (s.batter === 'L' ? 32 : 0) | (s.batter === 'S' ? 64 : 0) | (li >= 8 ? 128 : 0));
    // Kinds 0-15 fit in 4 bits. Later kinds borrow result code 7 (never a real result) as "add 16".
    const ri = ki >= 16 ? 7 : Math.max(0, RESULTS.indexOf(event.result));
    out.push((ki & 15) | (ri << 4) | (event.slow ? 128 : 0));
    if (event.kind === 'pitch') {
      // move (pickoff), which base, passed ball; then each runner on base: lead in feet and whether they go.
      const pk = Math.max(0, BASES.indexOf(event.pickoff));
      out.push((event.move === 'pickoff' ? 1 : 0) | (pk << 1) | (event.result === 'passed' ? 8 : 0) | (event.result === 'dropped' ? 16 : 0));
      for (const base of BASES) {
        if (!r[base]) continue;
        const x = (event.runners && event.runners[base]) || {};
        out.push(Math.max(0, Math.min(127, Math.round(x.lead || 0))) | (x.go ? 128 : 0));
      }
      if (event.result === 'passed' || event.result === 'dropped') { const bt = event.ballTo || { x: 10, y: -20 }; put16(out, bt.x); put16(out, bt.y); }
    }
    if (event.kind === 'rundown') out.push(Math.max(0, BASES.indexOf(event.runner)));
    if (event.kind === 'lookBack') out.push(Math.max(0, BASES.indexOf(event.runner)) | (Math.max(0, ACTIONS.indexOf(event.action)) << 2));
    if (event.kind === 'drawn') packDrawn(out, event);
    if (event.kind === 'script') packScript(out, event);
    if (moved.length) {
      out.push(moved.length);
      for (const p of moved) { out.push(POS.indexOf(p)); put16(out, s.start[p].x); put16(out, s.start[p].y); }
    }
    if (event.at) {
      put16(out, event.at.x); put16(out, event.at.y);
      const err = event.result === 'error' && event.error;
      out.push((event.through ? 1 : 0) | (event.slap === 'soft' ? 2 : 0) | (event.slap === 'hard' ? 4 : 0) | (event.squeeze ? 8 : 0) | (err ? 16 : 0));
      if (event.through) { put16(out, event.through.x); put16(out, event.through.y); }
      // An error: which kind, and where the ball ended up if the coach dragged it.
      if (err) {
        out.push(Math.max(0, ERRORS.indexOf(err.type)) | (err.to ? 4 : 0));
        if (err.to) { put16(out, err.to.x); put16(out, err.to.y); }
      }
    }
    if (nameBytes.length) { out.push(nameBytes.length); out.push(...nameBytes); }
    // Extras, at the very end so older links stay valid: the infield depth.
    const di = Math.max(0, DEPTHS.indexOf(s.depth || 'auto'));
    const d13 = Math.max(0, D13.indexOf(s.d13 || 'auto'));
    const bd = Math.max(0, BUNTD.indexOf(s.buntD || 'auto'));
    const extras = hasExtras(event);
    if (di || d13 || bd || extras) out.push(di | (d13 << 3) | (bd << 6));
    if (extras) packExtras(out, event);
    return toB64url(out);
  }

  /* Unpack a code into { situation, event, name }, or null if it isn't one. */
  function decode(code) {
    try {
      const b = fromB64url(String(code || '').trim());
      if (b.length < 4 || b[0] !== VERSION) return null;
      let i = 1;
      const f = b[i++];
      let park;
      if (f & 8) { const p = (Field.PARKS || [])[b[i++]]; park = p ? p.key : undefined; }
      const rb = b[i++];
      const league = LEAGUES[(f & 7) + (rb & 128 ? 8 : 0)];
      const situation = {
        league,
        runners: { first: !!(rb & 1), second: !!(rb & 2), third: !!(rb & 4) },
        outs: (rb >> 3) & 3,
        batter: rb & 64 ? 'S' : rb & 32 ? 'L' : 'R',
      };
      if (park) situation.park = park;
      if (f & 32) situation.leadoffs = !!(f & 64);
      const kb = b[i++];
      const kind = KINDS[(kb & 15) + (((kb >> 4) & 7) === 7 ? 16 : 0)];
      if (!kind || !league || situation.outs > 2) return null;
      const event = { kind };
      const result = ((kb >> 4) & 7) === 7 ? undefined : RESULTS[(kb >> 4) & 7];
      if (result) event.result = result;
      if (kb & 128) event.slow = true;
      if (kind === 'pitch') {
        const m = b[i++];
        if (m & 1) { event.move = 'pickoff'; event.pickoff = BASES[(m >> 1) & 3] || 'first'; } else event.move = 'pitch';
        if (m & 8) event.result = 'passed'; else if (m & 16) event.result = 'dropped'; else if (!(m & 1)) event.result = 'caught';
        event.runners = {};
        for (const base of BASES) {
          if (!situation.runners[base]) continue;
          const x = b[i++];
          event.runners[base] = { lead: x & 127, go: !!(x & 128) };
        }
        if (m & 24) { event.ballTo = { x: get16(b, i), y: get16(b, i + 2) }; i += 4; }
      }
      if (kind === 'rundown') event.runner = BASES[b[i++] & 3] || 'first';
      if (kind === 'lookBack') { const v = b[i++]; event.runner = BASES[v & 3] || 'first'; event.action = ACTIONS[(v >> 2) & 3]; }
      if (kind === 'drawn') { const u = unpackDrawn(b, i); event.steps = u.steps; i = u.i; }
      if (kind === 'script') { const u = unpackScript(b, i); event.steps = u.steps; if (u.title) event.title = u.title; i = u.i; }
      if (f & 128) {
        const n = b[i++];
        situation.start = {};
        for (let j = 0; j < n; j++) { const p = POS[b[i]]; if (p) situation.start[p] = { x: get16(b, i + 1), y: get16(b, i + 3) }; i += 5; }
      }
      if (KINDS.indexOf(kind) <= 4 || kind === 'droppedThird') {
        if (b.length < i + 5) return null;
        event.at = { x: get16(b, i), y: get16(b, i + 2) }; i += 4;
        const fl = b[i++];
        if (fl & 2) event.slap = 'soft'; else if (fl & 4) event.slap = 'hard';
        if (fl & 8) event.squeeze = true;
        if (fl & 1) { event.through = { x: get16(b, i), y: get16(b, i + 2) }; i += 4; }
        if (fl & 16) {
          const e = b[i++];
          event.error = { type: ERRORS[e & 3] || 'bobble' };
          if (e & 4) { event.error.to = { x: get16(b, i), y: get16(b, i + 2) }; i += 4; }
        }
      }
      let name = '';
      if (f & 16) { const n = b[i++]; name = unutf8(b.slice(i, i + n)); i += n; }
      if (i < b.length) {
        const x = b[i++];
        const d = DEPTHS[x & 7], e = D13[(x >> 3) & 7], f2 = BUNTD[(x >> 6) & 3];
        if (d && d !== 'auto') situation.depth = d;
        if (e && e !== 'auto') situation.d13 = e;
        if (f2 && f2 !== 'auto') situation.buntD = f2;
      }
      if (kind === 'script' && i < b.length && b[i] === EXTRAS) unpackExtras(b, i + 1, event);
      return { situation, event, name };
    } catch (e) { return null; }
  }

  // ------------------------------------------------------------------------------------------------ My plays
  function list(storage) {
    try { const a = JSON.parse(storage.getItem(KEY) || '[]'); return Array.isArray(a) ? a.filter((p) => p && p.code && decode(p.code)) : []; }
    catch (e) { return []; }
  }
  function write(storage, plays) {
    try { storage.setItem(KEY, JSON.stringify(plays)); return true; } catch (e) { return false; }
  }
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  function add(storage, name, code) {
    const plays = list(storage);
    const p = { id: newId(), name: String(name || 'My play').slice(0, 80), code, saved: new Date().toISOString() };
    plays.unshift(p);
    return write(storage, plays) ? p : null;
  }
  function rename(storage, id, name) {
    const plays = list(storage);
    const p = plays.find((x) => x.id === id);
    if (p) { p.name = String(name).slice(0, 80) || p.name; write(storage, plays); }
    return p;
  }
  function update(storage, id, name, code) {
    const plays = list(storage);
    const p = plays.find((x) => x.id === id);
    if (!p) return null;
    p.name = String(name || p.name).slice(0, 80); p.code = code; p.saved = new Date().toISOString();
    return write(storage, plays) ? p : null;
  }
  // Move a play up (-1) or down (+1) in My plays: the order Next play steps through.
  function move(storage, id, dir) {
    const plays = list(storage);
    const i = plays.findIndex((x) => x.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= plays.length) return false;
    [plays[i], plays[j]] = [plays[j], plays[i]];
    return write(storage, plays);
  }
  function copy(storage, id) {
    const p = list(storage).find((x) => x.id === id);
    return p ? add(storage, `${p.name} (copy)`, p.code) : null;
  }
  function remove(storage, id) {
    write(storage, list(storage).filter((x) => x.id !== id));
  }

  // The backup file: every saved play, and the team if there is one.
  function exportData(storage, team) {
    return { app: 'simple-fielding', kind: 'backup', version: 1, exported: new Date().toISOString(), plays: list(storage), team: team || null };
  }
  // Merge a backup file in. Plays already saved (same name and code) are skipped. Returns { added, team }.
  function importData(storage, data) {
    if (!data || data.app !== 'simple-fielding' || !Array.isArray(data.plays)) throw new Error("That isn't a Simple Fielding file.");
    const plays = list(storage);
    let added = 0;
    for (const p of data.plays) {
      if (!p || !p.code || !decode(p.code)) continue;
      if (plays.some((x) => x.code === p.code && x.name === p.name)) continue;
      plays.push({ id: newId(), name: String(p.name || 'My play').slice(0, 80), code: p.code, saved: p.saved || new Date().toISOString() });
      added++;
    }
    write(storage, plays);
    return { added, team: data.team || null };
  }

  const api = { encode, decode, list, add, update, copy, move, rename, remove, exportData, importData, LEAGUES, KINDS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Share = api;
})(typeof window !== 'undefined' ? window : globalThis);
