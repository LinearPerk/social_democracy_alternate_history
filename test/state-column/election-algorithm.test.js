'use strict';

// Runs the election scene's on-arrival script, read straight from the scene
// source, on the opening 1928 qualities.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Model = require('../../out/html/state-column/model.js');

const start1928 = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'start1928.json'), 'utf8'));

function onArrival(file, scene) {
  const src = fs.readFileSync(path.join(__dirname, '../../source/scenes', file), 'utf8').replace(/\r\n/g, '\n');
  const from = scene ? src.indexOf('\n@' + scene + '\n') : 0;
  assert.ok(from >= 0, 'scene found');
  const open = src.indexOf('on-arrival: {!', from);
  const body = src.slice(open + 'on-arrival: {!'.length, src.indexOf('\n!}', open));
  return new Function('Q', 'window', body);
}

function run(q, withModel = true) {
  onArrival('election_algorithm.scene.dry')(q, withModel ? { StateColumnModel: Model } : {});
  return q;
}

const fresh = (extra) => Object.assign(JSON.parse(JSON.stringify(start1928)), extra);
const total = (q) => q.parties.reduce((n, p) => n + q[p + '_votes'], 0);

test('integer shares sum to 100 on the opening 1928 qualities', () => {
  const q = run(fresh());
  assert.equal(total(q), 100);
  assert.deepEqual(q.parties.map((p) => q[p + '_votes']), [29, 11, 17, 5, 9, 15, 3, 11]);
});

test('without the model script the scene falls back to per-party rounding', () => {
  const q = run(fresh(), false);
  assert.equal(total(q), 99);
});

test('decimal mode is unchanged', () => {
  const q = run(fresh({ use_decimals: 1 }));
  assert.equal(q.spd_votes, 28.8);
  assert.equal(q.spd_votes_disp, 28.8);
});

test('the one-decimal figures stay the same in integer mode', () => {
  const q = run(fresh());
  assert.equal(q.spd_votes_dec, 28.8);
  assert.equal(q.spd_votes_disp, '28.8');
});

test('a class with no support for any party adds nothing and makes no NaN', () => {
  const zeroed = {};
  for (const p of start1928.parties) zeroed['unemployed_' + p] = 0;
  const q = run(fresh(zeroed));
  assert.equal(q.unemployed_spd_normalized, 0);
  assert.equal(q.unemployed_spd_display, 0);
  for (const p of q.parties) {
    assert.ok(Number.isFinite(q[p + '_votes']), p);
    assert.ok(Number.isFinite(q[p + '_normalized']), p);
  }
  assert.equal(total(q), 100);
});

test('the threshold renormalisation in the 1928 election keeps shares summing to 100', () => {
  const q = run(fresh({ constitutional_reform: 1, electoral_threshold: 5 }));
  q.election_records = [];
  q.year = 1928; q.month = 5;
  q.sapd_votes = q.sapd_votes || 0;
  for (const p of q.parties) q[p + '_r'] = 0;
  onArrival('events/election_1928.scene.dry', 'post_election_1928')(q, { StateColumnModel: Model });
  assert.equal(q.parties.reduce((n, p) => n + q[p + '_r'], 0), 100);
});
