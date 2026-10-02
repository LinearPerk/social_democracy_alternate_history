'use strict';

// The coalition dissent block: drawn at the foot of the Party and State tabs
// while a partner can call a vote of no confidence, one block per partner, each
// a button that opens the Coalition dissent entry. The model behind it is
// tested in coalition-strain.test.js.

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const View = require('../../out/html/state-column/view.js');
const Model = require('../../out/html/state-column/model.js');

function loadFixture(name) {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures', name + '.json'), 'utf8')
  );
}

const start1928 = loadFixture('start1928');
const gov1932 = loadFixture('gov1932');
const gov1932_prev = loadFixture('gov1932_prev');

const NO_GOVERNMENT = {
  in_popular_front: 0, in_grand_coalition: 0, in_weimar_coalition: 0, in_left_front: 0,
  in_minority_government: 0, in_emergency_government: 0, in_spd_majority: 0,
};

function government(flag, over) {
  return Object.assign({}, gov1932, NO_GOVERNMENT, { [flag]: 1 }, over);
}

const draw = (tab, q, base, opts) => View.renderTab(tab, q, base || q, opts || {});

// The markup of each block on a tab, as {head, band, segments, vote, say, notes, html}.
function blocks(tab, q, base, opts) {
  const html = draw(tab, q, base, opts);
  return (html.match(/<button type="button" class="sc-cd[\s\S]*?<\/button>/g) || []).map((b) => ({
    html: b,
    head: b.match(/<span class="cd-name">([^<]*)</)[1],
    band: b.match(/<span class="cd-band">([^<]*)/)[1],
    segments: (b.match(/<i[ >]/g) || []).length,
    filled: (b.match(/<i class="on/g) || []).length,
    labelled: (b.match(/<i[^>]*>vote<\/i>/g) || []).length,
    say: b.match(/<span class="cd-say">([\s\S]*?)<\/span>(?=<span class="cd-note">|<\/button>)/)[1].replace(/<span class="sc-badge[\s\S]*?<\/span>/g, ''),
    notes: (b.match(/<span class="cd-note">([^<]*)</g) || []).map((n) => n.replace(/<span class="cd-note">|</g, '')),
  }));
}

// ---- when it shows ---------------------------------------------------------------

test('no block in opposition, on either tab', () => {
  for (const tab of ['party', 'state']) {
    const html = draw(tab, start1928, start1928, {});
    assert.doesNotMatch(html, /sc-coalition|sc-cd/, tab);
  }
});

test('no block with an SPD majority or an emergency government: there is no vote to call', () => {
  for (const flag of ['in_spd_majority', 'in_emergency_government']) {
    for (const tab of ['party', 'state']) {
      assert.doesNotMatch(draw(tab, government(flag, { coalition_dissent: 2 }), null, {}), /sc-coalition/, flag + ' ' + tab);
    }
  }
});

test('the block closes both tabs: after the factions on Party, after the chart on State', () => {
  const party = draw('party', gov1932, gov1932, {});
  assert.ok(party.indexOf('sc-frows') < party.indexOf('sc-coalition'));
  const history = JSON.stringify([{ year: 1932, month: 8, inflation: 0.9, growth: 1.5, unemployed: 21, budget: 3 }]);
  const state = draw('state', Object.assign({}, gov1932, { sc_history: history }), gov1932, {});
  assert.ok(state.indexOf('sc-econ-chart') < state.indexOf('sc-coalition'));
  assert.ok(state.lastIndexOf('sc-fig') < state.indexOf('sc-coalition'));
});

test('the old pip row is gone from both tabs', () => {
  for (const tab of ['party', 'state']) {
    const html = draw(tab, gov1932, gov1932, {});
    assert.doesNotMatch(html, /sc-pips|KPD partner|data-depth-term="coalition-dissent"/, tab);
  }
});

// ---- the block ------------------------------------------------------------------

test('a Popular Front shows both partners: the Center first, then the KPD, three segments each', () => {
  for (const tab of ['party', 'state']) {
    const list = blocks(tab, gov1932);
    assert.deepEqual(list.map((b) => b.head), ['Coalition dissent', 'KPD dissent'], tab);
    assert.deepEqual(list.map((b) => b.segments), [3, 3], tab);
    assert.deepEqual(list.map((b) => b.filled), [2, 2], tab);
  }
});

test('the segments are the steps to the vote: three in a Grand Coalition, four in a Weimar Coalition, the last labelled', () => {
  const grand = blocks('party', government('in_grand_coalition', { coalition_dissent: 1 }))[0];
  assert.equal(grand.segments, 3);
  assert.equal(grand.filled, 1);
  assert.equal(grand.labelled, 1);
  const weimar = blocks('party', government('in_weimar_coalition', { coalition_dissent: 3 }))[0];
  assert.equal(weimar.segments, 4);
  assert.equal(weimar.filled, 3);
  assert.equal(weimar.labelled, 1);
  assert.match(weimar.html, /<i class="vote">vote<\/i><\/span>/);
});

test('the last segment is filled, and labelled, when the vote is due', () => {
  const b = blocks('party', government('in_grand_coalition', { coalition_dissent: 3 }))[0];
  assert.equal(b.filled, 3);
  assert.match(b.html, /<i class="on vote">vote<\/i>/);
});

test('a value past the threshold fills the track and no more', () => {
  const b = blocks('party', government('in_grand_coalition', { coalition_dissent: 6 }))[0];
  assert.equal(b.segments, 3);
  assert.equal(b.filled, 3);
});

test('a Left Front has the KPD block alone, four segments', () => {
  const list = blocks('party', government('in_left_front', { kpd_coalition_dissent: 1 }));
  assert.deepEqual(list.map((b) => [b.head, b.segments, b.filled]), [['KPD dissent', 4, 1]]);
});

test('the track says its count to a screen reader, and carries no pips', () => {
  const html = draw('party', government('in_grand_coalition', { coalition_dissent: 2 }), null, {});
  assert.match(html, /<span class="cd-track" role="img" aria-label="2 of 3 steps to a vote of no confidence">/);
  assert.doesNotMatch(html, /sc-pips/);
});

test('the block is one button that opens the Coalition dissent entry', () => {
  for (const tab of ['party', 'state']) {
    const list = blocks(tab, gov1932);
    assert.equal(list.length, 2);
    list.forEach((b) => assert.match(b.html, /^<button type="button" class="sc-cd [^"]*" data-depth-entry="coalition-dissent"/));
  }
});

test('the band word follows the model, and the block carries it as a class', () => {
  const at = (v) => blocks('party', government('in_grand_coalition', { coalition_dissent: v }))[0];
  assert.deepEqual([0, 1, 2, 3].map((v) => at(v).band), ['calm', 'uneasy', 'strained', 'vote']);
  assert.match(at(2).html, /class="sc-cd band-strained"/);
});

test('the sentence, per band, names the caller, with its badge', () => {
  const at = (flag, v) => blocks('party', government(flag, { coalition_dissent: v }))[0];
  assert.equal(at('in_grand_coalition', 0).say, 'The partners are content.');
  assert.equal(at('in_grand_coalition', 1).say, '2 more steps and the DVP calls a vote of no confidence.');
  assert.equal(at('in_grand_coalition', 2).say, 'One more step and the DVP calls a vote of no confidence.');
  assert.equal(at('in_grand_coalition', 3).say, 'The DVP will call a vote of no confidence this month.');
  assert.equal(at('in_weimar_coalition', 3).say, 'One more step and the Center calls a vote of no confidence.');
  assert.match(at('in_grand_coalition', 2).html, /and the <span class="sc-badge[^>]*title="Deutsche Volkspartei/);
  assert.match(at('in_weimar_coalition', 2).html, /<span class="sc-badge[^>]*title="Deutsche Zentrumspartei/);
});

test('a blocked vote says so in the sentence and the band word, and the track stays', () => {
  const b = blocks('party', government('in_grand_coalition', { coalition_dissent: 3, constructive_vonc: 1 }))[0];
  assert.match(b.say, /^No vote can be called: the constitution bans votes of no confidence/);
  assert.equal(b.band, 'no vote');
  assert.match(b.html, /class="sc-cd band-vote blocked"/);
  assert.equal(b.segments, 3);
});

test('the head carries this month\'s change, with the dashboard\'s arrows', () => {
  const html = draw('party', gov1932, gov1932_prev, {});
  // gov1932's coalition_dissent (2) rose from gov1932_prev's (1): bad, not large.
  assert.match(html, /<span class="cd-band">strained<span class="sc-delta bad"[^>]*>▲<\/span><\/span>/);
});

test('a change in either dissent flashes its own block', () => {
  const html = draw('party', gov1932, gov1932, { last: Object.assign({}, gov1932, { kpd_coalition_dissent: 0 }) });
  const [first, second] = blocks('party', gov1932, gov1932, { last: Object.assign({}, gov1932, { kpd_coalition_dissent: 0 }) });
  assert.doesNotMatch(first.html, /sc-flash/);
  assert.match(second.html, /class="sc-cd band-strained sc-flash"/);
  assert.equal((html.match(/sc-flash/g) || []).length, 1);
});

// ---- the detail lines -----------------------------------------------------------

const LOG = JSON.stringify([
  { t: Model.timeIndex(1932, 6), key: 'coalition_dissent', delta: 1, cause: 'Labor Rights' },
  { t: Model.timeIndex(1932, 7), key: 'kpd_coalition_dissent', delta: 1, cause: 'Economic Policy' },
]);

test('the Party tab keeps all five lines: head, track, sentence, last, and what eases it', () => {
  const q = government('in_grand_coalition', { coalition_dissent: 2, coalition_affairs_timer: 0, resources: 3, sc_coalition_log: LOG });
  const [b] = blocks('party', q);
  assert.deepEqual(b.notes, [
    'Last: Labor Rights, June 1932, +1',
    'To ease it: Coalition Affairs card: ready · 2 resources lower it by 1',
  ]);
});

test('a block drawn "brief" keeps the row and the sentence and drops the notes', () => {
  const q = government('in_grand_coalition', { coalition_dissent: 2, resources: 3, sc_coalition_log: LOG });
  const [b] = blocks('state', q, q, { detail: { state: 'brief' } });
  assert.deepEqual(b.notes, []);
  assert.match(b.say, /^One more step/);
  assert.equal(b.segments, 3);
});

test('a block drawn "line" is the row alone: label, track and band word', () => {
  const q = government('in_grand_coalition', { coalition_dissent: 2, resources: 3, sc_coalition_log: LOG });
  const html = draw('party', q, q, { detail: { party: 'line' } });
  assert.doesNotMatch(html, /cd-say|cd-note/);
  assert.match(html, /<span class="cd-row"><span class="cd-name">Coalition dissent<\/span><span class="cd-track"[^>]*>(<i[^>]*>[^<]*<\/i>){3}<\/span><span class="cd-band">strained/);
});

test('the size is per tab, and a tab without one draws the full block', () => {
  const q = government('in_grand_coalition', { coalition_dissent: 2, sc_coalition_log: LOG });
  const opts = { detail: { party: 'brief' } };
  assert.equal(blocks('party', q, q, opts)[0].notes.length, 0);
  assert.equal(blocks('state', q, q, opts)[0].notes.length, 2);
  assert.equal(blocks('party', q, q, { detail: { party: 'huge' } })[0].notes.length, 2);
});

test('"Last" is the newest move of that dissent, and each partner has its own', () => {
  const [centre, kpd] = blocks('party', Object.assign({}, gov1932, { sc_coalition_log: LOG }));
  assert.ok(centre.notes.includes('Last: Labor Rights, June 1932, +1'));
  assert.ok(kpd.notes.includes('Last: Economic Policy, July 1932, +1'));
});

test('"Last" is left out with an empty log', () => {
  const [b] = blocks('party', government('in_grand_coalition', { coalition_dissent: 2 }));
  assert.ok(b.notes.every((n) => !/^Last/.test(n)));
});

test('what eases it: the card waiting, the card unavailable, resources short, historical mode', () => {
  const ease = (over, flag) => blocks('party', government(flag || 'in_grand_coalition', Object.assign({ coalition_dissent: 2 }, over)))[0].notes.filter((n) => /^To ease/.test(n))[0];
  assert.equal(ease({ coalition_affairs_timer: 3 }), 'To ease it: Coalition Affairs card: in 3 months');
  assert.equal(ease({ coalition_affairs_timer: 1 }), 'To ease it: Coalition Affairs card: in 1 month');
  assert.equal(ease({ resources: 1 }), 'To ease it: Coalition Affairs card: ready · 2 resources lower it by 1 (you have 1)');
  assert.equal(ease({ historical_mode: 1 }), 'To ease it: Coalition Affairs card: ready');
  assert.equal(ease({}, 'in_minority_government'), 'To ease it: Coalition Affairs card: not available in a minority government');
});

test('at no dissent there is nothing to ease, and the KPD block never has the line: no card touches it', () => {
  const [calm] = blocks('party', government('in_grand_coalition', { coalition_dissent: 0 }));
  assert.deepEqual(calm.notes, []);
  const [kpd] = blocks('party', government('in_left_front', { kpd_coalition_dissent: 2 }));
  assert.deepEqual(kpd.notes, []);
});

test('a blocked partner is still told what eases it', () => {
  const [b] = blocks('party', government('in_grand_coalition', { coalition_dissent: 2, constructive_vonc: 1, coalition_affairs_timer: 0 }));
  assert.ok(b.notes.some((n) => /^To ease/.test(n)));
});

test('every block text is escaped', () => {
  const log = JSON.stringify([{ t: Model.timeIndex(1932, 6), key: 'coalition_dissent', delta: 1, cause: '<b>Card</b> & co' }]);
  const html = draw('party', government('in_grand_coalition', { coalition_dissent: 1, sc_coalition_log: log }), null, {});
  assert.match(html, /Last: &lt;b>Card&lt;\/b> &amp; co, June 1932, \+1/);
});

// ---- the size that fits ----------------------------------------------------------

// Heights by markup size, as the page would measure them: a table keyed on how
// much of the block the markup holds.
function heightsBySize(table) {
  return (markups) => markups.map((markup, i) => {
    if (i === 0) return table.defense;
    const tab = /sc-frows/.test(markup) ? 'party' : 'state';
    const size = /cd-note/.test(markup) ? 'full' : /cd-say/.test(markup) ? 'brief' : 'line';
    return table[tab][size];
  });
}

test('each tab takes the richest block that keeps it no taller than Defense', () => {
  const q = government('in_grand_coalition', { coalition_dissent: 2 });
  const picked = View.pickDetail(q, q, {}, heightsBySize({
    defense: 224, party: { full: 219, brief: 190, line: 160 }, state: { full: 233, brief: 201, line: 170 },
  }));
  assert.deepEqual(picked, { party: 'full', state: 'brief' });
});

test('a tab that fits no size keeps the smallest', () => {
  const q = government('in_popular_front', { coalition_dissent: 2 });
  const picked = View.pickDetail(q, q, {}, heightsBySize({
    defense: 224, party: { full: 300, brief: 260, line: 230 }, state: { full: 300, brief: 241, line: 199 },
  }));
  assert.deepEqual(picked, { party: 'line', state: 'line' });
});

test('with no partner there is no block to size and no measuring', () => {
  let asked = 0;
  const picked = View.pickDetail(start1928, start1928, {}, () => { asked++; return []; });
  assert.equal(asked, 0);
  assert.deepEqual(picked, { party: 'full', state: 'full' });
});

test('the sizes are measured as drawn for measuring: no flash, no open-entry mark, no id', () => {
  const q = government('in_grand_coalition', { coalition_dissent: 2 });
  let seen = [];
  View.pickDetail(q, q, { last: Object.assign({}, q, { coalition_dissent: 0 }), openEntry: 'coalition-dissent' }, (markups) => {
    seen = markups;
    return markups.map(() => 100);
  });
  assert.equal(seen.length, 1 + 2 * 3);
  seen.forEach((m) => assert.doesNotMatch(m, /sc-flash|aria-current|\sid="/));
});
