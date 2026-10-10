/*
 * Ballplayers for the 3D view: rounded, generic, slightly caricatured people, in the spirit of a mid-2000s
 * baseball game. Built from a few shared shapes (lathe-turned torsos and limbs, spheres, capsules) plus two small
 * canvas decals (a chest emblem and a number on the back). Nothing is downloaded, and the parts on each joint are
 * merged into one mesh per material, so a full field of players stays a few hundred draw calls: light enough for
 * an iPhone, an iPad or a headset.
 *
 * A figure is a tree of pivots (hips, knees, shoulders, elbows, torso, head) posed each frame from a few numbers.
 * The pose is worked out from the play itself (see Field3D.poseFor): how fast the player is moving, and what the
 * ball is doing to them.
 *
 * Local axes: +z is the way the player faces, +y is up, and +x is the player's LEFT side. Units are feet: a figure
 * at scale 1 is about 6 ft tall.
 */
(function (root) {
  'use strict';

  // Blue defense, red offense, a gray coach and a navy umpire.
  const KITS = {
    defense: { jersey: 0x2a66d9, trim: 0x10306e, pants: 0xf2f1ec, socks: 0x10306e, cap: 0x10306e, sleeve: 0x10306e, emblem: 'ball' },
    offense: { jersey: 0xd23a32, trim: 0x7a1712, pants: 0xdcdcd6, socks: 0x7a1712, cap: 0x7a1712, sleeve: 0x7a1712, helmet: true, emblem: 'diamond' },
    coach: { jersey: 0x6b7280, trim: 0x374151, pants: 0x9ca3af, socks: 0x374151, cap: 0x374151, sleeve: 0x374151 },
    ump: { jersey: 0x1d2a3d, trim: 0x0b0f16, pants: 0x8e939b, socks: 0x0b0f16, cap: 0x0b0f16, sleeve: 0x1d2a3d, shoes: 0x0b0f16 },
  };
  const SKIN = [0xf1c9a5, 0xd9a47a, 0xa8714a, 0x7a4b2c];
  const THIGH = 1.52, SHIN = 1.42, FOOT = 0.2;         // leg lengths, ft
  const UPPER = 1.02, LOWER = 0.92;                      // arm lengths, ft
  const TORSO = 1.62, NECK = 0.26;

  let shared = null;
  function kit(THREE) {
    if (shared) return shared;
    const mats = {};
    const mat = (hex, opts) => {
      const key = hex + (opts ? JSON.stringify(opts) : '');
      return mats[key] || (mats[key] = new THREE.MeshLambertMaterial(Object.assign({ color: hex }, opts || {})));
    };
    const V = (x, y) => new THREE.Vector2(x, y);
    // Turned shapes: a profile of [radius, height] spun around the vertical.
    const lathe = (pts, seg = 16, sz = 1) => { const g = new THREE.LatheGeometry(pts.map(([r, y]) => V(r, y)), seg); if (sz !== 1) g.scale(1, 1, sz); return g; };
    const shoe = new THREE.CapsuleGeometry(0.15, 0.52, 4, 10); shoe.rotateX(Math.PI / 2); shoe.scale(1, 0.72, 1);
    const glove = new THREE.SphereGeometry(0.4, 16, 12); glove.scale(1, 1.18, 0.5);
    const mitt = new THREE.SphereGeometry(0.46, 16, 12); mitt.scale(1.05, 1, 0.55);
    const head = new THREE.SphereGeometry(0.36, 20, 16); head.scale(0.92, 1.12, 1);
    const crown = new THREE.SphereGeometry(0.4, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2); crown.scale(0.95, 0.9, 1.02);
    const brim = new THREE.CylinderGeometry(0.31, 0.31, 0.04, 18, 1, false, -Math.PI / 2, Math.PI); brim.scale(1.05, 1, 1.3);
    const helmet = new THREE.SphereGeometry(0.43, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.6);
    // The chest protector: a padded shell over the front of the torso.
    const vest = new THREE.CylinderGeometry(0.66, 0.6, 1.2, 16, 1, true, -Math.PI * 0.42, Math.PI * 0.84); vest.scale(1, 1, 0.7);
    const guard = new THREE.CylinderGeometry(0.25, 0.2, 1.15, 12, 1, true, -Math.PI * 0.55, Math.PI * 1.1);
    shared = {
      mat, V,
      // Legs: a tapered thigh, a knee, a shin with a calf.
      thigh: lathe([[0.001, 0], [0.2, 0.02], [0.24, 0.35], [0.28, 1.2], [0.24, THIGH], [0.001, THIGH + 0.02]], 14),
      knee: new THREE.SphereGeometry(0.21, 12, 8),
      shin: lathe([[0.001, 0], [0.13, 0.02], [0.16, 0.35], [0.22, 0.95], [0.19, SHIN - 0.05], [0.001, SHIN]], 14),
      shoe,
      pelvis: lathe([[0.001, -0.32], [0.3, -0.28], [0.5, -0.08], [0.55, 0.12], [0.5, 0.3], [0.001, 0.3]], 18, 0.72),
      // The torso: a waist, a chest, a V to the shoulders.
      torso: lathe([[0.001, 0], [0.48, 0.02], [0.5, 0.35], [0.6, 0.85], [0.66, 1.2], [0.64, 1.42], [0.45, 1.58], [0.2, TORSO], [0.001, TORSO]], 20, 0.62),
      belt: new THREE.CylinderGeometry(0.5, 0.5, 0.12, 18).scale(1, 1, 0.72),
      shoulder: new THREE.SphereGeometry(0.21, 12, 10),
      upper: lathe([[0.001, 0], [0.16, 0.03], [0.17, 0.3], [0.14, UPPER - 0.05], [0.001, UPPER]], 12),
      sleeve: new THREE.CylinderGeometry(0.2, 0.19, 0.42, 12),
      lower: lathe([[0.001, 0], [0.09, 0.03], [0.13, 0.6], [0.12, LOWER - 0.04], [0.001, LOWER]], 12),
      hand: new THREE.SphereGeometry(0.12, 10, 8).scale(0.8, 1.2, 0.6),
      glove, mitt, pocket: new THREE.SphereGeometry(0.2, 12, 8),
      neck: new THREE.CylinderGeometry(0.15, 0.18, NECK + 0.1, 12),
      head, nose: new THREE.SphereGeometry(0.06, 8, 6).scale(0.9, 1, 1.3), ear: new THREE.SphereGeometry(0.08, 8, 6).scale(0.5, 1, 0.8),
      eye: new THREE.SphereGeometry(0.035, 8, 6),
      crown, brim, button: new THREE.SphereGeometry(0.045, 6, 4), helmet, flap: new THREE.SphereGeometry(0.19, 12, 8),
      // A face mask: a padded frame and a cage of bars.
      maskBar: new THREE.CylinderGeometry(0.02, 0.02, 0.62, 6), maskPost: new THREE.CylinderGeometry(0.022, 0.022, 0.7, 6),
      maskPad: new THREE.TorusGeometry(0.3, 0.05, 6, 16).scale(1, 1.2, 0.6),
      vest, guard, kneeCap: new THREE.SphereGeometry(0.24, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      bat: new THREE.CylinderGeometry(0.085, 0.038, 2.8, 14), knob: new THREE.CylinderGeometry(0.06, 0.06, 0.04, 12),
      ring: new THREE.RingGeometry(1.25, 1.7, 32),
      shadow: new THREE.CircleGeometry(1, 20),
      decal: new THREE.PlaneGeometry(1, 1),
      textures: {},
    };
    return shared;
  }

  // A small canvas decal, cached: the chest emblem for a team, or a number for the back.
  function decal(THREE, key, draw) {
    const S = kit(THREE);
    if (S.textures[key]) return S.textures[key];
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    draw(c.getContext('2d'));
    const tex = new THREE.CanvasTexture(c);
    const m = new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    S.textures[key] = m;
    return m;
  }
  function emblem(THREE, kind) {
    return decal(THREE, 'emblem-' + kind, (g) => {
      g.lineWidth = 9;
      if (kind === 'ball') {
        g.fillStyle = '#ffffff'; g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#10306e'; g.stroke();
        g.strokeStyle = '#d23a32'; g.lineWidth = 6;
        g.beginPath(); g.arc(18, 64, 34, -0.95, 0.95); g.stroke();
        g.beginPath(); g.arc(110, 64, 34, Math.PI - 0.95, Math.PI + 0.95); g.stroke();
      } else {
        g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(64, 10); g.lineTo(118, 64); g.lineTo(64, 118); g.lineTo(10, 64); g.closePath(); g.fill();
        g.fillStyle = '#7a1712'; g.beginPath(); g.moveTo(64, 30); g.lineTo(98, 64); g.lineTo(64, 98); g.lineTo(30, 64); g.closePath(); g.fill();
        g.fillStyle = '#ffffff';
        for (const [x, y] of [[64, 36], [92, 64], [64, 92], [36, 64]]) g.fillRect(x - 6, y - 6, 12, 12);
      }
    });
  }
  function number(THREE, n, color) {
    return decal(THREE, 'num-' + n + '-' + color, (g) => {
      g.font = '900 96px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 10; g.strokeStyle = color; g.strokeText(String(n), 64, 70);
      g.fillStyle = '#ffffff'; g.fillText(String(n), 64, 70);
    });
  }

  function joint(THREE, parent, x, y, z) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  }
  function part(parent, geo, mat, x, y, z) {
    const m = new root.THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  /*
   * Merge the meshes hanging directly off each joint into one mesh per material, keeping their placement. The
   * figure looks the same and moves the same, with a third of the draw calls. (Decals stay separate: they blend.)
   */
  function bake(THREE, node) {
    const groups = new Map();
    for (const c of node.children.slice()) {
      if (c.isMesh && !c.material.transparent && c.geometry.index) {
        if (!groups.has(c.material)) groups.set(c.material, []);
        groups.get(c.material).push(c);
      }
    }
    for (const [m, list] of groups) {
      if (list.length < 2) continue;
      let nv = 0, ni = 0;
      for (const c of list) { nv += c.geometry.attributes.position.count; ni += c.geometry.index.count; }
      const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), idx = new Uint32Array(ni);
      let vo = 0, io = 0;
      const v = new THREE.Vector3(), nm = new THREE.Matrix3();
      for (const c of list) {
        c.updateMatrix();
        nm.getNormalMatrix(c.matrix);
        const P = c.geometry.attributes.position, N = c.geometry.attributes.normal, I = c.geometry.index;
        for (let i = 0; i < P.count; i++) {
          v.fromBufferAttribute(P, i).applyMatrix4(c.matrix); pos.set([v.x, v.y, v.z], (vo + i) * 3);
          v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor.set([v.x, v.y, v.z], (vo + i) * 3);
        }
        for (let i = 0; i < I.count; i++) idx[io + i] = I.getX(i) + vo;
        vo += P.count; io += I.count;
        node.remove(c);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      node.add(new THREE.Mesh(g, m));
    }
    for (const c of node.children) if (!c.isMesh) bake(THREE, c);
  }

  // A catcher's or umpire's mask on a head: a padded frame, a cage, and a throat guard.
  function mask(THREE, head, S) {
    const metal = S.mat(0x2b2f36), pad = S.mat(0x151515);
    const m = joint(THREE, head, 0, -0.02, 0.36);
    part(m, S.maskPad, pad, 0, 0, 0);
    for (const y of [-0.2, -0.05, 0.1]) { const b = part(m, S.maskBar, metal, 0, y, 0.05); b.rotation.z = Math.PI / 2; }
    for (const x of [-0.12, 0.12]) part(m, S.maskPost, metal, x, -0.02, 0.06);
    const throat = part(m, S.maskBar, metal, 0, -0.42, 0.02); throat.rotation.z = Math.PI / 2; throat.scale.set(1, 0.4, 1);
  }

  /**
   * Build a player. team: 'defense' | 'offense' | 'coach' | 'ump'. opts: glove (left hand), mitt (a catcher's),
   * bat, skin (tone index), number (on the back), lefty (for the helmet's ear flap), catcher (the gear), umpire.
   */
  function makePlayer(THREE, team, opts = {}) {
    const S = kit(THREE);
    if (!UP) { UP = new THREE.Vector3(0, 1, 0); AIM = new THREE.Vector3(); }
    const K = KITS[team] || KITS.defense;
    const jersey = S.mat(K.jersey), trim = S.mat(K.trim), pants = S.mat(K.pants), socks = S.mat(K.socks), sleeve = S.mat(K.sleeve);
    const skin = S.mat(SKIN[(opts.skin || 0) % SKIN.length]), black = S.mat(K.shoes || 0x1b1b1d), leather = S.mat(0x8a5a2b);
    const gear = S.mat(team === 'ump' ? 0x1b1b1d : K.trim);

    const fig = new THREE.Group();
    const body = joint(THREE, fig, 0, THIGH + SHIN + FOOT, 0);    // the hips; raised or lowered to keep feet down
    const J = { fig, body };
    part(body, S.pelvis, pants, 0, 0, 0);
    for (const [side, x] of [['L', 0.28], ['R', -0.28]]) {
      const hip = joint(THREE, body, x, 0, 0);
      part(hip, S.thigh, pants, 0, -THIGH, 0);
      const knee = joint(THREE, hip, 0, -THIGH, 0);
      part(knee, S.knee, pants, 0, 0, 0);
      part(knee, S.shin, socks, 0, -SHIN, 0);
      part(knee, S.shoe, black, 0, -SHIN - 0.03, 0.17);
      if (opts.catcher) {
        const gd = part(knee, S.guard, gear, 0, -0.62, 0.02);
        gd.rotation.y = 0;
        part(knee, S.kneeCap, gear, 0, 0.02, 0.06).rotation.x = Math.PI / 2;
      }
      J['hip' + side] = hip; J['knee' + side] = knee;
    }
    const torso = joint(THREE, body, 0, 0.18, 0);
    part(torso, S.torso, jersey, 0, 0, 0);
    part(torso, S.belt, trim, 0, 0.02, 0);
    if (opts.catcher || opts.umpire) part(torso, S.vest, opts.umpire ? S.mat(0x1d2a3d) : gear, 0, 0.9, 0.02).scale.set(1, 1, opts.umpire ? 1.05 : 1);
    if (K.emblem && !opts.catcher) {
      const e = part(torso, S.decal, emblem(THREE, K.emblem), 0, 1.12, 0.43);
      e.scale.set(0.4, 0.4, 1);
    }
    if (opts.number !== undefined) {
      const n = part(torso, S.decal, number(THREE, opts.number, '#' + K.trim.toString(16).padStart(6, '0')), 0, 1.05, -0.43);
      n.rotation.y = Math.PI; n.scale.set(0.72, 0.72, 1);
    }
    J.torso = torso;
    const neck = joint(THREE, torso, 0, TORSO - 0.06, 0);
    part(neck, S.neck, skin, 0, NECK / 2, 0);
    const head = joint(THREE, neck, 0, NECK + 0.3, 0.02);
    part(head, S.head, skin, 0, 0, 0);
    part(head, S.nose, skin, 0, -0.02, 0.34);
    for (const x of [0.32, -0.32]) part(head, S.ear, skin, x, 0, -0.02);
    for (const x of [0.12, -0.12]) part(head, S.eye, S.mat(0x1b1b1d), x, 0.07, 0.31);
    if (K.helmet) {
      part(head, S.helmet, trim, 0, -0.03, -0.01);
      part(head, S.brim, trim, 0, 0.05, 0.26).scale.set(0.8, 1, 0.6);
      part(head, S.flap, trim, opts.lefty ? 0.34 : -0.34, -0.14, 0).scale.set(0.45, 1, 1);   // faces the pitcher
    } else if (opts.catcher) {
      // A hockey-style catcher's helmet with its mask.
      part(head, S.helmet, gear, 0, -0.05, -0.02).scale.set(1, 1.05, 1.08);
      mask(THREE, head, S);
    } else {
      const cmat = S.mat(K.cap);
      part(head, S.crown, cmat, 0, 0.07, -0.01);
      part(head, S.button, cmat, 0, 0.43, -0.01);
      part(head, S.brim, cmat, 0, 0.09, 0.27).rotation.x = 0.1;
      if (opts.umpire) mask(THREE, head, S);
    }
    J.head = head;
    for (const [side, x] of [['L', 0.7], ['R', -0.7]]) {
      const sh = joint(THREE, torso, x, TORSO - 0.24, 0);
      part(sh, S.shoulder, jersey, 0, 0, 0);
      part(sh, S.sleeve, jersey, 0, -0.18, 0);
      part(sh, S.upper, sleeve, 0, -UPPER, 0);
      const el = joint(THREE, sh, 0, -UPPER, 0);
      part(el, S.lower, sleeve, 0, -LOWER, 0);
      const hand = joint(THREE, el, 0, -LOWER, 0);
      if (side === 'L' && (opts.glove || opts.mitt)) {
        part(hand, opts.mitt ? S.mitt : S.glove, leather, 0, -0.2, 0.06);
        part(hand, S.pocket, S.mat(0x6b4220), 0, -0.18, 0.2).scale.set(1, 1.1, 0.35);
      } else part(hand, S.hand, skin, 0, -0.08, 0);
      J['sh' + side] = sh; J['el' + side] = el; J['hand' + side] = hand;
    }
    if (opts.bat) {
      // The hands, just in front of the back shoulder; the bat is aimed from there each frame (see apply).
      const bat = joint(THREE, torso, -0.3, 1.2, 0.55);
      part(bat, S.bat, S.mat(0xc8995a), 0, 1.3, 0);
      part(bat, S.knob, S.mat(0xa8793a), 0, -0.1, 0);
      J.bat = bat;
    }
    // A soft shadow on the ground, which keeps a figure from looking pasted onto the grass.
    const sh = new THREE.Mesh(S.shadow, S.mat(0x000000, { transparent: true, opacity: 0.22, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2; sh.position.y = 0.06; sh.scale.set(1.1, 0.8, 1);
    fig.add(sh);
    bake(THREE, fig);
    fig.userData.joints = J;
    return fig;
  }

  // A loose bat, for the batter to toss.
  function makeBat(THREE) {
    const S = kit(THREE);
    const g = new THREE.Group();
    part(g, S.bat, S.mat(0xc8995a), 0, 1.3, 0);
    part(g, S.knob, S.mat(0xa8793a), 0, -0.1, 0);
    return g;
  }

  // ------------------------------------------------------------------------------------------------ poses
  // A pose is a flat set of angles (radians); poses blend with lerpPose.
  //   hipL/hipR, kneeL/kneeR: legs forward (+) / knees bent (+). legSpread: feet apart (+).
  //   lean: torso forward (+); twist: torso turned to its left (+); side: torso tilted to its left (+).
  //   headYaw, headPitch (+ looks up). shL/shR: arm raised forward (+, π = straight up), shLz/shRz: arm out to the
  //   side (+), elL/elR: elbow bent (+). bat: 0 = held up behind the head, 1 = swung through.
  const ZERO = { hipL: 0, hipR: 0, kneeL: 0.05, kneeR: 0.05, legSpread: 0.07, lean: 0.03, twist: 0, side: 0, headYaw: 0, headPitch: 0,
    shL: 0.05, shR: 0.05, shLz: 0.12, shRz: 0.12, elL: 0.2, elR: 0.2, bat: 0 };
  const P = {
    stand: {},
    set: { hipL: 0.5, hipR: 0.5, kneeL: 0.8, kneeR: 0.8, legSpread: 0.3, lean: 0.5, shL: 0.6, shR: 0.55, elL: 0.45, elR: 0.45, headPitch: 0.4 },
    squat: { hipL: 1.6, hipR: 1.6, kneeL: 2.35, kneeR: 2.35, legSpread: 0.5, lean: 0.25, shL: 1.25, shR: 0.4, elL: 0.45, elR: 1.0, headPitch: 0.15 },
    umpire: { hipL: 1.0, hipR: 1.0, kneeL: 1.55, kneeR: 1.55, legSpread: 0.42, lean: 0.55, shL: 0.35, shR: 0.35, shLz: 0.1, shRz: 0.1, elL: 1.3, elR: 1.3, headPitch: 0.3 },
    grounder: { hipL: 1.05, hipR: 0.95, kneeL: 1.4, kneeR: 1.3, legSpread: 0.55, lean: 1.05, shL: 1.05, shR: 0.95, elL: 0.12, elR: 0.3, headPitch: 0.6 },
    chest: { hipL: 0.2, hipR: 0.15, kneeL: 0.3, kneeR: 0.25, legSpread: 0.22, lean: 0.12, shL: 1.5, shR: 1.2, elL: 0.35, elR: 0.9 },
    high: { lean: -0.12, shL: 2.85, shR: 2.5, elL: 0.2, elR: 0.35, headPitch: 0.75, kneeL: 0.15, kneeR: 0.15 },
    windup: { hipL: 0.4, kneeL: 0.35, twist: -0.8, side: -0.1, lean: -0.08, shL: 1.4, shR: -0.45, shRz: 1.35, elR: 1.65, shLz: 0.25 },
    release: { hipR: -0.4, hipL: 0.6, kneeL: 0.4, kneeR: 0.3, twist: 0.75, side: 0.1, lean: 0.55, shL: 0.45, shR: 1.95, shRz: 0.2, elR: 0.3 },
    lead: { hipL: 0.35, hipR: 0.35, kneeL: 0.6, kneeR: 0.6, legSpread: 0.45, lean: 0.4, shL: 0.35, shR: 0.35, shLz: 0.35, shRz: 0.35, elL: 0.5, elR: 0.5 },
    stance: { hipL: 0.25, hipR: 0.2, kneeL: 0.45, kneeR: 0.4, legSpread: 0.42, lean: 0.25, twist: -0.25, shL: 1.05, shR: 0.95, shLz: -0.55, shRz: 0.55, elL: 1.35, elR: 1.9, headYaw: 1.25, bat: 0 },
    swing: { hipL: 0.1, hipR: 0.3, kneeL: 0.2, kneeR: 0.55, legSpread: 0.5, lean: 0.25, twist: 1.35, shL: 1.45, shR: 1.4, shLz: -0.2, shRz: 0.3, elL: 0.3, elR: 0.5, headYaw: 0.2, bat: 1 },
  };
  const pose = (name) => Object.assign({}, ZERO, P[name]);
  // [yaw from facing, toward the left (+); elevation] of the bat along the swing, in the torso's frame.
  const BAT_PATH = [[-1.95, 1.05], [-1.2, 0.45], [-0.55, 0.08], [0.3, 0.2], [1.0, 0.65]];
  let UP = null, AIM = null;
  function lerpPose(a, b, w) {
    if (w <= 0) return a;
    if (w >= 1) return Object.assign({}, b);
    const out = {};
    for (const k in ZERO) out[k] = a[k] + (b[k] - a[k]) * w;
    return out;
  }

  /*
   * Moving on foot, from a walk to a sprint. ph is the stride phase (one full cycle is two steps); v is the speed
   * in ft/s. Faster means longer, higher-kneed strides, more arm swing and more lean; below a jog it's a walk,
   * with straighter legs and small arms.
   */
  function run(base, ph, v) {
    const amt = Math.min(1, v / 3);
    if (amt <= 0) return base;
    const k = Math.min(1, Math.max(0, (v - 5) / 17));            // 0 = walking, 1 = sprinting
    const s = Math.sin(ph), c = Math.cos(ph);
    const swing = 0.35 + 0.55 * k;                                // thigh swing
    const r = Object.assign({}, ZERO, {
      hipL: swing * s + 0.1 * k, hipR: -swing * s + 0.1 * k,
      // The trailing leg folds up behind; the leading knee stays softer.
      kneeL: 0.15 + (0.35 + 1.0 * k) * Math.max(0, -c) + 0.2 * Math.max(0, c),
      kneeR: 0.15 + (0.35 + 1.0 * k) * Math.max(0, c) + 0.2 * Math.max(0, -c),
      lean: 0.06 + 0.3 * k, twist: -0.12 * s * (0.4 + k),
      shL: -(0.25 + 0.6 * k) * s, shR: (0.25 + 0.6 * k) * s,
      elL: 0.35 + 1.15 * k, elR: 0.35 + 1.15 * k, legSpread: 0.06,
    });
    const out = lerpPose(base, r, amt);
    out.headYaw = base.headYaw; out.headPitch = base.headPitch;
    return out;
  }
  // How high the body rides in a stride: twice a cycle, more at a sprint.
  const bob = (ph, v) => v < 1 ? 0 : Math.abs(Math.sin(ph)) * (0.06 + 0.22 * Math.min(1, Math.max(0, (v - 5) / 17)));
  // Stride length (one full cycle, two steps) at speed v, in ft for a 6 ft player.
  const cycleLength = (v) => 3.2 + 0.46 * Math.min(v, 30);

  // Apply a pose to a figure, keeping the lower foot on the ground. `lift` raises the body (a stride's bounce).
  function apply(fig, p, lift = 0) {
    const J = fig.userData.joints;
    J.hipL.rotation.set(-p.hipL, 0, p.legSpread); J.hipR.rotation.set(-p.hipR, 0, -p.legSpread);
    J.kneeL.rotation.x = p.kneeL; J.kneeR.rotation.x = p.kneeR;
    J.torso.rotation.set(p.lean, p.twist, p.side || 0);
    J.head.rotation.set(-p.headPitch * 0.6, p.headYaw, 0);
    J.head.parent.rotation.x = -p.lean * 0.55;       // hold the head up when bent over
    J.shL.rotation.set(-p.shL, 0, p.shLz); J.shR.rotation.set(-p.shR, 0, -p.shRz);
    J.elL.rotation.x = -p.elL; J.elR.rotation.x = -p.elR;
    if (J.bat) {
      const k = BAT_PATH, f = Math.max(0, Math.min(1, p.bat)) * (k.length - 1), i = Math.min(k.length - 2, Math.floor(f)), u = f - i;
      const yaw = k[i][0] + (k[i + 1][0] - k[i][0]) * u, el = k[i][1] + (k[i + 1][1] - k[i][1]) * u;
      AIM.set(Math.sin(yaw) * Math.cos(el), Math.sin(el), Math.cos(yaw) * Math.cos(el));
      J.bat.quaternion.setFromUnitVectors(UP, AIM);
    }
    const leg = (h, k) => (THIGH * Math.cos(h) + SHIN * Math.cos(k - h)) * Math.cos(p.legSpread) + FOOT;
    J.body.position.y = Math.max(leg(p.hipL, p.kneeL), leg(p.hipR, p.kneeR)) + lift;
  }

  root.Figures3D = { makePlayer, makeBat, pose, lerpPose, run, bob, cycleLength, apply, kit, KITS };
})(typeof window !== 'undefined' ? window : globalThis);
