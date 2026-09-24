/*
 * Ballplayers for the 3D view: rounded, smooth-shaded figures in the spirit of an early-2000s baseball game, built
 * from a few shared shapes (capsules, spheres, cylinders) plus two small canvas decals: a chest emblem and a number
 * on the back. Nothing is downloaded, so the view stays light and all the work happens on the viewer's device.
 *
 * A figure is a tree of pivots (hips, knees, shoulders, elbows, torso, head) posed each frame from a few numbers.
 * The pose is worked out from the play itself: how fast the player is moving, and what the ball is doing to them
 * (fielding a grounder low, a liner at the chest, a fly overhead, throwing). See Field3D.poseFor.
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
    ump: { jersey: 0x1c2533, trim: 0x0b0f16, pants: 0x8e939b, socks: 0x0b0f16, cap: 0x0b0f16, sleeve: 0x1c2533 },
  };
  const SKIN = [0xf1c9a5, 0xd9a47a, 0xa8714a, 0x7a4b2c];
  const THIGH = 1.5, SHIN = 1.4, FOOT = 0.2;           // leg lengths, ft
  const UPPER = 1.05, LOWER = 0.95;                      // arm lengths, ft

  let shared = null;
  function kit(THREE) {
    if (shared) return shared;
    const mats = {};
    const mat = (hex) => mats[hex] || (mats[hex] = new THREE.MeshLambertMaterial({ color: hex }));
    const cap = (r, len, rad = 12) => new THREE.CapsuleGeometry(r, Math.max(0.01, len - 2 * r), 4, rad);
    const shoe = new THREE.CapsuleGeometry(0.16, 0.5, 4, 10); shoe.rotateX(Math.PI / 2); shoe.scale(1, 0.75, 1);
    const glove = new THREE.SphereGeometry(0.3, 14, 10); glove.scale(1, 1.2, 0.5);
    const torso = new THREE.CylinderGeometry(0.64, 0.54, 1.55, 18); torso.scale(1, 1, 0.64);
    const chest = new THREE.SphereGeometry(0.64, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2); chest.scale(1, 0.42, 0.64);
    const pelvis = new THREE.SphereGeometry(0.58, 16, 10); pelvis.scale(1, 0.55, 0.7);
    const head = new THREE.SphereGeometry(0.4, 18, 14); head.scale(1, 1.12, 1);
    const crown = new THREE.SphereGeometry(0.44, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2); crown.scale(1, 0.95, 1.02);
    const brim = new THREE.CylinderGeometry(0.34, 0.34, 0.045, 18, 1, false, -Math.PI / 2, Math.PI); brim.scale(1.05, 1, 1.25);
    const helmet = new THREE.SphereGeometry(0.47, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.58);
    shared = {
      mat,
      thigh: cap(0.27, THIGH), knee: new THREE.SphereGeometry(0.25, 12, 8), shin: cap(0.21, SHIN), shoe,
      pelvis, torso, chest, belt: new THREE.CylinderGeometry(0.56, 0.56, 0.13, 18),
      upper: cap(0.17, UPPER), sleeve: new THREE.CylinderGeometry(0.21, 0.19, 0.5, 12), lower: cap(0.14, LOWER),
      hand: new THREE.SphereGeometry(0.13, 10, 8), glove, pocket: new THREE.SphereGeometry(0.16, 10, 8),
      head, eye: new THREE.SphereGeometry(0.045, 6, 4), neck: new THREE.CylinderGeometry(0.17, 0.2, 0.3, 12),
      crown, brim, button: new THREE.SphereGeometry(0.05, 6, 4), helmet, flap: new THREE.SphereGeometry(0.2, 10, 8),
      bat: new THREE.CylinderGeometry(0.085, 0.038, 2.8, 12), knob: new THREE.CylinderGeometry(0.06, 0.06, 0.04, 10),
      ring: new THREE.RingGeometry(1.25, 1.7, 32),
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
    const m = new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false });
    S.textures[key] = m;
    return m;
  }
  function emblem(THREE, kind) {
    return decal(THREE, 'emblem-' + kind, (g) => {
      g.lineWidth = 9;
      if (kind === 'ball') {
        // A baseball: white, with red stitching, ringed in the team color.
        g.fillStyle = '#ffffff'; g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#10306e'; g.stroke();
        g.strokeStyle = '#d23a32'; g.lineWidth = 6;
        g.beginPath(); g.arc(18, 64, 34, -0.95, 0.95); g.stroke();
        g.beginPath(); g.arc(110, 64, 34, Math.PI - 0.95, Math.PI + 0.95); g.stroke();
      } else {
        // A diamond with a white base at each corner.
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

  // A pivot group at (x, y, z) with meshes hung from it.
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

  /**
   * Build a player. team: 'defense' | 'offense' | 'coach' | 'ump'. opts.glove puts a glove on the left hand;
   * opts.bat gives them a bat; opts.skin picks a skin tone; opts.number goes on the back.
   */
  function makePlayer(THREE, team, opts = {}) {
    const S = kit(THREE);
    if (!UP) { UP = new THREE.Vector3(0, 1, 0); AIM = new THREE.Vector3(); }
    const K = KITS[team] || KITS.defense;
    const jersey = S.mat(K.jersey), trim = S.mat(K.trim), pants = S.mat(K.pants), socks = S.mat(K.socks), sleeve = S.mat(K.sleeve);
    const skin = S.mat(SKIN[(opts.skin || 0) % SKIN.length]), black = S.mat(0x1b1b1d), leather = S.mat(0x8a5a2b);

    const fig = new THREE.Group();
    const body = joint(THREE, fig, 0, THIGH + SHIN + FOOT, 0);    // the hips; raised or lowered to keep feet down
    const J = { fig, body };
    part(body, S.pelvis, pants, 0, 0.05, 0);
    for (const [side, x] of [['L', 0.3], ['R', -0.3]]) {
      const hip = joint(THREE, body, x, 0, 0);
      part(hip, S.thigh, pants, 0, -THIGH / 2, 0);
      const knee = joint(THREE, hip, 0, -THIGH, 0);
      part(knee, S.knee, pants, 0, 0, 0);
      part(knee, S.shin, socks, 0, -SHIN / 2, 0);
      part(knee, S.shoe, black, 0, -SHIN - 0.02, 0.17);
      J['hip' + side] = hip; J['knee' + side] = knee;
    }
    const torso = joint(THREE, body, 0, 0, 0);
    part(torso, S.torso, jersey, 0, 0.2 + 1.55 / 2, 0);
    part(torso, S.chest, jersey, 0, 0.2 + 1.55, 0);
    part(torso, S.belt, trim, 0, 0.2, 0);
    if (K.emblem) {
      const e = part(torso, S.decal, emblem(THREE, K.emblem), 0, 1.4, 0.415);
      e.scale.set(0.42, 0.42, 1);
    }
    if (opts.number !== undefined) {
      const n = part(torso, S.decal, number(THREE, opts.number, '#' + K.trim.toString(16).padStart(6, '0')), 0, 1.25, -0.415);
      n.rotation.y = Math.PI; n.scale.set(0.8, 0.8, 1);
    }
    J.torso = torso;
    const neck = joint(THREE, torso, 0, 2.02, 0);
    part(neck, S.neck, skin, 0, 0.12, 0);
    const head = joint(THREE, neck, 0, 0.52, 0);
    part(head, S.head, skin, 0, 0, 0);
    for (const x of [0.14, -0.14]) part(head, S.eye, black, x, 0.06, 0.37);
    if (K.helmet) {
      part(head, S.helmet, trim, 0, -0.02, 0);
      part(head, S.brim, trim, 0, 0.06, 0.3).scale.set(0.8, 1, 0.7);
      part(head, S.flap, trim, opts.lefty ? 0.38 : -0.38, -0.16, 0).scale.set(0.45, 1, 1);   // faces the pitcher
    } else {
      // A cap that sits on the head: a dome over the top, a button, and a brim curving out in front.
      const cmat = S.mat(K.cap);
      part(head, S.crown, cmat, 0, 0.08, 0);
      part(head, S.button, cmat, 0, 0.5, 0);
      const b = part(head, S.brim, cmat, 0, 0.1, 0.3);
      b.rotation.x = 0.12;
    }
    J.head = head;
    for (const [side, x] of [['L', 0.76], ['R', -0.76]]) {
      const sh = joint(THREE, torso, x, 1.72, 0);
      part(sh, S.sleeve, jersey, 0, -0.18, 0);
      part(sh, S.upper, sleeve, 0, -UPPER / 2, 0);
      const el = joint(THREE, sh, 0, -UPPER, 0);
      part(el, S.lower, sleeve, 0, -LOWER / 2, 0);
      const hand = joint(THREE, el, 0, -LOWER, 0);
      if (side === 'L' && opts.glove) {
        part(hand, S.glove, leather, 0, -0.16, 0.06);
        part(hand, S.pocket, S.mat(0x6b4220), 0, -0.14, 0.17).scale.set(1, 1.1, 0.35);
      } else part(hand, S.hand, skin, 0, -0.06, 0);
      J['sh' + side] = sh; J['el' + side] = el; J['hand' + side] = hand;
    }
    if (opts.bat) {
      // The hands, just in front of the back shoulder; the bat is aimed from there each frame (see apply).
      const bat = joint(THREE, torso, -0.3, 1.45, 0.55);
      part(bat, S.bat, S.mat(0xc8995a), 0, 1.3, 0);
      part(bat, S.knob, S.mat(0xa8793a), 0, -0.1, 0);
      J.bat = bat;
    }
    fig.userData.joints = J;
    return fig;
  }

  // ------------------------------------------------------------------------------------------------ poses
  // A pose is a flat set of angles (radians) and a few extras; they blend with lerpPose.
  //   hipL/hipR, kneeL/kneeR: legs forward (+) / knees bent (+). legSpread: feet apart (+).
  //   lean: torso forward (+); twist: torso turned to its left (+); headYaw, headPitch (+ looks up).
  //   shL/shR: arm raised forward (+, π = straight up), shLz/shRz: arm out to the side (+), elL/elR: elbow bent (+).
  //   bat: 0 = held up behind the head, 1 = swung through.
  const ZERO = { hipL: 0, hipR: 0, kneeL: 0, kneeR: 0, legSpread: 0.08, lean: 0, twist: 0, headYaw: 0, headPitch: 0,
    shL: 0, shR: 0, shLz: 0.1, shRz: 0.1, elL: 0.15, elR: 0.15, bat: 0 };
  const P = {
    stand: {},
    set: { hipL: 0.45, hipR: 0.45, kneeL: 0.75, kneeR: 0.75, legSpread: 0.28, lean: 0.45, shL: 0.55, shR: 0.55, elL: 0.35, elR: 0.35, headPitch: 0.35 },
    squat: { hipL: 1.55, hipR: 1.55, kneeL: 2.3, kneeR: 2.3, legSpread: 0.45, lean: 0.2, shL: 1.25, shR: 0.35, elL: 0.35, elR: 0.9, headPitch: 0.1 },
    umpire: { hipL: 1.0, hipR: 1.0, kneeL: 1.5, kneeR: 1.5, legSpread: 0.4, lean: 0.55, shL: 0.35, shR: 0.35, shLz: 0.1, shRz: 0.1, elL: 1.2, elR: 1.2, headPitch: 0.3 },
    grounder: { hipL: 1.0, hipR: 1.0, kneeL: 1.35, kneeR: 1.35, legSpread: 0.5, lean: 1.05, shL: 1.05, shR: 0.95, elL: 0.1, elR: 0.25, headPitch: 0.6 },
    chest: { hipL: 0.15, hipR: 0.15, kneeL: 0.25, kneeR: 0.25, legSpread: 0.22, lean: 0.12, shL: 1.5, shR: 1.2, elL: 0.35, elR: 0.9 },
    high: { lean: -0.12, shL: 2.85, shR: 2.5, elL: 0.2, elR: 0.35, headPitch: 0.75 },
    windup: { hipL: 0.35, kneeL: 0.3, twist: -0.75, lean: -0.1, shL: 1.4, shR: -0.4, shRz: 1.35, elR: 1.6, shLz: 0.2 },
    release: { hipR: -0.35, hipL: 0.55, kneeL: 0.35, twist: 0.7, lean: 0.55, shL: 0.5, shR: 1.9, shRz: 0.2, elR: 0.3 },
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
  // A running stride at phase ph (radians), blended in by amount 0..1.
  function run(base, ph, amt) {
    if (amt <= 0) return base;
    const s = Math.sin(ph), c = Math.cos(ph);
    const r = Object.assign({}, ZERO, {
      hipL: 0.75 * s, hipR: -0.75 * s,
      kneeL: 0.35 + 0.75 * Math.max(0, -c), kneeR: 0.35 + 0.75 * Math.max(0, c),
      lean: 0.25, shL: -0.7 * s, shR: 0.7 * s, elL: 1.45, elR: 1.45, legSpread: 0.1,
    });
    const out = lerpPose(base, r, amt);
    // Keep the head where the base pose had it.
    out.headYaw = base.headYaw; out.headPitch = base.headPitch;
    return out;
  }

  // Apply a pose to a figure, keeping the lower foot on the ground. `bob` lifts the body in a stride.
  function apply(fig, p, bob = 0) {
    const J = fig.userData.joints;
    J.hipL.rotation.set(-p.hipL, 0, p.legSpread); J.hipR.rotation.set(-p.hipR, 0, -p.legSpread);
    J.kneeL.rotation.x = p.kneeL; J.kneeR.rotation.x = p.kneeR;
    J.torso.rotation.set(p.lean, p.twist, 0);
    J.head.rotation.set(-p.headPitch * 0.6, p.headYaw, 0);
    J.head.parent.rotation.x = -p.lean * 0.5;        // hold the head up when bent over
    J.shL.rotation.set(-p.shL, 0, p.shLz); J.shR.rotation.set(-p.shR, 0, -p.shRz);
    J.elL.rotation.x = -p.elL; J.elR.rotation.x = -p.elR;
    if (J.bat) {
      // The barrel's direction in the torso's frame: up and back toward the catcher in the stance, level and
      // out over the plate at contact (the torso has turned by then), and wrapped around toward the pitcher.
      const k = BAT_PATH, f = Math.max(0, Math.min(1, p.bat)) * (k.length - 1), i = Math.min(k.length - 2, Math.floor(f)), u = f - i;
      const yaw = k[i][0] + (k[i + 1][0] - k[i][0]) * u, el = k[i][1] + (k[i + 1][1] - k[i][1]) * u;
      AIM.set(Math.sin(yaw) * Math.cos(el), Math.sin(el), Math.cos(yaw) * Math.cos(el));
      J.bat.quaternion.setFromUnitVectors(UP, AIM);
    }
    // Height of the hips above each foot: thigh and shin projected on the vertical, the spread tilting both.
    const leg = (h, k) => (THIGH * Math.cos(h) + SHIN * Math.cos(k - h)) * Math.cos(p.legSpread) + FOOT;
    J.body.position.y = Math.max(leg(p.hipL, p.kneeL), leg(p.hipR, p.kneeR)) + bob;
  }

  // Top of the head, for hanging a name tag above it.
  const HEAD_TOP = THIGH + SHIN + FOOT + 2.02 + 0.52 + 0.55;

  root.Figures3D = { makePlayer, pose, lerpPose, run, apply, kit, KITS, HEAD_TOP };
})(typeof window !== 'undefined' ? window : globalThis);
