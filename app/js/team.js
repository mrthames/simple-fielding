/*
 * The team: players, who plays where, and how the field labels them.
 *
 * Kept on the device only (localStorage). No accounts, nothing sent anywhere: these are children's names.
 * Pure data functions here, so they run under Node for the tests; the sheet UI is in teamui.js.
 */
(function (root) {
  'use strict';

  const POSITIONS = ['P', 'C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF'];
  const LABEL_STYLES = ['position', 'first', 'last', 'initials', 'number'];

  function empty() {
    const slots = {};
    for (const p of POSITIONS) slots[p] = null;
    return { version: 1, players: [], slots, names: {}, label: 'position' };
  }

  // Accept whatever came out of storage, and never let a bad value break the field.
  function normalize(t) {
    const out = empty();
    if (!t || typeof t !== 'object') return out;
    if (Array.isArray(t.players)) {
      for (const p of t.players) {
        if (!p || !p.id) continue;
        out.players.push({ id: String(p.id), first: clean(p.first), last: clean(p.last), num: clean(p.num).slice(0, 3) });
      }
    }
    const ids = new Set(out.players.map((p) => p.id));
    for (const pos of POSITIONS) {
      const id = t.slots && t.slots[pos];
      if (id && ids.has(id)) out.slots[pos] = id;
      const n = t.names && t.names[pos];
      if (n) out.names[pos] = clean(n);
    }
    // A player fills one position at a time.
    const seen = new Set();
    for (const pos of POSITIONS) {
      const id = out.slots[pos];
      if (id && seen.has(id)) out.slots[pos] = null;
      if (id) seen.add(id);
    }
    if (LABEL_STYLES.includes(t.label)) out.label = t.label;
    return out;
  }

  function clean(s) { return (s == null ? '' : String(s)).replace(/\s+/g, ' ').trim().slice(0, 30); }

  let seq = 0;
  function newId() { seq += 1; return 'p' + Date.now().toString(36) + seq; }

  function addPlayer(team, first, last, num) {
    const p = { id: newId(), first: clean(first), last: clean(last), num: clean(num).slice(0, 3) };
    if (!p.first && !p.last && !p.num) return null;
    team.players.push(p);
    return p;
  }

  function updatePlayer(team, id, fields) {
    const p = team.players.find((x) => x.id === id);
    if (!p) return;
    if ('first' in fields) p.first = clean(fields.first);
    if ('last' in fields) p.last = clean(fields.last);
    if ('num' in fields) p.num = clean(fields.num).slice(0, 3);
  }

  function removePlayer(team, id) {
    team.players = team.players.filter((p) => p.id !== id);
    for (const pos of POSITIONS) if (team.slots[pos] === id) team.slots[pos] = null;
  }

  function positionOf(team, id) {
    return POSITIONS.find((pos) => team.slots[pos] === id) || null;
  }

  /*
   * Put a player at a position. Whoever was there goes where the player came from — the other
   * position if it was a swap between two positions, otherwise the bench. `id` null clears it.
   */
  function assign(team, pos, id) {
    const from = id ? positionOf(team, id) : null;
    const occupant = team.slots[pos];
    if (from === pos) return;
    team.slots[pos] = id || null;
    if (id) delete team.names[pos];
    if (from) team.slots[from] = occupant || null;
  }

  function bench(team, id) {
    const pos = positionOf(team, id);
    if (pos) team.slots[pos] = null;
  }

  // A one-off name typed on a position ("Maya") without adding a player to the roster.
  function setName(team, pos, name) {
    const n = clean(name);
    if (n) { team.names[pos] = n; team.slots[pos] = null; }
    else delete team.names[pos];
  }

  function clearPosition(team, pos) {
    team.slots[pos] = null;
    delete team.names[pos];
  }

  function playerAt(team, pos) {
    const id = team.slots[pos];
    if (id) return team.players.find((p) => p.id === id) || null;
    if (team.names[pos]) return { id: null, first: team.names[pos], last: '', num: '' };
    return null;
  }

  function initials(p) {
    const a = (p.first || '').charAt(0), b = (p.last || '').charAt(0);
    return (a + b).toUpperCase() || (p.first || p.last || '').slice(0, 2).toUpperCase();
  }

  function fullName(p) {
    return [p.first, p.last].filter(Boolean).join(' ');
  }

  /*
   * What the field shows for a position:
   *   inner — up to three characters inside the circle
   *   tag   — a name tag under the circle (first/last name styles), or '' for none
   *   name  — how the job list refers to them ("Maya", "Maya R.", "#7"), or '' for a generic position
   */
  function labelFor(team, pos, style) {
    const s = style || team.label;
    const p = playerAt(team, pos);
    if (!p) return { inner: pos, tag: '', name: '' };
    const name = p.first ? (p.last ? `${p.first} ${p.last.charAt(0)}.` : p.first) : (p.last || (p.num ? '#' + p.num : ''));
    switch (s) {
      case 'first': return { inner: pos, tag: p.first || p.last || (p.num ? '#' + p.num : ''), name };
      case 'last': return { inner: pos, tag: p.last || p.first || (p.num ? '#' + p.num : ''), name };
      case 'initials': return { inner: initials(p).slice(0, 3) || pos, tag: '', name };
      case 'number': return { inner: p.num ? p.num : pos, tag: '', name };
      default: return { inner: pos, tag: '', name };
    }
  }

  function load(storage) {
    try { return normalize(JSON.parse(storage.getItem('sf.team') || 'null')); } catch (e) { return empty(); }
  }
  function save(storage, team) {
    try { storage.setItem('sf.team', JSON.stringify(team)); } catch (e) { /* private mode: lives for this visit */ }
  }

  const api = {
    POSITIONS, LABEL_STYLES, empty, normalize, addPlayer, updatePlayer, removePlayer, assign, bench,
    setName, clearPosition, playerAt, positionOf, labelFor, fullName, initials, load, save,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Team = api;
})(typeof window !== 'undefined' ? window : globalThis);
