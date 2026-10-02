'use strict';

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

test('party tab is registered on TAB_RENDERERS', () => {
  assert.equal(typeof View.TAB_RENDERERS.party, 'function');
});

test('the party tab has no Position row or coalition line', () => {
  for (const q of [start1928, gov1932]) {
    const html = View.renderTab('party', q, q, {});
    assert.doesNotMatch(html, /sc-posline|sc-posgov|aria-current/);
    assert.doesNotMatch(html, /<div class="sc-sub">Position<\/div>/);
  }
});

test('the depth-term hooks wrap the Factions and resources labels, and no position words', () => {
  const html = View.renderTab('party', start1928, start1928, {});
  for (const slug of ['factions', 'party-resources']) {
    assert.equal((html.match(new RegExp('data-depth-term="' + slug + '"', 'g')) || []).length, 1, slug);
  }
  for (const slug of ['party-dissent', 'opposition', 'toleration', 'government', 'caretaker']) {
    assert.doesNotMatch(html, new RegExp('data-depth-term="' + slug + '"'), slug);
  }
});

test('party resources row shows the label, one lit token per resource out of max(5, resources), and the number', () => {
  // start1928 has resources: 2, so 2 of 5 tokens are lit.
  const html = View.renderTab('party', start1928, start1928, {});
  assert.match(html, /<span class="lbl sc-sub"><span data-depth-term="party-resources">Party resources<\/span><\/span>/);
  const tokens = html.match(/<span class="sc-tokens">([\s\S]*?)<\/span>/);
  assert.ok(tokens, 'no sc-tokens span found');
  const on = (tokens[1].match(/<i class="on">/g) || []).length;
  const total = (tokens[1].match(/<i/g) || []).length;
  assert.equal(on, 2);
  assert.equal(total, 5);
  assert.match(html, /<span class="val">2<\/span>/);
});

test('party resources token count grows past 5 when resources exceeds it', () => {
  const q = Object.assign({}, start1928, { resources: 7 });
  const html = View.renderTab('party', q, q, {});
  const tokens = html.match(/<span class="sc-tokens">([\s\S]*?)<\/span>/);
  const on = (tokens[1].match(/<i class="on">/g) || []).length;
  const total = (tokens[1].match(/<i/g) || []).length;
  assert.equal(on, 7);
  assert.equal(total, 7);
});

test('party resources value carries a delta (big 2, polarity 1)', () => {
  // gov1932's resources (1) fell from gov1932_prev's (3): a bad, large drop.
  const html = View.renderTab('party', gov1932, gov1932_prev, {});
  assert.match(html, /<span class="val">1<span class="sc-delta bad"[^>]*>▼▼<\/span><\/span>/);
});

test('the Party tab has no coalition pip rows; the dissent block (tab-coalition.test.js) closes it in government only', () => {
  for (const q of [start1928, gov1932]) {
    const html = View.renderTab('party', q, q, {});
    assert.doesNotMatch(html, />Coalition</);
    assert.doesNotMatch(html, />KPD partner</);
    assert.doesNotMatch(html, /sc-pips/);
  }
  assert.doesNotMatch(View.renderTab('party', start1928, start1928, {}), /sc-coalition/);
  assert.match(View.renderTab('party', gov1932, gov1932, {}), /sc-coalition/);
});

// Factions as twin bars: strength and dissent per faction.
const Model = require('../../out/html/state-column/model.js');

function frows(html) {
  return html.match(/<div class="sc-frow" [\s\S]*?<\/span><\/span><\/div>/g) || [];
}

function pct(str, prop) {
  return parseFloat(str.match(new RegExp(prop + ':([0-9.]+)%'))[1]);
}

// A row's two fills: strength first, dissent second.
function fills(row) {
  return row.match(/<span class="fill" style="[^"]*"><\/span>/g) || [];
}

test('Factions is no heading above the table: its depth term sits in the header row, once', () => {
  const html = View.renderTab('party', gov1932, gov1932, {});
  assert.doesNotMatch(html, /<div class="sc-sub"><span data-depth-term="factions">/);
  assert.doesNotMatch(html, />Factions</);
  assert.equal((html.match(/data-depth-term="factions"/g) || []).length, 1);
});

test('the Party tab has no needle gauge, skyline, rows variant or party-dissent meter', () => {
  for (const q of [start1928, gov1932]) {
    const html = View.renderTab('party', q, q, {});
    assert.doesNotMatch(html, /sc-gauge|sc-sky|sc-dmeter|sc-pdiss|sc-pdlbl|data-sc-factions|Party dissent/);
  }
});

test('the ?factions= switch is gone: the option changes nothing', () => {
  assert.equal(
    View.renderTab('party', gov1932, gov1932, { factions: 'rows' }),
    View.renderTab('party', gov1932, gov1932, {})
  );
});

test('a header row in the small-caps style reads Faction, Strength, Dissent, directly above the first row', () => {
  const html = View.renderTab('party', start1928, start1928, {});
  assert.match(
    html,
    /<div class="sc-frows"><div class="sc-frow head sc-sub"><span class="lbl"><span data-depth-term="factions">Faction<\/span><\/span><span class="fbar">Strength<\/span><span class="fbar">Dissent<\/span><\/div><div class="sc-frow" /
  );
  assert.equal((html.match(/>Strength</g) || []).length, 1, 'the Strength caption appears once');
  assert.equal((html.match(/>Dissent</g) || []).length, 1, 'the Dissent caption appears once');
});

test('one row per faction, neorevisionists only once neorevisionism is above 0', () => {
  const start = View.renderTab('party', start1928, start1928, {});
  assert.equal(frows(start).length, 4);
  assert.doesNotMatch(start, /Neorevisionists/);
  const gov = View.renderTab('party', gov1932, gov1932, {});
  assert.equal(frows(gov).length, 5);
  assert.match(gov, /<i class="sc-sw" style="background:#6d3a8c"><\/i>Neorevisionists/);
});

test('a row has swatch, name and the summary as its title', () => {
  // start1928 left: strength 15 "moderate", dissent 20 "medium".
  const left = frows(View.renderTab('party', start1928, start1928, {}))[0];
  assert.match(left, /<span class="lbl"><i class="sc-sw" style="background:#7a1010"><\/i>Left<\/span>/);
  assert.match(left, /^<div class="sc-frow" title="Left: moderate strength, medium dissent">/);
});

test('strength bar: width is strength over 0-50, in the faction colour, clamped', () => {
  // start1928 left: strength 15 -> 30%.
  const left = frows(View.renderTab('party', start1928, start1928, {}))[0];
  const strength = fills(left)[0];
  assert.ok(Math.abs(pct(strength, 'width') - 30) < 0.01);
  assert.match(strength, /background:#7a1010/);
  const q = Object.assign({}, start1928, { left_strength: 80, center_strength: 0 });
  const rows = frows(View.renderTab('party', q, q, {}));
  assert.equal(pct(fills(rows[0])[0], 'width'), 100);
  assert.equal(pct(fills(rows[1])[0], 'width'), 0);
});

test('dissent bar: width is dissent over 0-60, clamped', () => {
  // start1928 left: dissent 20 -> a third.
  const left = frows(View.renderTab('party', start1928, start1928, {}))[0];
  assert.ok(Math.abs(pct(fills(left)[1], 'width') - 20 / 60 * 100) < 0.01);
  const q = Object.assign({}, start1928, { left_dissent: 95, center_dissent: 0 });
  const rows = frows(View.renderTab('party', q, q, {}));
  assert.equal(pct(fills(rows[0])[1], 'width'), 100);
  assert.equal(pct(fills(rows[1])[1], 'width'), 0);
});

test('dissent bar colour is the dissent band', () => {
  // very low to 5, low to 15, medium to 31, high to 50, very high above.
  const cases = [[3, 'very-low'], [10, 'low'], [20, 'medium'], [40, 'high'], [55, 'very-high']];
  for (const [v, band] of cases) {
    const q = Object.assign({}, start1928, { left_dissent: v });
    const dissent = fills(frows(View.renderTab('party', q, q, {}))[0])[1];
    assert.match(dissent, new RegExp('background:var\\(--sc-dis-' + band + '\\)'), v + ' -> ' + band);
  }
});

test('every dissent band has a colour in both themes', () => {
  const css = fs.readFileSync(path.join(__dirname, '../../out/html/state-column/state-column.css'), 'utf8');
  const light = css.match(/\r?\nbody \{\r?\n(  --sc-dis-[^}]*)\}/)[1];
  const dark = css.match(/\r?\nbody\.dark-mode \{\r?\n(  --sc-dis-[^}]*)\}/)[1];
  for (const band of ['very-low', 'low', 'medium', 'high', 'very-high']) {
    assert.match(light, new RegExp('--sc-dis-' + band + ': #[0-9a-f]{6};'), 'light ' + band);
    assert.match(dark, new RegExp('--sc-dis-' + band + ': #[0-9a-f]{6};'), 'dark ' + band);
  }
});

test('the dissent track carries a tick at 30 titled "Disunity above 30"; the strength track has none', () => {
  for (const row of frows(View.renderTab('party', gov1932, gov1932, {}))) {
    const ticks = row.match(/<span class="tick" style="left:50%" title="Disunity above 30"><\/span>/g) || [];
    assert.equal(ticks.length, 1);
    // The tick sits in the second (dissent) bar cell.
    assert.ok(row.indexOf('class="tick"') > row.lastIndexOf('<span class="fbar">'));
  }
});

test('a faction whose dissent crosses a band shows the crossing after its dissent bar', () => {
  // gov1932 reformists: dissent 22 -> 34, medium -> high, a rise of 12 (big is 10).
  const html = View.renderTab('party', gov1932, gov1932_prev, {});
  const reformists = frows(html).find((r) => /Reformists/.test(r));
  assert.match(
    reformists,
    /<span class="fd"><span class="sc-delta bad cross" title="Changed this month: medium → high">▲▲<\/span><\/span><\/span><\/div>$/
  );
});

test('faction strength markers use scale strength with neutral polarity, after the strength bar', () => {
  // left 26 -> 42 crosses strong -> very strong.
  const q = Object.assign({}, gov1932, { left_strength: 42 });
  const left = frows(View.renderTab('party', q, gov1932, {}))[0];
  const strengthCell = left.slice(left.indexOf('<span class="fbar">'), left.lastIndexOf('<span class="fbar">'));
  assert.match(strengthCell, /<span class="sc-delta neutral cross" title="Changed this month: strong → very strong">▲▲<\/span>/);
});

test('unchanged factions show no markers, but keep their arrow cell so tracks stay aligned', () => {
  const html = View.renderTab('party', gov1932, gov1932, {});
  assert.doesNotMatch(html, /sc-delta/);
  assert.equal((html.match(/<span class="fd"><\/span>/g) || []).length, 10);
});
