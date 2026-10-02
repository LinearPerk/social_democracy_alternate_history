'use strict';

// The State tab: the economic readout, the history chart, the coalition rows.

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

const start1928 = loadFixture('start1928');
const gov1932 = loadFixture('gov1932');
const gov1932_prev = loadFixture('gov1932_prev');

function readout(html) {
  return (html.match(/<div class="sc-row sc-fig"[\s\S]*?<\/div>/g) || []);
}

function labels(html) {
  return readout(html).map((row) => row.match(/<span class="lbl">([^<]*)</)[1]);
}

test('the State tab is registered', () => {
  assert.equal(typeof View.TAB_RENDERERS.state, 'function');
});

test('start1928 reads inflation, growth and unemployment from the first month, no budget in opposition', () => {
  const html = View.renderTab('state', start1928, start1928, {});
  assert.deepEqual(labels(html), ['Inflation', 'Growth', 'Unemployment']);
  assert.match(html, /Inflation<\/span><span class="val"><b>2\.9%<\/b><\/span>/);
  assert.match(html, /Growth<\/span><span class="val"><b>4\.4%<\/b><\/span>/);
});

test('the unemployment figure reads 8.6% at the 1928 start and does not wait for Black Thursday', () => {
  assert.match(View.renderTab('state', start1928, start1928, {}), /Unemployment<[/]span><span class="val"><b>8[.]6%<[/]b>/);
  for (const flag of [0, 1]) {
    const q = Object.assign({}, start1928, { black_thursday_seen: flag });
    assert.deepEqual(labels(View.renderTab('state', q, q, {})), ['Inflation', 'Growth', 'Unemployment']);
  }
});

test('gov1932 adds the budget, the SPD governing', () => {
  const html = View.renderTab('state', gov1932, gov1932, {});
  assert.deepEqual(labels(html), ['Inflation', 'Growth', 'Unemployment', 'Budget']);
  assert.match(html, /Unemployment<\/span><span class="val"><b>21\.5%<\/b>/);
  assert.match(html, /Budget<\/span><span class="val"><b>3<\/b>/);
});

test('the budget shows only while the SPD governs, whatever its size', () => {
  const q = Object.assign({}, gov1932, { spd_in_government: 0, budget: 7 });
  assert.doesNotMatch(View.renderTab('state', q, q, {}), /Budget/);
});

test('a negative figure carries a true minus sign, and no figure reads -0.0', () => {
  const q = Object.assign({}, gov1932, { economic_growth: -2.34, inflation: -0.04, budget: -3 });
  const html = View.renderTab('state', q, q, {});
  assert.match(html, /Growth<\/span><span class="val"><b>\u22122\.3%<\/b>/);
  assert.match(html, /Inflation<\/span><span class="val"><b>0\.0%<\/b>/);
  assert.match(html, /Budget<\/span><span class="val"><b>\u22123<\/b>/);
});

test('the readout figures carry deltas against the month\'s baseline', () => {
  const base = Object.assign({}, gov1932, { inflation: 0, unemployed: 0, economic_growth: 0, budget: 0 });
  const html = View.renderTab('state', gov1932, base, {});
  // Inflation: neutral, a change of 0.8 is under the big threshold of 1.
  assert.match(html, /<b>0\.8%<\/b><span class="sc-delta neutral" title="Changed this month">\u25b2<\/span>/);
  // Unemployment: up is bad, 21.5 is big.
  assert.match(html, /<b>21\.5%<\/b><span class="sc-delta bad" title="Changed this month">\u25b2\u25b2<\/span>/);
  // Growth: up is good, 1.2 is big.
  assert.match(html, /<b>1\.2%<\/b><span class="sc-delta good" title="Changed this month">\u25b2\u25b2<\/span>/);
  // Budget: up is good, 3 is big (2).
  assert.match(html, /<b>3<\/b><span class="sc-delta good" title="Changed this month">\u25b2\u25b2<\/span>/);
});

test('unchanged figures carry no marker', () => {
  assert.doesNotMatch(View.renderTab('state', gov1932, gov1932, {}), /sc-delta/);
});

test('the budget row explains what a deficit does, from post_event', () => {
  assert.match(View.renderTab('state', gov1932, gov1932, {}), /title="Government budget\. At zero or below, deficit spending pushes inflation up\."/);
});

test('the economy is no longer in the Reichstag block', () => {
  assert.doesNotMatch(View.chart(gov1932, gov1932_prev, {}), /sc-economy|Inflation/);
});
