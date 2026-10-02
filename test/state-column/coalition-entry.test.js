'use strict';

// The Coalition dissent entry in the depth column: the explanation (a record in
// entries.json) and, under it, the live part drawn from the game's state: the
// track, what moved it, how to lower it. The figures it quotes are checked
// against the scenes.

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const Model = require('../../out/html/state-column/model.js');
const Entry = require('../../out/html/depth-column/coalition-entry.js');

const root = path.join(__dirname, '..', '..');
const gov1932 = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'gov1932.json'), 'utf8'));
const start1928 = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'start1928.json'), 'utf8'));

const NO_GOVERNMENT = {
  in_popular_front: 0, in_grand_coalition: 0, in_weimar_coalition: 0, in_left_front: 0,
  in_minority_government: 0, in_emergency_government: 0, in_spd_majority: 0,
};

function government(flag, over) {
  return Object.assign({}, gov1932, NO_GOVERNMENT, { [flag]: 1, coalition_dissent: 0, kpd_coalition_dissent: 0 }, over);
}

function scene(...parts) {
  return fs.readFileSync(path.join(root, 'source', 'scenes', ...parts), 'utf8').replace(/\r\n/g, '\n');
}

function text(html) {
  return html.replace(/<span class="sc-badge[\s\S]*?<\/span>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/\s+/g, ' ').trim();
}

const LOG = JSON.stringify([
  { t: Model.timeIndex(1932, 5), key: 'coalition_dissent', delta: 1, cause: 'Labor Rights' },
  { t: Model.timeIndex(1932, 6), key: 'kpd_coalition_dissent', delta: 2, cause: 'Economic Policy' },
  { t: Model.timeIndex(1932, 7), key: 'coalition_dissent', delta: -1, cause: 'Coalition Affairs' },
]);

// ---- the track and the sentence --------------------------------------------------

test('the live part opens with each partner\'s track, as long as the block\'s, and its sentence', () => {
  const html = Entry.renderCoalitionLive(government('in_weimar_coalition', { coalition_dissent: 3 }));
  assert.equal((html.match(/<span class="cd-track"/g) || []).length, 1);
  assert.equal((html.match(/<span class="cd-track"[^>]*>(<i[^>]*>[^<]*<\/i>)+/)[0].match(/<i[ >]/g) || []).length, 4);
  assert.match(text(html), /One more step and the Center calls a vote of no confidence\./);
  assert.match(html, /<span class="sc-badge/);
});

test('a Popular Front has two tracks, each under its name', () => {
  const html = Entry.renderCoalitionLive(government('in_popular_front', { coalition_dissent: 1, kpd_coalition_dissent: 2 }));
  assert.equal((html.match(/<span class="cd-track"/g) || []).length, 2);
  assert.match(html, /Coalition dissent[\s\S]*KPD dissent/);
  assert.match(text(html), /2 more steps and the Center calls[\s\S]*One more step and the KPD calls/);
});

test('without a partner it says why no vote can be called, and draws no track', () => {
  const none = Entry.renderCoalitionLive(start1928);
  assert.doesNotMatch(none, /cd-track/);
  assert.match(text(none), /The SPD is not in government/);
  assert.match(text(Entry.renderCoalitionLive(government('in_spd_majority'))), /governs alone/);
  assert.match(text(Entry.renderCoalitionLive(government('in_emergency_government'))), /emergency government/);
});

// ---- what moved it -----------------------------------------------------------------

test('what moved it lists the log newest first, with month and amount, each dissent named', () => {
  const html = Entry.renderCoalitionLive(government('in_popular_front', { sc_coalition_log: LOG }));
  const items = (html.match(/<li class="cde-move[^>]*>[\s\S]*?<\/li>/g) || []).map(text);
  assert.deepEqual(items, [
    'Coalition Affairs July 1932 −1 Coalition',
    'Economic Policy June 1932 +2 KPD',
    'Labor Rights May 1932 +1 Coalition',
  ]);
});

test('a rise is marked as bad and a fall as good, and the amount carries a true minus sign', () => {
  const html = Entry.renderCoalitionLive(government('in_popular_front', { sc_coalition_log: LOG }));
  assert.match(html, /<b class="cde-amt bad">\+2<\/b>/);
  assert.match(html, /<b class="cde-amt good">−1<\/b>/);
});

test('with the log empty it says nothing has moved it yet', () => {
  assert.match(text(Entry.renderCoalitionLive(government('in_grand_coalition'))), /Nothing has moved it yet/);
});

test('the log is escaped', () => {
  const log = JSON.stringify([{ t: Model.timeIndex(1932, 5), key: 'coalition_dissent', delta: 1, cause: '<i>x</i> & y' }]);
  const html = Entry.renderCoalitionLive(government('in_grand_coalition', { sc_coalition_log: log }));
  assert.match(html, /&lt;i>x&lt;\/i> &amp; y/);
});

// ---- how to lower it ---------------------------------------------------------------

test('how to lower it names the card, the advisors, the partners\' favourites and the vote itself, with the game\'s figures', () => {
  const t = Model.COALITION_TERMS;
  const body = text(Entry.renderCoalitionLive(government('in_grand_coalition', { coalition_dissent: 1 })));
  assert.match(body, new RegExp('Coalition Affairs card'));
  assert.match(body, new RegExp('welfare falls by ' + t.cutsWelfare));
  assert.match(body, new RegExp('Left dissent rises by ' + t.cutsLeftDissent + ' and Labor dissent by ' + t.cutsLaborDissent));
  assert.match(body, new RegExp('spend ' + t.cardResources + ' resources to lower it by ' + t.step));
  assert.match(body, new RegExp('returns ' + 'five' + ' months after'));
  assert.match(body, /Braun.* Müller/);
  assert.match(body, new RegExp('wait six months'));
  assert.match(body, new RegExp('spend ' + t.voteResources + ' resources'));
});

test('the card line ends with where the card stands now', () => {
  const at = (over, flag) => text(Entry.renderCoalitionLive(government(flag || 'in_grand_coalition', Object.assign({ coalition_dissent: 1 }, over))));
  assert.match(at({ coalition_affairs_timer: 0 }), /On offer now\./);
  assert.match(at({ coalition_affairs_timer: 4 }), /Back in 4 months\./);
  assert.match(at({}, 'in_minority_government'), /Not available in a minority government\./);
  assert.match(at({ coalition_dissent: 0 }), /Needs dissent of at least 1\./);
});

test('the resource option is left out of the card line in historical mode', () => {
  const body = text(Entry.renderCoalitionLive(government('in_grand_coalition', { coalition_dissent: 1, historical_mode: 1 })));
  assert.doesNotMatch(body, /spend 2 resources to lower it by 1/);
  assert.match(body, /not offered in historical mode/);
});

test('the KPD line says no card or advisor lowers its dissent, only its own vote', () => {
  const body = text(Entry.renderCoalitionLive(government('in_left_front', { kpd_coalition_dissent: 2 })));
  assert.match(body, /KPD dissent: no card or advisor lowers it/);
  assert.doesNotMatch(body, /Coalition Affairs card/);
});

// ---- the figures, read back from the scenes ---------------------------------------

test('the welfare cut and what it costs the party are the card\'s', () => {
  const card = scene('government_affairs', 'coalition_affairs.scene.dry');
  const cuts = card.slice(card.indexOf('\n@promise_cuts\n'), card.indexOf('\n@resources\n')).match(/^on-arrival: (.+)$/m)[1];
  const t = Model.COALITION_TERMS;
  assert.match(cuts, new RegExp('welfare -= ' + t.cutsWelfare + ';'));
  assert.match(cuts, new RegExp('budget \\+= ' + t.cutsBudget + ';'));
  assert.match(cuts, new RegExp('left_dissent \\+= ' + t.cutsLeftDissent + ';'));
  assert.match(cuts, new RegExp('labor_dissent \\+= ' + t.cutsLaborDissent + ';'));
  assert.match(cuts, /coalition_dissent = 0$/);
  assert.match(card, new RegExp('coalition_affairs_timer = ' + t.cardWaitMonths + '$', 'm'));
});

test('the advisors\' action takes one step and starts the six-month wait', () => {
  for (const file of ['braun', 'muller']) {
    const text = scene('advisors', file + '.scene.dry');
    const action = text.slice(text.indexOf('\n@coalition\n'));
    assert.match(action, new RegExp('advisor_action_timer = ' + Model.COALITION_TERMS.advisorWaitMonths + ';'), file);
    assert.match(action, /coalition_dissent -= 1 if spd_in_government = 1 and coalition_dissent > 0/, file);
  }
});

test('a vote called by the Right or the KPD offers three resources for one step', () => {
  const t = Model.COALITION_TERMS;
  const right = scene('events', 'vote_of_no_confidence.scene.dry');
  const resources = right.slice(right.indexOf('\n@resources\n'), right.indexOf('\n@support_kpd\n'));
  assert.match(resources, new RegExp('choose-if: resources >= ' + t.voteResources));
  assert.match(resources, new RegExp('resources -= ' + t.voteResources + '; coalition_dissent -= 1'));
  const kpd = scene('events', 'kpd_vote_of_no_confidence.scene.dry');
  const kpdResources = kpd.slice(kpd.indexOf('\n@resources\n'), kpd.indexOf('\n@support_center\n'));
  assert.match(kpdResources, new RegExp('resources >= ' + t.voteResources + ' and kpd_ultimatum_seen = 0'));
  assert.match(kpdResources, new RegExp('resources -= ' + t.voteResources + '; kpd_coalition_dissent -= 1'));
  // And the two other ways to call it off, which set it to 0.
  assert.match(right, /@give_up_prussia\nview-if: spd_prussia == 1\non-arrival: coalition_dissent = 0;/);
  assert.match(right, /@austerity\n[^\n]*\non-arrival: coalition_dissent = 0;/);
});

test('the choices the partners favour each take a step off, as the entry lists them', () => {
  const lowers = (file, id, grand) => {
    const text = scene('government_affairs', file);
    const block = text.slice(text.indexOf('\n@' + id + '\n'));
    const line = block.match(/^on-arrival: .+$/m)[0];
    assert.match(line, grand ? /coalition_dissent -= 1 if in_grand_coalition and coalition_dissent > 0/ : /coalition_dissent -= 1 if coalition_dissent > 0/, file + ' ' + id);
  };
  lowers('labor_affairs.scene.dry', 'support_employers');
  lowers('military_policy.scene.dry', 'increase_funding');
  lowers('foreign_policy.scene.dry', 'customs_union_2');
  lowers('foreign_policy.scene.dry', 'reduce_reparations');
  lowers('fiscal_policy.scene.dry', 'regressive', true);
  lowers('social_welfare.scene.dry', 'reduce_spending', true);
});

test('an election and a Popular Front\'s formation reset the dissents; the entry says elections do', () => {
  const election = scene('events', 'election_1928.scene.dry');
  assert.match(election, /^Q\.coalition_dissent = 0;$/m);
  assert.match(election, /^Q\.kpd_coalition_dissent = 0;$/m);
});

// ---- the record -------------------------------------------------------------------

const records = JSON.parse(fs.readFileSync(path.join(root, 'out', 'html', 'depth-column', 'entries.json'), 'utf8'));

test('the entry\'s explanation speaks of segments and thresholds, not pips', () => {
  const record = records['coalition-dissent'];
  assert.equal(record.title, 'Coalition dissent');
  const body = text(record.html);
  assert.doesNotMatch(body, /pip/i);
  assert.match(body, /A Grand Coalition, a Popular Front or a minority government has three segments, a Weimar Coalition four/);
  assert.match(body, /The KPD has a track of its own in a Popular Front \(three segments\) and in a Left Front \(four\)/);
  assert.match(body, /the DVP in a Grand Coalition, the Center Party in/);
  assert.match(body, /the government falls and there is an election in a few months/);
  assert.equal(record.library, 'curr_gov');
});
