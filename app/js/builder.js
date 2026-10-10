/*
 * Build a play: the panel and the field while the coach writes a play step by step (requested 2026-10-09; the
 * engine side is script.js).
 *
 * The coach answers one question at a time, "What happens next?", and the choices depend on who has the ball.
 * Choosing a person is a tap (on the field, or a button); places (where a ball goes, where someone runs, where a
 * runner stops) are a tap on the field. Dragging a fielder moves them during the selected step. Every change is
 * planned again at once, so the field always shows the play as written, at the end of the selected step.
 *
 * Phones watch and share built plays; building needs a tablet or a computer (his call, 2026-10-09).
 *
 * Endings (2026-10-10): a play can fork after any step ("Add another ending after this step"). The coach works on one
 * path at a time, picked in the endings bar; steps shared with other endings are marked, and changing one changes
 * it in every ending that has it. New steps go into the ending being worked on. Throws can be wild or dropped.
 */
(function (root) {
  'use strict';

  const S = () => root.Script;
  const POS = ['P', 'C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF'];
  const SHORT = { P: 'P', C: 'C', '1B': '1B', '2B': '2B', SS: 'SS', '3B': '3B', LF: 'LF', CF: 'CF', RF: 'RF' };
  const BASE_WORD = { first: '1st', second: '2nd', third: '3rd', home: 'home' };
  const BASE_OF = { 1: 'first', 2: 'second', 3: 'third', 4: 'home', 0: 'home' };
  const HIT_KINDS = [['ground', 'Ground ball'], ['line', 'Line drive'], ['fly', 'Fly ball'], ['pop', 'Pop-up'], ['bunt', 'Bunt']];
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const r1 = (v) => Math.round(v * 2) / 2;
  const NS = 'http://www.w3.org/2000/svg';

  function create(ctx) {
    const { $, view, svg, state, store } = ctx;
    const panel = $('#bp');
    const canBuildQ = root.matchMedia ? root.matchMedia('(min-width: 700px) and (min-height: 500px)') : { matches: true };
    const draft = store.get('buildDraft', null);
    const B = {
      script: draft && Array.isArray(draft.steps) ? { title: draft.title || '', steps: draft.steps, main: draft.main || '', alts: Array.isArray(draft.alts) ? draft.alts : [] } : { title: '', steps: [], main: '', alts: [] },
      alt: draft && Number.isInteger(draft.alt) ? draft.alt : -1,   // the ending being worked on: -1 the main play
      sel: draft && Number.isInteger(draft.sel) ? draft.sel : -1,
      pending: null,       // { type: 'fielder' | 'target' | 'spot' | 'path', prompt, done(answer), runner? }
      choosing: null,      // a half-made step: { a: 'pitch', r: 'hit' } while picking how it's hit, etc.
      undo: [], redo: [],
      savedId: null,
      plan: null,
    };
    if (!B.script.alts[B.alt]) B.alt = -1;
    B.sel = Math.min(B.sel, S().resolve(B.script, B.alt).length - 1);

    const canBuild = () => !!canBuildQ.matches;
    const active = () => state.pm === 'build' && canBuild() && !ctx.blocked();
    // The steps of the path being worked on: the very step objects of the main play and its endings, so changing one
    // changes it wherever it is shared. Adding and deleting go through insertAt / removeAt.
    const steps = () => S().resolve(B.script, B.alt);
    const alts = () => B.script.alts || (B.script.alts = []);
    const ownSteps = (owner) => (owner < 0 ? B.script.steps : alts()[owner].steps);
    // Whose step is step i of this path, and where it sits in their own list.
    function locate(i) {
      const segs = S().segments(B.script, B.alt);
      for (const sg of segs) if (i >= sg.start && i < sg.start + sg.use) return { owner: sg.owner, index: i - sg.start };
      const last = segs[segs.length - 1];
      return { owner: last.owner, index: last.use };
    }
    // An ending forks after its parent's step `at`; keep that pointing at the same step when the parent changes.
    function shiftForks(owner, from, by) {
      for (const a of alts()) if ((Number.isInteger(a.from) ? a.from : -1) === owner && a.at >= from) a.at += by;
    }
    function insertAt(q, st) {
      const end = steps().length;
      const where = q >= end ? (() => { const segs = S().segments(B.script, B.alt); const l = segs[segs.length - 1]; return { owner: l.owner, index: l.use }; })() : locate(q);
      ownSteps(where.owner).splice(where.index, 0, st);
      shiftForks(where.owner, where.index, 1);
    }
    function removeAt(i) {
      const w = locate(i);
      ownSteps(w.owner).splice(w.index, 1);
      for (const a of alts()) if ((Number.isInteger(a.from) ? a.from : -1) === w.owner && a.at >= w.index) a.at -= 1;
    }
    // Shared with how many other paths: a step of the main play or of an ending that others fork from.
    function sharedBy(i) {
      if (!alts().length) return 0;
      const w = locate(i);
      let n = 0;
      for (let k = -1; k < alts().length; k++) {
        if (k === B.alt) continue;
        const segs = S().segments(B.script, k);
        if (segs.some((sg) => sg.owner === w.owner && w.index < sg.use)) n++;
      }
      return n;
    }
    function addEnding() {
      const w = locate(B.sel);
      change(() => {
        alts().push({ name: `Ending ${alts().length + 1}`, from: w.owner, at: w.index, steps: [] });
        B.alt = alts().length - 1;
      });
    }
    // An ending and every ending that forks from it.
    function removeEnding(k) {
      change(() => {
        const gone = new Set([k]);
        alts().forEach((a, j) => { if (gone.has(Number.isInteger(a.from) ? a.from : -1)) gone.add(j); });
        const keep = alts().map((a, j) => j).filter((j) => !gone.has(j));
        const renum = new Map(keep.map((j, n) => [j, n]));
        B.script.alts = keep.map((j) => { const a = alts()[j]; const f = Number.isInteger(a.from) ? a.from : -1; return Object.assign({}, a, { from: f < 0 ? -1 : renum.get(f) }); });
        B.alt = -1;
        B.sel = Math.min(B.sel, steps().length - 1);
      });
    }
    function pickEnding(k) {
      B.alt = k; B.pending = null; B.choosing = null;
      B.sel = Math.min(B.sel, steps().length - 1);
      saveDraft();
      refresh();
    }
    const states = () => (B.plan && B.plan.scriptStates) || [];
    const geo = () => ctx.geo();
    // The field before the selected step, and after it.
    const before = (i) => (i <= 0 ? startState() : states()[i - 1] || startState());
    const after = (i) => (i < 0 ? startState() : states()[i] || startState());
    function startState() {
      const runners = {};
      const sit = ctx.situation();
      const g = geo();
      for (const b of ['first', 'second', 'third']) if (sit.runners[b]) runners[b] = { p: { first: 1, second: 2, third: 3 }[b], at: g.bases[b], base: b, status: 'on' };
      return { holder: 'P', loose: null, pitched: false, runners, fielders: root.Field.readyPositions(g, sit), t0: 0, t1: 0 };
    }

    // ------------------------------------------------------------------------------------------- changes
    function saveDraft() { store.set('buildDraft', { title: B.script.title, steps: B.script.steps, main: B.script.main, alts: alts(), alt: B.alt, sel: B.sel }); }
    function change(fn, opts) {
      B.undo.push(JSON.stringify({ script: B.script, sel: B.sel, alt: B.alt }));
      if (B.undo.length > 80) B.undo.shift();
      B.redo = [];
      fn();
      saveDraft();
      refresh(opts);
    }
    function undo() {
      if (!B.undo.length) return;
      B.redo.push(JSON.stringify({ script: B.script, sel: B.sel, alt: B.alt }));
      const s = JSON.parse(B.undo.pop());
      B.script = s.script; B.sel = s.sel; B.alt = s.alt ?? -1; B.pending = null; B.choosing = null;
      saveDraft(); refresh();
    }
    function redo() {
      if (!B.redo.length) return;
      B.undo.push(JSON.stringify({ script: B.script, sel: B.sel, alt: B.alt }));
      const s = JSON.parse(B.redo.pop());
      B.script = s.script; B.sel = s.sel; B.alt = s.alt ?? -1; B.pending = null; B.choosing = null;
      saveDraft(); refresh();
    }
    function addStep(st) {
      B.pending = null; B.choosing = null;
      change(() => { insertAt(B.sel + 1, st); B.sel += 1; }, { playStep: true });
    }
    function editStep(fn, opts) { change(() => fn(steps()[B.sel]), opts); }

    // ------------------------------------------------------------------------------------------- the field
    // Plan the script and show it at the end of the selected step (or play that step).
    function refresh(opts) {
      opts = opts || {};
      if (state.pm !== 'build') return;
      const ev = { kind: 'script', title: B.script.title, steps: clone(B.script.steps) };
      if (alts().length) { ev.alts = clone(alts()); ev.branch = B.alt; }
      if (B.script.main) ev.main = B.script.main;
      ctx.runEvent(ev, { autoplay: false, name: B.script.title || '', savedId: B.savedId });
      B.plan = state.plan;
      const st = B.sel >= 0 ? states()[B.sel] : null;
      if (opts.playStep && st) { ctx.seek(st.t0); ctx.play(); }
      else ctx.seek(st ? st.t1 : 0);
      render();
      drawOverlay();
    }

    function layer() {
      let g = svg.querySelector('g.layer-builder');
      if (!g) { g = document.createElementNS(NS, 'g'); g.setAttribute('class', 'layer-builder'); svg.appendChild(g); }
      return g;
    }
    function ring(g, p, r, cls) {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', p.x); c.setAttribute('cy', -p.y); c.setAttribute('r', r); c.setAttribute('class', cls);
      g.appendChild(c);
    }
    // Rings on whoever (or wherever) can be tapped for the question being asked.
    function drawOverlay() {
      const g = layer();
      g.innerHTML = '';
      const p = B.pending;
      if (!p || !active()) { svg.classList.remove('bp-picking'); return; }
      svg.classList.add('bp-picking');
      const u = view.us || 1;
      if (p.type === 'fielder' || p.type === 'target') {
        for (const pos of POS) if (pos !== p.exclude) ring(g, view.actorAt(pos), 9 * u, 'bp-ring' + (pos === p.suggest ? ' suggest' : ''));
      }
      if (p.type === 'target') for (const b of ['first', 'second', 'third']) ring(g, geo().bases[b], 6 * u, 'bp-ring base');
      if (p.type === 'path') {
        const path = document.createElementNS(NS, 'path');
        const bs = geo().bases;
        if (Number.isFinite(p.leg)) {
          const a = S().pathPoint(geo(), p.leg), b = S().pathPoint(geo(), p.leg + 1);
          path.setAttribute('d', `M${a.x},${-a.y} L${b.x},${-b.y}`);
        } else path.setAttribute('d', `M${bs.home.x},${-bs.home.y} L${bs.first.x},${-bs.first.y} L${bs.second.x},${-bs.second.y} L${bs.third.x},${-bs.third.y} Z`);
        path.setAttribute('class', 'bp-path');
        g.appendChild(path);
        if (Number.isFinite(B.preview)) ring(g, S().pathPoint(geo(), B.preview), 4 * u, 'bp-ring bp-mark');
      }
    }
    function pxPerFt() {
      const a = view.toField(0, 0), b = view.toField(100, 0);
      return 100 / (Math.hypot(a.x - b.x, a.y - b.y) || 1);
    }
    function fielderNear(pt, exclude) {
      const reach = 30 / pxPerFt();
      let best = null, bd = Infinity;
      for (const pos of POS) {
        if (pos === exclude) continue;
        const a = view.actorAt(pos);
        const d = Math.hypot(a.x - pt.x, a.y - pt.y);
        if (d < bd) { bd = d; best = pos; }
      }
      return bd <= Math.max(reach, 6) ? best : null;
    }
    function baseNear(pt) {
      const reach = 30 / pxPerFt();
      for (const b of ['first', 'second', 'third', 'home']) {
        const q = geo().bases[b];
        if (Math.hypot(q.x - pt.x, q.y - pt.y) <= Math.max(reach, 6)) return b;
      }
      return null;
    }

    function ask(p) { B.pending = p; render(); drawOverlay(); }
    function cancelAsk() { B.pending = null; B.choosing = null; B.preview = null; render(); drawOverlay(); }
    function answer(pt) {
      const p = B.pending;
      if (!p) return;
      if (p.type === 'fielder') {
        const pos = fielderNear(pt, p.exclude);
        if (!pos) return ctx.toast('Tap a player with a ring');
        p.done(pos);
      } else if (p.type === 'target') {
        const pos = fielderNear(pt, p.exclude);
        if (pos) return p.done({ to: pos, at: spotOf(pos) });
        const base = baseNear(pt);
        if (base) {
          const now = after(B.sel);
          let to = S().coverer(base, now.fielders, geo());
          if (to === p.exclude) to = base === 'second' ? (to === 'SS' ? '2B' : 'SS') : null;
          if (!to) return ctx.toast("They're already there: pick someone else, or Step on a base");
          return p.done({ to, at: geo().bases[base] });
        }
        ctx.toast('Tap a player or a base');
      } else if (p.type === 'spot') {
        p.done({ x: r1(pt.x), y: r1(pt.y) });
      } else if (p.type === 'path') {
        if (Number.isFinite(p.leg)) { B.preview = null; return p.done(onLeg(p.leg, pt)); }
        const q = S().progressNear(geo(), pt);
        if (q.d > 14) return ctx.toast('Tap on the base path');
        p.done(Math.round(q.p * 100) / 100);
      }
    }
    // Progress along one baseline (leg 3 is 3rd to home) nearest a field point, kept just off both bases.
    function onLeg(leg, pt) {
      const a = S().pathPoint(geo(), leg), b = S().pathPoint(geo(), leg + 1);
      const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2 || 1;
      const f = Math.max(0.03, Math.min(0.97, ((pt.x - a.x) * (b.x - a.x) + (pt.y - a.y) * (b.y - a.y)) / L2));
      return Math.round((leg + f) * 100) / 100;
    }
    // Where a fielder is at the end of the selected step.
    function spotOf(pos) { const f = after(B.sel).fielders[pos]; return { x: r1(f.x), y: r1(f.y) }; }

    // The field: taps answer the question being asked; dragging a fielder moves them during the selected step.
    let drag = null;
    svg.addEventListener('pointerdown', (e) => {
      if (!active()) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      const pt = view.toField(e.clientX, e.clientY);
      const pl = !B.pending && B.sel >= 0 && e.target.closest && e.target.closest('.player');
      drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, pt, pos: pl ? pl.dataset.pos : null, moved: false };
      if (drag.pos) { const a = view.actorAt(drag.pos); drag.off = { x: a.x - pt.x, y: a.y - pt.y }; }
      try { svg.setPointerCapture(e.pointerId); } catch (err) { /* already released */ }
    }, true);
    svg.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      e.stopImmediatePropagation();
      if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
      drag.moved = true;
      if (B.pending && B.pending.type === 'path' && Number.isFinite(B.pending.leg)) {
        B.preview = onLeg(B.pending.leg, view.toField(e.clientX, e.clientY));
        drawOverlay();
        return;
      }
      if (!drag.pos) return;
      const p = view.toField(e.clientX, e.clientY);
      drag.at = { x: r1(p.x + drag.off.x), y: r1(p.y + drag.off.y) };
      view.place(view.actors[drag.pos], drag.at);
    }, true);
    const up = (e, cancelled) => {
      if (!drag || e.pointerId !== drag.id) return;
      e.stopImmediatePropagation();
      const d = drag; drag = null;
      if (cancelled) return;
      if (d.pos && d.moved && d.at) {
        const pos = d.pos, at = d.at;
        editStep((st) => { st.move = st.move || {}; st.move[pos] = at; });
        return;
      }
      // A tap answers; so does the end of a drag while the question wants a place on the field.
      if (!d.moved || (B.pending && (B.pending.type === 'path' || B.pending.type === 'spot'))) answer(view.toField(e.clientX, e.clientY));
    };
    svg.addEventListener('pointerup', (e) => up(e, false), true);
    svg.addEventListener('pointercancel', (e) => up(e, true), true);

    // ------------------------------------------------------------------------------------------- the panel
    const h = (tag, attrs, ...kids) => {
      const el = document.createElement(tag);
      for (const k in attrs || {}) {
        const v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      }
      for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
      return el;
    };
    const chip = (label, onclick, on, extra) => h('button', Object.assign({ type: 'button', class: 'bp-chip' + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false', onclick }, extra || {}), label);
    const posChips = (onPick, exclude, current) => h('div', { class: 'bp-chips pos' }, POS.filter((p) => p !== exclude).map((p) => chip(SHORT[p], () => onPick(p), p === current, { 'data-pos': p, title: S().PLAYER[p] })));

    function render() {
      if (!panel) return;
      panel.innerHTML = '';
      const editable = canBuild();
      const head = h('div', { class: 'card-head' },
        h('h2', {}, 'Build a play'),
        editable ? h('div', { class: 'bp-tools' },
          h('button', { type: 'button', class: 'text-btn small', id: 'bp-undo', disabled: !B.undo.length, onclick: undo, title: 'Undo (Ctrl+Z)' }, 'Undo'),
          h('button', { type: 'button', class: 'text-btn small', id: 'bp-redo', disabled: !B.redo.length, onclick: redo, title: 'Redo' }, 'Redo'),
          h('button', { type: 'button', class: 'text-btn small', id: 'bp-reset', disabled: !steps().length && !B.script.title, onclick: startOver }, 'Start over')) : null);
      panel.append(head);
      if (!editable) {
        panel.append(h('p', { class: 'bp-phone' }, 'Building a play works on a tablet or a computer. Here you can watch built plays and share them: open one from My plays or a link.'));
        if (alts().length) panel.append(endingsBar(false));
        if (steps().length) panel.append(stepList(false));
        // Drawing frame by frame already worked on phones before Build a play, so it stays here.
        panel.append(h('button', { type: 'button', class: 'text-btn small bp-draw', id: 'build-draw', onclick: () => ctx.drawByHand() }, '✎ Draw a play by hand, frame by frame'));
        return;
      }
      panel.append(h('label', { class: 'bp-name', for: 'bp-title' }, 'Name',
        h('input', { id: 'bp-title', type: 'text', maxlength: '60', placeholder: 'Name this play', value: B.script.title,
          onchange: (e) => change(() => { B.script.title = e.target.value.trim(); }) })));
      if (alts().length) panel.append(endingsBar(true));
      panel.append(stepList(true));
      panel.append(nextBox());
      if (B.sel >= 0 && steps()[B.sel]) panel.append(details());
      const issues = (B.plan && B.plan.scriptIssues) || [];
      panel.append(h('div', { class: 'bp-save' },
        h('button', { type: 'button', class: 'bp-primary', id: 'bp-save', disabled: !steps().length, onclick: () => ctx.save() }, 'Save to My plays'),
        h('button', { type: 'button', class: 'bp-secondary', id: 'bp-share', disabled: !steps().length, onclick: () => ctx.share() }, 'Share link')));
      panel.append(h('button', { type: 'button', class: 'text-btn small bp-draw', id: 'build-draw', onclick: () => ctx.drawByHand() }, '✎ Or draw a play by hand, frame by frame'));
      if (issues.length) panel.querySelector('.bp-save').prepend(h('p', { class: 'bp-warn' }, `${issues.length} step${issues.length === 1 ? ' needs' : 's need'} fixing before this play is right.`));
    }

    // Which path is showing: the main play or one of its endings. Tap one to watch or work on it.
    function endingsBar(editable) {
      const box = h('div', { class: 'bp-endings', id: 'bp-endings' }, h('h4', {}, 'Endings'));
      box.append(h('div', { class: 'bp-chips' }, S().endings(B.script).map((e) => chip(e.name, () => pickEnding(e.k), e.k === B.alt, { 'data-ending': String(e.k) }))));
      if (editable) {
        const cur = B.alt < 0 ? B.script.main || '' : alts()[B.alt].name || '';
        box.append(h('label', { class: 'bp-name bp-ending-name', for: 'bp-ending-name' }, 'This ending',
          h('input', { id: 'bp-ending-name', type: 'text', maxlength: '40', placeholder: B.alt < 0 ? 'Main play' : 'Name this ending', value: cur,
            onchange: (e) => change(() => { const v = e.target.value.trim(); if (B.alt < 0) B.script.main = v; else alts()[B.alt].name = v; }) })));
        if (B.alt >= 0) box.append(h('button', { type: 'button', class: 'text-btn small danger', id: 'bp-ending-delete', onclick: () => removeEnding(B.alt) }, 'Delete this ending'));
      }
      return box;
    }

    function stepList(editable) {
      const issues = (B.plan && B.plan.scriptIssues) || [];
      const ol = h('ol', { class: 'bp-steps', id: 'bp-steps' });
      ol.append(h('li', { class: 'bp-step setup' + (B.sel === -1 ? ' on' : ''), onclick: () => select(-1) },
        h('span', { class: 'n' }, '0'),
        h('span', { class: 'txt' }, h('b', {}, 'Before the pitch'), h('span', { class: 'mw' }, situationText()))));
      steps().forEach((st, i) => {
        const d = S().describe(st, before(i));
        const bad = issues.find((x) => x.step === i);
        const shared = sharedBy(i);
        ol.append(h('li', { class: 'bp-step' + (B.sel === i ? ' on' : '') + (bad ? ' bad' : '') + (shared ? ' shared' : ''), 'data-step': i, onclick: () => select(i) },
          h('span', { class: 'n' }, String(i + 1)),
          h('span', { class: 'txt' }, h('b', {}, d.text), d.meanwhile ? h('span', { class: 'mw' }, d.meanwhile) : null,
            shared ? h('span', { class: 'bp-shared' }, `Shared with ${shared} other ending${shared === 1 ? '' : 's'}`) : null,
            bad ? h('span', { class: 'fix' }, 'Fix this: ' + bad.text) : null)));
      });
      if (!editable && !steps().length) return h('p', {}, '');
      return ol;
    }
    function situationText() {
      const sit = ctx.situation();
      const on = ['first', 'second', 'third'].filter((b) => sit.runners[b]).map((b) => BASE_WORD[b]);
      return `${sit.outs} out${sit.outs === 1 ? '' : 's'}, ${on.length ? 'runners on ' + on.join(' & ') : 'nobody on'}. Set this in Situation above.`;
    }
    function select(i) {
      B.sel = i; B.pending = null; B.choosing = null;
      saveDraft();
      const st = i >= 0 ? states()[i] : null;
      ctx.seek(st ? st.t1 : 0);
      render(); drawOverlay();
    }
    function startOver() {
      change(() => { B.script = { title: '', steps: [], main: '', alts: [] }; B.alt = -1; B.sel = -1; B.savedId = null; });
    }

    // "What happens next?": only what fits who has the ball after the selected step.
    function nextBox() {
      const box = h('div', { class: 'bp-next', id: 'bp-next' });
      const now = after(B.sel);
      const holderWord = now.holder ? S().PLAYER[now.holder] : null;
      const opts = S().options(B.sel < 0 ? null : now);
      const atEnd = B.sel === steps().length - 1;
      const q = B.pending ? B.pending.prompt
        : B.choosing ? B.choosing.prompt
        : !opts.length ? 'Nothing left to happen.'
        : opts[0] === 'pitch' ? 'What does the pitcher do?'
        : opts[0] === 'field' ? 'Who gets the ball?'
        : `What does the ${holderWord} do?`;
      box.append(h('div', { class: 'bp-q' }, atEnd || B.pending || B.choosing ? q : `Add a step after step ${B.sel + 1}: ${q.charAt(0).toLowerCase()}${q.slice(1)}`));
      if (B.pending) {
        const p = B.pending;
        if (p.type === 'fielder') box.append(posChips((pos) => p.done(pos), p.exclude, p.suggest));
        if (p.type === 'target') box.append(posChips((pos) => p.done({ to: pos, at: spotOf(pos) }), p.exclude),
          h('p', { class: 'bp-tip' }, 'Or tap a base on the field: whoever covers it takes the throw there.'));
        if (p.quick) box.append(h('div', { class: 'bp-chips' }, p.quick.map(([label, fn]) => chip(label, fn))));
        box.append(h('button', { type: 'button', class: 'text-btn small bp-cancel', onclick: cancelAsk }, 'Cancel'));
        return box;
      }
      if (B.choosing) {
        box.append(B.choosing.body());
        box.append(h('button', { type: 'button', class: 'text-btn small bp-cancel', onclick: cancelAsk }, 'Cancel'));
        return box;
      }
      const btn = (label, fn, primary) => h('button', { type: 'button', class: primary ? 'bp-act prim' : 'bp-act', onclick: fn }, label);
      const grid = h('div', { class: 'bp-acts' });
      const live = S().liveRunners(now);
      for (const o of opts) {
        if (o === 'pitch') {
          grid.append(btn('Pitch', () => { B.choosing = { prompt: 'What happens to the pitch?', body: pitchChoices }; render(); }, true));
        } else if (o === 'pickoff') {
          // Pickoffs need leadoffs, and fastpitch has none from the pitcher (the old builder's rule too).
          const sit = ctx.situation();
          const leads = sit.leadoffs && !document.body.classList.contains('softball');
          if (leads && live.some((r) => r.base && r.base !== 'home')) grid.append(btn('Pickoff throw', () => { B.choosing = { prompt: 'Throw to which base?', body: pickoffChoices }; render(); }));
        } else if (o === 'field') {
          // The only thing that can happen to a loose ball. At the end of the play, ask straight away (the overlay is
          // drawn after render); on a step in the middle, a button, so selecting a step to change it never adds one.
          const suggest = nearestTo(now.loose && now.loose.at, now.fielders);
          const ask1 = { type: 'fielder', prompt: 'Who gets the ball? Tap them on the field.', suggest, done: (by) => addStep(Object.assign({ a: 'field', by }, now.loose && now.loose.air ? { call: 'out' } : {})) };
          if (!atEnd) { grid.append(btn('Someone gets the ball', () => ask(ask1), true)); continue; }
          B.pending = ask1;
          return nextBox();
        } else if (o === 'throw') {
          grid.append(btn('Throw', () => ask({ type: 'target', exclude: now.holder, prompt: 'Who catches it? Tap a player or a base.', done: (t) => addStep({ a: 'throw', to: t.to, at: t.at }) }), true));
        } else if (o === 'run') {
          grid.append(btn('Run with it', () => ask({ type: 'spot', prompt: 'Tap where they run.', done: (at) => addStep({ a: 'run', at }) })));
        } else if (o === 'tag') {
          if (live.length) grid.append(btn('Tag a runner', () => { B.choosing = { prompt: 'Tag which runner?', body: () => h('div', { class: 'bp-chips' }, live.map((r) => chip(cap(r.word), () => addStep({ a: 'tag', runner: r.id, call: 'out' })))) }; render(); }));
        } else if (o === 'base') {
          grid.append(btn('Step on a base', () => { B.choosing = { prompt: 'Which base?', body: () => h('div', { class: 'bp-chips' }, ['first', 'second', 'third', 'home'].map((b) => chip(BASE_WORD[b], () => addStep(Object.assign({ a: 'base', base: b }, forcedOn(b, live)))))) }; render(); }));
        } else if (o === 'hold') {
          grid.append(btn('Hold it: play over', () => addStep({ a: 'hold' })));
        }
      }
      if (!grid.children.length) return box;
      box.append(grid);
      return box;
    }
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    // A force: the runner heading to that base, if there is one.
    function forcedOn(base, live) {
      const target = { first: 1, second: 2, third: 3, home: 4 }[base];
      const r = live.find((x) => x.going === target || (x.p < target && x.p > target - 1));
      return r ? { runner: r.id, call: 'out' } : {};
    }
    function nearestTo(at, fielders) {
      if (!at) return null;
      let best = null, bd = Infinity;
      for (const pos of POS) { const f = fielders[pos]; const d = Math.hypot(f.x - at.x, f.y - at.y); if (d < bd) { bd = d; best = pos; } }
      return best;
    }
    function pitchChoices() {
      const box = h('div', { class: 'bp-chips' });
      box.append(chip('Catcher catches it', () => addStep({ a: 'pitch', r: 'caught' })));
      box.append(chip('Batter hits it', () => { B.choosing = { prompt: 'How is it hit?', body: () => h('div', { class: 'bp-chips' }, HIT_KINDS.map(([k, label]) => chip(label, () => {
        B.choosing = null;
        ask({ type: 'spot', prompt: `Tap where the ${label.toLowerCase()} goes.`, done: (at) => addStep({ a: 'pitch', r: 'hit', hit: { kind: k, at } }) });
      }))) }; render(); }));
      if (!document.body.classList.contains('no-steals')) box.append(chip('It gets by the catcher', () => rolls('passed')));
      if (!document.body.classList.contains('no-dropped')) box.append(chip('Strike 3 in the dirt', () => rolls('dropped')));
      return box;
    }
    function rolls(r) {
      B.choosing = null;
      ask({ type: 'spot', prompt: 'Tap where the ball rolls.', quick: [['Just behind the plate', () => addStep({ a: 'pitch', r, at: { x: 8, y: -16 } })]], done: (at) => addStep({ a: 'pitch', r, at }) });
    }
    function pickoffChoices() {
      const live = S().liveRunners(after(B.sel));
      return h('div', { class: 'bp-chips' }, live.filter((r) => r.base && r.base !== 'home').map((r) => chip(BASE_WORD[r.base], () => addStep({ a: 'pickoff', base: r.base }))));
    }

    // The selected step: change what the ball does, what each runner does, who moves, the caption.
    function details() {
      const i = B.sel;
      const st = steps()[i];
      const prev = before(i);
      const box = h('div', { class: 'bp-detail', id: 'bp-detail' });
      box.append(h('div', { class: 'bp-detail-head' }, h('h3', {}, `Step ${i + 1}`),
        h('button', { type: 'button', class: 'text-btn small danger', id: 'bp-delete', onclick: () => change(() => { removeAt(i); B.sel = Math.min(i - 1, steps().length - 1); }) }, 'Delete step')));
      // Another way it could go from here: "he turns back", "bad toss". Only once something follows this step: on the
      // last step it read as "add the next step", and a play went out as just the pitch with the rest in an ending.
      if (i < steps().length - 1) box.append(h('button', { type: 'button', class: 'bp-link bp-fork', id: 'bp-fork', onclick: addEnding }, `+ Add another ending after step ${i + 1}`));
      const row = (label, ...kids) => h('div', { class: 'bp-row' }, h('span', { class: 'bp-label' }, label), h('div', { class: 'bp-row-body' }, ...kids));
      const calls = (key = 'call') => h('div', { class: 'bp-chips calls' },
        chip('Out', () => editStep((s) => { s[key] = 'out'; }), (st[key] || 'out') === 'out', { class: 'bp-chip call-out' + ((st[key] || 'out') === 'out' ? ' on' : '') }),
        chip('Safe', () => editStep((s) => { s[key] = 'safe'; }), st[key] === 'safe', { class: 'bp-chip call-safe' + (st[key] === 'safe' ? ' on' : '') }));
      if (st.a === 'pitch') {
        box.append(row('The pitch', h('div', { class: 'bp-chips' },
          [['caught', 'Caught'], ['hit', 'Hit'], ['passed', 'Gets by'], ['dropped', 'Strike 3 in the dirt']].map(([r, label]) => chip(label, () => editStep((s) => {
            s.r = r;
            if (r === 'hit' && !s.hit) s.hit = { kind: 'ground', at: { x: -24, y: 70 } };
            if ((r === 'passed' || r === 'dropped') && !s.at) s.at = { x: 8, y: -16 };
          }), (st.r || 'caught') === r)))));
        if (st.r === 'hit') {
          box.append(row('How', h('div', { class: 'bp-chips' }, HIT_KINDS.map(([k, label]) => chip(label, () => editStep((s) => { s.hit.kind = k; }), st.hit && st.hit.kind === k)))));
          box.append(row('Where', h('button', { type: 'button', class: 'bp-link', onclick: () => ask({ type: 'spot', prompt: 'Tap where it goes.', done: (at) => { B.pending = null; editStep((s) => { s.hit.at = at; }); } }) }, 'Move where it goes')));
        }
        if (st.r === 'passed' || st.r === 'dropped') box.append(row('Where', h('button', { type: 'button', class: 'bp-link', onclick: () => ask({ type: 'spot', prompt: 'Tap where it rolls.', done: (at) => { B.pending = null; editStep((s) => { s.at = at; }); } }) }, 'Move where it rolls')));
      } else if (st.a === 'pickoff') {
        box.append(row('To', h('div', { class: 'bp-chips' }, ['first', 'second', 'third'].map((b) => chip(BASE_WORD[b], () => editStep((s) => { s.base = b; }), st.base === b)))));
      } else if (st.a === 'field') {
        box.append(row('Who', posChips((p) => editStep((s) => { s.by = p; }), null, st.by)));
        if (prev.loose && prev.loose.air) box.append(row('Caught?', h('div', { class: 'bp-chips' },
          chip('Caught: batter out', () => editStep((s) => { s.call = 'out'; }), st.call === 'out'),
          chip('Not caught', () => editStep((s) => { delete s.call; }), st.call !== 'out'))));
      } else if (st.a === 'throw') {
        box.append(row('To', posChips((p) => editStep((s) => { s.to = p; s.at = spotOfBefore(p); }), prev.holder, st.to)));
        box.append(row('Where', h('button', { type: 'button', class: 'bp-link', onclick: () => ask({ type: 'spot', prompt: `Tap where the ${S().PLAYER[st.to]} catches it.`, done: (at) => { B.pending = null; editStep((s) => { s.at = at; }); } }) }, 'Move where they catch it')));
        box.append(row('Fake first', h('div', { class: 'bp-chips' }, chip('No fake', () => editStep((s) => { delete s.fake; }), !st.fake),
          ['first', 'second', 'third', 'home'].map((b) => chip('To ' + BASE_WORD[b], () => editStep((s) => { s.fake = b; }), st.fake === b)))));
        // A mistake: the throw sails past to where the coach taps, or the catch gets away. Either way the ball is loose.
        box.append(row('The throw', h('div', { class: 'bp-chips bp-err' },
          chip('Good throw', () => editStep((s) => { delete s.err; delete s.miss; }), !st.err),
          chip('Wild throw', () => ask({ type: 'spot', prompt: 'Tap where the wild throw ends up.', done: (at) => { B.pending = null; editStep((s) => { s.err = 'wild'; s.miss = at; }); } }), st.err === 'wild'),
          chip('Dropped', () => editStep((s) => { s.err = 'dropped'; delete s.miss; }), st.err === 'dropped'))));
      } else if (st.a === 'run') {
        box.append(row('Where', h('button', { type: 'button', class: 'bp-link', onclick: () => ask({ type: 'spot', prompt: 'Tap where they run.', done: (at) => { B.pending = null; editStep((s) => { s.at = at; }); } }) }, 'Move where they run')));
      } else if (st.a === 'tag') {
        const live = S().liveRunners(prev);
        box.append(row('Runner', h('div', { class: 'bp-chips' }, live.map((r) => chip(cap(r.word), () => editStep((s) => { s.runner = r.id; }), st.runner === r.id)))));
        box.append(row('Call', calls()));
      } else if (st.a === 'base') {
        const live = S().liveRunners(prev);
        box.append(row('Base', h('div', { class: 'bp-chips' }, ['first', 'second', 'third', 'home'].map((b) => chip(BASE_WORD[b], () => editStep((s) => { s.base = b; }), st.base === b)))));
        box.append(row('Force on', h('div', { class: 'bp-chips' }, chip('Nobody', () => editStep((s) => { delete s.runner; delete s.call; }), !st.runner),
          live.map((r) => chip(cap(r.word), () => editStep((s) => { s.runner = r.id; s.call = s.call || 'out'; }), st.runner === r.id)))));
        if (st.runner) box.append(row('Call', calls()));
      }
      // Runners: what each one does from this step on. Nothing chosen: they keep doing what they were doing.
      const live = S().liveRunners(prev).concat(st.a === 'pitch' && (st.r === 'hit' || st.r === 'dropped') ? [{ id: 'batter', word: 'the batter', p: 0, base: 'home' }] : []);
      if (live.length) {
        const rbox = h('div', { class: 'bp-runners' }, h('h4', {}, 'Runners in this step'));
        for (const r of live) {
          const o = (st.runners || {})[r.id];
          const set = (val) => editStep((s) => { s.runners = s.runners || {}; if (val) s.runners[r.id] = val; else delete s.runners[r.id]; if (!Object.keys(s.runners).length) delete s.runners; });
          const p = r.p || 0;
          const ahead = BASE_OF[Math.min(4, Math.floor(p + 1e-6) + 1)];
          const behind = p % 1 > 0.02 ? BASE_OF[Math.floor(p)] : BASE_OF[Math.max(0, Math.round(p) - 1)];
          const chips = [chip('As before', () => set(null), !o)];
          if (ahead && p < 4) chips.push(chip(ahead === 'home' ? 'Run home' : 'Run to ' + BASE_WORD[ahead], () => set({ go: ahead }), o && o.go === ahead && !(behind === ahead)));
          // Back is for a runner caught between bases; one standing on a base has nowhere to go back to.
          if (behind && p > 1 && p % 1 > 0.02 && behind !== 'home') chips.push(chip('Back to ' + BASE_WORD[behind], () => set({ go: behind }), o && o.go === behind));
          // Their own baseline only, toward the next base: a lead, or stopping short. Tap it or drag along it.
          const leg = Math.max(0, Math.min(3, Math.floor(p + 1e-6)));
          chips.push(chip('Stop partway', () => ask({ type: 'path', leg, prompt: `Tap or drag along the orange line: where does ${r.word} stop?`, done: (v) => { B.pending = null; set({ stop: v }); } }), o && Number.isFinite(o.stop)));
          chips.push(chip('Hold', () => set({ hold: true }), o && o.hold));
          rbox.append(h('div', { class: 'bp-runner', 'data-runner': r.id }, h('span', { class: 'bp-label' }, cap(r.word)), h('div', { class: 'bp-chips' }, chips)));
        }
        box.append(rbox);
      }
      const moved = Object.keys(st.move || {});
      box.append(h('div', { class: 'bp-fielders' }, h('h4', {}, 'Fielders in this step'),
        h('p', { class: 'bp-tip' }, 'Drag a fielder on the field to send them somewhere during this step.'),
        moved.length ? h('div', { class: 'bp-chips' }, moved.map((pos) => chip(`${SHORT[pos]} moves · put back`, () => editStep((s) => { delete s.move[pos]; if (!Object.keys(s.move).length) delete s.move; })))) : null));
      box.append(h('label', { class: 'bp-cap', for: 'bp-cap' }, 'Caption',
        h('input', { id: 'bp-cap', type: 'text', maxlength: '40', placeholder: 'Shown on the field, e.g. "Four! Four!"', value: st.cap || '',
          onchange: (e) => editStep((s) => { const v = e.target.value.trim(); if (v) s.cap = v; else delete s.cap; }) })));
      return box;
    }
    function spotOfBefore(pos) { const f = before(B.sel).fielders[pos]; return { x: r1(f.x), y: r1(f.y) }; }

    // Keyboard, for a mouse: Ctrl/Cmd+Z undo, Shift+Ctrl/Cmd+Z or Ctrl+Y redo, Escape cancels a question.
    document.addEventListener('keydown', (e) => {
      if (!active() || (e.target && /INPUT|TEXTAREA/.test(e.target.tagName))) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
      else if (e.key === 'Escape' && (B.pending || B.choosing)) cancelAsk();
    });
    if (canBuildQ.addEventListener) canBuildQ.addEventListener('change', () => { if (state.pm === 'build') refresh(); });

    return {
      refresh, render, active, canBuild,
      // A built play from a link or My plays.
      load(event, name, savedId) {
        B.script = { title: event.title || name || '', steps: clone(event.steps || []), main: event.main || '', alts: clone(event.alts || []) };
        B.alt = Number.isInteger(event.branch) && B.script.alts[event.branch] ? event.branch : -1;
        // At the start, before the pitch: opening on the last step showed a shared play already over (his phone, 2026-10-10).
        B.sel = -1;
        B.savedId = savedId || null;
        B.undo = []; B.redo = []; B.pending = null; B.choosing = null;
        saveDraft();
      },
      // For tests and the app: the script and the selection.
      get script() { return clone(B.script); },
      get sel() { return B.sel; },
      get alt() { return B.alt; },
      select,
      setSavedId(id) { B.savedId = id; },
    };
  }

  root.Builder = { create };
})(typeof window !== 'undefined' ? window : globalThis);
