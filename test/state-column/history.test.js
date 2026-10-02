'use strict';

// The monthly economic history the State tab's chart draws from: one point
// per game month, a JSON string in the quality sc_history.

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const Model = require('../../out/html/state-column/model.js');

const start1928 = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'start1928.json'), 'utf8')
);

function at(year, month, over) {
  return Object.assign({}, start1928, { year, month }, over);
}

test('a point holds the date and the four figures, rounded to two places', () => {
  assert.deepEqual(
    Model.historyPoint(at(1928, 1, { inflation: 2.912, economic_growth: -0.004, unemployed: 8.6, budget: 4 })),
    { year: 1928, month: 1, inflation: 2.91, growth: 0, unemployed: 8.6, budget: 4 }
  );
});

test('no point without a date', () => {
  assert.equal(Model.historyPoint({ inflation: 1 }), null);
  assert.equal(Model.recordHistory(undefined, { inflation: 1 }), undefined);
});

test('recording into nothing starts a history of one point', () => {
  const stored = Model.recordHistory(undefined, at(1928, 1));
  assert.equal(typeof stored, 'string');
  assert.deepEqual(Model.parseHistory(stored), [
    { year: 1928, month: 1, inflation: 2.9, growth: 4.4, unemployed: 8.6, budget: 4 },
  ]);
});

test('a new month appends a point; the same month replaces its point, and leaves the string alone when nothing moved', () => {
  let stored = Model.recordHistory(undefined, at(1928, 1));
  stored = Model.recordHistory(stored, at(1928, 2, { inflation: 3.1 }));
  assert.equal(Model.parseHistory(stored).length, 2);
  assert.equal(Model.recordHistory(stored, at(1928, 2, { inflation: 3.1 })), stored);
  const later = Model.recordHistory(stored, at(1928, 2, { inflation: 3.4 }));
  const points = Model.parseHistory(later);
  assert.equal(points.length, 2);
  assert.equal(points[1].inflation, 3.4);
  assert.equal(points[0].inflation, 2.9);
});

test('a month across a new year appends', () => {
  let stored = Model.recordHistory(undefined, at(1928, 12));
  stored = Model.recordHistory(stored, at(1929, 1));
  assert.deepEqual(Model.parseHistory(stored).map((p) => [p.year, p.month]), [[1928, 12], [1929, 1]]);
});

test('points later than the present go: a refunded month leaves no future point', () => {
  let stored = Model.recordHistory(undefined, at(1928, 1));
  stored = Model.recordHistory(stored, at(1928, 2));
  stored = Model.recordHistory(stored, at(1928, 3));
  const back = Model.recordHistory(stored, at(1928, 2, { inflation: 9 }));
  assert.deepEqual(Model.parseHistory(back).map((p) => [p.month, p.inflation]), [[1, 2.9], [2, 9]]);
});

test('the history keeps the latest 120 points', () => {
  let stored;
  for (let i = 0; i < 130; i++) {
    const t = 1928 * 12 + i;
    stored = Model.recordHistory(stored, at(Math.floor(t / 12), (t % 12) + 1, { inflation: i }));
  }
  const points = Model.parseHistory(stored);
  assert.equal(points.length, Model.HISTORY_CAP);
  assert.equal(Model.HISTORY_CAP, 120);
  assert.equal(points[0].inflation, 10);
  assert.equal(points[119].inflation, 129);
});

test('a stored history that is not a list of dated points reads as empty', () => {
  for (const bad of [undefined, '', 'not json', '{}', '3', '[1,2]', '[{"month":1}]', '[null]']) {
    assert.deepEqual(Model.parseHistory(bad), [], String(bad));
  }
});

test('a history in a save survives JSON, the way Dendry saves it', () => {
  // getExportableState returns the whole state and the browser saves it with
  // JSON.stringify; qualities is a plain object, so a string quality round-trips.
  const state = { qualities: Object.assign({}, at(1930, 5)) };
  state.qualities.sc_history = Model.recordHistory(state.qualities.sc_history, state.qualities);
  const loaded = JSON.parse(JSON.stringify(state));
  assert.equal(loaded.qualities.sc_history, state.qualities.sc_history);
  assert.equal(Model.parseHistory(loaded.qualities.sc_history).length, 1);
});
