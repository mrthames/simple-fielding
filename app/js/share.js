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

  const LEAGUES = ['littleLeague', 'intermediate', 'softball', 'softball10', 'junior90', 'highSchool', 'college', 'pro'];
  const KINDS = ['ground', 'line', 'fly', 'pop', 'bunt', 'steal2', 'steal3', 'firstThirdSteal', 'passedBall', 'primaryLead', 'secondaryLead'];
  const RESULTS = [undefined, 'out', 'single', 'double', 'triple'];
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
    const out = [VERSION];
    out.push(li | (pi >= 0 ? 8 : 0) | (nameBytes.length ? 16 : 0) | (lead ? 32 : 0) | (lead && s.leadoffs ? 64 : 0));
    if (pi >= 0) out.push(pi);
    const r = s.runners || {};
    out.push((r.first ? 1 : 0) | (r.second ? 2 : 0) | (r.third ? 4 : 0) | ((s.outs || 0) << 3) | (s.batter === 'L' ? 32 : 0));
    const ri = Math.max(0, RESULTS.indexOf(event.result));
    out.push(ki | (ri << 4) | (event.slow ? 128 : 0));
    if (event.at) {
      put16(out, event.at.x); put16(out, event.at.y);
      out.push(event.through ? 1 : 0);
      if (event.through) { put16(out, event.through.x); put16(out, event.through.y); }
    }
    if (nameBytes.length) { out.push(nameBytes.length); out.push(...nameBytes); }
    return toB64url(out);
  }

  /* Unpack a code into { situation, event, name }, or null if it isn't one. */
  function decode(code) {
    try {
      const b = fromB64url(String(code || '').trim());
      if (b.length < 4 || b[0] !== VERSION) return null;
      let i = 1;
      const f = b[i++];
      const league = LEAGUES[f & 7];
      let park;
      if (f & 8) { const p = (Field.PARKS || [])[b[i++]]; park = p ? p.key : undefined; }
      const rb = b[i++];
      const situation = {
        league,
        runners: { first: !!(rb & 1), second: !!(rb & 2), third: !!(rb & 4) },
        outs: (rb >> 3) & 3,
        batter: rb & 32 ? 'L' : 'R',
      };
      if (park) situation.park = park;
      if (f & 32) situation.leadoffs = !!(f & 64);
      const kb = b[i++];
      const kind = KINDS[kb & 15];
      if (!kind || !league || situation.outs > 2) return null;
      const event = { kind };
      const result = RESULTS[(kb >> 4) & 7];
      if (result) event.result = result;
      if (kb & 128) event.slow = true;
      if (KINDS.indexOf(kind) <= 4) {
        if (b.length < i + 5) return null;
        event.at = { x: get16(b, i), y: get16(b, i + 2) }; i += 4;
        if (b[i++] & 1) { event.through = { x: get16(b, i), y: get16(b, i + 2) }; i += 4; }
      }
      let name = '';
      if (f & 16) { const n = b[i++]; name = unutf8(b.slice(i, i + n)); i += n; }
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

  const api = { encode, decode, list, add, rename, remove, exportData, importData, LEAGUES, KINDS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Share = api;
})(typeof window !== 'undefined' ? window : globalThis);
