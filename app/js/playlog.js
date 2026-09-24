/*
 * The play log: every play the app runs, recorded compactly so a report can say exactly what happened,
 * and a replay code that reproduces it (the engine is deterministic: same situation + same event = same play).
 *
 * Keeps the last 50 plays on the device. Positions only — never players' names.
 */
(function (root) {
  'use strict';

  const KEEP = 50;
  const KEY = 'sf.log';

  function b64(s) {
    if (typeof btoa !== 'undefined') return btoa(unescape(encodeURIComponent(s)));
    return Buffer.from(s, 'utf8').toString('base64');
  }
  function unb64(s) {
    if (typeof atob !== 'undefined') return decodeURIComponent(escape(atob(s)));
    return Buffer.from(s, 'base64').toString('utf8');
  }

  // Replay code: URL-safe, versioned.
  function encodeReplay(situation, event) {
    return 'r1.' + b64(JSON.stringify({ s: situation, e: event })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function decodeReplay(code) {
    if (!code || code.slice(0, 3) !== 'r1.') return null;
    try {
      let s = code.slice(3).replace(/-/g, '+').replace(/_/g, '/');
      while (s.length % 4) s += '=';
      const o = JSON.parse(unb64(s));
      if (!o || typeof o.s !== 'object' || typeof o.e !== 'object' || typeof o.e.kind !== 'string') return null;
      return { situation: o.s, event: o.e };
    } catch (e) { return null; }
  }

  const BASE = { first: '1st', second: '2nd', third: '3rd', home: 'home' };

  function situationText(s, leagueLabel) {
    const r = s.runners || {};
    const on = ['first', 'second', 'third'].filter((b) => r[b]).map((b) => BASE[b]);
    return [
      on.length ? 'Runners on ' + on.join(' & ') : 'Bases empty',
      `${s.outs || 0} out${s.outs === 1 ? '' : 's'}`,
      s.batter === 'L' ? 'lefty batter' : 'righty batter',
      leagueLabel || s.league,
      s.leadoffs ? 'leadoffs on' : 'no leadoffs',
    ].join(' · ');
  }

  function eventText(e) {
    const kinds = { ground: 'Grounder', line: 'Line drive', fly: 'Fly ball', pop: 'Pop-up', bunt: 'Bunt',
      steal2: 'Steal of 2nd', steal3: 'Steal of 3rd', firstThirdSteal: '1st & 3rd double steal',
      passedBall: 'Passed ball', primaryLead: 'Primary lead / pickoff', secondaryLead: 'Secondary lead / back-pick' };
    let t = kinds[e.kind] || e.kind;
    if (e.at) t += ` to (${e.at.x.toFixed(0)}, ${e.at.y.toFixed(0)}) ft — ${Math.hypot(e.at.x, e.at.y).toFixed(0)} ft from home`;
    if (e.result && e.result !== 'auto') t += ` · result forced: ${e.result}`;
    return t;
  }

  function didText(plan) {
    const parts = [plan.summary];
    const runners = plan.runners.map((r) => {
      const who = r.id === 'batter' ? 'Batter' : `Runner from ${BASE[r.id]}`;
      if (r.held) return `${who} holds at ${BASE[r.held]}`;
      if (r.out) return `${who} out going to ${BASE[r.to] || r.to}`;
      return r.from === r.to ? `${who} stays` : `${who} → ${BASE[r.to] || r.to}`;
    });
    if (runners.length) parts.push('Runners: ' + runners.join('; '));
    parts.push('Jobs: ' + plan.jobs.map((j) => `${j.pos} ${j.role}`).join(', '));
    return parts.join('\n');
  }

  // The compact record of one play.
  function entry(plan, situation, event, version) {
    return {
      id: 'p' + Date.now().toString(36),
      at: new Date().toISOString(),
      version,
      situation,
      event,
      title: plan.title,
      summary: plan.summary,
      classification: plan.classification || null,
      fielder: plan.fielder,
      target: plan.target,
      targets: plan.targets || null,
      notes: plan.notes,
      jobs: plan.jobs.map((j) => ({ pos: j.pos, role: j.role, to: j.to, job: j.job })),
      runners: plan.runners.map((r) => ({ id: r.id, from: r.from, to: r.to, held: r.held || null, out: !!r.out })),
      duration: Math.round(plan.timeline.duration * 100) / 100,
      replay: encodeReplay(situation, event),
    };
  }

  function load(storage) {
    try { const a = JSON.parse(storage.getItem(KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
  }
  function record(storage, e) {
    const list = load(storage);
    list.push(e);
    while (list.length > KEEP) list.shift();
    try { storage.setItem(KEY, JSON.stringify(list)); } catch (err) { /* full or private: the report still has this play */ }
    return e;
  }

  const api = { encodeReplay, decodeReplay, situationText, eventText, didText, entry, load, record, KEEP };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PlayLog = api;
})(typeof window !== 'undefined' ? window : globalThis);
