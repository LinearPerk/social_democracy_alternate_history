'use strict';

// The election entry (depth column): the large hemicycle and the result rows
// for the last election this game held, drawn from its record and not from
// the current polls. Pure renderers only; the claim on arrival, the hover
// light and the clicks are checked in the layout harness.

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const Entry = require('../../out/html/depth-column/election-entry.js');
const Reichstag = require('../../out/html/depth-column/reichstag-entry.js');
const Model = require('../../out/html/state-column/model.js');
const Results = require('../../out/html/state-column/results.js');

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name + '.json'), 'utf8'));
}

// The fixtures stand at a date with the shares of the election before it;
// this gives each one the record the game would have pushed at that
// election (the _r values as they were, one item per election).
function withRecord(q, year, month) {
  const record = { date: new Date(year, month - 1).toISOString() };
  Model.PARTIES.forEach((p) => {
    if (typeof q[p.id + '_r'] === 'number') record[p.id] = q[p.id + '_r'];
  });
  return Object.assign({}, q, { election_records: [record] });
}

const start1928 = withRecord(loadFixture('start1928'), 1928, 5);
const crisis1930 = withRecord(loadFixture('crisis1930'), 1930, 9);
const gov1932 = withRecord(loadFixture('gov1932'), 1932, 7);
const FIXTURES = { start1928, crisis1930, gov1932 };

const count = (html, re) => (html.match(re) || []).length;

test('the title names the month and year of the last record', () => {
  assert.equal(Entry.title(start1928), 'Reichstag election, May 1928');
  assert.equal(Entry.title(crisis1930), 'Reichstag election, September 1930');
  assert.equal(Entry.title(gov1932), 'Reichstag election, July 1932');
});

test('the title follows the last of several records', () => {
  const q = Object.assign({}, gov1932, {
    election_records: start1928.election_records.concat(gov1932.election_records),
  });
  assert.equal(Entry.title(q), 'Reichstag election, July 1932');
});

test('before any election the title is plain and the body says so in a sentence', () => {
  const q = Object.assign({}, loadFixture('start1928'), { election_records: [] });
  assert.equal(Entry.title(q), 'Reichstag election');
  const html = Entry.renderElectionEntry(q);
  assert.match(html, /No Reichstag election has been held in this game yet\./);
  assert.equal(count(html, /<svg/g), 0);
  assert.equal(count(html, /rr-row/g), 0);
  // A game whose records are missing altogether reads the same.
  const bare = Object.assign({}, q);
  delete bare.election_records;
  assert.match(Entry.renderElectionEntry(bare), /No Reichstag election has been held/);
});

Object.keys(FIXTURES).forEach((name) => {
  const q = FIXTURES[name];

  test(`${name}: one row per party that took votes, each opening that party's entry`, () => {
    const html = Entry.renderElectionEntry(q);
    const rows = Results.reichstag(Entry.resultQualities(q));
    assert.ok(rows.length >= 6);
    assert.equal(count(html, /class="rr-row[^"]*" data-depth-entry="party:/g), rows.length);
    rows.forEach((r) => assert.ok(html.includes('data-depth-entry="party:' + r.id + '"'), r.id));
  });

  test(`${name}: the hemicycle draws exactly the house, and the rows' seats add up to it`, () => {
    const html = Entry.renderElectionEntry(q);
    const date = new Date(q.election_records[0].date);
    const house = Model.houseAt(date.getFullYear(), date.getMonth() + 1);
    assert.equal(count(html, /<circle/g), house);
    const seatCells = (html.match(/<span class="rr-seats">(\d*)<\/span>/g) || [])
      .map((s) => Number(s.replace(/\D/g, '')));
    assert.equal(seatCells.reduce((a, b) => a + b, 0), house);
  });

  test(`${name}: no government is marked, so no seat is dimmed`, () => {
    const html = Entry.renderElectionEntry(q);
    assert.equal(count(html, /opacity="0\.28"/g), 0);
    assert.equal(count(html, /sc-party-seats (lit|dim)/g), 0);
    assert.match(html, /sc-housenum">\d+</);
  });

  test(`${name}: the note on seats follows the rows`, () => {
    const html = Entry.renderElectionEntry(q);
    assert.ok(html.includes('Seats follow votes: one for every 60,000.'));
    assert.ok(html.indexOf('rr-row') < html.indexOf('Seats follow votes'));
  });
});

test('a game with the SPD in government still draws no marking', () => {
  const q = Object.assign({}, gov1932, { spd_in_government: 1, in_popular_front: 1 });
  assert.equal(count(Entry.renderElectionEntry(q), /opacity="0\.28"/g), 0);
});

test('the shares are the record\'s, not the current polls', () => {
  const q = Object.assign({}, start1928, { spd_r: 5, spd_votes: 5 });
  q.election_records = [Object.assign({}, start1928.election_records[0], { spd: 31 })];
  const rows = Results.reichstag(Entry.resultQualities(q));
  assert.equal(rows.filter((r) => r.id === 'spd')[0].share, 31);
  assert.match(Entry.renderElectionEntry(q), /<span class="rr-share"[^>]*>31%<\/span>/);
});

test('the change comes from the old_ values the election left', () => {
  const q = Object.assign({}, start1928, { old_spd_r: 26, old_kpd_r: 13, old_z_r: 17 });
  q.election_records = [Object.assign({}, start1928.election_records[0], { spd: 29 })];
  const rows = Results.reichstag(Entry.resultQualities(q));
  const spd = rows.filter((r) => r.id === 'spd')[0];
  assert.equal(spd.change, spd.share - 26);
  assert.match(Entry.renderElectionEntry(q), /▲ \d/);
});

test('the year and month of the record set the house, not the game\'s date', () => {
  // 1928 house (491) from a record dated May 1928, while the game's date is later.
  const q = Object.assign({}, start1928, { year: 1932, month: 7 });
  assert.equal(count(Entry.renderElectionEntry(q), /<circle/g), Model.houseAt(1928, 5));
});

test('SAPD seats show when the record has them, whatever the flag says now', () => {
  const record = Object.assign({}, gov1932.election_records[0], { sapd: 4 });
  const q = Object.assign({}, gov1932, { sapd_formed: 0, election_records: [record] });
  assert.match(Entry.renderElectionEntry(q), /party:sapd/);
});

test('sections is an ordered list of HTML strings: lead, hemicycle, gains and losses, rows', () => {
  const list = Entry.sections(start1928);
  assert.ok(Array.isArray(list));
  assert.ok(list.length >= 4);
  list.forEach((s) => assert.equal(typeof s, 'string'));
  assert.match(list[0], /class="el-lead/);
  assert.match(list[1], /<svg/);
  assert.match(list[2], /Gains and losses/);
  assert.match(list[3], /class="rr full with-seats"/);
  assert.equal(Entry.sections(Object.assign({}, start1928, { election_records: [] })).length, 0);
});

test('every section sits inside the entry, in order', () => {
  const html = Entry.renderElectionEntry(start1928);
  const list = Entry.sections(start1928);
  let at = -1;
  list.forEach((s) => {
    const next = html.indexOf(s);
    assert.ok(next > at, 'section out of order');
    at = next;
  });
  assert.match(html, /^<div class="dc-entry el-entry" data-entry="election:latest"/);
});

test('an animated entry carries how far into the fade it is', () => {
  assert.doesNotMatch(Entry.renderElectionEntry(start1928), /el-enter/);
  const html = Entry.renderElectionEntry(start1928, { elapsed: 240 });
  assert.match(html, /el-enter/);
  assert.match(html, /--el-elapsed:240ms/);
});

test('the Reichstag entry offers "Last election" only once a record exists', () => {
  const before = Object.assign({}, loadFixture('start1928'), { election_records: [] });
  assert.doesNotMatch(Reichstag.renderReichstagEntry(before), /election:latest/);
  const after = Reichstag.renderReichstagEntry(start1928);
  assert.match(after, /data-depth-entry="election:latest"/);
  assert.match(after, /Last election/);
});

// ---- Coalitions and who moved ------------------------------------------------

const GROUPS = ['workers', 'new_middle', 'old_middle', 'rural', 'unemployed', 'catholics'];

// A record's groups as the game stores them: each group's party shares. A
// share table under `_all` applies to every group not named.
function groupsOf(shares) {
  const out = {};
  GROUPS.forEach((g) => { out[g] = Object.assign({}, shares[g] || shares._all || {}); });
  return out;
}

function twoRecords(before, after) {
  const base = gov1932.election_records[0];
  return Object.assign({}, gov1932, {
    election_records: [
      Object.assign({}, base, { groups: groupsOf(before) }),
      Object.assign({}, base, { groups: groupsOf(after) }),
    ],
  });
}

function houseOf(q) {
  const when = new Date(q.election_records[q.election_records.length - 1].date);
  return Model.houseAt(when.getFullYear(), when.getMonth() + 1);
}

test('coalitions: majorities first, then by size', () => {
  const rq = Entry.resultQualities(gov1932);
  const house = houseOf(gov1932);
  const counts = Model.allocateSeats(Model.seatShares(rq, 'seats'), house);
  const rows = Entry.coalitionRows(rq);
  const all = Reichstag.coalitions(rq, counts, house);
  assert.equal(rows.length, all.length);
  rows.forEach((r, i) => {
    if (i === 0) return;
    const p = rows[i - 1];
    assert.ok(p.clears >= r.clears, 'a majority after a shortfall');
    if (p.clears === r.clears) assert.ok(p.seats >= r.seats, 'larger after smaller');
  });
  rows.forEach((r) => {
    const want = all.filter((a) => a.id === r.id)[0];
    assert.equal(r.seats, want.seats);
    assert.equal(r.clears, r.seats >= Model.majority(house));
  });
});

test('coalitions: the word is "majority" or "short by N" against the house majority', () => {
  const html = Entry.renderElectionEntry(gov1932);
  const house = houseOf(gov1932);
  const rows = Entry.coalitionRows(Entry.resultQualities(gov1932));
  rows.forEach((r) => {
    const word = r.clears ? 'majority' : 'short by ' + (Model.majority(house) - r.seats);
    const at = html.indexOf('data-el-coalition="' + r.id + '"');
    assert.ok(at > 0, r.id);
    const chunk = html.slice(at, html.indexOf('</button>', at));
    assert.ok(chunk.includes('>' + word + '<'), r.id + ': ' + word);
    assert.ok(chunk.includes('>' + r.seats + '<'), r.id + ' total');
  });
  assert.ok(rows.some((r) => !r.clears), 'the fixture should have a shortfall to check');
  assert.match(html, /<div class="dc-sub">Coalitions<\/div>/);
});

test('coalitions: segments stack the members\' seats on the house scale, with a tick at the majority', () => {
  const html = Entry.renderElectionEntry(gov1932);
  const house = houseOf(gov1932);
  const at = html.indexOf('data-el-coalition="grand"');
  const chunk = html.slice(at, html.indexOf('</button>', at));
  const tick = chunk.match(/class="el-co-tick" style="left:([\d.]+)%/);
  assert.ok(tick);
  assert.ok(Math.abs(Number(tick[1]) - Model.majority(house) / house * 100) < 0.01);
  const widths = (chunk.match(/class="el-co-seg" style="width:[\d.]+%/g) || [])
    .map((s) => Number(s.match(/width:([\d.]+)/)[1]));
  const row = Entry.coalitionRows(Entry.resultQualities(gov1932)).filter((r) => r.id === 'grand')[0];
  assert.ok(Math.abs(widths.reduce((a, b) => a + b, 0) - row.seats / house * 100) < 0.05);
});

test('coalitions: a picked one is pressed and lights its members on the hemicycle', () => {
  const html = Entry.renderElectionEntry(gov1932, { picked: 'grand' });
  assert.match(html, /data-el-coalition="grand" aria-pressed="true"/);
  assert.match(html, /data-el-coalition="weimar" aria-pressed="false"/);
  assert.match(html, /sc-party-seats lit" data-sc-seats="spd"/);
  assert.match(html, /sc-party-seats dim" data-sc-seats="kpd"/);
  assert.match(html, /sc-houselbl">coalition</);
  // An unknown pick lights nothing.
  assert.equal(count(Entry.renderElectionEntry(gov1932, { picked: 'nope' }), /sc-party-seats (lit|dim)/g), 0);
});

test('by group: six stacked bars under the head', () => {
  const html = Entry.renderElectionEntry(gov1932);
  assert.match(html, /<div class="dc-sub">By group<\/div>/);
  ['Workers', 'New middle class', 'Old middle class', 'Rural', 'Unemployed', 'Catholics'].forEach((label) => {
    assert.ok(html.includes('<div class="dc-sub">' + label + '</div>'), label);
  });
  assert.equal(count(html, /class="dc-stack"/g), 6);
});

test('who moved: the largest gain and the largest loss, in points, rounded', () => {
  const before = { workers: { spd: 50, kpd: 20, dnvp: 10, nsdap: 10, other: 10 } };
  const after = { workers: { spd: 54.4, kpd: 20.2, dnvp: 3.6, nsdap: 11.8, other: 10 } };
  const q = twoRecords(before, after);
  const move = Entry.movement(q, 'workers');
  assert.equal(move.gain.id, 'spd');
  assert.equal(move.gain.points, 4);
  assert.equal(move.loss.id, 'dnvp');
  assert.equal(move.loss.points, 6);
  assert.match(Entry.renderElectionEntry(q), /SPD ▲ 4<\/span> · <span class="el-down">DNVP ▼ 6/);
});

test('who moved: moves under a point are left out, and no change says so', () => {
  const before = { workers: { spd: 50, kpd: 25, other: 25 }, rural: { spd: 20, dnvp: 80 } };
  const after = { workers: { spd: 50.6, kpd: 24.4, other: 25 }, rural: { spd: 25, dnvp: 75 } };
  const q = twoRecords(before, after);
  assert.equal(Entry.movement(q, 'workers').gain, null);
  assert.equal(Entry.movement(q, 'workers').loss, null);
  assert.match(Entry.renderElectionEntry(q), /<div class="el-move">no change<\/div>/);
  const rural = Entry.movement(q, 'rural');
  assert.equal(rural.gain.id, 'spd');
  assert.equal(rural.loss.id, 'dnvp');
  // A group with only a gain shows the gain alone.
  const solo = Entry.movement(twoRecords({ rural: { spd: 20, dnvp: 80 } }, { rural: { spd: 25, dnvp: 80 } }), 'rural');
  assert.equal(solo.gain.points, 5);
  assert.equal(solo.loss, null);
});

test('who moved: with no earlier record carrying groups, the bars draw and the line is left out', () => {
  const rec = gov1932.election_records[0];
  const mine = groupsOf({ _all: { spd: 60, kpd: 40 } });
  const only = Object.assign({}, gov1932, { election_records: [Object.assign({}, rec, { groups: mine })] });
  assert.equal(Entry.movement(only, 'workers'), null);
  let html = Entry.renderElectionEntry(only);
  assert.equal(count(html, /class="dc-stack"/g), 6);
  assert.equal(count(html, /el-move/g), 0);
  // An earlier record from before this change has no groups.
  const old = Object.assign({}, gov1932, { election_records: [rec, Object.assign({}, rec, { groups: mine })] });
  assert.equal(Entry.movement(old, 'workers'), null);
  assert.equal(count(Entry.renderElectionEntry(old), /el-move/g), 0);
});

test('a record without groups does not throw, and draws the bars from the game\'s own values', () => {
  const html = Entry.renderElectionEntry(gov1932);
  assert.equal(count(html, /el-move/g), 0);
  assert.equal(count(html, /class="dc-stack"/g), 6);
  const bare = Object.assign({}, gov1932, { election_records: [{ date: gov1932.election_records[0].date }] });
  assert.doesNotThrow(() => Entry.renderElectionEntry(bare));
});

test('the bars read the record\'s shares, not the game\'s current ones', () => {
  const rec = Object.assign({}, gov1932.election_records[0], { groups: groupsOf({ _all: { spd: 75, kpd: 25 } }) });
  const html = Entry.renderElectionEntry(Object.assign({}, gov1932, { election_records: [rec] }));
  assert.match(html, /title="SPD 75%"/);
  assert.match(html, /title="KPD 25%"/);
});

test('sections: the coalitions and groups follow the rows', () => {
  const list = Entry.sections(gov1932);
  assert.equal(list.length, 6);
  assert.match(list[4], /Coalitions/);
  assert.match(list[5], /By group/);
});

// ---- Seats gained and lost -------------------------------------------------

function noOld(q) {
  const out = Object.assign({}, q);
  Object.keys(out).forEach((k) => { if (k.indexOf('old_') === 0) { delete out[k]; } });
  return out;
}

// Months where the house changes, so the changes are not all zero.
const may1928 = withRecord(Object.assign(loadFixture('start1928'), { year: 1928, month: 5 }), 1928, 5);
const sep1930 = withRecord(Object.assign(loadFixture('crisis1930'), { year: 1930, month: 9 }), 1930, 9);

test('the lead line names the SPD, its seats and its seat change, above the hemicycle', () => {
  const q = sep1930;
  const move = Results.partySeats(Entry.resultQualities(q), 'spd');
  const html = Entry.renderElectionEntry(q);
  const lead = html.match(/<div class="el-lead[^"]*">[\s\S]*?<\/div>/)[0];
  assert.ok(html.indexOf('el-lead') < html.indexOf('<svg'));
  assert.match(lead, /sc-badge/);
  const text = lead.match(/el-lead-text">([\s\S]*?)<\/span>/)[1];
  const arrow = move.change > 0 ? '▲ ' + move.change : move.change < 0 ? '▼ ' + -move.change : '—';
  assert.equal(text.replace(/\s+/g, ' ').trim(), 'SPD · ' + move.seats + ' seats · ' + arrow);
  assert.match(lead, new RegExp('el-lead ' + (move.change > 0 ? 'good' : move.change < 0 ? 'bad' : 'same')));
});

test('a first election has a lead line with seats and no change', () => {
  const q = noOld(may1928);
  const lead = Entry.sections(q)[0];
  assert.match(lead, /SPD · \d+ seats/);
  assert.doesNotMatch(lead, /▲|▼|—/);
  assert.match(lead, /el-lead same/);
});

function glRows(q) {
  const html = Entry.sections(q).filter((s) => /Gains and losses/.test(s))[0] || '';
  return html.match(/<button[^>]*el-gl-row[\s\S]*?<\/button>/g) || [];
}

test('gains and losses: a row per party that moved, sorted, in a party button', () => {
  const rows = glRows(sep1930);
  const move = Results.seatMovement(Entry.resultQualities(sep1930));
  assert.deepEqual(rows.map((r) => r.match(/data-depth-entry="party:([a-z]+)"/)[1]), move.items.map((i) => i.id));
  rows.forEach((r) => assert.match(r, /^<button type="button" class="el-gl-row/));
  const signed = rows.map((r) => r.match(/el-gl-num"[^>]*>([^<]*)</)[1]);
  assert.deepEqual(signed, move.items.map((i) => (i.change > 0 ? '+' + i.change : i.change < 0 ? '−' + -i.change : '0')));
});

test('gains and losses: gains grow right of the centre, losses left, in the party colour', () => {
  const rows = glRows(sep1930);
  const move = Results.seatMovement(Entry.resultQualities(sep1930));
  move.items.forEach((item, i) => {
    const color = Model.PARTIES.find((p) => p.id === item.id).color;
    if (item.change > 0) {
      assert.match(rows[i], /el-gl-fill up" style="left:50%;width:[\d.]+%;background:/);
    } else if (item.change < 0) {
      assert.match(rows[i], /el-gl-fill down" style="right:50%;width:[\d.]+%;background:/);
    } else {
      assert.doesNotMatch(rows[i], /el-gl-fill/);
    }
    if (item.change !== 0) { assert.ok(rows[i].includes('background:' + color)); }
  });
});

test('gains and losses: the largest change fills half the width, the rest in proportion', () => {
  const rows = glRows(sep1930);
  const move = Results.seatMovement(Entry.resultQualities(sep1930));
  const top = Math.max(...move.items.map((i) => Math.abs(i.change)));
  move.items.forEach((item, i) => {
    if (item.change === 0) { return; }
    const width = parseFloat(rows[i].match(/width:([\d.]+)%/)[1]);
    assert.ok(Math.abs(width - Math.abs(item.change) / top * 50) < 0.06, item.id);
  });
  assert.ok(rows.some((r) => /width:50%/.test(r)));
});

test('gains and losses: parties with no change come last, without a bar', () => {
  const q = Object.assign({}, may1928);
  const rows = glRows(q);
  const bars = rows.map((r) => /el-gl-fill/.test(r));
  const firstBare = bars.indexOf(false);
  if (firstBare >= 0) { assert.ok(bars.slice(firstBare).every((b) => !b)); }
  rows.filter((r) => !/el-gl-fill/.test(r)).forEach((r) => assert.match(r, /el-gl-num"[^>]*>0</));
});

test('gains and losses: a party that fell out of the house is listed with its loss', () => {
  const rec = Object.assign({}, sep1930.election_records[0], { kpd: 0 });
  const q = Object.assign({}, sep1930, { election_records: [rec] });
  const rows = glRows(q);
  const kpd = rows.find((r) => /party:kpd/.test(r));
  assert.match(kpd, /el-gl-fill down/);
  assert.match(kpd, /el-gl-num"[^>]*>−\d+</);
});

test('gains and losses is left out when there is no previous result', () => {
  const q = noOld(may1928);
  assert.equal(glRows(q).length, 0);
  assert.doesNotMatch(Entry.renderElectionEntry(q), /Gains and losses/);
});

test('the hover light also answers to a gains-and-losses row', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../out/html/depth-column/election-entry.js'), 'utf8');
  assert.match(src, /\.el-gl-row\[data-depth-entry\]/);
});
