'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// The decision column's result placeholders: a [data-results] name in the
// page maps to a builder in ResultRows. Pure, so no page is needed. How the
// filled rows look and behave is checked by checks/election.mjs.

const require = createRequire(import.meta.url);
const { resultsHtml, RESULT_BUILDERS } = require('../../out/html/decision-column/decision-column.js');
const ResultRows = require('../../out/html/state-column/results.js');
const q = require('../state-column/fixtures/start1928.json');

test('a known name builds the Reichstag rows with seats, compact', () => {
  const html = resultsHtml('reichstag', ResultRows, q, 'period');
  assert.match(html, /^<div class="rr compact with-seats"/);
  assert.equal((html.match(/data-depth-entry="party:/g) || []).length, ResultRows.reichstag(q).length);
});

test('the symbols setting reaches the badges', () => {
  const period = resultsHtml('reichstag', ResultRows, q, 'period');
  const plain = resultsHtml('reichstag', ResultRows, q, 'badges');
  assert.notEqual(period, plain);
});

test('an unknown name builds nothing, so the scene\'s text stays', () => {
  assert.equal(resultsHtml('nonesuch', ResultRows, q, 'period'), null);
  assert.equal(resultsHtml('toString', ResultRows, q, 'period'), null);
});

test('a build without ResultRows builds nothing', () => {
  assert.equal(resultsHtml('reichstag', undefined, q, 'period'), null);
});

test('a builder that throws builds nothing', () => {
  assert.equal(resultsHtml('reichstag', ResultRows, null, 'period'), null);
});

test('the map is a plain name-to-builder table, open to new names', () => {
  assert.equal(typeof RESULT_BUILDERS.reichstag, 'function');
});

test('the presidential names build rows: a tick on a first round, none on a second', () => {
  const q1932 = { election_round: 1, nsdap_candidate: 'Hitler', braun_campaign: 1,
    hindenburg_votes: 49, hitler_votes: 30, thalmann_votes: 5, braun_votes: 16 };
  const first = resultsHtml('president-round1', ResultRows, q1932, 'badges');
  const second = resultsHtml('president-round2', ResultRows, Object.assign({}, q1932, { election_round: 2 }), 'badges');
  assert.match(first, /^<div class="rr compact wide-names"/);
  assert.equal((first.match(/rr-mark/g) || []).length, 4);
  assert.doesNotMatch(second, /rr-mark/);
  assert.doesNotMatch(first, /Change \(pts\)/);
  const q1934 = { round: 1, spd_candidate: 'Braun', Hitler_running: 1, Hitler_votes: 40, Braun_running: 1, Braun_votes: 60,
    has_majority: 1, winner: 'Braun' };
  assert.match(resultsHtml('president-1934-round1', ResultRows, q1934, 'badges'), /rr-tag">majority</);
  assert.doesNotMatch(resultsHtml('president-1934-round2', ResultRows, Object.assign({}, q1934, { round: 2 }), 'badges'), /rr-mark|rr-tag/);
});

test('a presidential placeholder with no candidates leaves the scene text', () => {
  assert.equal(resultsHtml('president-1934-round1', ResultRows, { round: 1 }, 'badges'), null);
});
