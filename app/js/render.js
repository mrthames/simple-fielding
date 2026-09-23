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
        outer.addEventListener('pointerup', (e) => { e.stopPropagation(); if (this.onPick) this.onPick(pos); });
        this.actors[pos] = outer;
      }
      this.ballShadow = el('ellipse', { rx: 2.2, ry: 1.2, class: 'ball-shadow' }, this.layers.ball);
      this.ballEl = el('circle', { r: 2, class: 'ball' }, this.layers.ball);
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

    place(node, p) { node.setAttribute('transform', `translate(${p.x.toFixed(2)},${(-p.y).toFixed(2)})`); }

    placeBall(p, idle) {
      const h = p.h || 0;
      const lift = h * 0.45;
      this.ballShadow.setAttribute('cx', p.x); this.ballShadow.setAttribute('cy', -p.y);
      this.ballShadow.setAttribute('opacity', Math.max(0.15, 0.5 - h / 200));
      this.ballEl.setAttribute('cx', p.x); this.ballEl.setAttribute('cy', -p.y - lift);
      this.ballEl.setAttribute('r', 2 + Math.min(h, 90) * 0.035);
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
        if ((ev.type === 'out' || ev.type === 'catch') && t >= ev.t && t <= ev.t + 1.6) {
          const g = el('g', { class: 'caption ' + ev.type, transform: `translate(${ev.at.x},${-ev.at.y - 12})` }, this.layers.captions);
          const w = ev.text.length * 5 + 8;
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
      el('circle', { cx: to.x, cy: -to.y, r: 4, class: 'drag-target' }, this.layers.drag);
      el('circle', { cx: to.x, cy: -to.y, r: 2, class: 'ball' }, this.layers.drag);
    }

    hideDrag() { this.clearLayer('drag'); }
  }

  root.FieldView = FieldView;
})(window);
