'use strict';

// The Reichstag entry (depth column) and the seat-chart highlight it drives:
// the coalition table, the requirements each government's card checks, the
// entry's HTML, View's highlight, and StateColumn.highlightParties.

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const Entry = require('../../out/html/depth-column/reichstag-entry.js');
const Model = require('../../out/html/state-column/model.js');
const View = require('../../out/html/state-column/view.js');

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name + '.json'), 'utf8'));
}

const start1928 = loadFixture('start1928');
const crisis1930 = loadFixture('crisis1930');
const gov1932 = loadFixture('gov1932');

function table(q, chart) {
  const sc = View.seatCounts(q, { chart: chart || 'seats' });
  return Entry.coalitions(q, sc.counts, sc.house);
}

const byId = (rows, id) => rows.filter((r) => r.id === id)[0];

// ---- the table ---------------------------------------------------------------

test('five named governments, in the order the entry lists them', () => {
  assert.deepEqual(table(start1928).map((r) => r.name),
    ['Weimar Coalition', 'Grand Coalition', 'Popular Front', 'Left Front', 'SPD majority']);
});

test('members are the parties each card names, in seating order; SAPD only once it has formed', () => {
  const rows = table(start1928);
  assert.deepEqual(byId(rows, 'weimar').parties, ['spd', 'ddp', 'z']);
  assert.deepEqual(byId(rows, 'grand').parties, ['spd', 'ddp', 'z', 'bvp', 'dvp']);
  assert.deepEqual(byId(rows, 'popular').parties, ['kpd', 'spd', 'ddp', 'z']);
  assert.deepEqual(byId(rows, 'left').parties, ['kpd', 'spd']);
  assert.deepEqual(byId(rows, 'spd').parties, ['spd']);
  const formed = table(gov1932);
  assert.deepEqual(byId(formed, 'popular').parties, ['kpd', 'sapd', 'spd', 'ddp', 'z']);
  assert.deepEqual(byId(formed, 'left').parties, ['kpd', 'sapd', 'spd']);
});

test('the Popular Front leaves BVP out (the game takes its 3 seats off Z); the Grand Coalition keeps it', () => {
  assert.ok(!byId(table(start1928), 'popular').parties.includes('bvp'));
  assert.ok(byId(table(start1928), 'grand').parties.includes('bvp'));
});

test('the Weimar Coalition counts the SAPD as toleration while KPD relations are 30 or more', () => {
  // gov1932: SAPD formed, KPD relations 56.
  assert.ok(byId(table(gov1932), 'weimar').parties.includes('sapd'));
  const cool = Object.assign({}, gov1932, { kpd_relation: 29 });
  assert.ok(!byId(table(cool), 'weimar').parties.includes('sapd'));
  const unformed = Object.assign({}, gov1932, { sapd_formed: 0 });
  assert.ok(!byId(table(unformed), 'weimar').parties.includes('sapd'));
});

test('totals are the members\' seats from the chart\'s own counts, against the house majority', () => {
  // start1928: 493 seats, majority 247; SPD 128, DDP 30, Z 69, BVP 15, DVP 49, KPD 44.
  const rows = table(start1928);
  assert.equal(byId(rows, 'weimar').seats, 128 + 30 + 69);
  assert.equal(byId(rows, 'grand').seats, 128 + 30 + 69 + 15 + 49);
  assert.equal(byId(rows, 'popular').seats, 44 + 128 + 30 + 69);
  assert.equal(byId(rows, 'left').seats, 44 + 128);
  assert.equal(byId(rows, 'spd').seats, 128);
  rows.forEach((r) => assert.equal(r.majority, 247));
});

test('clears is seats at or above the majority: the SPD alone fails at the start, the Grand Coalition passes', () => {
  const rows = table(start1928);
  assert.equal(byId(rows, 'spd').clears, false);
  assert.equal(byId(rows, 'weimar').clears, false);
  assert.equal(byId(rows, 'grand').clears, true);
  assert.equal(byId(rows, 'popular').clears, true);
  assert.equal(byId(rows, 'left').clears, false);
  // The line itself counts: exactly the majority clears it.
  assert.equal(byId(Entry.coalitions(start1928, { spd: 247 }, 493), 'spd').clears, true);
  assert.equal(byId(Entry.coalitions(start1928, { spd: 246 }, 493), 'spd').clears, false);
});

test('the seat source follows the Seats/Polls toggle', () => {
  // crisis1930 has poll shares that differ from its seats.
  assert.equal(byId(table(crisis1930, 'seats'), 'spd').seats, 144);
  assert.equal(byId(table(crisis1930, 'polls'), 'spd').seats, 133);
  // Before polls exist there is no toggle, so the seats stand.
  assert.equal(byId(table(start1928, 'polls'), 'spd').seats, 128);
});

test('current marks the government the SPD sits in, by name, and nothing when it is out', () => {
  assert.equal(table(start1928).filter((r) => r.current).length, 0);
  // gov1932 is a Popular Front.
  assert.deepEqual(table(gov1932).filter((r) => r.current).map((r) => r.id), ['popular']);
  const weimar = Object.assign({}, start1928, { spd_in_government: 1, in_weimar_coalition: 1 });
  assert.deepEqual(table(weimar).filter((r) => r.current).map((r) => r.id), ['weimar']);
  // A minority or emergency government is none of the five.
  const minority = Object.assign({}, start1928, { spd_in_government: 1, in_minority_government: 1 });
  assert.equal(table(minority).filter((r) => r.current).length, 0);
  // The SPD out of office, flags left over: not current.
  const out = Object.assign({}, gov1932, { spd_in_government: 0 });
  assert.equal(table(out).filter((r) => r.current).length, 0);
});

// ---- what the game checks ------------------------------------------------------

function reqs(id, q, chart) {
  const rows = table(q, chart);
  return Entry.requirements(id, q, byId(rows, id));
}
const find = (list, re) => list.filter((r) => re.test(r.text))[0];

test('Weimar: a majority and nothing else; the SAPD line appears once it has formed', () => {
  const list = reqs('weimar', start1928);
  assert.equal(list[0].met, false);
  assert.match(list[0].text, /A majority of the seats: 227 of 247/);
  assert.equal(find(list, /No relations minimum/).met, null);
  assert.equal(find(list, /SAPD/), undefined);
  assert.equal(find(reqs('weimar', gov1932), /SAPD seats count as toleration/).met, true);
});

test('Grand: majority, not already broken down, and DVP relations when the Center leads', () => {
  const list = reqs('grand', start1928);
  assert.equal(list[0].met, true);
  assert.equal(find(list, /not already broken down/).met, true);
  const broken = reqs('grand', Object.assign({}, start1928, { grand_coalition_failed: 1 }));
  assert.equal(find(broken, /not already broken down/).met, false);
  // First election, SPD the largest party (by its shares before the game has set largest_party): the SPD leads; a weak DVP only costs leverage.
  assert.match(find(list, /would lead/).text, /SPD would lead/);
  // After the first election with the SPD under 30%: the Center leads and DVP relations count.
  const centre = Object.assign({}, start1928, { n_elections: 2, spd_r: 25, largest_party: 'SPD', dvp_relation: 35 });
  const centreList = reqs('grand', centre);
  assert.match(find(centreList, /Center would lead/).text, /DVP relations at least 30 \(cool\)/);
  assert.equal(find(centreList, /Center would lead/).met, true);
  assert.equal(find(reqs('grand', Object.assign({}, centre, { dvp_relation: 20 })), /Center would lead/).met, false);
  // President Braun: the SPD leads whatever its share.
  assert.match(find(reqs('grand', Object.assign({}, centre, { president: 'Braun' })), /would lead/).text, /SPD would lead/);
});

test('Popular Front: relation thresholds depend on who leads the KPD and the Center', () => {
  // Thälmann, Marx: KPD 65, Z 65, DDP 50.
  let list = reqs('popular', start1928);
  assert.match(find(list, /^KPD relations/).text, /KPD relations at least 65 \(friendly\)/);
  assert.match(find(list, /^Z relations/).text, /Z relations at least 65 \(friendly\)/);
  assert.match(find(list, /^DDP relations/).text, /DDP relations at least 50 \(neutral\)/);
  assert.equal(find(list, /^KPD relations/).met, false);
  assert.equal(find(list, /^DDP relations/).met, true);
  assert.equal(find(list, /willing to join/).met, false);
  // Conciliators lead the KPD: KPD 45, Z 55.
  list = reqs('popular', Object.assign({}, start1928, { kpd_party_leader: 'Conciliators' }));
  assert.match(find(list, /^KPD relations/).text, /at least 45/);
  assert.match(find(list, /^Z relations/).text, /at least 55/);
  // Joos leads the Center: Z 45.
  list = reqs('popular', Object.assign({}, start1928, { z_party_leader: 'Joos' }));
  assert.match(find(list, /^Z relations/).text, /at least 45/);
  // Joos and the Conciliators: both relations only need 30, and nothing else.
  list = reqs('popular', Object.assign({}, start1928, { z_party_leader: 'Joos', kpd_party_leader: 'Conciliators', kpd_relation: 30, z_relation: 30 }));
  assert.equal(find(list, /at least 30 \(cool\) and Z relations at least 30/).met, true);
  assert.equal(find(list, /^DDP relations/), undefined);
});

test('Popular Front: the smoothing line is met by 4 resources, Braun, Conciliators, or a warm KPD that is willing', () => {
  const smooth = (extra) => find(reqs('popular', Object.assign({}, start1928, { resources: 0 }, extra)), /^And one of/).met;
  assert.equal(smooth({}), false);
  assert.equal(smooth({ resources: 4 }), true);
  assert.equal(smooth({ president: 'Braun' }), true);
  assert.equal(smooth({ kpd_party_leader: 'Conciliators' }), true);
  assert.equal(smooth({ kpd_relation: 60, communist_coalition: 3 }), true);
  assert.equal(smooth({ kpd_relation: 60, communist_coalition: 2 }), false);
});

test('Left Front: KPD relations 50 (40 under the Conciliators), a willing KPD, then a way past Thälmann', () => {
  let list = reqs('left', start1928);
  assert.match(find(list, /^KPD relations/).text, /at least 50 \(neutral\)/);
  assert.equal(find(list, /^KPD relations/).met, false);
  assert.equal(find(list, /willing to join/).met, false);
  assert.equal(find(list, /^And one of/).met, false);
  list = reqs('left', Object.assign({}, start1928, { kpd_party_leader: 'Conciliators', kpd_relation: 40, communist_coalition: 3 }));
  assert.match(find(list, /^KPD relations/).text, /at least 40 \(neutral\)/);
  assert.equal(find(list, /^KPD relations/).met, true);
  assert.equal(find(list, /^And one of/).met, true);
  assert.equal(find(reqs('left', Object.assign({}, start1928, { resources: 3 })), /^And one of/).met, true);
});

test('SPD majority: the SPD\'s own seats against the line, no partners', () => {
  const list = reqs('spd', start1928);
  assert.match(list[0].text, /The SPD alone holds a majority: 128 of 247/);
  assert.equal(list[0].met, false);
  assert.equal(find(list, /No partners/).met, null);
});

// ---- the entry's HTML ------------------------------------------------------------

const render = (q, ctx) => Entry.renderReichstagEntry(q, ctx);

test('the entry lists five buttons with members, "seats / majority" and a mark', () => {
  const html = render(start1928, { chart: 'seats' });
  assert.equal((html.match(/<button type="button" class="rs-row/g) || []).length, 5);
  assert.match(html, /493 seats, 247 for a majority/);
  assert.match(html, /data-rs-coalition="weimar" aria-pressed="false"/);
  assert.match(html, /<span class="rs-total ok" title="[^"]*">291 \/ 247 <b>✓<\/b><\/span>/);
  assert.match(html, /<span class="rs-total no" title="[^"]*">128 \/ 247 <b>✗<\/b><\/span>/);
  // Small colour squares with abbreviations.
  assert.match(html, /<span class="rs-mem"><i class="rs-sw" style="background:#E3000F"><\/i>SPD<\/span>/);
  assert.match(html, /<span class="rs-mem"><i class="rs-sw" style="background:#1c1c1c"><\/i>Z<\/span>/);
});

test('DDP shows under its current name (DStP after 1930)', () => {
  const html = render(Object.assign({}, start1928, { ddp_name: 'DStP' }), {});
  assert.match(html, /<\/i>DStP<\/span>/);
});

test('with nothing picked the preview area holds the hint, and the entry ends with the charts link', () => {
  const html = render(start1928, {});
  assert.match(html, /<p class="rs-hint">Pick a coalition to preview it\.<\/p>/);
  assert.doesNotMatch(html, /rs-preview/);
  assert.match(html, /<a href="#" data-rs-charts>Charts and statistics<\/a>/);
  // An unknown pick is no pick.
  assert.match(render(start1928, { picked: 'nobody' }), /Pick a coalition to preview it/);
});

test('the current government\'s row carries the marker', () => {
  const html = render(gov1932, {});
  assert.equal((html.match(/rs-cur/g) || []).length, 1);
  assert.match(html, /Popular Front<small class="rs-cur">current<\/small>/);
  assert.equal((render(start1928, {}).match(/rs-cur/g) || []).length, 0);
});

test('a picked row is pressed, and its preview lists partners with the ledger\'s bar and word, then the requirements', () => {
  const html = render(start1928, { picked: 'weimar' });
  assert.match(html, /class="rs-row on" data-rs-coalition="weimar" aria-pressed="true"/);
  assert.doesNotMatch(html, /rs-hint/);
  assert.match(html, /data-rs-preview="weimar"/);
  // DDP 60 is warm, Z 50 neutral; the SPD is the player and has no row.
  assert.match(html, /rs-pn"><i[^>]*><\/i>DDP<\/span><span class="rs-rel"><span class="fill" style="width:60%;background:var\(--sc-rel-warm\)"><\/span>[\s\S]*?<span class="rs-word">warm<\/span>/);
  assert.match(html, /rs-pn"><i[^>]*><\/i>Z<\/span>[\s\S]*?<span class="rs-word">neutral<\/span>/);
  assert.equal((html.match(/class="rs-partner"/g) || []).length, 2);
  assert.match(html, /<li class="no"><b>✗<\/b><span>A majority of the seats: 227 of 247<\/span><\/li>/);
  assert.match(html, /<li class="note"><b>·<\/b>/);
});

test('BVP follows the Center Party\'s relation, and the SPD majority has no partners', () => {
  const grand = render(start1928, { picked: 'grand' });
  assert.match(grand, /rs-pn"><i[^>]*><\/i>BVP<\/span><span class="rs-rel" title="Follows the Center Party"/);
  assert.equal((grand.match(/class="rs-partner"/g) || []).length, 4);
  const alone = render(start1928, { picked: 'spd' });
  assert.equal((alone.match(/class="rs-partner"/g) || []).length, 0);
  assert.match(alone, /The SPD governs alone\./);
});

test('the SAPD has no relation to show, so the Left Front lists only the KPD as a partner', () => {
  const html = render(gov1932, { picked: 'left' });
  assert.equal((html.match(/class="rs-partner"/g) || []).length, 1);
});

test('a Polls chart says so, and counts the polling seats', () => {
  const html = render(crisis1930, { chart: 'polls', picked: null });
  assert.match(html, /577 seats, 289 for a majority, by the polls/);
  assert.match(html, /133 \/ 289/);
});

// ---- the chart's highlight --------------------------------------------------------

test('highlightIds keeps known parties once each and turns anything else into no highlight', () => {
  assert.deepEqual(View.highlightIds(['spd', 'z', 'spd']), ['spd', 'z']);
  assert.deepEqual(View.highlightIds(['nobody', 'ddp']), ['ddp']);
  assert.equal(View.highlightIds([]), null);
  assert.equal(View.highlightIds(['nobody']), null);
  assert.equal(View.highlightIds(null), null);
  assert.equal(View.highlightIds('spd'), null);
});

const groupClass = (html, id) => html.match(new RegExp('<g class="([^"]*)" data-sc-seats="' + id + '">'))[1];

test('the chart draws each party\'s dots in a group, one circle per seat as before', () => {
  const html = View.chart(start1928, start1928, {});
  assert.equal((html.match(/<g class="sc-party-seats/g) || []).length, Model.PARTIES.length);
  assert.equal((html.match(/<circle/g) || []).length, 493);
  assert.equal(groupClass(html, 'spd'), 'sc-party-seats');
});

test('a highlight lights the named parties\' groups and dims the rest', () => {
  const html = View.chart(start1928, start1928, { highlight: ['spd', 'ddp', 'z'] });
  ['spd', 'ddp', 'z'].forEach((id) => assert.equal(groupClass(html, id), 'sc-party-seats lit'));
  ['kpd', 'sapd', 'bvp', 'dvp', 'other', 'dnvp', 'nsdap'].forEach((id) => assert.equal(groupClass(html, id), 'sc-party-seats dim'));
  assert.match(html, /<svg class="sc-hemi sc-lit"/);
  // Every seat is still drawn, and the dots themselves carry no opacity.
  assert.equal((html.match(/<circle/g) || []).length, 493);
  assert.doesNotMatch(html, /opacity="0.28"/);
});

test('the centre shows the coalition\'s seats, without the majority line', () => {
  const html = View.chart(start1928, start1928, { highlight: ['spd', 'ddp', 'z'] });
  assert.match(html, /class="sc-houselbl">coalition<\/text>/);
  assert.match(html, /class="sc-housenum">227<\/text>/);
  assert.doesNotMatch(html, /for majority/);
  // Unhighlighted, the centre reads the house.
  const plain = View.chart(start1928, start1928, {});
  assert.match(plain, /class="sc-houselbl">seats<\/text>/);
  assert.match(plain, /class="sc-housenum">493<\/text>/);
});

test('the highlight follows the Polls source like the rest of the chart', () => {
  const html = View.chart(crisis1930, crisis1930, { chart: 'polls', highlight: ['spd'] });
  assert.match(html, /class="sc-housenum">133<\/text>/);
});

test('with no highlight the government marking is unchanged: other parties\' dots dim one by one', () => {
  const html = View.chart(gov1932, gov1932, {});
  assert.equal((html.match(/opacity="0.28"/g) || []).length, 608 - 352);
  assert.doesNotMatch(html, /sc-party-seats (lit|dim)/);
});

// StateColumn.highlightParties, run against the real state-column.js with a
// stand-in for the page.
function loadStateColumn(q) {
  const listeners = [];
  const element = () => ({
    style: {}, innerHTML: '', parentNode: { insertBefore() {} },
    classList: { add() {}, remove() {}, toggle() {} },
    contains: () => false, querySelector: () => null, setAttribute() {}, getAttribute: () => null, appendChild() {},
  });
  const elements = { stats_sidebar: element(), qualities: element(), content: element() };
  const calls = { show: [], showStats: 0 };
  // The depth column's open view, which a test moves and announces.
  let view = null;
  const win = {
    StateColumnModel: Model,
    StateColumnView: View,
    localStorage: { getItem: () => null, setItem() {} },
    dendryUI: { dendryEngine: { state: { qualities: q } } },
    DepthColumn: { view: () => view, show: (v) => calls.show.push(v) },
    showStats: () => { calls.showStats += 1; },
    updateSidebar() {},
    addEventListener() {},
    requestAnimationFrame: () => 0,
    cancelAnimationFrame() {},
  };
  win.window = win;
  win.document = {
    activeElement: null,
    addEventListener: (type, fn) => listeners.push({ type, fn }),
    getElementById: (id) => elements[id] || null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: element,
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../out/html/state-column/state-column.js'), 'utf8'), win);
  const setView = (next) => {
    view = next;
    listeners.filter((l) => l.type === 'depthcolumn:view').forEach((l) => l.fn());
  };
  return { win, calls, listeners, qualities: elements.qualities, setView };
}

test('StateColumn.highlightParties lights those parties on the chart and redraws; null clears it', () => {
  const { win, qualities } = loadStateColumn(Object.assign({}, start1928));
  win.updateSidebar();
  assert.doesNotMatch(qualities.innerHTML, /sc-party-seats (lit|dim)/);
  win.StateColumn.highlightParties(['spd', 'ddp', 'z']);
  assert.deepEqual(win.StateColumn.highlighted(), ['spd', 'ddp', 'z']);
  assert.match(qualities.innerHTML, /<g class="sc-party-seats lit" data-sc-seats="spd">/);
  assert.match(qualities.innerHTML, /<g class="sc-party-seats dim" data-sc-seats="kpd">/);
  assert.match(qualities.innerHTML, /class="sc-housenum">227<\/text>/);
  win.StateColumn.highlightParties(null);
  assert.equal(win.StateColumn.highlighted(), null);
  assert.doesNotMatch(qualities.innerHTML, /sc-party-seats (lit|dim)/);
});

test('StateColumn.highlightParties ignores unknown ids and an empty list, and the highlight survives a monthly redraw', () => {
  const { win, qualities } = loadStateColumn(Object.assign({}, start1928));
  win.StateColumn.highlightParties(['nobody']);
  assert.equal(win.StateColumn.highlighted(), null);
  win.StateColumn.highlightParties(['spd']);
  win.StateColumn.highlightParties([]);
  assert.equal(win.StateColumn.highlighted(), null);
  win.StateColumn.highlightParties(['kpd', 'spd']);
  win.updateSidebar();
  assert.match(qualities.innerHTML, /<g class="sc-party-seats lit" data-sc-seats="kpd">/);
});

test('a click on the chart opens the Reichstag entry in the depth column, not upstream\'s Library', () => {
  const { calls, listeners } = loadStateColumn(Object.assign({}, start1928));
  const click = listeners.filter((l) => l.type === 'click')[0].fn;
  click({ target: { closest: (selector) => (selector === '[data-sc-chart]' ? {} : null) } });
  assert.deepEqual(JSON.parse(JSON.stringify(calls.show)), [{ kind: 'entry', key: 'reichstag:seats', title: 'Reichstag' }]);
  assert.equal(calls.showStats, 0);
});

// ---- a party entry marks its ledger row and lights the party ---------------------

const PARTY_VIEW = { kind: 'entry', key: 'party:ddp', title: 'DDP' };

test('opening a party entry marks that ledger row aria-current and nothing else', () => {
  const { win, qualities, setView } = loadStateColumn(Object.assign({}, start1928));
  win.updateSidebar();
  assert.doesNotMatch(qualities.innerHTML, /aria-current/);
  setView(PARTY_VIEW);
  const marked = qualities.innerHTML.match(/<div class="sc-ledger[^"]*" data-sc-party="([a-z]+)" aria-current="true">/g) || [];
  assert.equal(marked.length, 1);
  assert.match(marked[0], /data-sc-party="ddp"/);
});

test('opening a party entry lights its dots, dims the rest, and the centre reads its seats and name', () => {
  const { win, qualities, setView } = loadStateColumn(Object.assign({}, start1928));
  win.updateSidebar();
  setView(PARTY_VIEW);
  const html = qualities.innerHTML;
  assert.match(html, /<g class="sc-party-seats lit" data-sc-seats="ddp">/);
  assert.equal((html.match(/<g class="sc-party-seats lit"/g) || []).length, 1);
  assert.match(html, /<g class="sc-party-seats dim" data-sc-seats="spd">/);
  assert.match(html, new RegExp('class="sc-houselbl">' + Model.partyLabel(start1928, 'ddp') + '</text>'));
  const seats = View.seatCounts(start1928, {}).counts.ddp;
  assert.match(html, new RegExp('class="sc-housenum">' + seats + '</text>'));
  assert.doesNotMatch(html, /for majority/);
  assert.deepEqual(win.StateColumn.highlighted(), ['ddp']);
});

test('Back, another view or a page without the entry clears the row mark and the highlight', () => {
  const { win, qualities, setView } = loadStateColumn(Object.assign({}, start1928));
  win.updateSidebar();
  [{ kind: 'polls' }, { kind: 'entry', key: 'defense:sa' }, { kind: 'page' }, null].forEach((next) => {
    setView(PARTY_VIEW);
    assert.match(qualities.innerHTML, /aria-current="true"/);
    setView(next);
    assert.doesNotMatch(qualities.innerHTML, /aria-current/);
    assert.doesNotMatch(qualities.innerHTML, /sc-party-seats (lit|dim)/);
    assert.equal(win.StateColumn.highlighted(), null);
  });
});

test('a party entry with no seats in the house marks nothing and lights nothing', () => {
  const { win, qualities, setView } = loadStateColumn(Object.assign({}, start1928));
  win.updateSidebar();
  setView({ kind: 'entry', key: 'party:nobody', title: 'Nobody' });
  assert.doesNotMatch(qualities.innerHTML, /sc-party-seats (lit|dim)/);
});

test('a coalition pick replaces the party highlight, and the party highlight replaces a pick', () => {
  const { win, qualities, setView } = loadStateColumn(Object.assign({}, start1928));
  win.updateSidebar();
  // A pick lives in the Reichstag entry; opening a party entry ends it (the
  // entry's own listener calls highlightParties(null), here or after ours).
  win.StateColumn.highlightParties(['spd', 'kpd', 'sapd']);
  setView(PARTY_VIEW);
  win.StateColumn.highlightParties(null);
  assert.deepEqual(win.StateColumn.highlighted(), ['ddp']);
  assert.match(qualities.innerHTML, /<g class="sc-party-seats lit" data-sc-seats="ddp">/);
  // And from the Reichstag entry, a pick takes the chart.
  setView({ kind: 'entry', key: 'reichstag:seats', title: 'Reichstag' });
  assert.equal(win.StateColumn.highlighted(), null);
  win.StateColumn.highlightParties(['spd', 'ddp', 'z']);
  assert.deepEqual(win.StateColumn.highlighted(), ['spd', 'ddp', 'z']);
  assert.match(qualities.innerHTML, /class="sc-houselbl">coalition<\/text>/);
  assert.doesNotMatch(qualities.innerHTML, /aria-current/);
});

test('the ledger marks the row of the open party entry with aria-current, leaving the wash class', () => {
  const html = View.ledger(start1928, start1928, { openEntry: 'party:spd' });
  assert.match(html, /<div class="sc-ledger[^"]* player" data-sc-party="spd" aria-current="true">/);
  assert.equal((html.match(/aria-current/g) || []).length, 1);
  assert.doesNotMatch(View.ledger(start1928, start1928, { openEntry: 'defense:sa' }), /aria-current/);
  assert.doesNotMatch(View.ledger(start1928, start1928, {}), /aria-current/);
});

test('the hemicycle names a lone highlighted party in the centre; coalition picks keep "coalition"', () => {
  const lone = View.chart(start1928, start1928, { highlight: ['spd'], highlightName: 'SPD' });
  assert.match(lone, /class="sc-houselbl">SPD<\/text>/);
  const pick = View.chart(start1928, start1928, { highlight: ['spd'] });
  assert.match(pick, /class="sc-houselbl">coalition<\/text>/);
});
