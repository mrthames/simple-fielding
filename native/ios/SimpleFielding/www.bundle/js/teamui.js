/*
 * The Team sheet (roster, lineup, label style) and the one-position editor opened by pressing and
 * holding a fielder. Drag-and-drop is built on Pointer Events, so a finger, an Apple Pencil and a mouse
 * all work the same way. Tap a player and then a position does the same thing without dragging.
 */
(function () {
  'use strict';

  const { NAMES } = window.Field;
  const T = window.Team;
  const $ = (s) => document.querySelector(s);

  let team = null;
  let onChange = () => {};
  let selected = null;      // player id picked by a tap, waiting for a position tap
  let editingId = null;
  let editingPos = null;

  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  function changed() { onChange(team); render(); }

  function chipHtml(p, short) {
    const full = T.fullName(p) || 'Player';
    // In a lineup slot there's only room for a first name.
    const name = short ? (p.first || p.last || full) : full;
    return `<span class="chip-num">${p.num ? esc(p.num) : ''}</span><span class="chip-name">${esc(name)}</span>` +
      `<span class="chip-edit" role="button" tabindex="0" aria-label="Edit ${esc(full)}" data-edit="${p.id}">` +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l4-1 11-11-3-3L5 16l-1 4z"/></svg></span>';
  }

  function chip(p, short) {
    const b = document.createElement('div');
    b.className = 'chip' + (selected === p.id ? ' selected' : '');
    b.dataset.id = p.id;
    b.title = T.fullName(p);
    b.innerHTML = chipHtml(p, short);
    return b;
  }

  // Lineup laid out like the field: outfield on top, catcher at the bottom.
  const AREAS = { LF: 'lf', CF: 'cf', RF: 'rf', SS: 'ss', '2B': 'sb', '3B': 'tb', P: 'p', '1B': 'fb', C: 'c' };

  function render() {
    const lineup = $('#lineup');
    lineup.innerHTML = '';
    for (const pos of T.POSITIONS) {
      const slot = document.createElement('div');
      slot.className = 'slot drop';
      slot.dataset.drop = pos;
      slot.style.gridArea = AREAS[pos];
      const p = T.playerAt(team, pos);
      slot.innerHTML = `<div class="slot-pos"><b>${pos}</b> ${NAMES[pos]}</div>`;
      if (p && p.id) slot.appendChild(chip(p, true));
      else if (p) slot.insertAdjacentHTML('beforeend', `<div class="slot-oneoff">${esc(p.first)} <small>name only</small></div>`);
      else slot.insertAdjacentHTML('beforeend', '<div class="slot-open">Open</div>');
      lineup.appendChild(slot);
    }
    const bench = $('#bench');
    bench.innerHTML = '';
    const benched = team.players.filter((p) => !T.positionOf(team, p.id));
    for (const p of benched) bench.appendChild(chip(p));
    if (!team.players.length) bench.innerHTML = '<p class="bench-empty">Add your players below. They start on the bench.</p>';
    else if (!benched.length) bench.innerHTML = '<p class="bench-empty">Everyone is on the field. Drag someone here to sit them.</p>';
    $('#bench-count').textContent = team.players.length ? `${team.players.length} player${team.players.length === 1 ? '' : 's'}` : '';
    for (const b of document.querySelectorAll('#label-seg button')) b.classList.toggle('on', b.dataset.label === team.label);
  }

  // ---------------------------------------------------------------- drag and drop
  let drag = null;

  function dropTargetAt(x, y) {
    const el = document.elementFromPoint(x, y);
    return el && el.closest('[data-drop]');
  }

  function place(id, target) {
    if (!target) return;
    const where = target.dataset.drop;
    if (where === 'bench') T.bench(team, id);
    else T.assign(team, where, id);
    selected = null;
    changed();
  }

  function onDown(e) {
    if (e.target.closest('[data-edit]')) return;
    const c = e.target.closest('.chip');
    if (!c) return;
    drag = { id: c.dataset.id, el: c, x: e.clientX, y: e.clientY, pid: e.pointerId, active: false, ghost: null, over: null };
    c.setPointerCapture(e.pointerId);
  }

  function onMove(e) {
    if (!drag || e.pointerId !== drag.pid) return;
    if (!drag.active && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) {
      drag.active = true;
      const r = drag.el.getBoundingClientRect();
      const g = drag.el.cloneNode(true);
      g.classList.add('ghost');
      g.style.width = r.width + 'px';
      document.body.appendChild(g);
      drag.ghost = g;
      drag.dx = drag.x - r.left; drag.dy = drag.y - r.top;
      drag.el.classList.add('dragging');
    }
    if (!drag.active) return;
    e.preventDefault();
    drag.ghost.style.transform = `translate(${e.clientX - drag.dx}px, ${e.clientY - drag.dy}px)`;
    const t = dropTargetAt(e.clientX, e.clientY);
    if (t !== drag.over) {
      if (drag.over) drag.over.classList.remove('over');
      if (t) t.classList.add('over');
      drag.over = t;
    }
  }

  function onUp(e) {
    if (!drag || e.pointerId !== drag.pid) return;
    const d = drag;
    drag = null;
    if (d.ghost) d.ghost.remove();
    if (d.over) d.over.classList.remove('over');
    d.el.classList.remove('dragging');
    if (d.active) {
      place(d.id, dropTargetAt(e.clientX, e.clientY));
    } else {
      // A tap: select this player, then tap a position (or the bench) to put them there.
      selected = selected === d.id ? null : d.id;
      render();
    }
  }

  function onSheetClick(e) {
    const edit = e.target.closest('[data-edit]');
    if (edit) { openPlayer(edit.dataset.edit); return; }
    if (e.target.closest('.chip')) return;
    const target = e.target.closest('[data-drop]');
    if (target && selected) place(selected, target);
  }

  // ---------------------------------------------------------------- dialogs
  function open(d) { if (d.showModal) { if (!d.open) d.showModal(); } else d.setAttribute('open', ''); }
  function close(d) { if (d.close) d.close(); else d.removeAttribute('open'); }

  function openTeam() {
    selected = null;
    render();
    open($('#team'));
  }

  function openPlayer(id) {
    const p = team.players.find((x) => x.id === id);
    if (!p) return;
    editingId = id;
    const f = $('#player-form');
    f.first.value = p.first; f.last.value = p.last; f.num.value = p.num;
    open($('#player-editor'));
    f.first.focus();
  }

  function openPosition(pos) {
    editingPos = pos;
    $('#pe-title').textContent = NAMES[pos];
    const list = $('#pe-list');
    list.innerHTML = '';
    if (!team.players.length) list.innerHTML = '<p class="fine">No players yet. Type a name below, or add your whole team.</p>';
    const current = team.slots[pos];
    for (const p of team.players) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pe-player' + (p.id === current ? ' on' : '');
      const at = T.positionOf(team, p.id);
      b.innerHTML = `<span class="chip-num">${p.num ? esc(p.num) : ''}</span><span>${esc(T.fullName(p) || 'Player')}</span>` +
        (at && at !== pos ? `<small>now ${at}</small>` : '');
      b.addEventListener('click', () => { T.assign(team, pos, p.id); changed(); close($('#pos-editor')); });
      list.appendChild(b);
    }
    $('#pe-name').oneoff.value = team.names[pos] || '';
    open($('#pos-editor'));
  }

  function init(opts) {
    team = opts.team;
    onChange = opts.onChange;
    const sheet = $('#team');
    sheet.addEventListener('pointerdown', onDown);
    sheet.addEventListener('pointermove', onMove);
    sheet.addEventListener('pointerup', onUp);
    sheet.addEventListener('pointercancel', (e) => { if (drag && e.pointerId === drag.pid) { if (drag.ghost) drag.ghost.remove(); if (drag.over) drag.over.classList.remove('over'); drag.el.classList.remove('dragging'); drag = null; } });
    sheet.addEventListener('click', onSheetClick);
    sheet.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-edit]')) { e.preventDefault(); openPlayer(e.target.dataset.edit); } });

    for (const b of document.querySelectorAll('#label-seg button')) {
      b.addEventListener('click', () => { team.label = b.dataset.label; changed(); });
    }
    $('#add-player').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target;
      if (T.addPlayer(team, f.first.value, f.last.value, f.num.value)) {
        f.reset();
        changed();
        f.first.focus();
      }
    });
    $('#player-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target;
      T.updatePlayer(team, editingId, { first: f.first.value, last: f.last.value, num: f.num.value });
      changed();
      close($('#player-editor'));
    });
    $('#pf-delete').addEventListener('click', () => {
      T.removePlayer(team, editingId);
      changed();
      close($('#player-editor'));
    });
    $('#pe-name').addEventListener('submit', (e) => {
      e.preventDefault();
      T.setName(team, editingPos, e.target.oneoff.value);
      changed();
      close($('#pos-editor'));
    });
    $('#pe-generic').addEventListener('click', () => { T.clearPosition(team, editingPos); changed(); close($('#pos-editor')); });
    $('#pe-team').addEventListener('click', () => { close($('#pos-editor')); openTeam(); });
    for (const d of [sheet, $('#pos-editor'), $('#player-editor')]) {
      d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-close]')) close(d); });
    }
    $('#btn-team').addEventListener('click', openTeam);
  }

  window.TeamUI = { init, openTeam, openPosition };
})();
