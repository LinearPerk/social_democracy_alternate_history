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
const crisis1930 = loadFixture('crisis1930');
const crisis1930_prev = loadFixture('crisis1930_prev');

function rowsOf(html) {
  return html.match(/<button type="button" class="sc-drow"[^>]*>.*?<\/button>/gs) || [];
}

function rowFor(html, id) {
  return rowsOf(html).find((r) => r.includes('data-depth-entry="defense:' + id + '"'));
}

function entryKeys(html) {
  return rowsOf(html).map((r) => r.match(/data-depth-entry="defense:([a-z_]+)"/)[1]);
}

test('the list has two groups, Paramilitaries then State forces', () => {
  const html = View.renderTab('defense', start1928, start1928, {});
  const heads = [...html.matchAll(/<div class="sc-sub sc-dgroup">([^<]*)<\/div>/g)].map((m) => m[1]);
  assert.deepEqual(heads, ['Paramilitaries', 'State forces']);
});

test('the paramilitaries list in order, then the state forces', () => {
  const html = View.renderTab('defense', crisis1930, crisis1930_prev, {});
  assert.deepEqual(entryKeys(html), ['rb', 'rfb', 'sh', 'sa', 'reichswehr', 'prussian_police']);
});

test('the interior police row appears only once the SPD is in government', () => {
  assert.deepEqual(
    entryKeys(View.renderTab('defense', gov1932, gov1932_prev, {})),
    ['rb', 'rfb', 'sh', 'sa', 'reichswehr', 'prussian_police', 'interior_police']
  );
  assert.ok(!entryKeys(View.renderTab('defense', crisis1930, crisis1930_prev, {})).includes('interior_police'));
});

test('every row is a button carrying its entry key, and no balance bar, pips or axis are left', () => {
  FIXTURES().forEach(([name, q, base]) => {
    const html = View.renderTab('defense', q, base, {});
    assert.ok(rowsOf(html).length >= 6, `${name}: rows`);
    assert.doesNotMatch(html, /sc-stack|sc-pips|sc-div|axis|sc-symrow/, `${name}: old panel pieces`);
  });
});

function FIXTURES() {
  return [
    ['start1928', start1928, start1928],
    ['crisis1930', crisis1930, crisis1930_prev],
    ['gov1932', gov1932, gov1932_prev]
  ];
}

test('a paramilitary row shows its militancy band word, coloured by severity', () => {
  // crisis1930: sa_militancy 0.9 is the "High" band (index 5), red.
  const sa = rowFor(View.renderTab('defense', crisis1930, crisis1930_prev, {}), 'sa');
  assert.match(sa, /<span class="st" style="color:var\(--sc-dis-high\)">high/);
  // start1928: rb_militancy 0.01 is "Nonexistent" (index 0), calm grey.
  const rb = rowFor(View.renderTab('defense', start1928, start1928, {}), 'rb');
  assert.match(rb, /style="color:var\(--sc-dis-very-low\)">nonexistent/);
});

test('a state-force row shows its loyalty band word; the disloyal bands are the red ones', () => {
  // crisis1930: reichswehr_loyalty 0.24 is "generally disloyal", prussian
  // police 0.6 is "mostly loyal".
  const html = View.renderTab('defense', crisis1930, crisis1930_prev, {});
  assert.match(rowFor(html, 'reichswehr'), /style="color:var\(--sc-dis-high\)">generally disloyal/);
  assert.match(rowFor(html, 'prussian_police'), /style="color:var\(--sc-dis-low\)">mostly loyal/);
});

test('a change in strength since the month began shows an arrow on the number', () => {
  // gov1932 against its previous month: sa_strength rose 400 to 420. A rise in
  // the SA is bad news, so the arrow reads as bad.
  const html = View.renderTab('defense', gov1932, gov1932_prev, {});
  const sa = rowFor(html, 'sa');
  assert.match(sa, /<span class="sz-n[^>]*>[^<]*<span class="sc-delta bad[^>]*>▲/);
  assert.doesNotMatch(rowFor(html, 'rb'), /sc-delta/);
  assert.doesNotMatch(rowFor(View.renderTab('defense', gov1932, gov1932, {}), 'sa'), /sc-delta/);
  // The band word carries no arrow of its own.
  assert.doesNotMatch(sa, /<span class="st"[^>]*>[^<]*<span/);
});

function barOf(row) {
  const fill = row.match(/<span class="sz-f" style="width:([\d.]+)%;background:var\(--sc-dis-([a-z-]+)\)">/);
  const label = row.match(/<span class="sz-n( in)?"[^>]*>([^<]+)/);
  return { pct: parseFloat(fill[1]), sev: fill[2], inside: !!label[1], text: label[2] };
}

test('bar length is the square root of strength over the largest strength shown', () => {
  // start1928: rb 2000, sh 500, sa 80, rfb 130, reichswehr 100, prussian 90.
  const html = View.renderTab('defense', start1928, start1928, {});
  const pct = (id) => barOf(rowFor(html, id)).pct;
  assert.equal(pct('rb'), 100);
  assert.equal(pct('sh'), 50);
  assert.ok(Math.abs(pct('sa') - 20) < 0.1, 'SA is about a fifth: ' + pct('sa'));
  assert.ok(Math.abs(pct('reichswehr') - 22.4) < 0.1, 'state forces share the scale');
  assert.ok(pct('sa') < pct('rfb') && pct('rfb') < pct('sh'), 'order is kept');
});

test('the largest organisation shown fills the track, even when it is not the Reichsbanner', () => {
  const q = Object.assign({}, start1928, { rb_strength: 100, sh_strength: 400 });
  const html = View.renderTab('defense', q, q, {});
  assert.equal(barOf(rowFor(html, 'sh')).pct, 100);
  assert.equal(barOf(rowFor(html, 'rb')).pct, 50);
});

test('the interior police bar joins the scale once the SPD is in government', () => {
  const html = View.renderTab('defense', gov1932, gov1932_prev, {});
  // 50 of rb's 2600: sqrt(50/2600) is 13.9%.
  assert.ok(Math.abs(barOf(rowFor(html, 'interior_police')).pct - 13.9) < 0.1);
});

test('a row has two lines: symbol, name, band word and chevron, then the size bar', () => {
  const html = View.renderTab('defense', start1928, start1928, {});
  rowsOf(html).forEach((row) => {
    const order = [...row.matchAll(/<span class="(ico|nm|st|chev|sz)[ "]/g)].map((m) => m[1]);
    assert.deepEqual(order, ['ico', 'nm', 'st', 'chev', 'sz']);
  });
});

test('the number sits inside a bar that fills half the track or more, after it otherwise', () => {
  // start1928: rb 100%, sh 50%, sa 20%, rfb 36%, reichswehr 22%, prussian 21%.
  const html = View.renderTab('defense', start1928, start1928, {});
  const inside = (id) => barOf(rowFor(html, id)).inside;
  assert.deepEqual(['rb', 'sh', 'sa', 'rfb', 'reichswehr', 'prussian_police'].map(inside),
    [true, true, false, false, false, false]);
  // An inside number is placed from the fill's right end, an outside one from its left.
  assert.match(rowFor(html, 'sh'), /<span class="sz-n in" style="right:calc\(50% \+ 3px\)">/);
  assert.match(rowFor(html, 'sa'), /<span class="sz-n" style="left:calc\(20% \+ 3px\)">/);
});

test('the number formats as millions, thousands and rounded thousands, inside or after the bar', () => {
  const html = View.renderTab('defense', start1928, start1928, {});
  assert.deepEqual(barOf(rowFor(html, 'rb')), { pct: 100, sev: 'very-low', inside: true, text: '2.0m' });
  assert.equal(barOf(rowFor(html, 'sh')).text, '500k');
  assert.equal(barOf(rowFor(html, 'sh')).inside, true);
  assert.equal(barOf(rowFor(html, 'sa')).text, '80k');
  assert.equal(barOf(rowFor(html, 'sa')).inside, false);
  // Strengths carry decimals after the game's percentage cuts.
  const q = Object.assign({}, start1928, { sa_strength: 55.66 });
  assert.equal(barOf(rowFor(View.renderTab('defense', q, q, {}), 'sa')).text, '56k');
});

test('the bar takes the band colour: militancy for the street, loyalty for state forces', () => {
  // crisis1930: sa_militancy 0.9 is High (red); reichswehr_loyalty 0.24 is
  // generally disloyal (red); prussian police 0.6 is mostly loyal (calm).
  const html = View.renderTab('defense', crisis1930, crisis1930_prev, {});
  assert.equal(barOf(rowFor(html, 'sa')).sev, 'high');
  assert.equal(barOf(rowFor(html, 'reichswehr')).sev, 'high');
  assert.equal(barOf(rowFor(html, 'prussian_police')).sev, 'low');
  // The bar's colour and the band word's are the same token.
  const sa = rowFor(html, 'sa');
  assert.match(sa, /<span class="st" style="color:var\(--sc-dis-high\)">/);
});

test('Model.sizeFraction and formatMembers handle zero and bad input', () => {
  const Model = require('../../out/html/state-column/model.js');
  assert.equal(Model.sizeFraction(0, 2000), 0);
  assert.equal(Model.sizeFraction(50, 0), 0);
  assert.equal(Model.sizeFraction(undefined, 2000), 0);
  assert.equal(Model.sizeFraction(2000, 2000), 1);
  assert.equal(Model.sizeFraction(500, 2000), 0.5);
  assert.equal(Model.formatMembers(1949.6), '1.9m');
  assert.equal(Model.formatMembers(999.6), '1.0m');
  assert.equal(Model.formatMembers(0), '0k');
});

test('the open entry\'s row is marked aria-current, and only that one', () => {
  const html = View.renderTab('defense', crisis1930, crisis1930_prev, { openEntry: 'defense:sa' });
  assert.match(rowFor(html, 'sa'), /aria-current="true"/);
  assert.equal((html.match(/aria-current/g) || []).length, 1);
  assert.doesNotMatch(View.renderTab('defense', crisis1930, crisis1930_prev, {}), /aria-current/);
});

test('period symbols fill the icon cell when asked for, plain swatches otherwise', () => {
  const period = View.renderTab('defense', crisis1930, crisis1930_prev, { symbols: 'period' });
  assert.match(rowFor(period, 'sa'), /<img src="state-column\/symbols\/SA-Logo\.svg"/);
  const badges = View.renderTab('defense', crisis1930, crisis1930_prev, { symbols: 'badges' });
  assert.doesNotMatch(badges, /<img/);
  assert.match(rowFor(badges, 'sa'), /class="sc-sw"/);
});

test('the full state column has no Details (text view) button', () => {
  const html = View.render(crisis1930, crisis1930_prev, { tab: 'defense' });
  assert.doesNotMatch(html, /Details|sc-details|data-sc-details/);
});
