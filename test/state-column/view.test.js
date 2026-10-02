'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const View = require('../../out/html/state-column/view.js');
const Model = require('../../out/html/state-column/model.js');

const fixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'start1928.json'), 'utf8')
);

function loadFixture(name) {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures', name + '.json'), 'utf8')
  );
}

const gov1932 = loadFixture('gov1932');
const gov1932_prev = loadFixture('gov1932_prev');
const crisis1930 = loadFixture('crisis1930');
const crisis1930_prev = loadFixture('crisis1930_prev');

test('render produces the state column container', () => {
  const html = View.render(fixture, fixture, {});
  assert.match(html, /id="state-column"/);
});

test('the column carries sc-gov while the SPD is in government, and not before', () => {
  assert.match(View.render(gov1932, gov1932_prev, {}), /<div id="state-column" class="sc-gov">/);
  assert.match(View.render(fixture, fixture, {}), /<div id="state-column">/);
});

test('render has exactly three tabs, Party, Defense and State, in that order, and no Polls tab', () => {
  const html = View.render(fixture, fixture, {});
  const keys = [...html.matchAll(/data-sc-tab="(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(keys, ['party', 'defense', 'state']);
  assert.match(html, /data-sc-tab="party">Party</);
  assert.match(html, /data-sc-tab="defense">Defense</);
  assert.match(html, /data-sc-tab="state">State</);
});

test('a saved tab that no longer exists (polls, anything else) falls back to the Party tab', () => {
  for (const tab of ['polls', 'economy', '', undefined]) {
    const html = View.render(fixture, fixture, { tab });
    const active = html.match(/<button[^>]*data-sc-tab="party"[^>]*>/);
    assert.match(active[0], /class="sc-tab on"/, `saved tab ${tab}`);
    assert.equal((html.match(/class="sc-tab on"/g) || []).length, 1);
  }
});

test('opts.tab marks the matching tab button active, others not', () => {
  const html = View.render(fixture, fixture, { tab: 'defense' });

  const active = html.match(/<button[^>]*data-sc-tab="defense"[^>]*>/);
  assert.ok(active, 'defense tab button not found');
  assert.match(active[0], /class="sc-tab on"/);

  const inactive = html.match(/<button[^>]*data-sc-tab="party"[^>]*>/);
  assert.ok(inactive, 'party tab button not found');
  assert.doesNotMatch(inactive[0], /\bon\b/);
});

test('opts.tab defaults to party when not given', () => {
  const html = View.render(fixture, fixture, {});
  const active = html.match(/<button[^>]*data-sc-tab="party"[^>]*>/);
  assert.ok(active, 'party tab button not found');
  assert.match(active[0], /class="sc-tab on"/);
});

test('renderTab returns an empty string for a tab with no registered renderer', () => {
  assert.equal(View.renderTab('no-such-tab', fixture, fixture, {}), '');
});

// Put back a tab registration a test overrode, or remove one it added.
function restore(table, key, value) {
  if (value === undefined) delete table[key]; else table[key] = value;
}

test('renderTab returns the registered renderer\'s output for its tab', () => {
  const saved = View.TAB_RENDERERS.party;
  View.TAB_RENDERERS.party = (q, base, opts) => 'spd:' + q.year + ':' + opts.tab;
  try {
    assert.equal(View.renderTab('party', fixture, fixture, { tab: 'party' }), 'spd:1928:party');
    assert.equal(View.renderTab('no-such-tab', fixture, fixture, {}), '');
  } finally {
    restore(View.TAB_RENDERERS, 'party', saved);
  }
});

test('renderTabBar uses a registered label for its tab, escaped', () => {
  const savedLabel = View.TAB_LABELS.defense;
  View.TAB_LABELS.defense = () => 'Defense & Order';
  try {
    const html = View.render(fixture, fixture, {});
    assert.match(html, /data-sc-tab="defense">Defense &amp; Order<\/button>/);
  } finally {
    restore(View.TAB_LABELS, 'defense', savedLabel);
  }
});

test('the tab bar reads the labels and nothing after them: no peek text', () => {
  const html = View.render(gov1932, gov1932_prev, {});
  const bar = html.match(/<div class="sc-tabs">[\s\S]*?<\/div>/)[0];
  assert.doesNotMatch(bar, /sc-peek|<small/);
  assert.equal(bar.replace(/<[^>]+>/g, ''), 'PartyDefenseState');
  assert.equal(View.TAB_PEEKS, undefined);
});

test('there is no polls tab renderer, and no gauge', () => {
  assert.equal(View.TAB_RENDERERS.polls, undefined);
  assert.equal(View.gauge, undefined);
});

test('sub wraps text in a heading div', () => {
  assert.equal(View.sub('Government'), '<div class="sc-sub">Government</div>');
});

test('note wraps text in a note div', () => {
  assert.equal(View.note('will not work with us'), '<div class="sc-note">will not work with us</div>');
});

test('swatch renders a coloured square', () => {
  assert.equal(View.swatch('#8B0000'), '<i class="sc-sw" style="background:#8B0000"></i>');
});

test('pips lights the first n of max and outlines the marked pip', () => {
  const html = View.pips(2, 5, 'dissent', 3);
  assert.equal(
    html,
    '<span class="sc-pips dissent"><i class="on"></i><i class="on"></i><i class="mark"></i><i></i><i></i></span>'
  );
});

test('pips with no mark leaves every unlit pip plain', () => {
  const html = View.pips(1, 2, '', 0);
  assert.equal(html, '<span class="sc-pips"><i class="on"></i><i></i></span>');
});

test('stack renders one span per segment with width, colour, title and text', () => {
  const html = View.stack([
    { width: 30, color: '#8B0000', title: 'KPD: strong', text: 'K' },
    { width: 70, color: '#E3000F' }
  ], 'thin');
  assert.equal(
    html,
    '<div class="sc-stack thin">' +
      '<span style="width:30%;background:#8B0000" title="KPD: strong">K</span>' +
      '<span style="width:70%;background:#E3000F"></span>' +
      '</div>'
  );
});

test('bar fills proportionally and places ticks at the given marks', () => {
  const html = View.bar(25, 100, '#3F7BC1', [50]);
  assert.equal(
    html,
    '<span class="sc-bar"><span class="fill" style="width:25%;background:#3F7BC1"></span>' +
      '<i class="sc-tick" style="left:50%"></i></span>'
  );
});

test('bar clamps v to the 0..max range', () => {
  assert.match(View.bar(-5, 100, '#000', []), /width:0%/);
  assert.match(View.bar(500, 100, '#000', []), /width:100%/);
});

test('delta returns an empty string when the value has not changed', () => {
  // crisis1930's reformist_dissent (9) is unchanged from crisis1930_prev.
  const html = View.delta(crisis1930, crisis1930_prev, 'reformist_dissent',
    { scale: 'dissent', big: 10, polarity: -1 });
  assert.equal(html, '');
});

test('delta marks a band crossing as good with a single arrow below big', () => {
  // gov1932's kpd_relation (56) crosses neutral -> warm from
  // gov1932_prev (48); the rise of 8 is below the big threshold of 10.
  const html = View.delta(gov1932, gov1932_prev, 'kpd_relation',
    { scale: 'relationships', big: 10, polarity: 1 });
  assert.match(html, /class="sc-delta good cross"/);
  assert.match(html, /title="Changed this month: neutral → warm"/);
  assert.match(html, />▲<\/span>$/);
});

test('delta marks a bad change with a double arrow at or above big', () => {
  // gov1932's reformist_dissent (34) rises 12 from gov1932_prev (22),
  // at or above the big threshold of 10; polarity -1 makes a rise bad.
  const html = View.delta(gov1932, gov1932_prev, 'reformist_dissent',
    { big: 10, polarity: -1 });
  assert.match(html, /class="sc-delta bad"/);
  assert.doesNotMatch(html, /cross/);
  assert.match(html, />▲▲<\/span>$/);
});

test('delta pulses only when the last render differs from the current value', () => {
  const spec = { scale: 'relationships', big: 10, polarity: 1 };

  const changedSinceLast = View.delta(gov1932, gov1932_prev, 'kpd_relation', spec,
    { kpd_relation: 40 });
  assert.match(changedSinceLast, /\bpulse\b/);

  const unchangedSinceLast = View.delta(gov1932, gov1932_prev, 'kpd_relation', spec,
    { kpd_relation: 56 });
  assert.doesNotMatch(unchangedSinceLast, /\bpulse\b/);

  const noLast = View.delta(gov1932, gov1932_prev, 'kpd_relation', spec);
  assert.doesNotMatch(noLast, /\bpulse\b/);
});

test('badge renders a period symbol image when a party has one and symbols is period', () => {
  const html = View.badge({ year: 1930, month: 1 }, 'spd', 'small', { symbols: 'period' });
  assert.match(html, /^<span class="sc-badge sc-sym"/);
  assert.match(html, /<img src="state-column\/symbols\/SPD_monogram_recreation\.svg" alt="">/);
});

test('badge renders a colour square with the list number when symbols is badges', () => {
  const html = View.badge({ year: 1930, month: 1 }, 'spd', 'small', { symbols: 'badges' });
  assert.doesNotMatch(html, /sc-sym/);
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /background:#E3000F/);
  assert.match(html, />1<\/span>$/);
});

test('badge falls back to the colour square when symbols is period but the party has no symbol', () => {
  const html = View.badge({ year: 1930, month: 1 }, 'sapd', 'small', { symbols: 'period' });
  assert.doesNotMatch(html, /sc-sym/);
  assert.doesNotMatch(html, /<img/);
  assert.match(html, />·<\/span>$/);
});

test('badge uses dark text for a lightBg party and shows the big size class', () => {
  const html = View.badge({ year: 1930, month: 1 }, 'ddp', 'big', { symbols: 'badges' });
  assert.match(html, /class="sc-badge big"/);
  assert.match(html, /color:#222/);
});

test('badge title includes the German and English names, with the list number', () => {
  const html = View.badge({ year: 1930, month: 1 }, 'spd', 'small', { symbols: 'badges' });
  assert.match(
    html,
    /title="Sozialdemokratische Partei Deutschlands \(Social Democratic Party of Germany\) · Liste 1"/
  );
});

test('badge title omits the list part when the party has no list number', () => {
  const html = View.badge({ year: 1930, month: 1 }, 'sapd', 'small', { symbols: 'badges' });
  assert.match(
    html,
    /title="Sozialistische Arbeiterpartei Deutschlands \(Socialist Workers' Party of Germany\)"/
  );
});

test('badge with a symbol carries a data-fallback attribute holding the plain badge markup', () => {
  const html = View.badge({ year: 1930, month: 1 }, 'spd', 'small', { symbols: 'period' });
  const match = html.match(/data-fallback="([^"]*)"/);
  assert.ok(match, 'no data-fallback attribute found');
  const fallback = match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  assert.doesNotMatch(fallback, /sc-sym/);
  assert.match(fallback, /background:#E3000F/);
  assert.match(fallback, />1<\/span>$/);
});

function circleCount(html) {
  return (html.match(/<circle/g) || []).length;
}

test('chart draws exactly one seat circle per house seat', () => {
  // start1928 is January 1928, before the May election: house is the 1924
  // election's 493, not 1928's 491.
  assert.equal(circleCount(View.chart(fixture, fixture, {})), 493);
  assert.equal(circleCount(View.chart(crisis1930, crisis1930, {})), 577);
  assert.equal(circleCount(View.chart(gov1932, gov1932, {})), 608);
});

test('chart dims every seat outside the Popular Front for gov1932', () => {
  // 608 seats total, 352 held by the Popular Front (worked by hand from
  // gov1932's shares): the other 256 should be dimmed.
  const html = View.chart(gov1932, gov1932, {});
  const dimmed = (html.match(/opacity="0.28"/g) || []).length;
  assert.equal(dimmed, 608 - 352);
});

test('chart government bar shows the government name, the majority fraction, and a checkmark at or above it', () => {
  // Worked by hand: the Popular Front (spd+kpd+sapd+z+ddp) holds 352 of
  // gov1932's 608 seats; majority is 305.
  const html = View.chart(gov1932, gov1932, {});
  assert.match(html, /<span class="pos"><span data-depth-term="government">Government<\/span><\/span><span class="cab"> · Popular Front<\/span>/);
  assert.match(html, /352 \/ 305 ✓/);
});

test('chart government bar shows Toleration and the chancellor\'s cabinet, with no majority suffix, when the SPD is not in government', () => {
  const html = View.chart(crisis1930, crisis1930, {});
  assert.match(html, /<span class="pos"><span data-depth-term="toleration">Toleration<\/span><\/span><span class="cab"> · (?:<span class="sc-badge[^]*?<\/span>)?Br[^<]*ning cabinet<\/span>/);
  assert.doesNotMatch(html, /✓|short/);
});

test('chart government bar shows Opposition and the chancellor\'s cabinet when neither in government nor tolerating', () => {
  const html = View.chart(fixture, fixture, {});
  assert.match(html, /<span class="pos"><span data-depth-term="opposition">Opposition<\/span><\/span><span class="cab"> · (?:<span class="sc-badge[^]*?<\/span>)?Marx cabinet<\/span>/);
});

test('chart government bar drops the cabinet part when there is no chancellor', () => {
  const q = Object.assign({}, fixture, { chancellor: '' });
  const html = View.chart(q, q, {});
  assert.match(html, /<b><span class="pos"><span data-depth-term="opposition">Opposition<\/span><\/span><\/b>/);
});

test('chart government bar names the coalition or chancellor for a caretaker government', () => {
  const inCoalition = Object.assign({}, gov1932, { spd_caretaker: 1 });
  assert.match(View.chart(inCoalition, inCoalition, {}), /<span class="pos"><span data-depth-term="caretaker">Caretaker<\/span><\/span><span class="cab"> · Popular Front<\/span>/);
  const outOfGov = Object.assign({}, fixture, { spd_caretaker: 1 });
  assert.match(View.chart(outOfGov, outOfGov, {}), /<span class="pos"><span data-depth-term="caretaker">Caretaker<\/span><\/span><span class="cab"> · (?:<span class="sc-badge[^]*?<\/span>)?Marx cabinet<\/span>/);
});

test('the dashboard chart leaves the majority out of the centre; the government line carries it', () => {
  // Majority is half the house plus one: 493 seats -> 247, 608 -> 305.
  const start = View.chart(fixture, fixture, {});
  assert.doesNotMatch(start, /for majority/);
  assert.doesNotMatch(start, /sc-majlbl/);
  assert.match(start, / \/ 247</);
  const lit = View.chart(gov1932, gov1932, { highlight: ['spd', 'kpd'] });
  assert.doesNotMatch(lit, /for majority/);
  assert.match(lit, / \/ 305 /);
});

test('the hemicycle on its own keeps the majority line in the centre', () => {
  const sc = View.seatCounts(fixture, {});
  const all = Model.PARTIES.map((p) => p.id);
  assert.match(View.hemicycle(fixture, sc.counts, sc.house, all), /class="sc-houselbl sc-majlbl">247 for majority<[/]text>/);
  const sc32 = View.seatCounts(gov1932, {});
  assert.match(View.hemicycle(gov1932, sc32.counts, sc32.house, all), />305 for majority<[/]text>/);
});

test('the state bar omits the seats/polls toggle in historical mode', () => {
  const historical = Object.assign({}, gov1932, { historical_mode: 1 });
  const html = View.stateBar(historical, {});
  assert.match(html, />Reichstag<\/button>/);
  assert.doesNotMatch(html, /data-sc-chart-source/);
  assert.doesNotMatch(html, />Seats<\/button>/);
  assert.doesNotMatch(html, />Polls<\/button>/);
});

test('the state bar shows the seats/polls toggle outside historical mode', () => {
  const html = View.stateBar(gov1932, {});
  assert.match(html, />Reichstag<\/button>/);
  assert.match(html, /data-sc-chart-source="seats"[^>]*>Seats<\/button>/);
  assert.match(html, /data-sc-chart-source="polls"[^>]*>Polls<\/button>/);
});

test('the state bar title is a button that opens the Reichstag entry', () => {
  const html = View.stateBar(gov1932, {});
  assert.match(html, /<button type="button" class="sc-bar-title" data-sc-bar-open title="Coalitions and the majority">Reichstag<\/button>/);
  // The title comes before the toggle, which is not part of it.
  assert.ok(html.indexOf('sc-bar-title') < html.indexOf('data-sc-chart-toggle'));
});

test('the state bar marks the open source', () => {
  assert.match(View.stateBar(gov1932, { chart: 'polls' }), /class="on" data-sc-chart-source="polls"/);
  assert.match(View.stateBar(gov1932, {}), /class="on" data-sc-chart-source="seats"/);
});

test('the column has no title row or toggle of its own: the bar over it carries both', () => {
  const html = View.render(gov1932, gov1932, {});
  assert.doesNotMatch(html, /sc-title/);
  assert.doesNotMatch(html, /data-sc-chart-toggle/);
  assert.doesNotMatch(html, /data-sc-chart-source/);
  assert.doesNotMatch(html, />Reichstag<\/button>/);
});

test('chart with source polls changes the seat counts from source seats', () => {
  // Worked by hand from crisis1930's shares: nsdap gets 104 seats from
  // votes ('_r') but 127 from polls ('_votes').
  const seats = View.chart(crisis1930, crisis1930, { chart: 'seats' });
  const polls = View.chart(crisis1930, crisis1930, { chart: 'polls' });
  assert.match(seats, /<title>NSDAP: 104 seats<\/title>/);
  assert.match(polls, /<title>NSDAP: 127 seats<\/title>/);
});

test('chart falls back to seats and hides the toggle when no poll data exists yet', () => {
  // In a live game, *_votes qualities don't exist until post_event first
  // runs at the end of month one, so seatShares(q, 'polls') sums to 0.
  const noPolls = Object.assign({}, fixture);
  for (const key of Object.keys(noPolls)) {
    if (key.endsWith('_votes')) {
      delete noPolls[key];
    }
  }
  const html = View.chart(noPolls, noPolls, { chart: 'polls' });
  assert.equal(circleCount(html), 493);
  assert.doesNotMatch(html, /data-sc-chart-source/);
});

test('the hemicycle is an eighth shorter than the old 300 x 156 drawing, its arc in the same shape', () => {
  const html = View.chart(fixture, fixture, {});
  const box = html.match(/<svg class="sc-hemi[^"]*" viewBox="0 0 ([0-9.]+) ([0-9.]+)"/);
  assert.ok(box, 'the chart draws a hemicycle');
  const [w, h] = [Number(box[1]), Number(box[2])];
  assert.equal(w, 262.5);
  // 7/8 of the old 300 x 156 drawing, less a few units: the half-width of the
  // arc plus its 6-unit margin.
  assert.equal(h, w / 2 + 6);
  assert.ok(h < 156 * 7 / 8 + 1, `drawing is ${h} units tall`);
  // Every dot sits inside the drawing.
  for (const m of html.matchAll(/<circle cx="([0-9.]+)" cy="([0-9.]+)" r="([0-9.]+)"/g)) {
    const [cx, cy, r] = [Number(m[1]), Number(m[2]), Number(m[3])];
    assert.ok(cx - r >= 0 && cx + r <= w && cy - r >= 0 && cy + r <= h, `dot at ${cx},${cy} leaves the drawing`);
  }
});

test('the last centre line keeps room below its baseline inside the drawing', () => {
  const sc = View.seatCounts(fixture, {});
  const full = View.hemicycle(fixture, sc.counts, sc.house, Model.PARTIES.map((p) => p.id));
  const h = Number(full.match(/<svg class="sc-hemi[^"]*" viewBox="0 0 [0-9.]+ ([0-9.]+)"/)[1]);
  const y = Number(full.match(/<text [^>]*y="([0-9.]+)" class="sc-houselbl sc-majlbl">/)[1]);
  // The 9px line's box ends about 4 units under its baseline and 2 stay spare;
  // 4 more are slack for a fallback font with a deeper descent.
  assert.ok(h - y >= 10, `the majority line's baseline is ${h - y} units above the bottom edge`);
  // The dashboard's centre ends on the total: an 18px figure, its baseline
  // as far above the edge, and the label over it clear of the majority
  // line's lower end (48 units above the arc's baseline).
  const html = View.chart(fixture, fixture, {});
  const total = Number(html.match(/<text [^>]*y="([0-9.]+)" class="sc-housenum">/)[1]);
  const label = Number(html.match(/<text [^>]*y="([0-9.]+)" class="sc-houselbl">/)[1]);
  assert.ok(h - total >= 10, `the total's baseline is ${h - total} units above the bottom edge`);
  assert.ok(label - 9 > h - 6 - 48, `the label's top is at ${label - 9}`);
});

test('the hemicycle dots stay distinct: radius about 2.8 units, under half a row apart', () => {
  const html = View.chart(fixture, fixture, {});
  const radii = new Set([...html.matchAll(/<circle [^>]*r="([0-9.]+)"/g)].map((m) => Number(m[1])));
  assert.equal(radii.size, 1);
  const r = [...radii][0];
  assert.ok(r >= 2.5 && r <= 3.2, `dot radius ${r}`);
  // Adjacent rows stand (1 - 0.42) * 127.25 / (rows - 1) apart; a dot is well
  // under half of that, so neighbours never touch.
  assert.ok(2 * r < (1 - 0.42) * 127.25 / 7, `dots of radius ${r} would touch`);
});

test('the dashboard hemicycle centre has two labels: seats and the total', () => {
  const html = View.chart(fixture, fixture, {});
  assert.match(html, /class="sc-houselbl">seats<[/]text>/);
  assert.match(html, /class="sc-housenum">493<[/]text>/);
  assert.equal((html.match(/<text /g) || []).length, 2);
});

test('chart shows the election countdown in months, with the target month and year', () => {
  const html = View.chart(fixture, fixture, {});
  assert.match(html, /Election in <b>4 months<\/b>/);
  assert.match(html, /· May 1928/);
});

test('chart uses singular "1 month" one month before the election', () => {
  const q = Object.assign({}, fixture, { month: 4 });
  const html = View.chart(q, q, {});
  assert.match(html, /Election in <b>1 month<\/b>/);
});

function ledgerRowsByParty(html) {
  const rows = {};
  const re = /<div class="sc-ledger([^"]*)" data-sc-party="([a-z]+)">([\s\S]*?)<\/div>/g;
  let m;
  while ((m = re.exec(html))) {
    rows[m[2]] = { classes: m[1], body: m[3] };
  }
  return rows;
}

test('ledger has no column-header row: it opens on the first party row', () => {
  const html = View.ledger(gov1932, gov1932, {});
  assert.doesNotMatch(html, /sc-ledhead/);
  for (const label of ['Liste', 'Partei', 'Relations']) {
    assert.ok(!html.includes(`>${label}<`), `header label still drawn: ${label}`);
  }
  assert.ok(html.startsWith('<div class="sc-ledger'));
});

test('a starred row says what the star means; an unmarked row carries no title on its star cell', () => {
  const html = View.ledger(gov1932, gov1932, {});
  const rows = ledgerRowsByParty(html);
  const starred = Object.values(rows).filter((r) => r.body.includes('★'));
  assert.ok(starred.length > 0, 'the fixture has a government');
  for (const r of starred) {
    assert.match(r.body, /<span class="gv" title="In the government">★<[/]span>/);
  }
  assert.doesNotMatch(html, /<span class="gv" title="In the government"><[/]span>/);
  assert.match(html, /<span class="gv"><[/]span>/);
});

test('ledger has one row per seated party: 9 for crisis1930 (no SAPD)', () => {
  const html = View.ledger(crisis1930, crisis1930, {});
  const rows = ledgerRowsByParty(html);
  assert.equal(Object.keys(rows).length, 9);
  assert.ok(!rows.sapd, 'SAPD should have no row before it forms');
});

test('ledger has 10 rows for gov1932, including SAPD', () => {
  const html = View.ledger(gov1932, gov1932, {});
  const rows = ledgerRowsByParty(html);
  assert.equal(Object.keys(rows).length, 10);
  assert.ok(rows.sapd, 'SAPD should have a row once formed');
});

test('ledger stars exactly the Popular Front parties for gov1932', () => {
  const html = View.ledger(gov1932, gov1932, {});
  const rows = ledgerRowsByParty(html);
  const inGov = ['kpd', 'sapd', 'spd', 'z', 'ddp'];
  const outGov = ['dvp', 'bvp', 'other', 'dnvp', 'nsdap'];
  inGov.forEach((id) => {
    assert.match(rows[id].classes, /\bgov\b/, `${id} should carry the gov class`);
    assert.match(rows[id].body, />★<\/span>/, `${id} should show the star`);
  });
  outGov.forEach((id) => {
    assert.doesNotMatch(rows[id].classes, /\bgov\b/, `${id} should not carry the gov class`);
    assert.match(rows[id].body, /<span class="gv"><\/span>/, `${id} should show no star`);
  });
});

test('ledger stars no party out of government, the SPD included', () => {
  [fixture, crisis1930].forEach((q) => {
    const rows = ledgerRowsByParty(View.ledger(q, q, {}));
    Object.keys(rows).forEach((id) => {
      assert.doesNotMatch(rows[id].body, />★<\/span>/, `${id} should show no star`);
    });
  });
});

test('ledger shows a relations bar and band word for kpd, z, ddp, dvp; the KPD word is warm in gov1932', () => {
  const html = View.ledger(gov1932, gov1932, {});
  const rows = ledgerRowsByParty(html);
  assert.match(rows.kpd.body, /<span class="rl" title="KPD: warm">/);
  assert.match(rows.kpd.body, /class="fill" style="width:56%;background:var\(--sc-rel-warm\)"/);
  assert.match(rows.kpd.body, /<span class="wd">warm<\/span>/);
});

test('ledger gives bvp the Center party\'s relation bar and word, with a title saying so', () => {
  const rows = ledgerRowsByParty(View.ledger(gov1932, gov1932, {}));
  const z = Number(gov1932.z_relation);
  const band = rows.z.body.match(/<span class="wd">([^<]*)/)[1].replace(/ /g, '-');
  assert.match(rows.bvp.body, /<span class="rl" title="BVP: [a-z ]+ \(follows the Center Party\)">/);
  assert.ok(rows.bvp.body.includes('class="fill" style="width:' + z + '%;background:var(--sc-rel-' + band + ')"'));
  assert.equal(
    rows.bvp.body.match(/<span class="wd">([^<]*)/)[1],
    rows.z.body.match(/<span class="wd">([^<]*)/)[1]
  );
});

test('ledger colours each relations fill by its band, never by party', () => {
  // cold (20), neutral (45), warm (60), and both ends of the scale.
  const cases = [
    [0, 'hostile'], [10, 'frigid'], [20, 'cold'], [35, 'cool'],
    [45, 'neutral'], [60, 'warm'], [70, 'friendly'], [90, 'very-friendly']
  ];
  cases.forEach(([v, band]) => {
    const q = Object.assign({}, gov1932, { kpd_relation: v });
    const rows = ledgerRowsByParty(View.ledger(q, q, {}));
    assert.ok(
      rows.kpd.body.includes('class="fill" style="width:' + v + '%;background:var(--sc-rel-' + band + ')"'),
      'KPD at ' + v + ' should use --sc-rel-' + band
    );
  });
  const rows = ledgerRowsByParty(View.ledger(gov1932, gov1932, {}));
  ['kpd', 'z', 'ddp', 'dvp', 'bvp'].forEach((id) => {
    assert.doesNotMatch(rows[id].body, /class="fill"[^>]*#[0-9a-fA-F]{3,6}/, id + ' fill must not carry a party colour');
  });
});

test('ledger marks dnvp and nsdap as hostile beside an empty track', () => {
  const html = View.ledger(gov1932, gov1932, {});
  const rows = ledgerRowsByParty(html);
  ['dnvp', 'nsdap'].forEach((id) => {
    assert.match(rows[id].body, /<span class="rl"><span class="fill" style="width:0%[^"]*"><\/span><span class="tick"><\/span><\/span>/);
    assert.match(rows[id].body, /<span class="wd"><span class="sc-refuse">hostile<\/span><\/span>/);
  });
});

test('ledger shows spd as a "Player" pill across both relation columns, with no bar', () => {
  const html = View.ledger(gov1932, gov1932, {});
  const rows = ledgerRowsByParty(html);
  assert.match(rows.spd.body, /<span class="rl merged"><span class="sc-you">Player<\/span><\/span>/);
  assert.match(rows.spd.classes, /\bplayer\b/);
  assert.doesNotMatch(rows.spd.body, /class="fill"/);
});

test('ledger gives other and sapd a muted empty track with a dash', () => {
  const html = View.ledger(gov1932, gov1932, {});
  const rows = ledgerRowsByParty(html);
  ['other', 'sapd'].forEach((id) => {
    assert.match(rows[id].body, /<span class="rl none" title="No single party to negotiate with">/);
    assert.match(rows[id].body, /<span class="wd"[^>]*>—<\/span>/);
  });
});

test('ledger seats cell carries a delta on the party\'s _r quality (big 3, polarity 0), never for bvp', () => {
  const base = Object.assign({}, gov1932);
  const q = Object.assign({}, gov1932, { kpd_r: 15, bvp_r: 99 });
  const html = View.ledger(q, base, {});
  const rows = ledgerRowsByParty(html);
  assert.match(rows.kpd.body, /<span class="st">\d+<span class="sc-delta neutral"[^>]*>▲▲<\/span><\/span>/);
  assert.doesNotMatch(rows.bvp.body, /sc-delta/);
});

test('ledger uses the same seat counts as the chart, including the polls toggle', () => {
  // Worked by hand from crisis1930's shares (see the chart toggle test):
  // nsdap gets 104 seats from votes but 127 from polls.
  const seats = View.ledger(crisis1930, crisis1930, { chart: 'seats' });
  const polls = View.ledger(crisis1930, crisis1930, { chart: 'polls' });
  const seatsRows = ledgerRowsByParty(seats);
  const pollsRows = ledgerRowsByParty(polls);
  assert.match(seatsRows.nsdap.body, /<span class="st">104</);
  assert.match(pollsRows.nsdap.body, /<span class="st">127</);
});

test('render fills the ledger box with the party ledger', () => {
  const html = View.render(gov1932, gov1932, {});
  assert.match(html, /<div class="sc-ledger-box"><div class="sc-ledger/);
  assert.ok(html.includes('data-sc-party="kpd"'));
});
