// The team roster: assigning, swapping, one-off names, and what the field shows.
const test = require('node:test');
const assert = require('node:assert/strict');
const Team = require('../app/js/team.js');

function team() {
  const t = Team.empty();
  const maya = Team.addPlayer(t, 'Maya', 'Rivera', '7');
  const leo = Team.addPlayer(t, 'Leo', 'Park', '12');
  return { t, maya, leo };
}

test('a player fills one position; moving them leaves the old one open', () => {
  const { t, maya } = team();
  Team.assign(t, 'SS', maya.id);
  assert.equal(t.slots.SS, maya.id);
  Team.assign(t, '2B', maya.id);
  assert.equal(t.slots['2B'], maya.id);
  assert.equal(t.slots.SS, null);
});

test('dropping a player on an occupied position swaps them', () => {
  const { t, maya, leo } = team();
  Team.assign(t, 'SS', maya.id);
  Team.assign(t, '2B', leo.id);
  Team.assign(t, 'SS', leo.id);
  assert.equal(t.slots.SS, leo.id);
  assert.equal(t.slots['2B'], maya.id);
});

test('dropping a bench player on an occupied position sends the occupant to the bench', () => {
  const { t, maya, leo } = team();
  Team.assign(t, 'P', maya.id);
  Team.assign(t, 'P', leo.id);
  assert.equal(t.slots.P, leo.id);
  assert.equal(Team.positionOf(t, maya.id), null);
});

test('removing a player clears their position', () => {
  const { t, maya } = team();
  Team.assign(t, 'C', maya.id);
  Team.removePlayer(t, maya.id);
  assert.equal(t.slots.C, null);
  assert.equal(t.players.length, 1);
});

test('label styles', () => {
  const { t, maya } = team();
  Team.assign(t, 'SS', maya.id);
  assert.deepEqual(Team.labelFor(t, 'SS', 'position'), { inner: 'SS', tag: '', name: 'Maya R.' });
  assert.equal(Team.labelFor(t, 'SS', 'first').tag, 'Maya');
  assert.equal(Team.labelFor(t, 'SS', 'last').tag, 'Rivera');
  assert.equal(Team.labelFor(t, 'SS', 'initials').inner, 'MR');
  assert.equal(Team.labelFor(t, 'SS', 'number').inner, '7');
  // An open position stays generic in every style.
  for (const s of Team.LABEL_STYLES) assert.deepEqual(Team.labelFor(t, 'CF', s), { inner: 'CF', tag: '', name: '' });
});

test('a one-off name on a position, and going back to just the position', () => {
  const { t } = team();
  Team.setName(t, 'LF', 'Sam');
  assert.equal(Team.labelFor(t, 'LF', 'first').tag, 'Sam');
  assert.equal(Team.labelFor(t, 'LF', 'initials').inner, 'S');
  Team.clearPosition(t, 'LF');
  assert.equal(Team.labelFor(t, 'LF', 'first').tag, '');
});

test('a player with only a number falls back sensibly', () => {
  const t = Team.empty();
  const p = Team.addPlayer(t, '', '', '23');
  Team.assign(t, '1B', p.id);
  assert.equal(Team.labelFor(t, '1B', 'first').tag, '#23');
  assert.equal(Team.labelFor(t, '1B', 'number').inner, '23');
  assert.equal(Team.labelFor(t, '1B', 'initials').inner, '1B');
});

test('an empty entry is not added', () => {
  const t = Team.empty();
  assert.equal(Team.addPlayer(t, ' ', '', ''), null);
  assert.equal(t.players.length, 0);
});

test('normalize survives junk and duplicates from storage', () => {
  assert.deepEqual(Team.normalize(null), Team.empty());
  assert.deepEqual(Team.normalize('nonsense'), Team.empty());
  const t = Team.normalize({ players: [{ id: 'a', first: 'Maya' }], slots: { SS: 'a', '2B': 'a', P: 'ghost' }, label: 'weird' });
  assert.equal([t.slots.SS, t.slots['2B']].filter((x) => x === 'a').length, 1, 'one position per player');
  assert.equal(t.slots.P, null, 'unknown ids are dropped');
  assert.equal(t.label, 'position');
});

test('load and save round-trip through storage', () => {
  const mem = { v: null, getItem() { return this.v; }, setItem(k, v) { this.v = v; } };
  const { t, maya } = team();
  Team.assign(t, 'SS', maya.id);
  t.label = 'first';
  Team.save(mem, t);
  const back = Team.load(mem);
  assert.equal(back.slots.SS, maya.id);
  assert.equal(back.label, 'first');
});
