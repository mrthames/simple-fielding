/*
 * The 3D view: the same plays, drawn in 3D with Three.js (app/vendor/three.min.js, MIT, loaded only when 3D is
 * turned on). It reads the plan the engine made — the same timeline the 2D field plays — so nothing about a play
 * changes between views.
 *
 * Field feet map to Three's world as x → x, height → y, and field y (toward center) → -z, so a camera behind home
 * plate looking out sees 1st base on the right.
 *
 * Cameras: 'broadcast' (behind home, up high), 'overhead', and 'player:POS' or 'runner:ID' — ride along with one
 * player, at eye height, looking where the engine says they're looking.
 */
(function (root) {
  'use strict';

  const POSITIONS = ['P', 'C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF'];
  const ROLE_COLORS = { field: 0xffc400, cutoff: 0xff8c1a, relay: 0xff8c1a, trail: 0xff8c1a, cover: 0x22c55e, backup: 0xa855f7, hold: 0xcbd5e1 };
  const sample = (keys, t) => root.Engine.sampleTrack(keys || [], t);

  class Field3D {
    constructor(container) {
      const THREE = root.THREE;
      this.THREE = THREE;
      this.container = container;
      this.renderer = new THREE.WebGLRenderer({ antialias: true });
      this.renderer.setPixelRatio(Math.min(2, root.devicePixelRatio || 1));
      this.canvas = this.renderer.domElement;
      this.canvas.className = 'field3d';
      container.appendChild(this.canvas);
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x8fc3e8);
      this.scene.fog = new THREE.Fog(0x8fc3e8, 600, 1600);
      this.camera = new THREE.PerspectiveCamera(50, 1, 0.5, 4000);
      this.scene.add(new THREE.HemisphereLight(0xffffff, 0x3a5a2a, 0.7));
      const sun = new THREE.DirectionalLight(0xffffff, 0.75);
      sun.position.set(-200, 400, 150);
      this.scene.add(sun);
      this.mode = 'broadcast';
      this.plan = null;
      this.t = 0;
      this.labels = {};
      this.camPos = null;
      this.onResize = () => this.resize();
      root.addEventListener('resize', this.onResize);
      this.resize();
    }

    // Field feet → world.
    w(x, y, h = 0) { return new this.THREE.Vector3(x, h, -y); }

    resize() {
      const r = this.container.getBoundingClientRect();
      const W = Math.max(1, r.width), H = Math.max(1, r.height);
      this.renderer.setSize(W, H, false);
      this.canvas.style.width = W + 'px';
      this.canvas.style.height = H + 'px';
      this.camera.aspect = W / H;
      this.camera.updateProjectionMatrix();
      this.render();
    }

    flat(points, color, h, mat) {
      const THREE = this.THREE;
      const shape = new THREE.Shape(points.map((p) => new THREE.Vector2(p.x, p.y)));
      const geo = new THREE.ShapeGeometry(shape, 24);
      const mesh = new THREE.Mesh(geo, mat || new THREE.MeshLambertMaterial({ color }));
      mesh.rotation.x = -Math.PI / 2;   // shape x,y → world x,-z
      mesh.position.y = h;
      this.field.add(mesh);
      return mesh;
    }

    setGeometry(geo) {
      const THREE = this.THREE;
      this.geo = geo;
      if (this.field) this.scene.remove(this.field);
      this.field = new THREE.Group();
      this.scene.add(this.field);
      const F = geo.fenceMax;
      const wall = (inset) => {
        const pts = [{ x: 0, y: 0 }];
        for (let a = 0; a <= 90; a += 1.5) {
          const r = geo.fenceDir(a) - inset, t = (a + 45) * Math.PI / 180;
          pts.push({ x: Math.cos(t) * r, y: Math.sin(t) * r });
        }
        return pts;
      };
      // Foul ground, the warning track, fair grass.
      this.flat([{ x: -F * 1.6, y: -F * 0.6 }, { x: F * 1.6, y: -F * 0.6 }, { x: F * 1.6, y: F * 1.4 }, { x: -F * 1.6, y: F * 1.4 }], 0x2f6f32, -0.05);
      this.flat(wall(0), 0xb98a57, 0);
      this.flat(wall(Math.max(10, 10 * geo.fence / 200)), 0x3f8f3a, 0.02);
      // Infield dirt: an arc around the rubber, closed by the foul lines (as in 2D).
      const R = geo.infieldEdge - geo.mound.y, m = geo.mound.y;
      const xi = (m + Math.sqrt(2 * R * R - m * m)) / 2;
      const dirt = [{ x: 0, y: -6 }, { x: xi, y: xi }];
      const a0 = Math.atan2(xi - m, xi), a1 = Math.atan2(xi - m, -xi);
      for (let i = 0; i <= 40; i++) { const a = a0 + (a1 - a0) * i / 40; dirt.push({ x: Math.cos(a) * R, y: m + Math.sin(a) * R }); }
      dirt.push({ x: -xi, y: xi });
      this.flat(dirt, 0xc68c52, 0.04);
      const s = geo.side, k = geo.base / 60;
      if (geo.league.sport !== 'softball') {
        const inset = 9 * k;
        this.flat([{ x: 0, y: inset * 1.3 }, { x: s - inset, y: s }, { x: 0, y: 2 * s - inset }, { x: -(s - inset), y: s }], 0x3f8f3a, 0.06);
      }
      const circ = (x, y, r, color, h) => {
        const g = new THREE.CircleGeometry(r, 32);
        const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color }));
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.copy(this.w(x, y, h));
        this.field.add(mesh);
        return mesh;
      };
      circ(0, 0, 13 * k, 0xc68c52, 0.07);
      for (const bse of ['first', 'second', 'third']) circ(geo.bases[bse].x, geo.bases[bse].y, 7 * k, 0xc68c52, 0.07);
      if (geo.league.sport === 'softball') {
        const ring = new THREE.Mesh(new THREE.RingGeometry(7.8, 8.2, 48), new THREE.MeshBasicMaterial({ color: 0xffffff }));
        ring.rotation.x = -Math.PI / 2; ring.position.copy(this.w(0, geo.mound.y, 0.09)); this.field.add(ring);
      } else {
        const mound = new THREE.Mesh(new THREE.CylinderGeometry(7 * k, 9 * k, 0.9, 32), new THREE.MeshLambertMaterial({ color: 0xc68c52 }));
        mound.position.copy(this.w(0, geo.mound.y, 0.45)); this.field.add(mound);
      }
      // Chalk: foul lines to the poles.
      const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      for (const sign of [-1, 1]) {
        const a = sign > 0 ? 0 : 90, r = geo.fenceDir(a), t = (a + 45) * Math.PI / 180;
        const end = { x: Math.cos(t) * r, y: Math.sin(t) * r };
        const len = Math.hypot(end.x, end.y);
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, len), lineMat);
        box.position.copy(this.w(end.x / 2, end.y / 2, 0.1));
        box.lookAt(this.w(end.x, end.y, 0.1));
        this.field.add(box);
        // Foul pole.
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 40, 8), new THREE.MeshLambertMaterial({ color: 0xffd400 }));
        pole.position.copy(this.w(end.x, end.y, 20)); this.field.add(pole);
      }
      // Bases and the plate.
      for (const bse of ['first', 'second', 'third']) {
        const bag = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.4, 1.25), new THREE.MeshLambertMaterial({ color: 0xffffff }));
        bag.position.copy(this.w(geo.bases[bse].x, geo.bases[bse].y, 0.2)); bag.rotation.y = Math.PI / 4; this.field.add(bag);
      }
      const plate = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 1.4), new THREE.MeshLambertMaterial({ color: 0xffffff }));
      plate.position.copy(this.w(0, 0, 0.1)); plate.rotation.y = Math.PI / 4; this.field.add(plate);
      // The wall: a dark green fence along the park's shape, with the distances on it.
      const wallMat = new THREE.MeshLambertMaterial({ color: 0x1f3b2a, side: THREE.DoubleSide });
      const H = geo.big ? 10 : 6;
      const pts = wall(0).slice(1);
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const seg = new THREE.Mesh(new THREE.BoxGeometry(len + 0.4, H, 0.8), wallMat);
        seg.position.copy(this.w((a.x + b.x) / 2, (a.y + b.y) / 2, H / 2));
        seg.rotation.y = Math.atan2(b.y - a.y, b.x - a.x);
        this.field.add(seg);
      }
      for (const a of [88, 45, 2]) {
        const r = geo.fenceDir(a) - 1.2, t = (a + 45) * Math.PI / 180;
        const lbl = this.textSprite(String(Math.round(geo.fenceDir(a === 88 ? 90 : a === 2 ? 0 : 45))), '#ffffff', 'rgba(0,0,0,0)', 64);
        lbl.position.copy(this.w(Math.cos(t) * r, Math.sin(t) * r, H * 0.55));
        lbl.scale.set(12 * (geo.fence / 200), 6 * (geo.fence / 200), 1);
        this.field.add(lbl);
      }
      // A coach on the rubber at 8U.
      if (geo.rules && geo.rules.pitcher === 'adult') {
        const coach = this.person(0xf5f1e6, 1.1);
        coach.position.copy(this.w(0, geo.mound.y - 1, 0));
        this.field.add(coach);
      }
      this.buildActors();
      this.render();
    }

    textSprite(text, fg, bg, size = 48) {
      const THREE = this.THREE;
      const c = document.createElement('canvas');
      const ctx = c.getContext('2d');
      ctx.font = `800 ${size}px system-ui, sans-serif`;
      const w = Math.ceil(ctx.measureText(text).width) + size * 0.6;
      c.width = w; c.height = size * 1.5;
      ctx.font = `800 ${size}px system-ui, sans-serif`;
      if (bg && bg !== 'rgba(0,0,0,0)') { ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(0, 0, w, c.height, c.height / 2) : ctx.rect(0, 0, w, c.height); ctx.fill(); }
      ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, w / 2, c.height / 2 + 2);
      const tex = new THREE.CanvasTexture(c);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
      sp.userData.aspect = w / c.height;
      sp.renderOrder = 10;
      return sp;
    }

    // A simple figure: body, head, and a colored ring at their feet for their job.
    person(color, scale = 1) {
      const THREE = this.THREE;
      const g = new THREE.Group();
      const mat = new THREE.MeshLambertMaterial({ color });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.9 * scale, 1.1 * scale, 3.6 * scale, 16), mat);
      body.position.y = 1.9 * scale;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.75 * scale, 16, 12), new THREE.MeshLambertMaterial({ color: 0xf1c9a5 }));
      head.position.y = 4.3 * scale;
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.8 * scale, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat);
      cap.position.y = 4.45 * scale;
      g.add(body, head, cap);
      return g;
    }

    buildActors() {
      const THREE = this.THREE;
      this.actors = {};
      this.rings = {};
      const us = Math.max(1, Math.min(1.9, this.geo.fenceMax / 215));
      this.us = us;
      for (const pos of POSITIONS) {
        const g = this.person(0x1f6fe5, 1.3);
        const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 3.0, 32), new THREE.MeshBasicMaterial({ color: 0xcbd5e1, transparent: true, opacity: 0.9 }));
        ring.rotation.x = -Math.PI / 2; ring.position.y = 0.15;
        g.add(ring);
        const lbl = this.textSprite(this.labels[pos] || pos, '#ffffff', 'rgba(15,40,90,.85)', 44);
        lbl.position.y = 8.6; lbl.scale.set(3.2 * lbl.userData.aspect * us * 0.8, 3.2 * us * 0.8, 1);
        g.add(lbl);
        g.userData.label = lbl;
        this.field.add(g);
        this.actors[pos] = g;
        this.rings[pos] = ring;
      }
      this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.45 * us, 16, 12), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x333333 }));
      this.ballShadow = new THREE.Mesh(new THREE.CircleGeometry(0.5 * us, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 }));
      this.ballShadow.rotation.x = -Math.PI / 2;
      this.field.add(this.ball, this.ballShadow);
      this.runnerMeshes = {};
    }

    setLabels(labels) {
      this.labels = {};
      for (const pos of POSITIONS) this.labels[pos] = (labels[pos] && labels[pos].inner) || pos;
      if (this.geo) { this.setGeometry(this.geo); if (this.plan) this.load(this.plan); }
    }

    clearRunners() {
      for (const id in this.runnerMeshes) this.field.remove(this.runnerMeshes[id]);
      this.runnerMeshes = {};
    }
    makeRunner(id, label) {
      const g = this.person(0xe23b3b, 1.25);
      const lbl = this.textSprite(label, '#ffffff', 'rgba(170,25,25,.9)', 44);
      lbl.position.y = 8.2; lbl.scale.set(2.6 * lbl.userData.aspect * this.us * 0.8, 2.6 * this.us * 0.8, 1);
      g.add(lbl);
      this.field.add(g);
      this.runnerMeshes[id] = g;
      return g;
    }

    showReady(ready, runners) {
      this.plan = null;
      if (!this.actors) return;
      for (const pos of POSITIONS) {
        this.place(this.actors[pos], ready[pos], { x: 0, y: 0 });
        this.rings[pos].material.color.setHex(0xcbd5e1);
      }
      this.clearRunners();
      const b = this.geo.bases;
      for (const base of ['first', 'second', 'third']) if (runners && runners[base]) this.place(this.makeRunner(base, 'R'), b[base], b.home);
      this.ball.position.copy(this.w(0, 1.5, 0.45)); this.ballShadow.position.copy(this.w(0, 1.5, 0.12));
      this.render();
    }

    load(plan) {
      this.plan = plan;
      if (!this.actors) return;
      for (const pos of POSITIONS) this.rings[pos].material.color.setHex(ROLE_COLORS[plan.assignments[pos].role] || 0xcbd5e1);
      this.clearRunners();
      for (const r of plan.runners) this.makeRunner(r.id, r.label || (r.id === 'batter' ? 'B' : 'R'));
      this.seek(0);
    }

    // Stand a figure at a spot, facing toward `look`.
    place(g, p, look) {
      g.position.copy(this.w(p.x, p.y, 0));
      if (look && (look.x !== p.x || look.y !== p.y)) g.rotation.y = Math.atan2(look.x - p.x, look.y - p.y);
    }

    seek(t) {
      this.t = t;
      const plan = this.plan;
      if (!plan || !this.actors) { this.render(); return; }
      const tr = plan.timeline.tracks;
      this.pose = {};
      for (const pos of POSITIONS) {
        const p = sample(tr[pos], t);
        const l = tr['look:' + pos] ? sample(tr['look:' + pos], t) : { x: 0, y: 0 };
        this.place(this.actors[pos], p, l);
        this.pose['player:' + pos] = { p, l };
      }
      for (const r of plan.runners) {
        const keys = tr['runner:' + r.id];
        const g = this.runnerMeshes[r.id];
        if (!keys || !g) continue;
        const p = sample(keys, t);
        const l = tr['look:runner:' + r.id] ? sample(tr['look:runner:' + r.id], t) : p;
        this.place(g, p, l);
        g.visible = p.o === undefined || p.o > 0.4;
        this.pose['runner:' + r.id] = { p, l };
      }
      const bp = sample(tr.ball, t);
      const hgt = 0.45 + Math.max(0, bp.h || 0) * 0.55;
      this.ball.position.copy(this.w(bp.x, bp.y, hgt));
      this.ballShadow.position.copy(this.w(bp.x, bp.y, 0.12));
      this.ballAt = { x: bp.x, y: bp.y, h: hgt };
      this.render();
    }

    // Which people the camera can ride with.
    riders() {
      const out = POSITIONS.map((pos) => ({ key: 'player:' + pos, label: this.labels[pos] && this.labels[pos] !== pos ? `${this.labels[pos]} (${pos})` : pos }));
      if (this.plan) for (const r of this.plan.runners) out.push({ key: 'runner:' + r.id, label: r.id === 'batter' ? 'Batter-runner' : `Runner on ${({ first: '1st', second: '2nd', third: '3rd' })[r.id] || r.id}` });
      return out;
    }

    setMode(mode) { this.mode = mode; this.camPos = null; this.render(); }

    updateCamera() {
      const g = this.geo;
      if (!g) return;
      const F = g.fence;
      let pos, look;
      if (this.mode === 'overhead') {
        pos = this.w(0, F * 0.42, F * 1.25);
        look = this.w(0, F * 0.44, 0);
        this.camera.up.set(0, 0, -1);
      } else if (this.mode.startsWith('player:') || this.mode.startsWith('runner:')) {
        this.camera.up.set(0, 1, 0);
        const pose = this.pose && this.pose[this.mode];
        let p, l;
        if (pose) { p = pose.p; l = pose.l; }
        else if (this.mode.startsWith('player:')) { const a = this.actors[this.mode.slice(7)]; p = { x: a.position.x, y: -a.position.z }; l = { x: 0, y: 0 }; }
        if (!p) { this.mode = 'broadcast'; return this.updateCamera(); }
        // From their eyes (about 5 ft up), looking where the engine says they're looking.
        const d = Math.hypot(l.x - p.x, l.y - p.y) || 1;
        const ux = (l.x - p.x) / d, uy = (l.y - p.y) / d;
        pos = this.w(p.x - ux * 0.5, p.y - uy * 0.5, 5.4);
        look = this.w(l.x, l.y, 3.5);
      } else {
        this.camera.up.set(0, 1, 0);
        pos = this.w(0, -F * 0.24, F * 0.2);
        look = this.w(0, F * 0.36, 0);
      }
      // Ease the camera so a turn of the head is a turn, not a jump.
      if (!this.camPos || this.mode === 'overhead' || this.mode === 'broadcast') { this.camPos = pos.clone(); this.camLook = look.clone(); }
      else { this.camPos.lerp(pos, 0.5); this.camLook.lerp(look, 0.25); }
      this.camera.position.copy(this.camPos);
      this.camera.lookAt(this.camLook);
      this.camera.fov = this.mode.startsWith('player:') || this.mode.startsWith('runner:') ? 70 : 50;
      this.camera.updateProjectionMatrix();
    }

    render() {
      if (!this.geo || !this.canvas.isConnected || this.canvas.style.display === 'none') return;
      this.updateCamera();
      // Riding with a player: hide their own figure so it doesn't block the view.
      for (const pos of POSITIONS) if (this.actors && this.actors[pos]) this.actors[pos].visible = this.mode !== 'player:' + pos;
      if (this.runnerMeshes) for (const id in this.runnerMeshes) if (this.mode === 'runner:' + id) this.runnerMeshes[id].visible = false;
      this.renderer.render(this.scene, this.camera);
    }

    show(on) {
      this.canvas.style.display = on ? '' : 'none';
      if (on) this.resize();
    }
  }

  root.Field3D = Field3D;
})(typeof window !== 'undefined' ? window : globalThis);
