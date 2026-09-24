/*
 * Drawing and animation.
 *
 * The field is one SVG whose user units are feet. SVG y grows downward, so every field point is
 * drawn at (x, -y). The renderer knows nothing about baseball: it draws what field.js describes and
 * plays back the keyframes engine.js produced.
 */
(function (root) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const { POSITIONS } = root.Field;

  function el(name, attrs, parent) {
    const n = document.createElementNS(NS, name);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  const P = (p) => `${p.x.toFixed(2)},${(-p.y).toFixed(2)}`;
  const smooth = (f) => f * f * (3 - 2 * f);

  // Sample a keyframe track. Fielders and runners ease within each leg; the ball is already sampled
  // finely by the engine and moves linearly between samples.
  function sample(keys, t, ease) {
    if (t <= keys[0].t) return keys[0];
    for (let i = 1; i < keys.length; i++) {
      const a = keys[i - 1], k = keys[i];
      if (t <= k.t) {
        let f = (t - a.t) / ((k.t - a.t) || 1);
        if (ease) f = smooth(f);
        const ao = a.o === undefined ? 1 : a.o, ko = k.o === undefined ? 1 : k.o;
        return { x: a.x + (k.x - a.x) * f, y: a.y + (k.y - a.y) * f, h: (a.h || 0) + ((k.h || 0) - (a.h || 0)) * f, o: ao + (ko - ao) * f };
      }
    }
    return keys[keys.length - 1];
  }

  class FieldView {
    constructor(svg) {
      this.svg = svg;
      this.geo = null;
      this.plan = null;
      this.t = 0;
      this.showPaths = true;
      this.spotlight = null;
      this.onPick = null;
    }

    setGeometry(geo) {
      this.geo = geo;
      const F = geo.fence;
      const w = F * 1.5;
      this.viewBox = { x: -w / 2, y: -(F + 14), w, h: F + 14 + 34 };
      this.svg.setAttribute('viewBox', `${this.viewBox.x} ${this.viewBox.y} ${this.viewBox.w} ${this.viewBox.h}`);
      this.svg.innerHTML = '';
      this.drawField();
      this.layers = {
        paths: el('g', { class: 'layer-paths' }, this.svg),
        marks: el('g', { class: 'layer-marks' }, this.svg),
        throws: el('g', { class: 'layer-throws' }, this.svg),
        players: el('g', { class: 'layer-players' }, this.svg),
        runners: el('g', { class: 'layer-runners' }, this.svg),
        ball: el('g', { class: 'layer-ball' }, this.svg),
        drag: el('g', { class: 'layer-drag' }, this.svg),
        captions: el('g', { class: 'layer-captions' }, this.svg),
        ink: el('g', { class: 'layer-ink' }, this.svg),
      };
      this.makeActors();
    }

    drawField() {
      const g = this.geo;
      const F = g.fence;
      const s = g.side;
      const b = g.bases;
      const svg = this.svg;
      const k = g.base / 60;

      const defs = el('defs', {}, svg);
      const pat = el('pattern', { id: 'mow', width: 24, height: 24, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
      el('rect', { width: 12, height: 24, fill: 'var(--grass-a)' }, pat);
      el('rect', { x: 12, width: 12, height: 24, fill: 'var(--grass-b)' }, pat);
      const arrow = el('marker', { id: 'arrow', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto-start-reverse' }, defs);
      el('path', { d: 'M0,0 L10,5 L0,10 z', fill: 'var(--throw)' }, arrow);

      const vb = this.viewBox;
      el('rect', { x: vb.x, y: vb.y, width: vb.w, height: vb.h, fill: 'var(--foul-grass)' }, svg);

      // Fair territory out to the fence, and a warning track.
      const fx = F / Math.SQRT2;
      el('path', { d: `M0,0 L${-fx},${-fx} A${F},${F} 0 0 1 ${fx},${-fx} Z`, fill: 'var(--track)' }, svg);
      const G = F - 10;
      const gx = G / Math.SQRT2;
      el('path', { d: `M0,0 L${-gx},${-gx} A${G},${G} 0 0 1 ${gx},${-gx} Z`, fill: 'url(#mow)' }, svg);

      // Infield dirt: an arc centred on the mound, closed by the foul lines.
      const R = g.infieldEdge - g.mound.y;
      const m = g.mound.y;
      // Where the arc meets the line y = x:  x^2 + (x - m)^2 = R^2
      const xi = (m + Math.sqrt(2 * R * R - m * m)) / 2;
      el('path', { d: `M0,6 L${-xi},${-xi} A${R},${R} 0 0 1 ${xi},${-xi} Z`, fill: 'var(--dirt)' }, svg);
      // Infield grass.
      const inset = 9 * k;
      const grass = [
        { x: 0, y: inset * 1.3 }, { x: s - inset, y: s }, { x: 0, y: 2 * s - inset }, { x: -(s - inset), y: s },
      ];
      el('path', { d: 'M' + grass.map(P).join(' L') + ' Z', fill: 'var(--grass-a)' }, svg);
      // Home plate circle, base cut-outs, mound.
      el('circle', { cx: 0, cy: 0, r: 13 * k, fill: 'var(--dirt)' }, svg);
      for (const base of ['first', 'second', 'third']) el('circle', { cx: b[base].x, cy: -b[base].y, r: 7 * k, fill: 'var(--dirt)' }, svg);
      el('circle', { cx: 0, cy: -g.mound.y, r: 7 * k, fill: 'var(--dirt)' }, svg);
      el('rect', { x: -1.2, y: -g.mound.y - 0.3, width: 2.4, height: 0.6, fill: 'white' }, svg);

      // Foul lines and the fence.
      el('line', { x1: 0, y1: 0, x2: -fx, y2: -fx, class: 'chalk' }, svg);
      el('line', { x1: 0, y1: 0, x2: fx, y2: -fx, class: 'chalk' }, svg);
      el('path', { d: `M${-fx},${-fx} A${F},${F} 0 0 1 ${fx},${-fx}`, class: 'fence' }, svg);
      // Backstop.
      const bs = g.backstop;
      el('path', { d: `M${-38 * k},${6 * k} Q0,${-bs * 1.35} ${38 * k},${6 * k}`, class: 'backstop' }, svg);

      // Batter's boxes.
      el('rect', { x: -6.5, y: -4, width: 4, height: 7, class: 'box' }, svg);
      el('rect', { x: 2.5, y: -4, width: 4, height: 7, class: 'box' }, svg);

      // Bases.
      this.baseEls = {};
      for (const base of ['first', 'second', 'third']) {
        const p = b[base];
        const grp = el('g', { class: 'base', 'data-base': base, transform: `translate(${p.x},${-p.y}) rotate(45)` }, svg);
        el('rect', { x: -7, y: -7, width: 14, height: 14, fill: 'transparent' }, grp); // bigger tap target
        el('rect', { x: -1.6, y: -1.6, width: 3.2, height: 3.2, class: 'bag' }, grp);
        this.baseEls[base] = grp;
      }
      el('path', { d: 'M-1.4,-1.4 L1.4,-1.4 L1.4,0 L0,1.4 L-1.4,0 Z', class: 'bag' }, svg);
    }

    makeActors() {
      this.actors = {};
      for (const pos of POSITIONS) {
        const outer = el('g', { class: 'player', 'data-pos': pos }, this.layers.players);
        const g = el('g', { class: 'actor' }, outer);
        el('circle', { r: 11, class: 'hit' }, g);
        el('circle', { r: 7.5, class: 'ring' }, g);
        el('circle', { r: 6, class: 'body' }, g);
        const t = el('text', { class: 'label', y: 0.2 }, g);
        t.textContent = pos;
        // Name tag under the circle, shown when the field is labelled with players' names.
        const tag = el('g', { class: 'tag', transform: 'translate(0,10.5)' }, g);
        el('rect', { class: 'tag-bg', x: -8, y: -3.4, width: 16, height: 6.8, rx: 3.4 }, tag);
        el('text', { class: 'tag-text', y: 0.2 }, tag);
        tag.style.display = 'none';

        // Tap spotlights; press and hold opens the position editor.
        let hold = null, held = false, start = null;
        const cancel = () => { if (hold) { clearTimeout(hold); hold = null; } };
        outer.addEventListener('pointerdown', (e) => {
          held = false; start = { x: e.clientX, y: e.clientY };
          cancel();
          hold = setTimeout(() => { hold = null; held = true; if (this.onLongPress) this.onLongPress(pos); }, 550);
        });
        outer.addEventListener('pointermove', (e) => { if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) cancel(); });
        outer.addEventListener('pointerleave', cancel);
        outer.addEventListener('pointercancel', cancel);
        outer.addEventListener('contextmenu', (e) => e.preventDefault());
        outer.addEventListener('pointerup', (e) => {
          e.stopPropagation(); cancel();
          if (held) { held = false; return; }
          if (this.onPick) this.onPick(pos);
        });
        outer._cancelHold = cancel;
        this.actors[pos] = outer;
      }
      this.ballShadow = el('ellipse', { rx: 2.2, ry: 1.2, class: 'ball-shadow' }, this.layers.ball);
      // The same baseball as Simple Pitch Counter's logo. It's the thing you grab and drag.
      this.ballEl = el('image', { href: 'img/baseball.svg', class: 'ball', width: 4, height: 4 }, this.layers.ball);
      this.runnerEls = {};
    }

    // Standing positions before any play.
    showReady(ready, runners) {
      this.plan = null;
      this.clearLayer('paths'); this.clearLayer('marks'); this.clearLayer('throws'); this.clearLayer('captions');
      for (const pos of POSITIONS) {
        this.place(this.actors[pos], ready[pos]);
        this.actors[pos].setAttribute('class', 'player');
      }
      this.setRunners(runners);
      this.placeBall({ x: 0, y: 1.5, h: 0 }, true);
      this.applySpotlight();
    }

    setRunners(runners) {
      this.clearLayer('runners');
      this.runnerEls = {};
      const b = this.geo.bases;
      for (const base of ['first', 'second', 'third']) {
        if (!runners[base]) continue;
        const r = this.makeRunner(base, 'R');
        this.place(r, { x: b[base].x, y: b[base].y });
      }
      for (const base of ['first', 'second', 'third']) {
        this.baseEls[base].classList.toggle('occupied', !!runners[base]);
      }
    }

    makeRunner(id, label) {
      const outer = el('g', { class: 'runner' + (id === 'batter' ? ' batter' : '') }, this.layers.runners);
      const g = el('g', { class: 'actor' }, outer);
      el('circle', { r: 5, class: 'body' }, g);
      const t = el('text', { class: 'label', y: 0.2 }, g);
      t.textContent = label;
      this.runnerEls[id] = outer;
      return outer;
    }

    place(node, p) {
      node._p = { x: p.x, y: p.y };
      node.setAttribute('transform', `translate(${p.x.toFixed(2)},${(-p.y).toFixed(2)})`);
    }

    placeBall(p, idle) {
      const h = p.h || 0;
      this.ballAt = { x: p.x, y: p.y };
      const lift = h * 0.45;
      this.ballShadow.setAttribute('cx', p.x); this.ballShadow.setAttribute('cy', -p.y);
      this.ballShadow.setAttribute('opacity', Math.max(0.15, 0.5 - h / 200));
      // Bigger while it waits at the plate to be grabbed, or on the whiteboard; true-ish size in flight.
      const r = (idle || this.boardMode ? 4.5 : 2.4) + Math.min(h, 90) * 0.04;
      this.ballEl.setAttribute('x', (p.x - r).toFixed(2));
      this.ballEl.setAttribute('y', (-p.y - lift - r).toFixed(2));
      this.ballEl.setAttribute('width', (2 * r).toFixed(2));
      this.ballEl.setAttribute('height', (2 * r).toFixed(2));
      this.ballShadow.setAttribute('rx', r * 0.9); this.ballShadow.setAttribute('ry', r * 0.45);
      this.ballEl.classList.toggle('idle', !!idle);
    }

    clearLayer(name) { this.layers[name].innerHTML = ''; }

    // Load a plan: draw destination marks and paths, create runner actors.
    load(plan) {
      this.plan = plan;
      this.firedEvents = new Set();
      this.clearLayer('paths'); this.clearLayer('marks'); this.clearLayer('throws'); this.clearLayer('captions');
      this.clearLayer('runners');
      this.runnerEls = {};
      for (const pos of POSITIONS) {
        const a = plan.assignments[pos];
        this.actors[pos].setAttribute('class', `player role-${a.role}`);
        const keys = plan.timeline.tracks[pos];
        const start = keys[0], end = keys[keys.length - 1];
        if (Math.hypot(end.x - start.x, end.y - start.y) > 4) {
          const d = 'M' + keys.map(P).join(' L');
          el('path', { d, class: `path role-${a.role}`, 'data-pos': pos }, this.layers.paths);
          el('circle', { cx: end.x, cy: -end.y, r: 3, class: `dest role-${a.role}`, 'data-pos': pos }, this.layers.marks);
        }
      }
      // Cutoff and relay lines: from the ball to the base, through the cutoff man.
      for (const th of plan.throws) {
        if (!th.via) continue;
        const fp = plan.ball.fieldPoint;
        const via = plan.assignments[th.via].to;
        const base = th.to === 'home' ? { x: 0, y: 0 } : plan.geo.bases[th.to];
        el('path', { d: `M${P(fp)} L${P(via)} L${P(base)}`, class: 'lineup' }, this.layers.paths);
      }
      for (const r of plan.runners) this.makeRunner(r.id, r.id === 'batter' ? 'B' : 'R');
      for (const base of ['first', 'second', 'third']) this.baseEls[base].classList.remove('occupied');
      this.layers.paths.style.display = this.showPaths ? '' : 'none';
      this.layers.marks.style.display = this.showPaths ? '' : 'none';
      this.seek(0);
    }

    seek(t) {
      const plan = this.plan;
      if (!plan) return;
      this.t = t;
      const tr = plan.timeline.tracks;
      for (const pos of POSITIONS) this.place(this.actors[pos], sample(tr[pos], t, true));
      for (const r of plan.runners) {
        const node = this.runnerEls[r.id];
        const keys = tr['runner:' + r.id];
        if (!node || !keys) continue;
        const p = sample(keys, t, false);
        this.place(node, p);
        node.style.opacity = p.o;
      }
      this.placeBall(sample(tr.ball, t, false), false);

      // Throw arrows while a throw is in the air, captions after events.
      this.clearLayer('throws');
      this.clearLayer('captions');
      for (const ev of plan.timeline.events) {
        if (ev.type === 'throw' && t >= ev.t && t <= ev.tEnd + 0.6) {
          el('line', { x1: ev.from.x, y1: -ev.from.y, x2: ev.to.x, y2: -ev.to.y, class: 'throw', 'marker-end': 'url(#arrow)' }, this.layers.throws);
        }
        if ((ev.type === 'out' || ev.type === 'catch' || ev.type === 'hold') && t >= ev.t && t <= ev.t + 1.8) {
          const g = el('g', { class: 'caption ' + ev.type, transform: `translate(${ev.at.x},${-ev.at.y - 12})` }, this.layers.captions);
          const w = ev.text.length * 3.6 + 8;
          el('rect', { x: -w / 2, y: -6, width: w, height: 11, rx: 5.5 }, g);
          el('text', { y: 0.5 }, g).textContent = ev.text;
        }
      }
    }

    setShowPaths(v) {
      this.showPaths = v;
      if (this.layers) {
        this.layers.paths.style.display = v ? '' : 'none';
        this.layers.marks.style.display = v ? '' : 'none';
      }
    }

    setSpotlight(pos) { this.spotlight = pos; this.applySpotlight(); }

    applySpotlight() {
      this.svg.classList.toggle('has-spotlight', !!this.spotlight);
      for (const pos of POSITIONS) this.actors[pos].classList.toggle('spot', this.spotlight === pos);
      for (const n of this.svg.querySelectorAll('.path, .dest')) n.classList.toggle('spot', n.getAttribute('data-pos') === this.spotlight);
    }

    // Screen point -> field feet.
    toField(clientX, clientY) {
      const pt = this.svg.createSVGPoint();
      pt.x = clientX; pt.y = clientY;
      const m = this.svg.getScreenCTM().inverse();
      const q = pt.matrixTransform(m);
      return { x: q.x, y: -q.y };
    }

    showDrag(from, to, kind) {
      this.clearLayer('drag');
      const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
      const lift = { ground: 0, bunt: 0, line: 10, fly: 45, pop: 60 }[kind] || 20;
      const d = `M${P(from)} Q${mid.x},${-mid.y - lift} ${to.x},${-to.y}`;
      el('path', { d, class: 'drag-line' }, this.layers.drag);
      el('circle', { cx: to.x, cy: -to.y, r: 7, class: 'drag-target' }, this.layers.drag);
      el('image', { href: 'img/baseball.svg', x: to.x - 4.5, y: -to.y - 4.5, width: 9, height: 9 }, this.layers.drag);
    }

    hideDrag() { this.clearLayer('drag'); }

    // ---------------------------------------------------------------------------------------------
    // Whiteboard
    // ---------------------------------------------------------------------------------------------

    // Everything where it is drawn right now: the starting point for the whiteboard.
    snapshot() {
      const players = {};
      for (const pos of POSITIONS) players[pos] = Object.assign({}, this.actors[pos]._p);
      const runners = [];
      for (const id in this.runnerEls) {
        const n = this.runnerEls[id];
        if (!n._p || (n.style.opacity !== '' && Number(n.style.opacity) < 0.5)) continue;
        runners.push({ id, label: id === 'batter' ? 'B' : 'R', x: n._p.x, y: n._p.y });
      }
      return { players, runners, ball: Object.assign({}, this.ballAt || { x: 0, y: 1.5 }) };
    }

    // Draw a board state: free positions, no paths, no timeline.
    setBoardMode(on) { this.boardMode = on; }

    cancelHolds() { for (const pos of POSITIONS) this.actors[pos]._cancelHold(); }

    // labels[pos] = { inner, tag } from Team.labelFor.
    setLabels(labels) {
      for (const pos of POSITIONS) {
        const l = labels[pos] || { inner: pos, tag: '' };
        const g = this.actors[pos];
        const t = g.querySelector('.label');
        t.textContent = l.inner;
        t.classList.toggle('long', l.inner.length >= 3);
        const tag = g.querySelector('.tag');
        if (l.tag) {
          const text = l.tag.length > 12 ? l.tag.slice(0, 11) + '…' : l.tag;
          tag.querySelector('.tag-text').textContent = text;
          const w = Math.max(10, text.length * 3.1 + 5);
          const r = tag.querySelector('.tag-bg');
          r.setAttribute('x', -w / 2); r.setAttribute('width', w);
          tag.style.display = '';
        } else {
          tag.style.display = 'none';
        }
      }
    }

    showBoard(board) {
      this.clearLayer('paths'); this.clearLayer('marks'); this.clearLayer('throws'); this.clearLayer('captions');
      for (const pos of POSITIONS) this.place(this.actors[pos], board.players[pos]);
      this.clearLayer('runners');
      this.runnerEls = {};
      for (const r of board.runners) {
        const n = this.makeRunner(r.id, r.label);
        this.place(n, r);
      }
      for (const base of ['first', 'second', 'third']) this.baseEls[base].classList.remove('occupied');
      this.placeBall(Object.assign({ h: 0 }, board.ball), false);
      this.drawInk(board.strokes);
    }

    drawInk(strokes, live) {
      this.clearLayer('ink');
      for (const st of strokes || []) this.renderStroke(st);
      if (live) this.renderStroke(live);
    }

    renderStroke(st) {
      const pts = st.pts;
      if (!pts.length) return;
      const g = el('g', { class: 'ink ink-' + st.type }, this.layers.ink);
      const w = st.width;
      if (pts.length === 1) {
        el('circle', { cx: pts[0].x, cy: -pts[0].y, r: w / 2, fill: st.color }, g);
        return;
      }
      // Smooth through the midpoints so a Pencil stroke looks like ink, not a polyline.
      let d = `M${pts[0].x.toFixed(2)},${(-pts[0].y).toFixed(2)}`;
      for (let i = 1; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        d += ` Q${a.x.toFixed(2)},${(-a.y).toFixed(2)} ${((a.x + b.x) / 2).toFixed(2)},${(-(a.y + b.y) / 2).toFixed(2)}`;
      }
      const last = pts[pts.length - 1];
      d += ` L${last.x.toFixed(2)},${(-last.y).toFixed(2)}`;
      el('path', { d, fill: 'none', stroke: st.color, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, g);
      if (st.type === 'arrow') {
        // Head points along the last few feet of the stroke, so curved arrows work too.
        let i = pts.length - 2;
        while (i > 0 && Math.hypot(last.x - pts[i].x, last.y - pts[i].y) < 5) i--;
        const a = pts[i];
        const len = Math.hypot(last.x - a.x, last.y - a.y) || 1;
        const ux = (last.x - a.x) / len, uy = (last.y - a.y) / len;
        const size = 4 + w * 1.5;
        const bx = last.x - ux * size, by = last.y - uy * size;
        const px = -uy * size * 0.6, py = ux * size * 0.6;
        const tri = [[last.x, last.y], [bx + px, by + py], [bx - px, by - py]]
          .map(([x, y]) => `${x.toFixed(2)},${(-y).toFixed(2)}`).join(' ');
        el('polygon', { points: tri, fill: st.color }, g);
      }
    }
  }

  root.FieldView = FieldView;
})(window);
