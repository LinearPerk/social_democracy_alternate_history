'use strict';

// The dashboard's box holds one height whichever tab is open: the open tab's
// body takes the tallest of the three bodies as its minimum height. The
// measuring is done in the page (checks/stable-height.mjs reads the result);
// here: the markup drawn for measuring, the max-of-three rule and the cache.

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const View = require('../../out/html/state-column/view.js');

function loadFixture(name) {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures', name + '.json'), 'utf8')
  );
}

const gov1932 = loadFixture('gov1932');
const gov1932prev = loadFixture('gov1932_prev');

// ---- the markup drawn for measuring ----------------------------------------------

test('one markup per tab, in tab order, each the same as the tab draws', () => {
  const markups = View.bodyMarkups(gov1932, gov1932prev, {});
  assert.equal(markups.length, View.TABS.length);
  View.TABS.forEach((entry, i) => {
    const plain = View.renderTab(entry[0], gov1932, gov1932prev, {}).replace(/\sid="[^"]*"/g, '');
    assert.equal(markups[i], plain, entry[0]);
  });
});

test('the markup carries no flash, no open-entry mark and no id, whatever the live opts hold', () => {
  const changed = Object.assign({}, gov1932prev, { resources: 1, inflation: 9, sa_militancy: 0.9 });
  const opts = { last: changed, openEntry: 'defense:sa', tab: 'defense' };
  const markups = View.bodyMarkups(gov1932, gov1932prev, opts);
  // The live render does mark them with these opts, so the check is real.
  const live = View.renderTab('defense', gov1932, gov1932prev, opts) + View.renderTab('party', gov1932, gov1932prev, opts);
  assert.match(live, /aria-current="true"/);
  assert.match(live, /sc-flash/);
  for (const markup of markups) {
    assert.doesNotMatch(markup, /aria-current/);
    assert.doesNotMatch(markup, /sc-flash/);
    assert.doesNotMatch(markup, /\sid="/);
  }
  // The caller's opts are left alone.
  assert.equal(opts.last, changed);
  assert.equal(opts.openEntry, 'defense:sa');
});

test('the markups do not depend on which tab is open', () => {
  const a = View.bodyMarkups(gov1932, gov1932prev, { tab: 'party' });
  const b = View.bodyMarkups(gov1932, gov1932prev, { tab: 'state' });
  assert.deepEqual(a, b);
});

// ---- the tallest of three ----------------------------------------------------------

// A measure that reads heights from a table keyed by markup and records what
// it was asked for.
function measurer(heights) {
  const asked = [];
  const measure = (markups) => {
    asked.push(markups.slice());
    return markups.map((markup) => heights[markup]);
  };
  return { measure, asked };
}

test('the minimum is the tallest of the three heights, whichever is open', () => {
  const markups = ['party', 'defense', 'state'];
  const { measure } = measurer({ party: 136, defense: 198, state: 154.4 });
  assert.equal(View.tallestBody(markups, '300', {}, measure), 198);
  assert.equal(View.tallestBody(['a', 'b', 'c'].map((k, i) => markups[2 - i]), '300', {}, measure), 198);
  const all = measurer({ party: 224, defense: 198, state: 186.4 });
  assert.equal(View.tallestBody(markups, '300', {}, all.measure), 224);
});

test('a tab that is not the tallest leaves room: the minimum is above its own height', () => {
  const { measure } = measurer({ party: 136, defense: 198, state: 154.4 });
  const tallest = View.tallestBody(['party', 'defense', 'state'], '300', {}, measure);
  assert.ok(tallest > 136 && tallest > 154.4);
});

// ---- the cache ---------------------------------------------------------------------

test('a markup is measured once: an unchanged render asks for nothing', () => {
  const { measure, asked } = measurer({ party: 1, defense: 3, state: 2 });
  const cache = {};
  assert.equal(View.tallestBody(['party', 'defense', 'state'], '300', cache, measure), 3);
  assert.equal(View.tallestBody(['party', 'defense', 'state'], '300', cache, measure), 3);
  assert.equal(asked.length, 1);
  assert.deepEqual(asked[0], ['party', 'defense', 'state']);
});

test('only a changed markup is measured again', () => {
  const { measure, asked } = measurer({ party: 1, defense: 3, state: 2, state2: 5 });
  const cache = {};
  View.tallestBody(['party', 'defense', 'state'], '300', cache, measure);
  assert.equal(View.tallestBody(['party', 'defense', 'state2'], '300', cache, measure), 5);
  assert.deepEqual(asked[1], ['state2']);
});

test('the key includes the column width: the same markup under another scope is measured again', () => {
  const { measure, asked } = measurer({ party: 1, defense: 3, state: 2 });
  const cache = {};
  View.tallestBody(['party', 'defense', 'state'], '324.4', cache, measure);
  View.tallestBody(['party', 'defense', 'state'], '300', cache, measure);
  assert.equal(asked.length, 2);
  assert.deepEqual(asked[1], ['party', 'defense', 'state']);
  // And each scope keeps its own answer.
  View.tallestBody(['party', 'defense', 'state'], '324.4', cache, measure);
  assert.equal(asked.length, 2);
});

test('the same markup twice in one render is asked for once', () => {
  const { measure, asked } = measurer({ same: 4, other: 2 });
  assert.equal(View.tallestBody(['same', 'same', 'other'], '300', {}, measure), 4);
  assert.deepEqual(asked[0], ['same', 'other']);
});

test('the cache stays small over a long game', () => {
  const cache = {};
  const heights = {};
  for (let i = 0; i < 200; i++) heights['m' + i] = i;
  const { measure } = measurer(heights);
  for (let i = 0; i < 198; i += 3) {
    assert.equal(View.tallestBody(['m' + i, 'm' + (i + 1), 'm' + (i + 2)], '300', cache, measure), i + 2);
  }
  assert.ok(Object.keys(cache).length <= 48);
});

// ---- each height, for choosing a size ------------------------------------------------

test('bodyHeights gives every markup its own height, in order, and tallestBody is the largest', () => {
  const { measure } = measurer({ a: 3, b: 9, c: 5 });
  assert.deepEqual(View.bodyHeights(['c', 'a', 'b'], '300', {}, measure), [5, 3, 9]);
  assert.equal(View.tallestBody(['c', 'a', 'b'], '300', {}, measure), 9);
});

test('a call that fills the cache past its limit still answers for every markup, cached or not', () => {
  const heights = {};
  const markups = [];
  for (let i = 0; i < 50; i++) {
    heights['m' + i] = i + 1;
    markups.push('m' + i);
  }
  const { measure } = measurer(heights);
  const cache = {};
  // Three are cached; the other 47 together push the count past the limit.
  View.bodyHeights(markups.slice(0, 3), '300', cache, measure);
  const answered = View.bodyHeights(markups, '300', cache, measure);
  assert.deepEqual(answered, markups.map((m) => heights[m]));
});
