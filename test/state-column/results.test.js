'use strict';

// The result rows: one readout block for any vote. The data builders
// (reichstag, rows) and the renderer (html) are pure.

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const Model = require('../../out/html/state-column/model.js');
const Results = require('../../out/html/state-column/results.js');

function loadFixture(name) {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures', name + '.json'), 'utf8')
  );
}

const start1928 = loadFixture('start1928');
const crisis1930 = loadFixture('crisis1930');
const gov1932 = loadFixture('gov1932');

function byId(rows) {
  const out = {};
  rows.forEach((r) => { out[r.id] = r; });
  return out;
}

test('the Reichstag rows follow the ledger order, with BVP split from Z', () => {
  const rows = Results.reichstag(start1928);
  assert.deepEqual(rows.map((r) => r.id),
    ['kpd', 'spd', 'ddp', 'z', 'bvp', 'dvp', 'other', 'dnvp', 'nsdap']);
  const r = byId(rows);
  assert.equal(r.z.share, 14);
  assert.equal(r.bvp.share, 3);
  assert.equal(r.bvp.prev, 3);
  assert.equal(r.bvp.change, 0);
});

test('SAPD has a row only when it is formed and has a share', () => {
  assert.ok(!Results.reichstag(crisis1930).some((r) => r.id === 'sapd'));
  assert.ok(Results.reichstag(gov1932).some((r) => r.id === 'sapd'));
  const unformed = Object.assign({}, gov1932, { sapd_formed: 0 });
  assert.ok(!Results.reichstag(unformed).some((r) => r.id === 'sapd'));
  const empty = Object.assign({}, gov1932, { sapd_r: 0 });
  assert.ok(!Results.reichstag(empty).some((r) => r.id === 'sapd'));
});

test('seats equal the dashboard allocation', () => {
  [start1928, crisis1930, gov1932].forEach((q) => {
    const expected = Model.allocateSeats(
      Model.seatShares(q, 'seats'), Model.houseAt(q.year, q.month));
    Results.reichstag(q).forEach((r) => {
      assert.equal(r.seats, expected[r.id], q.year + ' ' + r.id);
    });
  });
});

test('change is the share less its previous value, in points', () => {
  const r = byId(Results.reichstag(crisis1930));
  assert.equal(r.nsdap.share, 18);
  assert.equal(r.nsdap.prev, 3);
  assert.equal(r.nsdap.change, 15);
  assert.equal(r.dnvp.change, -13);
  assert.equal(r.spd.change, -1);
  assert.equal(r.z.prev, 14);
  assert.equal(r.z.change, 15 - 3 - 14);
  const same = byId(Results.reichstag(start1928));
  assert.equal(same.spd.change, 0);
});

test('a first election with no old values has no prev and no change', () => {
  const q = Object.assign({}, start1928);
  Object.keys(q).forEach((k) => { if (k.indexOf('old_') === 0) { delete q[k]; } });
  const rows = Results.reichstag(q);
  rows.forEach((r) => {
    assert.equal(r.prev, null, r.id);
    assert.equal(r.change, null, r.id);
  });
  const html = Results.html(rows, { q: q, symbols: 'off', seats: true });
  assert.doesNotMatch(html, /undefined|NaN|null/);
});

test('rows() normalises a hand-built list', () => {
  const rows = Results.rows([
    { label: 'Hindenburg', share: 49, prev: 40, note: 'DNVP and allies' },
    { id: 'spd', label: 'Braun', share: 38, player: true },
    { label: 'Thälmann', share: 13 }
  ]);
  assert.equal(rows[0].change, 9);
  assert.equal(rows[0].id, null);
  assert.equal(rows[1].prev, null);
  assert.equal(rows[1].change, null);
  assert.equal(rows[1].player, true);
  assert.equal(rows[2].seats, null);
});

test('a party row is a depth-entry button; a plain row is not', () => {
  const html = Results.html(Results.rows([
    { id: 'z', label: 'Z', share: 15 },
    { label: 'Hindenburg', share: 49 }
  ]), { q: start1928, symbols: 'off' });
  assert.match(html, /<button type="button" class="rr-row[^"]*" data-depth-entry="party:z"/);
  assert.equal((html.match(/<button/g) || []).length, 1);
  assert.match(html, /<div class="rr-row[^"]*">/);
});

test('the SPD row carries the player treatment', () => {
  const html = Results.html(Results.reichstag(start1928), { q: start1928, symbols: 'off' });
  assert.match(html, /class="rr-row player"[^>]*data-depth-entry="party:spd"/);
  assert.equal((html.match(/rr-row player/g) || []).length, 1);
});

test('the bar is scaled to max, and the ghost tick sits at prev', () => {
  const html = Results.html(Results.rows([{ label: 'A', share: 20, prev: 10 }]),
    { max: 40 });
  assert.match(html, /class="rr-fill" style="width:50%/);
  assert.match(html, /class="rr-ghost" style="left:25%/);
});

test('max defaults to the next ten above the largest share or prev', () => {
  const html = Results.html(Results.rows([{ label: 'A', share: 26, prev: 31 }]), {});
  assert.match(html, /class="rr-fill" style="width:65%/);
});

test('a Reichstag row leads with seats and their change, then the bar and the vote', () => {
  const html = Results.html(Results.reichstag(crisis1930), { q: crisis1930, symbols: 'off', seats: true });
  const heads = html.match(/<div class="rr-head">[\s\S]*?<\/div>/)[0];
  const cols = ['rr-badge', 'rr-name', 'rr-seats', 'rr-chg', 'rr-bar', 'rr-share'];
  assert.deepEqual(heads.match(/<span class="rr-[a-z]+/g).map((s) => s.slice(13)), cols);
  assert.match(heads, /rr-seats">Seats</);
  assert.match(heads, /rr-chg">Change</);
  assert.match(heads, /rr-share">Vote</);
  assert.doesNotMatch(html, /Change \(pts\)/);
  const nsdap = html.match(/<button[^>]*party:nsdap[\s\S]*?<\/button>/)[0];
  const order = cols.map((c) => nsdap.indexOf('class="' + c));
  assert.ok(order.every((i) => i >= 0));
  assert.deepEqual(order.slice().sort((a, b) => a - b), order);
});

test('seat changes use the dashboard arrows, with a dash for none', () => {
  const rows = Results.reichstag(crisis1930);
  const html = Results.html(rows, { q: crisis1930, symbols: 'off', seats: true });
  const r = byId(rows);
  const cell = (id) => html.match(new RegExp('party:' + id + '[\\s\\S]*?rr-chg[^"]*">([^<]*)<'))[1];
  assert.equal(cell('nsdap'), '▲ ' + r.nsdap.seatChange);
  assert.equal(cell('dnvp'), '▼ ' + Math.abs(r.dnvp.seatChange));
  const flat = Results.html([Object.assign({}, r.dvp, { seatChange: 0 })], { q: crisis1930, symbols: 'off', seats: true });
  assert.match(flat, /rr-chg same">—</);
});

test("a share's change in points moves into the vote cell's title", () => {
  const html = Results.html(Results.reichstag(crisis1930), { q: crisis1930, symbols: 'off', seats: true });
  assert.match(html, /class="rr-share" title="18%, up 15 points">18%</);
  assert.match(html, /title="[\d.]+%, down 13 points"/);
  assert.match(html, /title="[\d.]+%, no change"/);
  const first = Object.assign({}, start1928);
  Object.keys(first).forEach((k) => { if (k.indexOf('old_') === 0) { delete first[k]; } });
  const noPrev = Results.html(Results.reichstag(first), { q: first, symbols: 'off', seats: true });
  assert.doesNotMatch(noPrev, /rr-share" title/);
});

test('the seat change is coloured by direction on the player row only', () => {
  const rows = Results.reichstag(crisis1930);
  const html = Results.html(rows, { q: crisis1930, symbols: 'off', seats: true });
  const spd = byId(rows).spd;
  const spdRow = html.match(/<button[^>]*party:spd[\s\S]*?<\/button>/)[0];
  assert.match(spdRow, /rr-row player/);
  const dir = spd.seatChange > 0 ? 'up' : spd.seatChange < 0 ? 'down' : 'same';
  assert.match(spdRow, new RegExp('rr-chg ' + dir));
  assert.equal((html.match(/rr-row player/g) || []).length, 1);
});

test('seats show only when asked, and size picks the class', () => {
  const rows = Results.reichstag(start1928);
  const off = Results.html(rows, { q: start1928, symbols: 'off', size: 'full' });
  const on = Results.html(rows, { q: start1928, symbols: 'off', seats: true });
  assert.match(off, /class="rr full/);
  assert.match(on, /class="rr compact/);
  assert.doesNotMatch(off, /rr-seats/);
  assert.match(on, /rr-seats/);
});

test('a party row carries the party badge, period symbols when asked', () => {
  const plain = Results.html(Results.reichstag(start1928), { q: start1928, symbols: 'off' });
  const period = Results.html(Results.reichstag(start1928), { q: start1928, symbols: 'period' });
  assert.match(plain, /class="sc-badge"/);
  assert.match(period, /sc-sym/);
});

test('labels are escaped', () => {
  const html = Results.html(Results.rows([{ label: 'A & <B>', share: 5 }]), {});
  assert.match(html, /A &amp; &lt;B>/);
});

test('an empty list renders nothing', () => {
  assert.equal(Results.html([], {}), '');
});

// The votes that aren't party lists: the presidential elections.

function round1932(extra) {
  return Object.assign({
    election_round: 1, nsdap_candidate: 'Hitler', braun_campaign: 1,
    kpd_support_braun: 0, spd_support_thalmann: 0,
    hindenburg_votes: 49.6, hitler_votes: 28.1, thalmann_votes: 6.3, braun_votes: 16,
    hindenburg_majority: 0, hitler_majority: 0, thalmann_majority: 0, braun_majority: 0
  }, extra);
}

// Presidential votes draw the old layout. This string is what the block
// produced before the Reichstag rows led with seats; it must not move.
test('a presidential block is byte-identical to the layout it always had', () => {
  const q = round1932({ hindenburg_votes: 49.6, hindenburg_majority: 1 });
  const html = Results.html(Results.president1932(q),
    { q: q, symbols: 'off', size: 'full', seats: false, change: false, mark: 50, max: 100 });
  assert.equal(html, "<div class=\"rr full wide-names\"><div class=\"rr-head\"><span class=\"rr-badge\"></span><span class=\"rr-name\"></span><span class=\"rr-bar\">Share</span><span class=\"rr-share\"></span><span class=\"rr-chg\"></span></div><div class=\"rr-row\"><span class=\"rr-badge\"></span><span class=\"rr-name\">Hindenburg</span><span class=\"rr-bar\"><span class=\"rr-fill\" style=\"width:49.6%;background:var(--sc-rel-neutral)\"></span><span class=\"rr-mark\" style=\"left:50%\"></span></span><span class=\"rr-share\">49.6%</span><span class=\"rr-chg rr-tag\">majority</span></div><button type=\"button\" class=\"rr-row\" data-depth-entry=\"party:nsdap\"><span class=\"rr-badge\"><span class=\"sc-badge\" title=\"Nationalsozialistische Deutsche Arbeiterpartei (National Socialist German Workers' Party)\" style=\"background:#964B00;color:#fff\">·</span></span><span class=\"rr-name\">Hitler</span><span class=\"rr-bar\"><span class=\"rr-fill\" style=\"width:28.1%;background:#964B00\"></span><span class=\"rr-mark\" style=\"left:50%\"></span></span><span class=\"rr-share\">28.1%</span><span class=\"rr-chg\"></span></button><button type=\"button\" class=\"rr-row\" data-depth-entry=\"party:kpd\"><span class=\"rr-badge\"><span class=\"sc-badge\" title=\"Kommunistische Partei Deutschlands (Communist Party of Germany)\" style=\"background:#8B0000;color:#fff\">·</span></span><span class=\"rr-name\">Thälmann</span><span class=\"rr-bar\"><span class=\"rr-fill\" style=\"width:6.3%;background:#8B0000\"></span><span class=\"rr-mark\" style=\"left:50%\"></span></span><span class=\"rr-share\">6.3%</span><span class=\"rr-chg\"></span></button><button type=\"button\" class=\"rr-row player\" data-depth-entry=\"party:spd\"><span class=\"rr-badge\"><span class=\"sc-badge\" title=\"Sozialdemokratische Partei Deutschlands (Social Democratic Party of Germany)\" style=\"background:#E3000F;color:#fff\">·</span></span><span class=\"rr-name\">Braun</span><span class=\"rr-bar\"><span class=\"rr-fill\" style=\"width:16%;background:#E3000F\"></span><span class=\"rr-mark\" style=\"left:50%\"></span></span><span class=\"rr-share\">16%</span><span class=\"rr-chg\"></span></button></div>");
});

test('1932: one row per candidate standing, with the party that backs him', () => {
  const rows = Results.president1932(round1932());
  assert.deepEqual(rows.map((r) => r.label), ['Hindenburg', 'Hitler', 'Thälmann', 'Braun']);
  assert.deepEqual(rows.map((r) => r.id), [null, 'nsdap', 'kpd', 'spd']);
  assert.deepEqual(rows.map((r) => r.share), [49.6, 28.1, 6.3, 16]);
});

test('1932: Thälmann stands only without KPD support for Braun, Braun only when he runs', () => {
  const joint = Results.president1932(round1932({ kpd_support_braun: 1 }));
  assert.deepEqual(joint.map((r) => r.label), ['Hindenburg', 'Hitler', 'Braun']);
  const noBraun = Results.president1932(round1932({ braun_campaign: 0 }));
  assert.deepEqual(noBraun.map((r) => r.label), ['Hindenburg', 'Hitler', 'Thälmann']);
});

test('1932: the NSDAP candidate is named by nsdap_candidate', () => {
  const rows = Results.president1932(round1932({ nsdap_candidate: 'Göring' }));
  assert.equal(rows[1].label, 'Göring');
  assert.equal(rows[1].id, 'nsdap');
});

test("1932: the player's row is the candidate the SPD backs", () => {
  const braun = Results.president1932(round1932());
  assert.deepEqual(braun.filter((r) => r.player).map((r) => r.label), ['Braun']);
  const thalmann = Results.president1932(round1932({ braun_campaign: 0, spd_support_thalmann: 1 }));
  assert.deepEqual(thalmann.filter((r) => r.player).map((r) => r.label), ['Thälmann']);
  const hindenburg = Results.president1932(round1932({ braun_campaign: 0 }));
  assert.deepEqual(hindenburg.filter((r) => r.player).map((r) => r.label), ['Hindenburg']);
});

test('1932: Hindenburg has no party and no badge', () => {
  const [h] = Results.president1932(round1932());
  assert.equal(h.id, null);
  const html = Results.html([h], { q: round1932(), symbols: 'off', max: 100 });
  assert.doesNotMatch(html, /<button/);
  assert.doesNotMatch(html, /sc-badge/);
});

test('1932: the majority word sits on the first-round winner only', () => {
  const won = Results.president1932(round1932({ hindenburg_votes: 52, hindenburg_majority: 1 }));
  assert.deepEqual(won.filter((r) => r.tag).map((r) => r.label), ['Hindenburg']);
  assert.equal(won[0].tag, 'majority');
  assert.equal(Results.president1932(round1932()).filter((r) => r.tag).length, 0);
  const second = Results.president1932(round1932({ election_round: 2, hindenburg_votes: 52, hindenburg_majority: 1 }));
  assert.equal(second.filter((r) => r.tag).length, 0);
});

function round1934(extra) {
  return Object.assign({
    round: 1, spd_candidate: 'Braun', has_majority: 0, winner: 'Hitler',
    Hitler_running: 1, Seldte_running: 1, Thalmann_running: 1, Adenauer_running: 1, Braun_running: 1,
    Hitler_votes: 20, Seldte_votes: 14, Thalmann_votes: 9, Adenauer_votes: 15, Braun_votes: 42
  }, extra);
}

test("1934: the rows are the candidates running, in the scene's order, with their backers", () => {
  const rows = Results.president1934(round1934());
  assert.deepEqual(rows.map((r) => r.label), ['Hitler', 'Seldte', 'Thälmann', 'Adenauer', 'Braun']);
  assert.deepEqual(rows.map((r) => r.id), ['nsdap', 'dnvp', 'kpd', 'z', 'spd']);
  assert.deepEqual(rows.map((r) => r.share), [20, 14, 9, 15, 42]);
});

test('1934: a candidate who is not running has no row, however stale his votes', () => {
  const rows = Results.president1934(round1934({ Seldte_running: 0, Seldte_votes: 14 }));
  assert.ok(!rows.some((r) => r.label === 'Seldte'));
});

test('1934: diacritics come back on the names', () => {
  const rows = Results.president1934(round1934({
    Hitler_running: 0, Goring_running: 1, Goring_votes: 11, Thalmann_running: 0,
    Munzenberg_running: 1, Munzenberg_votes: 7
  }));
  assert.deepEqual(rows.map((r) => r.label).slice(0, 2), ['Göring', 'Seldte']);
  assert.ok(rows.some((r) => r.label === 'Münzenberg' && r.id === 'kpd'));
});

test("1934: the player's row is the candidate spd_candidate names", () => {
  const braun = Results.president1934(round1934());
  assert.deepEqual(braun.filter((r) => r.player).map((r) => r.label), ['Braun']);
  const eckener = Results.president1934(round1934({
    spd_candidate: 'Eckener', Braun_running: 0, Eckener_running: 1, Eckener_votes: 30
  }));
  const e = eckener.find((r) => r.label === 'Eckener');
  assert.equal(e.player, true);
  assert.equal(e.id, null, 'an independent has no party badge');
  const adenauer = Results.president1934(round1934({ spd_candidate: 'Adenauer', Braun_running: 0 }));
  assert.deepEqual(adenauer.filter((r) => r.player).map((r) => r.label), ['Adenauer']);
});

test('1934: the majority word sits on the winner of a first round that has one', () => {
  const won = Results.president1934(round1934({ has_majority: 1, winner: 'Braun', Braun_votes: 55 }));
  assert.deepEqual(won.filter((r) => r.tag).map((r) => r.label), ['Braun']);
  assert.equal(Results.president1934(round1934()).filter((r) => r.tag).length, 0);
  const second = Results.president1934(round1934({ round: 2, has_majority: 1, winner: 'Braun' }));
  assert.equal(second.filter((r) => r.tag).length, 0);
});

test("1934: no candidate flags gives no rows, so the scene's text stays", () => {
  assert.deepEqual(Results.president1934({ round: 1 }), []);
});

// The block's additions for these votes.

test("mark draws one threshold tick on every bar's scale", () => {
  const html = Results.html(Results.rows([{ label: 'A', share: 30 }, { label: 'B', share: 60 }]),
    { max: 100, mark: 50 });
  assert.equal((html.match(/class="rr-mark" style="left:50%"/g) || []).length, 2);
  const scaled = Results.html(Results.rows([{ label: 'A', share: 30 }]), { max: 80, mark: 50 });
  assert.match(scaled, /class="rr-mark" style="left:62.5%"/);
});

test('a tag is drawn after the share, in the change column', () => {
  const html = Results.html(Results.rows([{ label: 'A', share: 52, tag: 'majority' }, { label: 'B', share: 48 }]),
    { max: 100, change: false });
  assert.match(html, /rr-share">52%<\/span><span class="rr-chg rr-tag">majority<\/span>/);
  assert.equal((html.match(/rr-tag/g) || []).length, 1);
});

test('change: false drops the dashes and the column heading', () => {
  const html = Results.html(Results.rows([{ label: 'A', share: 52 }]), { change: false });
  assert.doesNotMatch(html, /Change \(pts\)/);
  assert.doesNotMatch(html, /—/);
});

test('without the new options the block is the plain one', () => {
  const html = Results.html(Results.reichstag(crisis1930), { q: crisis1930, symbols: 'off', seats: true });
  assert.doesNotMatch(html, /rr-mark|rr-tag/);
});

// Seats before the election: the old shares run through the allocation, over
// the house the month before.

function noOld(q) {
  const out = Object.assign({}, q);
  Object.keys(out).forEach((k) => { if (k.indexOf('old_') === 0) { delete out[k]; } });
  return out;
}

function previousHouse(q) {
  return q.month > 1 ? Model.houseAt(q.year, q.month - 1) : Model.houseAt(q.year - 1, 12);
}

test('previous seats are the old shares allocated over the previous house', () => {
  [start1928, crisis1930, gov1932].forEach((q) => {
    const prevShares = {};
    Model.PARTIES.forEach((p) => { prevShares[p.id] = q['old_' + p.id + '_r'] || 0; });
    const z = q.old_z_r || 0;
    prevShares.bvp = Math.min(3, z);
    prevShares.z = z - prevShares.bvp;
    if (!q.sapd_formed) { prevShares.sapd = 0; }
    const expected = Model.allocateSeats(prevShares, previousHouse(q));
    Results.reichstag(q).forEach((r) => {
      assert.equal(r.prevSeats, expected[r.id], q.year + ' ' + r.id);
      assert.equal(r.seatChange, r.seats - expected[r.id], q.year + ' ' + r.id);
    });
  });
});

test('the house grows with the election, so the changes add up to the growth', () => {
  const move = Results.seatMovement(crisis1930);
  assert.equal(move.prevHouse, Model.houseAt(1930, 9));
  assert.equal(move.house, Model.houseAt(1930, 10));
  const grown = Results.seatMovement(Object.assign({}, crisis1930, { month: 9 }));
  assert.equal(grown.prevHouse, Model.houseAt(1930, 8));
  assert.equal(grown.house, 577);
  assert.equal(grown.items.reduce((sum, i) => sum + i.change, 0), 577 - grown.prevHouse);
});

test('sum rule: seat changes over every party equal the change in the house', () => {
  [start1928, crisis1930, gov1932,
    Object.assign({}, crisis1930, { month: 9 }),
    Object.assign({}, gov1932, { month: 7 })].forEach((q) => {
    const move = Results.seatMovement(q);
    assert.equal(move.items.reduce((sum, i) => sum + i.change, 0), move.house - move.prevHouse,
      q.year + '-' + q.month);
  });
});

test('a party that had no seats and has some shows its whole count as the gain', () => {
  const r = byId(Results.reichstag(gov1932));
  assert.equal(r.sapd.prevSeats, 0);
  assert.equal(r.sapd.seatChange, r.sapd.seats);
  assert.ok(r.sapd.seats > 0);
});

test('a party with seats before and no share now has no row but is in the movement', () => {
  const q = Object.assign({}, crisis1930, { kpd_r: 0 });
  assert.ok(!Results.reichstag(q).some((r) => r.id === 'kpd'));
  const move = Results.seatMovement(q);
  const kpd = move.items.find((i) => i.id === 'kpd');
  assert.equal(kpd.seats, 0);
  assert.ok(kpd.prevSeats > 0);
  assert.equal(kpd.change, -kpd.prevSeats);
  assert.equal(move.items.reduce((sum, i) => sum + i.change, 0), move.house - move.prevHouse);
});

test('movement is sorted from the largest gain to the largest loss, no change last', () => {
  const move = Results.seatMovement(crisis1930);
  const changes = move.items.map((i) => i.change);
  const nonzero = changes.filter((c) => c !== 0);
  assert.deepEqual(nonzero, nonzero.slice().sort((a, b) => b - a));
  const firstZero = changes.indexOf(0);
  if (firstZero >= 0) { assert.ok(changes.slice(firstZero).every((c) => c === 0)); }
  assert.ok(nonzero.length > 0);
  assert.ok(move.items.every((i) => i.seats > 0 || i.prevSeats > 0));
});

test('a first election with no old values has no previous seats and no movement', () => {
  const q = noOld(start1928);
  Results.reichstag(q).forEach((r) => {
    assert.equal(r.prevSeats, null, r.id);
    assert.equal(r.seatChange, null, r.id);
  });
  assert.equal(Results.seatMovement(q), null);
  const spd = Results.reichstag(q).find((r) => r.id === 'spd');
  assert.deepEqual(Results.partySeats(q, 'spd'), { seats: spd.seats, change: null });
  const html = Results.html(Results.reichstag(q), { q: q, symbols: 'off', seats: true });
  assert.doesNotMatch(html, /undefined|NaN|null/);
});

test("partySeats gives the party's seats and change, and zero seats for a party with no row", () => {
  const spd = byId(Results.reichstag(crisis1930)).spd;
  assert.deepEqual(Results.partySeats(crisis1930, 'spd'), { seats: spd.seats, change: spd.seatChange });
  assert.equal(Results.partySeats(Object.assign({}, crisis1930, { spd_r: 0 }), 'spd').seats, 0);
});

test('January looks back to December of the year before', () => {
  assert.equal(Results.seatMovement(start1928).prevHouse, Model.houseAt(1927, 12));
});
