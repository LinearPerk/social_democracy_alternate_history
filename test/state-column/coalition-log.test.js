'use strict';

// What moved the coalition dissents: a short log kept as a JSON string in the
// quality sc_coalition_log, so a saved game carries it (like sc_history).

const assert = require('node:assert/strict');
const test = require('node:test');

const Model = require('../../out/html/state-column/model.js');

function at(year, month, over) {
  return Object.assign({ year, month, spd_in_government: 1, in_grand_coalition: 1, coalition_dissent: 0, kpd_coalition_dissent: 0 }, over);
}

const t = (year, month) => Model.timeIndex(year, month);

test('nothing recorded: nothing to parse', () => {
  assert.deepEqual(Model.parseCoalitionLog(undefined), []);
  assert.deepEqual(Model.parseCoalitionLog(''), []);
  assert.deepEqual(Model.parseCoalitionLog('not json'), []);
  assert.deepEqual(Model.parseCoalitionLog('{"a":1}'), []);
});

test('a rise is recorded with the month, the amount and the cause', () => {
  const now = at(1929, 3, { coalition_dissent: 1 });
  const stored = Model.recordCoalitionLog(undefined, { coalition_dissent: 0, kpd_coalition_dissent: 0 }, now, 'Labor Rights');
  assert.deepEqual(Model.parseCoalitionLog(stored), [
    { t: t(1929, 3), key: 'coalition_dissent', delta: 1, cause: 'Labor Rights' },
  ]);
});

test('a fall is recorded too, as a negative amount', () => {
  const now = at(1929, 5, { coalition_dissent: 1 });
  const stored = Model.recordCoalitionLog(undefined, { coalition_dissent: 3, kpd_coalition_dissent: 0 }, now, 'Coalition Affairs');
  assert.equal(Model.parseCoalitionLog(stored)[0].delta, -2);
});

test('each dissent has its own entry when both move at once', () => {
  const now = at(1929, 3, { in_popular_front: 1, coalition_dissent: 1, kpd_coalition_dissent: 2 });
  const log = Model.parseCoalitionLog(Model.recordCoalitionLog('', { coalition_dissent: 0, kpd_coalition_dissent: 0 }, now, 'Economic Policy'));
  assert.deepEqual(log.map((e) => [e.key, e.delta]), [['coalition_dissent', 1], ['kpd_coalition_dissent', 2]]);
});

test('the same string comes back when nothing moved, so the caller can skip the write', () => {
  const now = at(1929, 3, { coalition_dissent: 1 });
  const prev = { coalition_dissent: 1, kpd_coalition_dissent: 0 };
  assert.equal(Model.recordCoalitionLog(undefined, prev, now, 'x'), undefined);
  const stored = '[{"t":' + t(1929, 2) + ',"key":"coalition_dissent","delta":1,"cause":"Y"}]';
  assert.equal(Model.recordCoalitionLog(stored, prev, now, 'x'), stored);
});

test('with no earlier reading (a first draw, a loaded game) nothing is recorded', () => {
  const now = at(1929, 3, { coalition_dissent: 2 });
  assert.equal(Model.recordCoalitionLog(undefined, null, now, 'x'), undefined);
});

test('a missing cause reads "an event"', () => {
  const now = at(1929, 3, { coalition_dissent: 1 });
  const log = Model.parseCoalitionLog(Model.recordCoalitionLog('', { coalition_dissent: 0, kpd_coalition_dissent: 0 }, now, ''));
  assert.equal(log[0].cause, 'an event');
});

test('two changes by one card in one month add up to one entry', () => {
  const first = Model.recordCoalitionLog('', { coalition_dissent: 0, kpd_coalition_dissent: 0 }, at(1929, 3, { coalition_dissent: 1 }), 'Labor Rights');
  const second = Model.recordCoalitionLog(first, { coalition_dissent: 1, kpd_coalition_dissent: 0 }, at(1929, 3, { coalition_dissent: 2 }), 'Labor Rights');
  const log = Model.parseCoalitionLog(second);
  assert.equal(log.length, 1);
  assert.equal(log[0].delta, 2);
});

test('a rise and its undo in the same card cancel out and leave no entry', () => {
  const first = Model.recordCoalitionLog('', { coalition_dissent: 0, kpd_coalition_dissent: 0 }, at(1929, 3, { coalition_dissent: 1 }), 'X');
  const second = Model.recordCoalitionLog(first, { coalition_dissent: 1, kpd_coalition_dissent: 0 }, at(1929, 3, { coalition_dissent: 0 }), 'X');
  assert.deepEqual(Model.parseCoalitionLog(second), []);
});

test('the log keeps the latest 12 entries, oldest first', () => {
  let stored = '';
  let prev = 0;
  for (let i = 1; i <= 15; i++) {
    const q = at(1929, 1 + (i % 12), { year: 1929 + Math.floor(i / 12), coalition_dissent: prev + 1 });
    stored = Model.recordCoalitionLog(stored, { coalition_dissent: prev, kpd_coalition_dissent: 0 }, q, 'Card ' + i);
    prev += 1;
  }
  const log = Model.parseCoalitionLog(stored);
  assert.equal(Model.COALITION_LOG_CAP, 12);
  assert.equal(log.length, 12);
  assert.equal(log[0].cause, 'Card 4');
  assert.equal(log[11].cause, 'Card 15');
});

test('the log clears when the SPD is out of government: an election resets the dissents', () => {
  const stored = Model.recordCoalitionLog('', { coalition_dissent: 0, kpd_coalition_dissent: 0 }, at(1929, 3, { coalition_dissent: 2 }), 'X');
  assert.equal(Model.parseCoalitionLog(stored).length, 1);
  const after = Model.recordCoalitionLog(stored, { coalition_dissent: 2, kpd_coalition_dissent: 0 }, at(1930, 9, { spd_in_government: 0, coalition_dissent: 0 }), 'Reichstag Elections');
  assert.deepEqual(Model.parseCoalitionLog(after), []);
});

test('entries from a later month go: the game went back (a refunded month)', () => {
  let stored = Model.recordCoalitionLog('', { coalition_dissent: 0, kpd_coalition_dissent: 0 }, at(1929, 3, { coalition_dissent: 1 }), 'Early');
  stored = Model.recordCoalitionLog(stored, { coalition_dissent: 1, kpd_coalition_dissent: 0 }, at(1929, 6, { coalition_dissent: 2 }), 'Late');
  const back = Model.recordCoalitionLog(stored, { coalition_dissent: 2, kpd_coalition_dissent: 0 }, at(1929, 4, { coalition_dissent: 2 }), 'x');
  assert.deepEqual(Model.parseCoalitionLog(back).map((e) => e.cause), ['Early']);
});

test('parsing drops malformed entries and sorts what is left by month', () => {
  const stored = JSON.stringify([
    { t: t(1929, 5), key: 'coalition_dissent', delta: 1, cause: 'B' },
    { t: 'x', key: 'coalition_dissent', delta: 1, cause: 'bad date' },
    { t: t(1929, 4), key: 'coalition_dissent', delta: 0, cause: 'no change' },
    { t: t(1929, 4), key: 'resources', delta: 1, cause: 'wrong quality' },
    { t: t(1929, 4), key: 'kpd_coalition_dissent', delta: -1, cause: 'A' },
  ]);
  assert.deepEqual(Model.parseCoalitionLog(stored).map((e) => e.cause), ['A', 'B']);
});

test('the last entry for a dissent is its newest, and each dissent keeps its own', () => {
  const stored = JSON.stringify([
    { t: t(1929, 3), key: 'coalition_dissent', delta: 1, cause: 'One' },
    { t: t(1929, 4), key: 'kpd_coalition_dissent', delta: 1, cause: 'Two' },
    { t: t(1929, 5), key: 'coalition_dissent', delta: -1, cause: 'Three' },
  ]);
  const log = Model.parseCoalitionLog(stored);
  assert.equal(Model.lastCoalitionMove(log, 'coalition_dissent').cause, 'Three');
  assert.equal(Model.lastCoalitionMove(log, 'kpd_coalition_dissent').cause, 'Two');
  assert.equal(Model.lastCoalitionMove([], 'coalition_dissent'), null);
});

test('a move reads as its cause, month and signed amount', () => {
  const rise = { t: t(1929, 3), key: 'coalition_dissent', delta: 1, cause: 'Labor Rights' };
  const fall = { t: t(1930, 12), key: 'coalition_dissent', delta: -2, cause: 'Coalition Affairs' };
  assert.equal(Model.coalitionMoveText(rise), 'Labor Rights, March 1929, +1');
  assert.equal(Model.coalitionMoveText(fall), 'Coalition Affairs, December 1930, −2');
});
