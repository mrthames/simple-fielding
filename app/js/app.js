/*
 * UI: situation controls, drag-to-hit, playback, the job list.
 */
(function () {
  'use strict';

  const VERSION = '0.1.0';
  const { POSITIONS, NAMES, LEAGUES } = window.Field;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  const store = {
    get(k, d) { try { const v = localStorage.getItem('sf.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('sf.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };

  const state = {
    league: store.get('league', 'littleLeague'),
    leadoffs: null,
    runners: { first: false, second: false, third: false },
    outs: 0,
    batter: 'R',
    kind: 'ground',
    result: 'auto',
    speed: store.get('speed', 1),
    showPaths: store.get('showPaths', true),
    plan: null,
    lastEvent: null,
    playing: false,
    t: 0,
    spotlight: null,
    scenarioIndex: -1,
  };
  if (!LEAGUES[state.league]) state.league = 'littleLeague';
  state.leadoffs = store.get('leadoffs.' + state.league, LEAGUES[state.league].leadoffs);

  const view = new window.FieldView($('#field'));
  let geo;

  function situation() {
    return { runners: Object.assign({}, state.runners), outs: state.outs, batter: state.batter, league: state.league, leadoffs: state.leadoffs };
  }

  // -------------------------------------------------------------------------------------------
  // Situation controls
  // -------------------------------------------------------------------------------------------
  function renderSituation() {
    for (const b of $$('.mini-base')) b.classList.toggle('on', !!state.runners[b.dataset.base]);
    const dots = $$('#outs span');
    dots.forEach((d, i) => d.classList.toggle('on', i < state.outs));
    $('#outs').setAttribute('aria-label', `${state.outs} out${state.outs === 1 ? '' : 's'}`);
    for (const b of $$('#batter-seg button')) b.classList.toggle('on', b.dataset.batter === state.batter);
    for (const b of $$('#kind-chips button')) b.classList.toggle('on', b.dataset.kind === state.kind);
    for (const b of $$('#result-chips button')) b.classList.toggle('on', b.dataset.result === state.result);
    // Other plays only make sense with the right runners on.
    const r = state.runners;
    const need = {
      steal2: r.first && !r.second, steal3: r.second && !r.third, firstThirdSteal: r.first && r.third && !r.second,
      passedBall: r.first || r.second || r.third, primaryLead: r.first, secondaryLead: r.first,
    };
    for (const b of $$('#other-plays button')) {
      b.classList.toggle('dim', !need[b.dataset.play]);
      b.title = need[b.dataset.play] ? '' : needText(b.dataset.play);
    }
  }

  function needText(play) {
    return {
      steal2: 'Put a runner on 1st (and nobody on 2nd)', steal3: 'Put a runner on 2nd (and nobody on 3rd)',
      firstThirdSteal: 'Put runners on 1st and 3rd', passedBall: 'Put a runner on base',
      primaryLead: 'Put a runner on 1st', secondaryLead: 'Put a runner on 1st',
    }[play];
  }

  function toggleRunner(base) {
    state.runners[base] = !state.runners[base];
    situationChanged();
  }

  function situationChanged() {
    renderSituation();
    showReady();
  }

  function showReady() {
    stop();
    state.plan = null;
    state.lastEvent = null;
    view.showReady(window.Field.readyPositions(geo, situation()), state.runners);
    $('#result').hidden = true;
    $('#play-title').hidden = true;
    $('#field-hint').hidden = false;
    setSpotlight(null);
    updateTransport();
  }

  // -------------------------------------------------------------------------------------------
  // Running a play
  // -------------------------------------------------------------------------------------------
  function runEvent(event, opts) {
    const ev = Object.assign({}, event);
    if (ev.at && state.result !== 'auto' && !ev.result) ev.result = state.result;
    const plan = window.Engine.planPlay(situation(), ev);
    state.plan = plan;
    state.lastEvent = event;
    view.load(plan);
    renderResult(plan);
    $('#field-hint').hidden = true;
    const title = $('#play-title');
    title.textContent = plan.title;
    title.hidden = false;
    setSpotlight(state.spotlight);
    state.t = 0;
    if (!opts || opts.autoplay !== false) play();
    else updateTransport();
  }

  function renderResult(plan) {
    $('#result').hidden = false;
    $('#result-title').textContent = plan.title;
    $('#result-summary').textContent = plan.summary;
    const notes = $('#result-notes');
    notes.innerHTML = '';
    for (const n of plan.notes) {
      const li = document.createElement('li');
      li.textContent = n;
      notes.appendChild(li);
    }
    const jobs = $('#jobs');
    jobs.innerHTML = '';
    for (const j of plan.jobs) {
      const li = document.createElement('li');
      li.className = `job role-${j.role}`;
      li.dataset.pos = j.pos;
      li.innerHTML = `<span class="badge">${j.pos}</span><span class="job-text"><strong>${NAMES[j.pos]}</strong> ${escapeHtml(j.job)}</span>`;
      li.addEventListener('click', () => setSpotlight(state.spotlight === j.pos ? null : j.pos));
      jobs.appendChild(li);
    }
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function setSpotlight(pos) {
    state.spotlight = pos;
    view.setSpotlight(pos);
    for (const li of $$('#jobs li')) li.classList.toggle('spot', li.dataset.pos === pos);
    const card = $('#spot-card');
    if (pos && state.plan) {
      const j = state.plan.assignments[pos];
      card.className = `spot-card role-${j.role}`;
      card.innerHTML = `<span class="badge">${pos}</span><div><strong>${NAMES[pos]}</strong><p>${escapeHtml(j.job)}</p></div>`;
      card.hidden = false;
      const li = $(`#jobs li[data-pos="${pos}"]`);
      if (li && window.matchMedia('(min-width: 900px)').matches) li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else if (pos) {
      card.className = 'spot-card';
      card.innerHTML = `<span class="badge">${pos}</span><div><strong>${NAMES[pos]}</strong><p>Hit the ball to see what the ${NAMES[pos].toLowerCase()} does.</p></div>`;
      card.hidden = false;
    } else {
      card.hidden = true;
    }
  }

  // -------------------------------------------------------------------------------------------
  // Playback
  // -------------------------------------------------------------------------------------------
  let raf = 0;
  let lastFrame = 0;

  function play() {
    if (!state.plan) return;
    if (state.t >= state.plan.timeline.duration) state.t = 0;
    state.playing = true;
    lastFrame = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
    updateTransport();
  }

  function stop() {
    state.playing = false;
    cancelAnimationFrame(raf);
    updateTransport();
  }

  function frame(now) {
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    state.t += dt * state.speed;
    const dur = state.plan.timeline.duration;
    if (state.t >= dur) {
      state.t = dur;
      view.seek(state.t);
      stop();
      return;
    }
    view.seek(state.t);
    updateScrub();
    raf = requestAnimationFrame(frame);
  }

  function updateScrub() {
    const dur = state.plan ? state.plan.timeline.duration : 1;
    $('#scrub').value = Math.round((state.t / dur) * 1000);
  }

  function updateTransport() {
    const btn = $('#btn-play');
    const done = state.plan && state.t >= state.plan.timeline.duration;
    btn.dataset.mode = state.playing ? 'pause' : done ? 'replay' : 'play';
    btn.setAttribute('aria-label', state.playing ? 'Pause' : done ? 'Replay' : 'Play');
    btn.disabled = !state.plan;
    $('#scrub').disabled = !state.plan;
    $('#transport').classList.toggle('idle', !state.plan);
    updateScrub();
  }

  // -------------------------------------------------------------------------------------------
  // Drag to hit
  // -------------------------------------------------------------------------------------------
  const svg = $('#field');
  let drag = null;

  svg.addEventListener('pointerdown', (e) => {
    const baseEl = e.target.closest && e.target.closest('.base');
    if (baseEl) return; // bases toggle on pointerup
    const p = view.toField(e.clientX, e.clientY);
    const nearPlate = Math.hypot(p.x, p.y - 1) < 16;
    // Players are tapped, not dragged — except the catcher, who stands on top of the ball.
    if (!nearPlate && e.target.closest && e.target.closest('.player')) return;
    drag = { id: e.pointerId, start: p, fromPlate: nearPlate, moved: false, at: p };
    svg.setPointerCapture(e.pointerId);
    if (nearPlate) {
      stop();
      svg.classList.add('dragging');
    }
    e.preventDefault();
  });

  svg.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const p = view.toField(e.clientX, e.clientY);
    drag.at = p;
    if (Math.hypot(p.x - drag.start.x, p.y - drag.start.y) > 6) drag.moved = true;
    if (drag.fromPlate && drag.moved) {
      view.showDrag({ x: 0, y: 1 }, p, state.kind);
      $('#field-hint').hidden = true;
    }
  });

  function endDrag(e, cancelled) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    svg.classList.remove('dragging');
    view.hideDrag();
    if (cancelled) return;
    if (d.fromPlate && d.moved) {
      hitTo(d.at);
    } else if (!d.moved && !d.fromPlate) {
      // A plain tap on the field also hits the ball there — easier on a projector or with a mouse.
      if (state.spotlight) { setSpotlight(null); return; }
      if (Math.hypot(d.at.x, d.at.y) > 12) hitTo(d.at);
    } else if (!d.moved && d.fromPlate && state.plan) {
      replay();
    }
  }
  svg.addEventListener('pointerup', (e) => endDrag(e, false));
  svg.addEventListener('pointercancel', (e) => endDrag(e, true));

  // Tapping a base toggles a runner. Tapping a player spotlights them.
  svg.addEventListener('click', (e) => {
    const baseEl = e.target.closest && e.target.closest('.base');
    if (baseEl) toggleRunner(baseEl.dataset.base);
  });
  view.onPick = (pos) => { if (!drag || !drag.moved) setSpotlight(state.spotlight === pos ? null : pos); };

  function hitTo(p) {
    const at = { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 };
    // A drop right on top of a fielder in the outfield, with "Let the app decide", is a catch for a fly.
    runEvent({ kind: state.kind, at });
  }

  function replay() {
    if (!state.plan) return;
    state.t = 0;
    view.seek(0);
    play();
  }

  // -------------------------------------------------------------------------------------------
  // Controls
  // -------------------------------------------------------------------------------------------
  for (const b of $$('.mini-base')) b.addEventListener('click', () => toggleRunner(b.dataset.base));
  $('#btn-clear').addEventListener('click', () => { state.runners = { first: false, second: false, third: false }; situationChanged(); });
  $('#outs').addEventListener('click', () => { state.outs = (state.outs + 1) % 3; situationChanged(); });
  for (const b of $$('#batter-seg button')) b.addEventListener('click', () => { state.batter = b.dataset.batter; renderSituation(); rerun(); });
  for (const b of $$('#kind-chips button')) b.addEventListener('click', () => { state.kind = b.dataset.kind; renderSituation(); rerunHit(); });
  for (const b of $$('#result-chips button')) b.addEventListener('click', () => { state.result = b.dataset.result; renderSituation(); rerunHit(); });
  for (const b of $$('#other-plays button')) {
    b.addEventListener('click', () => {
      const play = b.dataset.play;
      // Put the runners the play needs on base, so the button always does something.
      const r = state.runners;
      if (play === 'steal2') { r.first = true; r.second = false; }
      if (play === 'steal3') { r.second = true; r.third = false; }
      if (play === 'firstThirdSteal') { r.first = true; r.third = true; r.second = false; }
      if (play === 'passedBall' && !(r.first || r.second || r.third)) r.third = true;
      if (play === 'primaryLead' || play === 'secondaryLead') r.first = true;
      renderSituation();
      runEvent({ kind: play });
      scrollToResultOnPhone();
    });
  }

  // Changing the hit type or result re-runs the last batted ball, so a coach can compare.
  function rerunHit() {
    if (state.lastEvent && state.lastEvent.at) runEvent({ kind: state.kind, at: state.lastEvent.at });
  }
  function rerun() {
    if (!state.lastEvent) return;
    if (state.lastEvent.at) rerunHit();
    else runEvent(state.lastEvent);
  }

  function scrollToResultOnPhone() {
    if (window.matchMedia('(max-width: 899px)').matches) $('#field-wrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  $('#btn-play').addEventListener('click', () => {
    if (!state.plan) return;
    if (state.playing) stop();
    else if (state.t >= state.plan.timeline.duration) replay();
    else play();
  });
  $('#scrub').addEventListener('input', (e) => {
    if (!state.plan) return;
    stop();
    state.t = (e.target.value / 1000) * state.plan.timeline.duration;
    view.seek(state.t);
    updateTransport();
  });
  for (const b of $$('.transport .seg button')) {
    b.classList.toggle('on', Number(b.dataset.speed) === state.speed);
    b.addEventListener('click', () => {
      state.speed = Number(b.dataset.speed);
      store.set('speed', state.speed);
      for (const x of $$('.transport .seg button')) x.classList.toggle('on', x === b);
    });
  }
  $('#btn-reset').addEventListener('click', showReady);

  // Library
  const lib = $('#library');
  function buildLibrary() {
    const body = $('#library-body');
    body.innerHTML = '';
    let i = 0;
    for (const g of window.Scenarios.GROUPS) {
      const h = document.createElement('h3');
      h.textContent = g.name;
      body.appendChild(h);
      const list = document.createElement('div');
      list.className = 'lib-list';
      for (const it of g.items) {
        const idx = i++;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'lib-item';
        btn.innerHTML = `<span>${escapeHtml(it.name)}</span>${miniSit(it)}`;
        btn.addEventListener('click', () => { closeSheet(lib); runScenario(idx); });
        list.appendChild(btn);
      }
      body.appendChild(list);
    }
  }
  function miniSit(it) {
    const r = it.runners;
    const dot = (on) => `<i class="${on ? 'on' : ''}"></i>`;
    return `<span class="lib-sit"><span class="lib-bases">${dot(r.third)}${dot(r.second)}${dot(r.first)}</span><span class="lib-outs">${it.outs} out${it.outs === 1 ? '' : 's'}</span></span>`;
  }

  function runScenario(idx) {
    const all = window.Scenarios.ALL;
    const sc = all[(idx + all.length) % all.length];
    state.scenarioIndex = (idx + all.length) % all.length;
    state.runners = Object.assign({ first: false, second: false, third: false }, sc.runners);
    state.outs = sc.outs || 0;
    if (sc.batter) state.batter = sc.batter;
    if (sc.leadoffs && !state.leadoffs && geo.league.sport === 'baseball') {
      // Leads only exist where leadoffs are allowed; switch them on for this play.
      state.leadoffs = true;
      $('#leadoffs').checked = true;
    }
    const ev = Object.assign({}, sc.event);
    if (ev.at) {
      const k = geo.base / 60;
      ev.at = { x: ev.at.x * k, y: ev.at.y * k };
      state.kind = ev.kind;
      state.result = ev.result || 'auto';
    }
    renderSituation();
    runEvent(ev);
    scrollToResultOnPhone();
  }

  $('#btn-library').addEventListener('click', () => openSheet(lib));

  // Settings
  const settings = $('#settings');
  const leagueSel = $('#league');
  for (const k in LEAGUES) {
    const o = document.createElement('option');
    o.value = k; o.textContent = LEAGUES[k].label;
    leagueSel.appendChild(o);
  }
  leagueSel.value = state.league;
  leagueSel.addEventListener('change', () => {
    state.league = leagueSel.value;
    store.set('league', state.league);
    state.leadoffs = store.get('leadoffs.' + state.league, LEAGUES[state.league].leadoffs);
    $('#leadoffs').checked = state.leadoffs;
    setGeometry();
  });
  $('#leadoffs').checked = state.leadoffs;
  $('#leadoffs').addEventListener('change', (e) => { state.leadoffs = e.target.checked; store.set('leadoffs.' + state.league, state.leadoffs); rerun(); if (!state.lastEvent) showReady(); });
  $('#show-paths').checked = state.showPaths;
  $('#show-paths').addEventListener('change', (e) => { state.showPaths = e.target.checked; store.set('showPaths', state.showPaths); view.setShowPaths(state.showPaths); });
  $('#btn-settings').addEventListener('click', () => openSheet(settings));
  $('#version').textContent = VERSION;

  function openSheet(d) { if (d.showModal) d.showModal(); else d.setAttribute('open', ''); }
  function closeSheet(d) { if (d.close) d.close(); else d.removeAttribute('open'); }
  for (const d of [lib, settings]) {
    d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-close]')) closeSheet(d); });
  }

  // Projector mode
  function toggleProjector() {
    const on = !document.body.classList.contains('projector');
    document.body.classList.toggle('projector', on);
    try {
      if (on && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
      else if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    } catch (e) { /* not supported (iPhone) */ }
  }
  $('#btn-projector').addEventListener('click', toggleProjector);
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) document.body.classList.remove('projector'); });

  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, select, textarea')) return;
    if (e.key === ' ') { e.preventDefault(); $('#btn-play').click(); }
    else if (e.key === 'n' || e.key === 'N' || e.key === 'ArrowRight') runScenario(state.scenarioIndex + 1);
    else if (e.key === 'ArrowLeft') runScenario(state.scenarioIndex - 1);
    else if (e.key === 'p' || e.key === 'P') toggleProjector();
    else if (e.key === 'r' || e.key === 'R') showReady();
    else if (e.key === 'Escape') setSpotlight(null);
  });

  function setGeometry() {
    geo = window.Field.geometry(state.league);
    view.setGeometry(geo);
    view.setShowPaths(state.showPaths);
    showReady();
  }

  // Test hook: lets the Playwright suite drive plays without synthesising drags.
  window.SimpleFielding = { state, runEvent, runScenario, hitTo, seekEnd() { if (state.plan) { stop(); state.t = state.plan.timeline.duration; view.seek(state.t); updateTransport(); } } };

  buildLibrary();
  setGeometry();
  renderSituation();
})();
