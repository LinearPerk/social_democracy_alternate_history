'use strict';

// The State tab's line chart of inflation, growth and unemployment.

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

function point(year, month, inflation, growth, unemployed, budget) {
  return { year, month, inflation, growth, unemployed, budget: budget === undefined ? 3 : budget };
}

const THREE = [
  point(1932, 6, 1, 2, 20),
  point(1932, 7, 0.9, 1.5, 21),
  point(1932, 8, 0.8, -1, 21.5),
];

// The first months of a 1928 game, unemployment at its 8.6% start.
const EARLY = [
  point(1928, 1, 2.9, 4.4, 8.6),
  point(1928, 2, 2.8, 4, 8.6),
  point(1928, 3, 2.7, 3.5, 8.5),
];

// Small figures everywhere and a dip below zero: the axis runs -1 to 2.
const LOW = [
  point(1928, 6, 1, 2, 0.5),
  point(1928, 7, 0.9, 1.5, 0.6),
  point(1928, 8, 0.8, -1, 0.7),
];

function paths(svg) {
  const out = {};
  for (const m of svg.matchAll(/<path class="sc-ln (\w+)" d="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

test('the chart draws a line per series, its path data a pure function of the history', () => {
  // The axis runs from -1 to 22 (plot area y 7 to 79, x 28 to 294), so a value
  // v sits at y = 79 - (v + 1) / 23 * 72.
  const svg = View.historyChart(THREE);
  assert.deepEqual(paths(svg), {
    infl: 'M28 72.7L161 73.1L294 73.4',
    growth: 'M28 69.6L161 71.2L294 79',
    unemp: 'M28 13.3L161 10.1L294 8.6',
  });
  assert.equal(View.historyChart(THREE), svg);
});

test('the chart is drawn in a 300 by 94 box, about 100px tall at the width of the column', () => {
  assert.match(View.historyChart(THREE), /<svg class="sc-econ-svg" viewBox="0 0 300 94"/);
});

test('unemployment is drawn from the first month of a 1928 game, on the same axis as the others', () => {
  const svg = View.historyChart(EARLY);
  assert.deepEqual(Object.keys(paths(svg)), ['infl', 'growth', 'unemp']);
  // No quality gates the line: the State tab draws it for the opening game.
  const q = Object.assign({}, start1928, { sc_history: JSON.stringify(EARLY) });
  assert.match(View.renderTab('state', q, q, {}), /<path class="sc-ln unemp"/);
});

test('the axis has a firm zero line, and labels in percent with a true minus sign', () => {
  const svg = View.historyChart(LOW);
  assert.equal((svg.match(/class="sc-zero"/g) || []).length, 1);
  assert.match(svg, />2%</);
  assert.match(svg, />0%</);
  assert.match(svg, />−1%</);
});

test('a bottom label too close to the zero label is left off, its line kept', () => {
  const svg = View.historyChart([point(1932, 6, 0.2, -0.3, 30), point(1932, 7, 0.3, -0.1, 31)]);
  assert.equal((svg.match(/class="sc-grid"/g) || []).length, 2);
  assert.doesNotMatch(svg, /−1%/);
});

test('months label the x axis at its ends, with a faint line at each January between', () => {
  const long = [];
  for (let i = 0; i < 30; i++) {
    const t = 1928 * 12 + i;
    long.push(point(Math.floor(t / 12), (t % 12) + 1, 2, 3, 8));
  }
  const svg = View.historyChart(long);
  assert.match(svg, /text-anchor="start">Jan ’28</);
  assert.match(svg, /text-anchor="end">Jun ’30</);
  // Jan 1929 and Jan 1930.
  assert.equal((svg.match(/class="sc-yr"/g) || []).length, 2);
});

test('with one month the points that exist are drawn, no line', () => {
  const svg = View.historyChart([point(1928, 1, 2.9, 4.4, 8.6)]);
  assert.equal((svg.match(/<path/g) || []).length, 0);
  assert.equal((svg.match(/<circle/g) || []).length, 3);
  assert.match(svg, /<title>Inflation 2\.9%, Jan ’28<\/title>/);
  assert.match(svg, /<title>Unemployment 8\.6%, Jan ’28<\/title>/);
});

test('with two or three months every point is marked; from four on, only the latest', () => {
  assert.equal((View.historyChart(THREE).match(/<circle/g) || []).length, 9);
  const four = THREE.concat([point(1932, 9, 0.7, 0, 22)]);
  assert.equal((View.historyChart(four).match(/<circle/g) || []).length, 3);
});

test('a skipped month leaves a gap: months are placed by date', () => {
  const svg = View.historyChart([point(1932, 1, 1, 1, 1), point(1932, 2, 1, 1, 1), point(1932, 5, 1, 1, 1)]);
  // Jan to May is four steps; February sits a quarter of the way along (28 + 66.5).
  assert.match(paths(svg).infl, /^M28 [\d.]+L94\.5 /);
});

test('an empty history draws no chart', () => {
  assert.equal(View.historyChart([]), '');
});

function legend(svg) {
  const g = svg.match(/<g class="sc-legend">[\s\S]*?<\/g>/);
  assert.ok(g, 'no legend');
  return [...g[0].matchAll(/class="sc-ax sc-key"[^>]*>([^<]+)</g)].map((m) => m[1]);
}

test('the tab draws the chart inline, from q.sc_history, and no chart before there is any history', () => {
  const none = View.renderTab('state', gov1932, gov1932, {});
  assert.doesNotMatch(none, /sc-econ-svg/);
  const q = Object.assign({}, gov1932, { sc_history: JSON.stringify(THREE) });
  const html = View.renderTab('state', q, q, {});
  assert.match(html, /<svg class="sc-econ-svg"/);
  assert.doesNotMatch(html, /<script|d3\./);
});

test('the legend names the lines drawn, in the line colours', () => {
  assert.deepEqual(legend(View.historyChart(THREE)), ['Inflation', 'Growth', 'Unemployment']);
  assert.deepEqual(legend(View.historyChart(EARLY)), ['Inflation', 'Growth', 'Unemployment']);
  const g = View.historyChart(THREE).match(/<g class="sc-legend">[\s\S]*?<\/g>/)[0];
  for (const cls of ['infl', 'growth', 'unemp']) assert.match(g, new RegExp('<line class="sc-ln ' + cls + '"'));
});

test('the legend sits inside the drawing, clear of the month labels at both ends', () => {
  const svg = View.historyChart(THREE);
  const xs = [...svg.match(/<g class="sc-legend">[\s\S]*?<\/g>/)[0].matchAll(/x1?="([\d.]+)"/g)].map((m) => Number(m[1]));
  assert.ok(Math.min(...xs) > 64, 'legend starts at ' + Math.min(...xs));
  assert.ok(Math.max(...xs) < 236 + 4.4 * 12, 'legend runs to ' + Math.max(...xs));
});

test('the chart sits under the readout rows', () => {
  const q = Object.assign({}, gov1932, { sc_history: JSON.stringify(THREE) });
  const html = View.renderTab('state', q, q, {});
  assert.ok(html.lastIndexOf('sc-fig') < html.indexOf('sc-econ-chart'));
});

test('the three chart colours are tokens defined for both themes', () => {
  const css = fs.readFileSync(path.join(__dirname, '../../out/html/state-column/state-column.css'), 'utf8');
  const light = css.match(/\r?\nbody \{\r?\n(  --sc-ec-[^}]*)\}/)[1];
  const dark = css.match(/\r?\nbody\.dark-mode \{\r?\n(  --sc-ec-[^}]*)\}/)[1];
  for (const name of ['infl', 'growth', 'unemp']) {
    assert.match(light, new RegExp('--sc-ec-' + name + ': #[0-9a-f]{6};'), 'light ' + name);
    assert.match(dark, new RegExp('--sc-ec-' + name + ': #[0-9a-f]{6};'), 'dark ' + name);
  }
});
