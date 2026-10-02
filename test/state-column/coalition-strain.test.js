'use strict';

// The coalition model: for each government, who can call a vote of no
// confidence, at what level of dissent, and what the player can do about it
// (Model.coalitionStrain). The thresholds and costs are read back from the
// scene source, so the model can't drift from the game.

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const Model = require('../../out/html/state-column/model.js');

const gov1932 = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'gov1932.json'), 'utf8')
);

const NO_GOVERNMENT = {
  in_popular_front: 0, in_grand_coalition: 0, in_weimar_coalition: 0, in_left_front: 0,
  in_minority_government: 0, in_emergency_government: 0, in_spd_majority: 0,
};

// gov1932 with exactly one government's flag set.
function government(flag, over) {
  return Object.assign({}, gov1932, NO_GOVERNMENT, { [flag]: 1, coalition_dissent: 0, kpd_coalition_dissent: 0 }, over);
}

// ---- who, and at what level -----------------------------------------------------

test('a Grand Coalition: the DVP calls the vote at 3', () => {
  const [p, ...rest] = Model.coalitionStrain(government('in_grand_coalition', { coalition_dissent: 2 }));
  assert.equal(rest.length, 0);
  assert.equal(p.key, 'coalition_dissent');
  assert.equal(p.label, 'Coalition dissent');
  assert.equal(p.callerId, 'dvp');
  assert.equal(p.callerLabel, 'DVP');
  assert.equal(p.threshold, 3);
  assert.equal(p.value, 2);
  assert.equal(p.stepsLeft, 1);
  assert.equal(p.band, 'strained');
});

test('a Grand Coalition at 0, 1, 2 and 3 reads calm, uneasy, strained, vote', () => {
  const bands = [0, 1, 2, 3].map((v) => {
    const [p] = Model.coalitionStrain(government('in_grand_coalition', { coalition_dissent: v }));
    return [p.band, p.stepsLeft];
  });
  assert.deepEqual(bands, [['calm', 3], ['uneasy', 2], ['strained', 1], ['vote', 0]]);
});

test('a Weimar Coalition: the Center calls the vote at 4, so 3 is still strained', () => {
  const at = (v) => Model.coalitionStrain(government('in_weimar_coalition', { coalition_dissent: v }))[0];
  assert.equal(at(3).threshold, 4);
  assert.equal(at(3).callerId, 'z');
  assert.equal(at(3).callerLabel, 'Center');
  assert.equal(at(3).band, 'strained');
  assert.equal(at(3).stepsLeft, 1);
  assert.equal(at(4).band, 'vote');
  assert.equal(at(1).band, 'uneasy');
  assert.equal(at(1).stepsLeft, 3);
});

test('a minority government: the Center calls the vote at 3', () => {
  const [p] = Model.coalitionStrain(government('in_minority_government', { coalition_dissent: 1 }));
  assert.equal(p.callerId, 'z');
  assert.equal(p.threshold, 3);
  assert.equal(p.band, 'uneasy');
});

test('a Popular Front has both partners: the Center at 3 and the KPD at 3', () => {
  const list = Model.coalitionStrain(government('in_popular_front', { coalition_dissent: 2, kpd_coalition_dissent: 3 }));
  assert.deepEqual(list.map((p) => [p.key, p.label, p.callerId, p.threshold, p.band]), [
    ['coalition_dissent', 'Coalition dissent', 'z', 3, 'strained'],
    ['kpd_coalition_dissent', 'KPD dissent', 'kpd', 3, 'vote'],
  ]);
});

test('a Left Front has only the KPD, and it calls the vote at 4', () => {
  const list = Model.coalitionStrain(government('in_left_front', { kpd_coalition_dissent: 3 }));
  assert.equal(list.length, 1);
  assert.equal(list[0].key, 'kpd_coalition_dissent');
  assert.equal(list[0].callerLabel, 'KPD');
  assert.equal(list[0].threshold, 4);
  assert.equal(list[0].band, 'strained');
});

test('no partners to manage: opposition, an SPD majority, an emergency government', () => {
  assert.deepEqual(Model.coalitionStrain(Object.assign({}, government('in_grand_coalition'), { spd_in_government: 0 })), []);
  assert.deepEqual(Model.coalitionStrain(government('in_spd_majority', { coalition_dissent: 2 })), []);
  assert.deepEqual(Model.coalitionStrain(government('in_emergency_government', { coalition_dissent: 2 })), []);
  assert.deepEqual(Model.coalitionStrain({}), []);
});

test('a value past the threshold is still a vote, and a negative one still calm', () => {
  const [over] = Model.coalitionStrain(government('in_grand_coalition', { coalition_dissent: 5 }));
  assert.equal(over.band, 'vote');
  assert.equal(over.stepsLeft, 0);
  const [under] = Model.coalitionStrain(government('in_grand_coalition', { coalition_dissent: -1 }));
  assert.equal(under.band, 'calm');
});

// ---- when no vote can fire ------------------------------------------------------

test('constructive_vonc blocks the vote, with its reason', () => {
  const [p] = Model.coalitionStrain(government('in_grand_coalition', { coalition_dissent: 3, constructive_vonc: 1 }));
  assert.match(p.blocked, /bans votes of no confidence/);
  assert.equal(p.sentence, 'No vote can be called: ' + p.blocked + '.');
});

test('an SPD at half the seats or more blocks the vote', () => {
  const [p] = Model.coalitionStrain(government('in_grand_coalition', { coalition_dissent: 3, spd_r: 50 }));
  assert.match(p.blocked, /half the seats/);
  const [q] = Model.coalitionStrain(government('in_grand_coalition', { coalition_dissent: 3, spd_r: 49.9 }));
  assert.equal(q.blocked, null);
});

test('both partners are blocked together in a Popular Front', () => {
  const list = Model.coalitionStrain(government('in_popular_front', { constructive_vonc: 1 }));
  assert.ok(list.every((p) => typeof p.blocked === 'string'));
});

// ---- the sentence ---------------------------------------------------------------

test('the sentence, per band, names the caller and counts the steps', () => {
  const say = (flag, v, over) => Model.coalitionStrain(government(flag, Object.assign({ coalition_dissent: v }, over)))[0].sentence;
  assert.equal(say('in_grand_coalition', 0), 'The partners are content.');
  assert.equal(say('in_grand_coalition', 1), '2 more steps and the DVP calls a vote of no confidence.');
  assert.equal(say('in_grand_coalition', 2), 'One more step and the DVP calls a vote of no confidence.');
  assert.equal(say('in_grand_coalition', 3), 'The DVP will call a vote of no confidence this month.');
  assert.equal(say('in_weimar_coalition', 1), '3 more steps and the Center calls a vote of no confidence.');
  assert.equal(say('in_weimar_coalition', 4), 'The Center will call a vote of no confidence this month.');
});

test('the sentence splits around the caller so the view can put its badge there', () => {
  const [p] = Model.coalitionStrain(government('in_grand_coalition', { coalition_dissent: 2 }));
  assert.equal(p.sentenceParts.before + p.callerLabel + p.sentenceParts.after, p.sentence);
  assert.equal(p.sentenceParts.before, 'One more step and the ');
  const [calm] = Model.coalitionStrain(government('in_grand_coalition'));
  assert.equal(calm.sentenceParts, null);
  const [blocked] = Model.coalitionStrain(government('in_grand_coalition', { constructive_vonc: 1 }));
  assert.equal(blocked.sentenceParts, null);
});

test('the KPD partner reads the same way', () => {
  const [p] = Model.coalitionStrain(government('in_left_front', { kpd_coalition_dissent: 3 }));
  assert.equal(p.sentence, 'One more step and the KPD calls a vote of no confidence.');
});

// ---- what the player can do -----------------------------------------------------

test('the Coalition Affairs card is ready when its timer is 0 and there is dissent to ease', () => {
  const [p] = Model.coalitionStrain(government('in_grand_coalition', { coalition_dissent: 1, coalition_affairs_timer: 0 }));
  assert.deepEqual(p.remedies.card, { state: 'ready', months: 0, reason: null });
});

test('the card is waiting while its timer runs, and says how many months', () => {
  const [p] = Model.coalitionStrain(government('in_grand_coalition', { coalition_dissent: 2, coalition_affairs_timer: 3 }));
  assert.deepEqual(p.remedies.card, { state: 'wait', months: 3, reason: null });
});

test('the card is not available in a minority government, which it does not list', () => {
  const [p] = Model.coalitionStrain(government('in_minority_government', { coalition_dissent: 2 }));
  assert.equal(p.remedies.card.state, 'unavailable');
  assert.match(p.remedies.card.reason, /minority government/);
});

test('the card needs dissent of at least 1', () => {
  const [p] = Model.coalitionStrain(government('in_grand_coalition', { coalition_dissent: 0 }));
  assert.equal(p.remedies.card.state, 'unavailable');
});

test('the resources option costs 2 for 1 step, is affordable at 2, and is absent in historical mode', () => {
  const at = (over) => Model.coalitionStrain(government('in_grand_coalition', Object.assign({ coalition_dissent: 1 }, over)))[0].remedies.resources;
  assert.deepEqual(at({ resources: 2 }), { cost: 2, lowersBy: 1, affordable: true, have: 2 });
  assert.equal(at({ resources: 1 }).affordable, false);
  assert.equal(at({ resources: 5, historical_mode: 1 }), null);
});

test('the KPD partner has no card and no resource option outside its own vote', () => {
  const [p] = Model.coalitionStrain(government('in_left_front', { kpd_coalition_dissent: 2 }));
  assert.deepEqual(p.remedies, { card: null, resources: null });
});

// ---- the figures, read back from the scenes -------------------------------------

const root = path.join(__dirname, '..', '..');
function scene(...parts) {
  return fs.readFileSync(path.join(root, 'source', 'scenes', ...parts), 'utf8').replace(/\r\n/g, '\n');
}

test('the thresholds are the ones the two no-confidence scenes read', () => {
  const vote = scene('events', 'vote_of_no_confidence.scene.dry').match(/^view-if: (.+)$/m)[1];
  // The or binds tighter than the and (see the scenes' view-if), so each trailing
  // guard holds for both branches; the model's blocked reasons are those guards.
  assert.match(vote, /\(in_grand_coalition = 1 or in_popular_front = 1 or in_minority_government = 1\) and coalition_dissent >= 3/);
  assert.match(vote, /in_weimar_coalition = 1 and coalition_dissent >= 4/);
  assert.match(vote, /spd_r < 50 and not constructive_vonc$/);
  const kpd = scene('events', 'kpd_vote_of_no_confidence.scene.dry').match(/^view-if: (.+)$/m)[1];
  assert.match(kpd, /in_popular_front = 1 and kpd_coalition_dissent >= 3/);
  assert.match(kpd, /in_left_front = 1 and kpd_coalition_dissent >= 4/);
  assert.match(kpd, /spd_r < 50 and not constructive_vonc$/);

  const t = (flag, key) => Model.coalitionStrain(government(flag))
    .filter((p) => p.key === key)[0].threshold;
  assert.equal(t('in_grand_coalition', 'coalition_dissent'), 3);
  assert.equal(t('in_popular_front', 'coalition_dissent'), 3);
  assert.equal(t('in_minority_government', 'coalition_dissent'), 3);
  assert.equal(t('in_weimar_coalition', 'coalition_dissent'), 4);
  assert.equal(t('in_popular_front', 'kpd_coalition_dissent'), 3);
  assert.equal(t('in_left_front', 'kpd_coalition_dissent'), 4);
});

test('the DVP is named for a Grand Coalition and the Center for the others, as the scene names them', () => {
  const text = scene('events', 'vote_of_no_confidence.scene.dry');
  assert.match(text, /\[\? if in_grand_coalition : The DVP \?\]\[\? if in_weimar_coalition or in_popular_front or in_minority_government: The Center Party \?\]/);
});

test('the Coalition Affairs card and its resource option match the model', () => {
  const card = scene('government_affairs', 'coalition_affairs.scene.dry');
  assert.match(card.match(/^view-if: (.+)$/m)[1],
    /^spd_in_government = 1 and coalition_dissent >= 1 and coalition_affairs_timer = 0 and \(in_grand_coalition or in_weimar_coalition or in_popular_front\)$/);
  assert.match(card, /^on-arrival: month_actions \+= 1; coalition_affairs_timer = 5$/m);
  const block = card.slice(card.indexOf('\n@resources\n'), card.indexOf('\n@no_change'));
  const cost = Number(block.match(/choose-if: resources >= (\d+)/)[1]);
  assert.match(block, new RegExp('on-arrival: resources -= ' + cost + '; coalition_dissent -= 1'));
  assert.match(block, /view-if: historical_mode = 0/);
  const [p] = Model.coalitionStrain(government('in_grand_coalition', { coalition_dissent: 1, resources: 9 }));
  assert.equal(p.remedies.resources.cost, cost);
  assert.equal(p.remedies.resources.lowersBy, 1);
  // Agreeing to the welfare cuts clears it.
  assert.match(card.slice(card.indexOf('\n@promise_cuts\n'), card.indexOf('\n@resources\n')), /coalition_dissent = 0$/m);
});

test('the card is on a five-month timer that the game counts down each month', () => {
  const root_dry = scene('root.scene.dry');
  assert.match(root_dry, /'coalition_affairs'/);
  assert.match(scene('post_event.scene.dry'), /Q\[timer\+'_timer'\] -= 1/);
});
