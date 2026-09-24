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
  const smooth = (f) => { f = Math.max(0, Math.min(1, f)); return f * f * (3 - 2 * f); };
  // An angle difference brought into -π..π.
  const wrap = (d) => { while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

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
      // Base paths: dirt the same width the whole way, 3 ft either side of each baseline (scaled for youth).
      const path = Math.max(2.2, 3 * geo.base / 90), pd = path * Math.SQRT2;
      if (geo.league.sport !== 'softball') {
        this.flat([{ x: 0, y: pd }, { x: s - pd, y: s }, { x: 0, y: 2 * s - pd }, { x: -(s - pd), y: s }], 0x3f8f3a, 0.06);
      }
      for (const sgn of [-1, 1]) {
        // The outside half of each path, in foul ground, from home to 1st and to 3rd.
        const o = { x: sgn * path / Math.SQRT2, y: -path / Math.SQRT2 };
        this.flat([{ x: 0, y: 0 }, { x: sgn * s, y: s }, { x: sgn * s + o.x, y: s + o.y }, { x: o.x, y: o.y }], 0xc68c52, 0.045);
      }
      const circ = (x, y, r, color, h) => {
        const g = new THREE.CircleGeometry(r, 32);
        const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color }));
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.copy(this.w(x, y, h));
        this.field.add(mesh);
        return mesh;
      };
      const q = geo.base / 90;                     // real sizes scale with the base distance
      circ(0, 0, Math.max(9, 13 * q), 0xc68c52, 0.07);
      for (const bse of ['first', 'second', 'third']) circ(geo.bases[bse].x, geo.bases[bse].y, 9 * q + 1, 0xc68c52, 0.07);
      this.moundTop = 0;
      if (geo.league.sport === 'softball') {
        const ring = new THREE.Mesh(new THREE.RingGeometry(7.8, 8.2, 48), new THREE.MeshBasicMaterial({ color: 0xffffff }));
        ring.rotation.x = -Math.PI / 2; ring.position.copy(this.w(0, geo.mound.y, 0.09)); this.field.add(ring);
      } else {
        // An 18 ft mound, 10 inches high, centered 18 inches in front of the rubber (scaled down for youth fields).
        const mh = 0.83 * q;
        const mound = new THREE.Mesh(new THREE.CylinderGeometry(2.5 * q, 9 * q, mh, 24), new THREE.MeshLambertMaterial({ color: 0xc68c52, flatShading: true }));
        mound.position.copy(this.w(0, geo.mound.y - 1.5 * q, mh / 2)); this.field.add(mound);
        this.moundTop = mh;
      }
      // Chalk: foul lines to the poles.
      const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      // Bases, the plate, the batter's and catcher's boxes and the rubber, at each level's real size.
      this.buildDiamond(geo);
      const chalk = (x0, y0, x1, y1) => {
        const len = Math.hypot(x1 - x0, y1 - y0);
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, len), lineMat);
        m.position.copy(this.w((x0 + x1) / 2, (y0 + y1) / 2, 0.1));
        m.lookAt(this.w(x1, y1, 0.1));
        this.field.add(m);
      };
      for (const sign of [-1, 1]) {
        const a = sign > 0 ? 0 : 90, r = geo.fenceDir(a), t = (a + 45) * Math.PI / 180;
        const end = { x: Math.cos(t) * r, y: Math.sin(t) * r };
        // Chalked from the front corner of the batter's box, not through it.
        const f0 = this.box.front;
        chalk(sign * f0, f0, end.x, end.y);
        // Foul pole.
        const ph = Math.max(40, (geo.wallDir ? geo.wallDir(a) : 10) + 30);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, ph, 8), new THREE.MeshLambertMaterial({ color: 0xffd400 }));
        pole.position.copy(this.w(end.x, end.y, ph / 2)); this.field.add(pole);
      }
      // The running lane: the second half of the way to 1st, 3 ft into foul ground.
      {
        const half = geo.base / 2, n = { x: 3 / Math.SQRT2, y: -3 / Math.SQRT2 }, u = 1 / Math.SQRT2;
        const a = { x: half * u + n.x, y: half * u + n.y }, b = { x: geo.base * u + n.x, y: geo.base * u + n.y };
        chalk(a.x, a.y, b.x, b.y);
        chalk(half * u, half * u, a.x, a.y);
      }
      // The wall: a dark green fence along the park's shape, with the distances on it.
      // Dark green padding; Wrigley's ivy is a leafier green.
      const wallMat = new THREE.MeshLambertMaterial({ color: geo.ivy ? 0x5a9a40 : 0x1f3b2a, side: THREE.DoubleSide });
      const wallH = (x, y) => geo.wallDir ? geo.wallDir(Math.atan2(y, x) * 180 / Math.PI - 45) : (geo.big ? 10 : 6);
      const pts = wall(0).slice(1);
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const H = wallH((a.x + b.x) / 2, (a.y + b.y) / 2);
        const seg = new THREE.Mesh(new THREE.BoxGeometry(len + 0.4, H, 0.8), wallMat);
        seg.position.copy(this.w((a.x + b.x) / 2, (a.y + b.y) / 2, H / 2));
        seg.rotation.y = Math.atan2(b.y - a.y, b.x - a.x);
        this.field.add(seg);
      }
      for (const a of [88, 45, 2]) {
        const r = geo.fenceDir(a) - 1.2, t = (a + 45) * Math.PI / 180;
        const lbl = this.textSprite(String(Math.round(geo.fenceDir(a === 88 ? 90 : a === 2 ? 0 : 45))), '#ffffff', 'rgba(0,0,0,0)', 64);
        lbl.position.copy(this.w(Math.cos(t) * r, Math.sin(t) * r, Math.min(8, wallH(Math.cos(t) * r, Math.sin(t) * r) * 0.55)));
        lbl.scale.set(12 * (geo.fence / 200), 6 * (geo.fence / 200), 1);
        this.field.add(lbl);
      }
      this.buildScoreboard(geo, wallH);
      // A coach on the rubber at 8U.
      if (geo.rules && geo.rules.pitcher === 'adult') {
        const F3 = root.Figures3D;
        const coach = F3.makePlayer(THREE, 'coach', {});
        F3.apply(coach, F3.pose('stand'));
        this.place(coach, { x: 0, y: geo.mound.y - 1 }, { x: 0, y: 0 });
        this.field.add(coach);
      }
      this.buildActors();
      this.render();
    }

    // A name tag that stays the same size on screen, near or far, like a player tag in a sports game.
    tag(text, fg, bg, height) {
      const sp = this.textSprite(text, fg, bg, 44);
      sp.material.sizeAttenuation = false;
      sp.scale.set(0.042 * sp.userData.aspect, 0.042, 1);
      sp.center.set(0.5, 0);          // hang from the bottom edge, so the tag sits above the head at any distance
      sp.position.y = height;
      return sp;
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

    // The diamond's hardware to scale: plate, bags, batter's and catcher's boxes, the rubber.
    buildDiamond(geo) {
      const THREE = this.THREE;
      const q = geo.base / 90;
      const soft = geo.league.sport === 'softball';
      const white = new THREE.MeshLambertMaterial({ color: 0xffffff });
      // Home plate: 17 inches across the front, a pentagon with its point toward the catcher.
      const hw = 17 / 24;
      this.flat([{ x: 0, y: 0 }, { x: hw, y: hw }, { x: hw, y: 2 * hw }, { x: -hw, y: 2 * hw }, { x: -hw, y: hw }], 0xffffff, 0.1, white);
      // Bags: 18 inches in the pros since 2023, 15 elsewhere, 3 inches high.
      const bag = geo.key === 'pro' ? 1.5 : 1.25;
      for (const bse of ['first', 'second', 'third']) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(bag, 0.25, bag), white);
        m.position.copy(this.w(geo.bases[bse].x, geo.bases[bse].y, 0.125)); m.rotation.y = Math.PI / 4; this.field.add(m);
      }
      // Chalk, 3 inches wide.
      const line = (x0, y0, x1, y1) => {
        const len = Math.hypot(x1 - x0, y1 - y0);
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.04, len + 0.25), white);
        m.position.copy(this.w((x0 + x1) / 2, (y0 + y1) / 2, 0.09));
        m.rotation.y = Math.atan2(x1 - x0, -(y1 - y0));
        this.field.add(m);
      };
      // Batter's boxes: 4 x 6 ft, 6 in off the plate, from 13U-14U up; 3 x 6 ft, 4 in off, on youth fields;
      // 3 x 7 ft in softball. The front line is 3 ft (softball 4 ft) in front of the middle of the plate.
      const bw = soft ? 3 : geo.big ? 4 : 3, gap = soft || geo.big ? 0.5 : 1 / 3, bl = soft ? 7 : 6;
      const front = hw + (soft ? 4 : 3), back = front - bl;
      for (const sgn of [-1, 1]) {
        const x0 = sgn * (hw + gap), x1 = sgn * (hw + gap + bw);
        line(x0, back, x0, front); line(x1, back, x1, front); line(x0, front, x1, front); line(x0, back, x1, back);
      }
      this.box = { inner: hw + gap, width: bw, mid: (front + back) / 2, front };
      // Catcher's box, behind: 43 in wide and 8 ft deep (youth 6 ft); softball 8 ft 5 in by 10 ft.
      const cw = soft ? 8.42 : 43 / 12, cd = soft ? 10 : geo.big ? 8 : 6;
      line(-cw / 2, back, -cw / 2, back - cd); line(cw / 2, back, cw / 2, back - cd); line(-cw / 2, back - cd, cw / 2, back - cd);
      // The rubber: 24 x 6 in (Little League 18 x 4), on top of the mound.
      const rw = !soft && !geo.big && geo.base <= 60 ? 1.5 : 2, rd = !soft && !geo.big && geo.base <= 60 ? 1 / 3 : 0.5;
      const top = soft ? 0 : 0.83 * q;
      const rub = new THREE.Mesh(new THREE.BoxGeometry(rw, 0.08, rd), white);
      rub.position.copy(this.w(0, geo.mound.y + rd / 2, top + 0.04)); this.field.add(rub);
    }

    // A scoreboard beyond the fence in right-center: the level, a line score, the count and the outs from the
    // play's situation, the inning, a pitch count, and which bases are taken.
    buildScoreboard(geo, wallH) {
      const THREE = this.THREE;
      const a = 28, t = (a + 45) * Math.PI / 180;
      const r = geo.fenceDir(a) + Math.max(14, geo.fence * 0.06);
      const P = { x: Math.cos(t) * r, y: Math.sin(t) * r };
      const W = Math.max(34, Math.min(88, geo.fence * 0.22)), H = W / 2;
      const lift = wallH(P.x, P.y) + 4 + H / 2;
      const c = document.createElement('canvas');
      c.width = 1024; c.height = 512;
      this.scoreCanvas = c;
      this.scoreTex = new THREE.CanvasTexture(c);
      const board = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: this.scoreTex }));
      board.position.copy(this.w(P.x, P.y, lift));
      board.rotation.y = Math.atan2(-P.x, P.y);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(W + 1.5, H + 1.5, 1), new THREE.MeshLambertMaterial({ color: 0x1b2a22 }));
      frame.position.copy(board.position); frame.rotation.copy(board.rotation);
      frame.translateZ(-0.6);
      this.field.add(frame, board);
      for (const sx of [-0.35, 0.35]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(1.2, lift, 1.2), new THREE.MeshLambertMaterial({ color: 0x3a4a40 }));
        post.position.copy(board.position); post.rotation.copy(board.rotation);
        post.translateX(sx * W); post.translateZ(-1.2);
        post.position.y = lift / 2;
        this.field.add(post);
      }
      this.score = this.score || { outs: 0, runners: {} };
      this.drawScore();
    }

    setScore(s) {
      this.score = Object.assign({}, this.score, s);
      this.drawScore();
    }

    // Big type and big lamps, so it reads from behind the plate: the count and outs on the left, the inning and
    // pitch count in the middle, the bases on the right, the level across the top and the score along the bottom.
    drawScore() {
      const c = this.scoreCanvas;
      if (!c) return;
      const g = c.getContext('2d');
      const S = this.score || { outs: 0, runners: {} };
      const dim = '#9fc0ad', lit = '#ffe36b', off = '#23382e';
      g.fillStyle = '#0f2a1d'; g.fillRect(0, 0, 1024, 512);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = lit; g.font = '900 50px system-ui, sans-serif';
      g.fillText(((this.geo && this.geo.league.label) || '').toUpperCase().slice(0, 34), 512, 46);
      g.fillStyle = '#2d4a3c'; g.fillRect(24, 84, 976, 4);
      const lamps = (label, n, max, on, y) => {
        g.textAlign = 'left'; g.fillStyle = dim; g.font = '900 56px system-ui, sans-serif'; g.fillText(label, 36, y);
        for (let i = 0; i < max; i++) {
          g.beginPath(); g.arc(270 + i * 76, y, 29, 0, Math.PI * 2);
          g.fillStyle = i < n ? on : off; g.fill();
        }
      };
      lamps('BALL', 0, 3, '#5fd36b', 150);
      lamps('STRIKE', 0, 2, '#ffd23f', 245);
      lamps('OUT', S.outs || 0, 2, '#ff5a4e', 340);
      g.textAlign = 'center';
      g.fillStyle = dim; g.font = '900 44px system-ui, sans-serif';
      g.fillText('INNING', 620, 132); g.fillText('PITCHES', 620, 290);
      g.fillStyle = lit; g.font = '900 96px ui-monospace, monospace';
      g.fillText('▲1', 620, 212); g.fillText('0', 620, 370);
      // Bases: a diamond with the occupied bases lit.
      const bx = 875, by = 250, d = 72;
      const base = (x, y, on, fill) => {
        g.save(); g.translate(x, y); g.rotate(Math.PI / 4);
        g.fillStyle = fill || (on ? lit : off); g.fillRect(-27, -27, 54, 54);
        g.restore();
      };
      const R = S.runners || {};
      base(bx + d, by, R.first); base(bx, by - d, R.second); base(bx - d, by, R.third);
      base(bx, by + d, false, '#f5f5f0');
      // The score.
      g.fillStyle = '#2d4a3c'; g.fillRect(24, 410, 976, 4);
      g.font = '900 60px system-ui, sans-serif';
      g.textAlign = 'left'; g.fillStyle = '#ff6b61'; g.fillText('RED  0', 60, 465);
      g.textAlign = 'right'; g.fillStyle = '#6fa0ff'; g.fillText('BLUE  0', 964, 465);
      if (this.scoreTex) this.scoreTex.needsUpdate = true;
    }

    // Players are sized to the level: about 6 ft from high school up, smaller for younger kids.
    figScale() {
      return ({ softball8: 0.66, softball10: 0.74, softball: 0.8, littleLeague: 0.8, intermediate: 0.86, softball14: 0.88,
        junior90: 0.9, softballHS: 0.93, softballCollege: 0.95, softballPro: 0.96, highSchool: 0.97, college: 1, pro: 1 })[this.geo.key] || 0.9;
    }

    newPlayer(team, opts) {
      const F3 = root.Figures3D;
      const g = F3.makePlayer(this.THREE, team, opts);
      g.scale.set(opts && opts.lefty ? -this.fs : this.fs, this.fs, this.fs);
      F3.apply(g, F3.pose('stand'));
      this.field.add(g);
      return g;
    }

    buildActors() {
      const THREE = this.THREE;
      this.actors = {};
      this.rings = {};
      const us = Math.max(1, Math.min(1.9, this.geo.fenceMax / 215));
      this.us = us;
      this.fs = this.figScale();
      const skins = { P: 0, C: 2, '1B': 1, '2B': 3, SS: 1, '3B': 0, LF: 2, CF: 3, RF: 0 };
      // Each fielder wears their scorebook number: 1 pitcher, 2 catcher... 9 right field.
      const nums = { P: 1, C: 2, '1B': 3, '2B': 4, '3B': 5, SS: 6, LF: 7, CF: 8, RF: 9 };
      for (const pos of POSITIONS) {
        const gear = pos === 'C' ? { mitt: true, catcher: true } : { glove: true };
        const g = this.newPlayer('defense', Object.assign(gear, { skin: skins[pos], number: nums[pos] }));
        const ring = new THREE.Mesh(root.Figures3D.kit(THREE).ring, new THREE.MeshBasicMaterial({ color: 0xcbd5e1, transparent: true, opacity: 0.9 }));
        ring.rotation.x = -Math.PI / 2; ring.position.y = 0.12;
        g.add(ring);
        // The tag rides on the head, so it stays just above it when the player crouches or bends.
        const lbl = this.tag(this.labels[pos] || pos, '#ffffff', 'rgba(15,40,90,.85)', 0.85);
        g.userData.joints.head.add(lbl);
        g.userData.label = lbl;
        this.actors[pos] = g;
        this.rings[pos] = ring;
      }
      const r = 0.24 * us;             // about twice a real ball; the trail does the rest
      this.ballR = r;
      this.ball = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x444444, flatShading: true }));
      this.ballShadow = new THREE.Mesh(new THREE.CircleGeometry(r * 1.2, 12), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 }));
      this.ballShadow.rotation.x = -Math.PI / 2;
      this.field.add(this.ball, this.ballShadow);
      // A trail of fading beads behind the ball, so its path through the air or along the ground is easy to follow.
      this.trail = [];
      for (let i = 0; i < 14; i++) {
        const f = 1 - i / 14;
        const m = new THREE.Mesh(new THREE.SphereGeometry(r * (0.35 + 0.6 * f), 8, 6),
          new THREE.MeshBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0.55 * f, depthWrite: false }));
        m.visible = false;
        this.trail.push(m);
        this.field.add(m);
      }
      this.runnerMeshes = {};
      this.batter = null;
      // The home-plate umpire, in the slot between the catcher and the batter.
      this.ump = this.newPlayer('ump', { skin: 3, umpire: true });
      this.looseBat = root.Figures3D.makeBat(THREE);
      this.looseBat.scale.setScalar(this.fs);
      this.looseBat.visible = false;
      this.field.add(this.looseBat);
    }

    placeUmp(standing) {
      const F3 = root.Figures3D;
      const c = this.plan ? sample(this.plan.timeline.tracks.C, 0) : (this.readyC || { x: 0, y: -3 });
      const side = this.side === 'L' || this.side === 'S' ? 1 : -1;
      this.place(this.ump, { x: side * 1.1, y: c.y - 2.6 * this.fs }, { x: side * 1.1, y: 60 });
      F3.apply(this.ump, F3.pose(standing ? 'stand' : 'umpire'));
    }

    setLabels(labels) {
      this.labels = {};
      for (const pos of POSITIONS) this.labels[pos] = (labels[pos] && labels[pos].inner) || pos;
      if (this.geo) { this.setGeometry(this.geo); if (this.plan) this.load(this.plan); }
    }

    clearRunners() {
      for (const id in this.runnerMeshes) this.field.remove(this.runnerMeshes[id]);
      this.runnerMeshes = {};
      if (this.batter) { this.field.remove(this.batter); this.batter = null; }
    }
    makeRunner(id, label, opts = {}) {
      const g = this.newPlayer('offense', Object.assign({ skin: id.length }, opts));
      const lbl = this.tag(label, '#ffffff', 'rgba(170,25,25,.9)', 0.85);
      lbl.scale.multiplyScalar(0.85);
      if (opts.lefty) lbl.scale.x *= -1;       // the mirrored figure would mirror its label too
      g.userData.joints.head.add(lbl);
      this.runnerMeshes[id] = g;
      return g;
    }

    // Where the batter stands: in the box on their side of the plate, facing it.
    boxSpot(side) {
      const b = this.box || { inner: 1.2, width: 4, mid: 0.7 };
      const x = b.inner + b.width * 0.42;
      return side === 'L' || side === 'S' ? { p: { x, y: b.mid - 0.3 }, face: { x: -10, y: b.mid - 0.3 } } : { p: { x: -x, y: b.mid - 0.3 }, face: { x: 10, y: b.mid - 0.3 } };
    }
    standBatter(g, side) {
      const F3 = root.Figures3D;
      const spot = this.boxSpot(side);
      this.place(g, spot.p, spot.face);
      F3.apply(g, F3.pose('stance'));
      if (g.userData.joints.bat) g.userData.joints.bat.visible = true;
    }

    showReady(ready, runners, batter, outs) {
      this.plan = null;
      if (!this.actors) return;
      for (const c of this.calls || []) c.sprite.visible = false;
      for (const m of this.trail || []) m.visible = false;
      if (this.looseBat) this.looseBat.visible = false;
      const F3 = root.Figures3D;
      for (const pos of POSITIONS) {
        const face = pos === 'C' ? { x: 0, y: 60 } : { x: 0, y: 0 };
        this.place(this.actors[pos], ready[pos], face);
        this.actors[pos].position.y = pos === 'P' ? this.moundTop || 0 : 0;
        F3.apply(this.actors[pos], F3.pose(pos === 'C' ? 'squat' : pos === 'P' ? 'stand' : 'set'));
        this.rings[pos].material.color.setHex(0xcbd5e1);
      }
      this.clearRunners();
      const b = this.geo.bases;
      for (const base of ['first', 'second', 'third']) {
        if (!runners || !runners[base]) continue;
        const g = this.makeRunner(base, 'R');
        this.place(g, b[base], this.geo.mound);
        F3.apply(g, F3.pose('stand'));
      }
      const side = batter || 'R';
      this.side = side;
      this.batter = this.newPlayer('offense', { bat: true, lefty: side !== 'R', skin: 1 });
      this.standBatter(this.batter, side);
      this.readyC = ready.C;
      this.placeUmp(false);
      this.setScore({ outs: outs || 0, runners: runners || {} });
      this.ball.position.copy(this.w(0, this.geo.mound.y - 1, 5 * this.fs + (this.moundTop || 0)));
      this.ballShadow.position.copy(this.w(0, this.geo.mound.y - 1, (this.moundTop || 0) + 0.05));
      this.render();
    }

    load(plan) {
      this.plan = plan;
      if (!this.actors) return;
      for (const pos of POSITIONS) this.rings[pos].material.color.setHex(ROLE_COLORS[plan.assignments[pos].role] || 0xcbd5e1);
      this.clearRunners();
      const side = (plan.situation && plan.situation.batter) || 'R';
      for (const r of plan.runners) {
        const isBatter = r.id === 'batter';
        this.makeRunner(r.id, r.label || (isBatter ? 'B' : 'R'), isBatter ? { bat: true, lefty: side !== 'R' } : {});
      }
      // A play without a batter-runner (a steal, a pickoff, a passed ball) still has someone at the plate.
      if (!plan.runners.some((r) => r.id === 'batter')) {
        this.batter = this.newPlayer('offense', { bat: true, lefty: side !== 'R', skin: 1 });
        this.standBatter(this.batter, side);
      }
      this.side = side;
      this.setScore({ outs: (plan.situation && plan.situation.outs) || 0, runners: (plan.situation && plan.situation.runners) || {} });
      this.actions = this.readActions(plan);
      // Each person's stride phase along their track: a cycle every stride length, which grows with speed, so the
      // feet keep pace with the ground instead of sliding over it.
      this.phase = {};
      const tr = plan.timeline.tracks, F3 = root.Figures3D;
      for (const key in tr) {
        if (key.startsWith('look') || key === 'ball') continue;
        const keys = tr[key], c = [0];
        for (let i = 1; i < keys.length; i++) {
          const d = Math.hypot(keys[i].x - keys[i - 1].x, keys[i].y - keys[i - 1].y), dt = keys[i].t - keys[i - 1].t || 1;
          c.push(c[i - 1] + 2 * Math.PI * d / (F3.cycleLength(d / dt / this.fs) * this.fs));
        }
        this.phase[key] = c;
      }
      this.throwEvents = plan.timeline.events.filter((e) => e.type === 'throw');
      this.readCalls(plan);
      this.seek(0);
    }

    /*
     * What the ball does to each fielder, read from the play: who has it when, so each gets a catch (grounder,
     * chest-high or overhead, by the ball's height when it arrives) and a throw when it leaves them. A fielder
     * "has" the ball when it stays within reach of them for a moment; a ball flying past doesn't count.
     */
    readActions(plan) {
      const tr = plan.timeline.tracks, T = plan.timeline.duration, hit = plan.timeline.hit;
      const throws = plan.timeline.events.filter((e) => e.type === 'throw');
      const dt = 0.04, reach = 4.5;
      const holders = [];
      for (let t = 0; t <= T; t += dt) {
        const b = sample(tr.ball, t);
        let best = null, bd = reach;
        if (b.h < 11) for (const pos of POSITIONS) {
          const p = sample(tr[pos], t);
          const d = Math.hypot(p.x - b.x, p.y - b.y);
          if (d < bd) { bd = d; best = pos; }
        }
        holders.push({ t, pos: best, h: b.h });
      }
      // Drop spells shorter than 0.16 s: that's a ball going by.
      for (let i = 0; i < holders.length;) {
        let j = i;
        while (j < holders.length && holders[j].pos === holders[i].pos) j++;
        if (holders[i].pos && j - i < 4 && i > 0) for (let k = i; k < j; k++) holders[k].pos = null;
        i = j;
      }
      const acts = {};
      for (const pos of POSITIONS) acts[pos] = [];
      let prev = holders.length ? holders[0].pos : null;
      for (let i = 1; i < holders.length; i++) {
        const cur = holders[i].pos;
        if (cur === prev) continue;
        const t = holders[i].t;
        if (prev) {
          const ev = throws.find((e) => Math.abs(e.t - t) < 0.45);
          acts[prev].push({ type: 'throw', t: ev ? ev.t : Math.max(0, t - 0.08) });
        }
        if (cur) {
          const h = holders[i].h;
          const air = hit && hit.caught && Math.abs(t - hit.t1) < 0.3;
          const style = air ? (hit.kind === 'line' ? 'chest' : 'high') : h <= 1.6 ? 'grounder' : h > 6.5 ? 'high' : 'chest';
          acts[cur].push({ type: 'catch', t, style });
        }
        prev = cur;
      }
      return acts;
    }

    // Stand a figure at a spot, facing toward `look`. Model +z faces forward; field y is world -z.
    place(g, p, look) {
      g.position.copy(this.w(p.x, p.y, 0));
      if (look && (look.x !== p.x || look.y !== p.y)) g.rotation.y = Math.atan2(look.x - p.x, -(look.y - p.y));
    }

    /*
     * A fielder's pose at time t: moving if they're moving, set if they're waiting, and whatever the ball asks of
     * them around a catch or a throw. Fielders take a small step in as the pitch arrives, and breathe while they wait.
     */
    poseFor(pos, t, speed, stride) {
      const F3 = root.Figures3D;
      const plan = this.plan;
      const contact = plan.timeline.contact || 0;
      let base;
      if (pos === 'C' && t < contact + 0.35 && speed < 1) base = F3.pose('squat');
      else if (pos === 'P' && t < 0.05) base = F3.pose('stand');
      else base = F3.lerpPose(F3.pose('stand'), F3.pose('set'), t < contact + 0.2 ? 1 : 0.55);
      base.lean += 0.025 * Math.sin(t * 1.7 + pos.length);
      let p = F3.run(base, stride, speed / this.fs);
      for (const a of this.actions[pos] || []) {
        if (a.type === 'catch') {
          const pre = a.style === 'high' ? 0.7 : 0.4;
          const w = t < a.t - pre || t > a.t + 0.5 ? 0 : t < a.t ? (t - (a.t - pre)) / pre : t < a.t + 0.15 ? 1 : 1 - (t - a.t - 0.15) / 0.35;
          if (w > 0) p = F3.lerpPose(p, F3.pose(a.style), smooth(w));
        } else {
          if (t > a.t - 0.45 && t < a.t) p = F3.lerpPose(p, F3.pose('windup'), smooth((t - (a.t - 0.45)) / 0.35));
          else if (t >= a.t && t < a.t + 0.5) {
            const f = (t - a.t) / 0.5;
            p = F3.lerpPose(p, F3.lerpPose(F3.pose('windup'), F3.pose('release'), smooth(Math.min(1, f * 3))), 1 - smooth(Math.max(0, f * 1.6 - 0.6)));
          }
        }
      }
      // The creep step: a little rise and settle, timed to land as the ball reaches the plate.
      if (!['P', 'C'].includes(pos) && contact > 0 && t > contact - 0.45 && t < contact + 0.05) {
        p = Object.assign({}, p, { _lift: 0.22 * this.fs * Math.sin(Math.PI * (t - (contact - 0.45)) / 0.5) });
      }
      return p;
    }

    // Stride phase along a track: distance over stride length, where a stride lengthens with speed.
    phaseAt(key, t) {
      const keys = this.plan.timeline.tracks[key], c = this.phase[key];
      if (!keys || !keys.length || !c) return 0;
      if (t <= keys[0].t) return 0;
      for (let i = 1; i < keys.length; i++) {
        if (t <= keys[i].t) {
          const f = (t - keys[i - 1].t) / ((keys[i].t - keys[i - 1].t) || 1);
          return c[i - 1] + (c[i] - c[i - 1]) * f;
        }
      }
      return c[c.length - 1];
    }

    /*
     * Move and pose a person along a track at time t. Speed and heading are read over a short window either side,
     * so starts, stops and turns ease in instead of snapping. A runner faces the way they're going and turns their
     * head to the ball; someone standing faces what they're watching. Returns the pose used by the cameras.
     */
    move(g, key, t, lookKey, poseFn) {
      const F3 = root.Figures3D;
      const tr = this.plan.timeline.tracks;
      const p = sample(tr[key], t);
      const W = 0.14, a = sample(tr[key], Math.max(0, t - W)), b = sample(tr[key], t + W);
      const span = Math.min(t, W) + W;
      const vx = (b.x - a.x) / span, vy = (b.y - a.y) / span;
      const speed = Math.hypot(vx, vy);
      const l = tr[lookKey] ? sample(tr[lookKey], t) : { x: 0, y: 0 };
      const yawTo = (dx, dy) => Math.atan2(dx, -dy);
      const lookYaw = l.x === p.x && l.y === p.y ? g.rotation.y : yawTo(l.x - p.x, l.y - p.y);
      const runYaw = speed > 0.5 ? yawTo(vx, vy) : lookYaw;
      const k = smooth((speed - 2) / 6);
      const body = lookYaw + wrap(runYaw - lookYaw) * k;
      g.position.copy(this.w(p.x, p.y, 0));
      g.rotation.y = body;
      const stride = this.phaseAt(key, t);
      const pose = poseFn(speed, stride);
      pose.headYaw = Math.max(-1.3, Math.min(1.3, wrap(lookYaw - body) + (pose.headYaw || 0) * (1 - k)));
      F3.apply(g, pose, F3.bob(stride, speed / this.fs) * this.fs + (pose._lift || 0));
      return { p, l };
    }

    // Where the ball is at time t: the engine's track, with the batted ball and each throw on smooth curves.
    ballPos(t) {
      const plan = this.plan, tr = plan.timeline.tracks;
      const bp = sample(tr.ball, t);
      let h = bp.h * this.fs;
      const hit = plan.timeline.hit;
      if (hit && t >= hit.t0 && t <= hit.t1) {
        const f = (t - hit.t0) / ((hit.t1 - hit.t0) || 1);
        if (hit.kind === 'fly' || hit.kind === 'pop' || hit.kind === 'line') {
          h = 3 * this.fs * (1 - f) + 4 * hit.peak * f * (1 - f) + (hit.caught ? 4 * this.fs * f : 0);
        } else {
          // Hops that die out: higher and longer at first, skipping along by the end.
          const n = Math.max(2, Math.round(Math.hypot(hit.to.x, hit.to.y) / 35));
          const A = hit.kind === 'bunt' ? 0.9 : 3.4 * this.fs;
          const g = Math.pow(f, 0.8) * n;
          h = Math.max(A * Math.pow(1 - f, 1.4) * Math.abs(Math.sin(Math.PI * g)), 3 * this.fs * (1 - 2 * g));
        }
      } else {
        const th = this.throwEvents.find((e) => t >= e.t && t <= e.tEnd);
        if (th) {
          const f = (t - th.t) / ((th.tEnd - th.t) || 1);
          const d = Math.hypot(th.to.x - th.from.x, th.to.y - th.from.y);
          h = 4 * this.fs + (d / 18) * 4 * f * (1 - f);
        }
      }
      if (t < 0.05 && this.moundTop) h += this.moundTop;
      return { x: bp.x, y: bp.y, h: Math.max(this.ballR, h) };
    }

    seek(t) {
      this.t = t;
      const plan = this.plan;
      if (!plan || !this.actors) { this.render(); return; }
      const F3 = root.Figures3D;
      const tr = plan.timeline.tracks;
      const contact = plan.timeline.contact || 0;
      this.pose = {};
      for (const pos of POSITIONS) {
        const g = this.actors[pos];
        this.pose['player:' + pos] = this.move(g, pos, t, 'look:' + pos, (speed, stride) => this.poseFor(pos, t, speed, stride));
        // On the mound, stand on it.
        const onMound = this.moundTop && Math.hypot(g.position.x, -g.position.z - this.geo.mound.y) < 6 * (this.geo.base / 90);
        g.position.y = onMound ? this.moundTop : 0;
      }
      this.looseBat.visible = false;
      for (const r of plan.runners) {
        const g = this.runnerMeshes[r.id];
        const key = 'runner:' + r.id;
        if (!tr[key] || !g) continue;
        if (r.id === 'batter') {
          const drop = contact + 0.28;
          if (t < drop) {
            // In the box through the swing.
            this.standBatter(g, this.side);
            const f = (t - (contact - 0.12)) / 0.3;
            if (f > 0) F3.apply(g, F3.lerpPose(F3.pose('stance'), F3.pose('swing'), smooth(Math.min(1, f))));
            this.pose[key] = { p: this.boxSpot(this.side).p, l: { x: 0, y: 60 } };
            continue;
          }
          // The bat's tossed aside, end over end, and lies where it lands.
          g.userData.joints.bat.visible = false;
          this.tossBat(t - drop);
        }
        this.pose[key] = this.move(g, key, t, 'look:' + key, (speed, stride) => {
          const q = sample(tr[key], t);
          const offBag = !['first', 'second', 'third', 'home'].some((bse) => {
            const b = this.geo.bases[bse] || { x: 0, y: 0 };
            return Math.hypot(q.x - b.x, q.y - b.y) < 2.5;
          });
          return F3.run(F3.pose(offBag ? 'lead' : 'stand'), stride, speed / this.fs);
        });
        const p = sample(tr[key], t);
        g.visible = p.o === undefined || p.o > 0.4;
      }
      if (this.batter) this.standBatter(this.batter, this.side);
      this.placeUmp(t > contact + 0.4);
      // The ball, its shadow, and a fading trail of where it's just been.
      const bp = this.ballPos(t);
      this.ball.position.copy(this.w(bp.x, bp.y, bp.h));
      this.ballShadow.position.copy(this.w(bp.x, bp.y, 0.1));
      this.ballShadow.material.opacity = Math.max(0.08, 0.35 - bp.h / 200);
      let prev = bp;
      this.trail.forEach((m, i) => {
        const tt = t - (i + 1) * 0.024;
        const q = tt >= 0 ? this.ballPos(tt) : null;
        const moved = q && Math.hypot(q.x - prev.x, q.y - prev.y, q.h - prev.h) > this.ballR * 0.3;
        m.visible = !!moved;
        if (moved) { m.position.copy(this.w(q.x, q.y, q.h)); prev = q; }
      });
      this.ballAt = bp;
      this.showCalls(t);
      this.render();
    }

    // The batter's bat after the swing: out of the hands, a flip or two through the air, then lying in the dirt.
    tossBat(dt) {
      const spot = this.boxSpot(this.side).p, away = this.side === 'L' || this.side === 'S' ? 1 : -1;
      const from = { x: spot.x, y: spot.y + 0.5, h: 3.4 * this.fs }, to = { x: spot.x + away * 4, y: spot.y - 3, h: 0.1 };
      const T = 0.55, f = Math.min(1, dt / T);
      const b = this.looseBat;
      b.visible = true;
      b.position.copy(this.w(from.x + (to.x - from.x) * f, from.y + (to.y - from.y) * f, from.h + (to.h - from.h) * f + 3 * f * (1 - f)));
      if (f < 1) b.rotation.set(dt * 11, away * 0.6, 0.4);
      else b.rotation.set(Math.PI / 2, away * 0.9, 0);
    }

    // OUT and SAFE over the runner, the moment the play decides it.
    readCalls(plan) {
      for (const c of this.calls || []) this.field.remove(c.sprite);
      this.calls = [];
      const tr = plan.timeline.tracks;
      const nearest = (at, t) => {
        let best = null, bd = 25;
        for (const r of plan.runners) {
          const k = tr['runner:' + r.id];
          if (!k) continue;
          const q = sample(k, t), d = Math.hypot(q.x - at.x, q.y - at.y);
          if (d < bd) { bd = d; best = r.id; }
        }
        return best;
      };
      for (const e of plan.timeline.events) {
        let text = null, runner = null;
        if (e.type === 'out' || e.type === 'safe') {
          runner = nearest(e.at, e.t);
          text = e.type === 'safe' ? 'SAFE!' : /doubled/i.test(e.text) ? 'DOUBLED OFF!' : 'OUT!';
        } else if (e.type === 'catch' && plan.runners.some((r) => r.id === 'batter')) {
          runner = 'batter'; text = 'OUT!';
        }
        if (!text) continue;
        const sp = this.textSprite(text, '#ffffff', e.type === 'safe' ? 'rgba(22,150,70,.95)' : 'rgba(210,35,50,.95)', 56);
        sp.material.sizeAttenuation = false;
        sp.center.set(0.5, 0);
        sp.userData.base = [0.07 * sp.userData.aspect, 0.07];
        sp.visible = false;
        this.field.add(sp);
        this.calls.push({ t: e.t, runner, at: e.at, sprite: sp });
      }
    }
    showCalls(t) {
      for (const c of this.calls || []) {
        const on = t >= c.t && t < c.t + 1.8;
        c.sprite.visible = on;
        if (!on) continue;
        const pose = c.runner && this.pose['runner:' + c.runner];
        const at = pose ? pose.p : c.at;
        c.sprite.position.copy(this.w(at.x, at.y, 8.6 * this.fs));
        const pop = 1 + 0.4 * Math.max(0, 1 - (t - c.t) / 0.18);
        c.sprite.scale.set(c.sprite.userData.base[0] * pop, c.sprite.userData.base[1] * pop, 1);
      }
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
      // A camera placed by a script (screenshots, marketing stills): field feet, { from: {x,y,h}, to: {x,y,h} }.
      if (this.fixedCam) {
        const c = this.fixedCam;
        this.camera.up.set(0, 1, 0);
        this.camera.position.copy(this.w(c.from.x, c.from.y, c.from.h));
        this.camera.lookAt(this.w(c.to.x, c.to.y, c.to.h));
        this.camera.fov = c.fov || 40;
        this.camera.updateProjectionMatrix();
        return;
      }
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
        pos = this.w(p.x - ux * 0.5, p.y - uy * 0.5, 5.4 * (this.fs || 1));
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

    // ---------------------------------------------------------------------------------------- VR (WebXR)
    // In a headset the world is life-size (feet → meters) and you stand in it: behind home plate, or riding along
    // with the player the camera picker names. Your head does the looking. The trigger plays the play.
    static async vrSupported() {
      try { return !!(navigator.xr && await navigator.xr.isSessionSupported('immersive-vr')); } catch (e) { return false; }
    }
    async enterVR(onFrame, onSelect) {
      const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] });
      const r = this.renderer;
      r.xr.enabled = true;
      r.xr.setReferenceSpaceType('local-floor');
      await r.xr.setSession(session);
      this.inVR = true;
      this.world = this.world || new this.THREE.Group();
      if (this.field.parent !== this.world) { this.scene.remove(this.field); this.world.add(this.field); this.scene.add(this.world); }
      this.world.scale.setScalar(0.3048);
      session.addEventListener('select', () => onSelect && onSelect());
      session.addEventListener('end', () => {
        this.inVR = false;
        r.setAnimationLoop(null);
        r.xr.enabled = false;
        this.world.scale.setScalar(1);
        this.world.position.set(0, 0, 0);
        this.resize();
      });
      let last = null;
      r.setAnimationLoop((time) => {
        const dt = last === null ? 0 : Math.min(0.1, (time - last) / 1000);
        last = time;
        if (onFrame) onFrame(dt);
        this.placeVR();
        r.render(this.scene, this.camera);
      });
    }
    // Put the viewer where the mode says: the world moves so that spot is at your feet.
    placeVR() {
      if (!this.world || !this.geo) return;
      let spot = { x: 0, y: -14 };                       // behind home plate, like an umpire
      if (this.mode === 'overhead') spot = { x: 0, y: this.geo.fence * 0.2 };
      const pose = this.pose && this.pose[this.mode];
      if (pose) spot = pose.p;
      const s = 0.3048;
      this.world.position.set(-spot.x * s, 0, spot.y * s);
      // Hide the figure you're riding with, so you're not inside it.
      for (const pos of POSITIONS) if (this.actors && this.actors[pos]) this.actors[pos].visible = this.mode !== 'player:' + pos;
    }

    render() {
      if (this.inVR) return;   // the headset's loop renders
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
