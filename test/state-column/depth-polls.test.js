'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const Readouts = require('../../out/html/depth-column/readouts.js');

function loadFixture(name) {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures', name + '.json'), 'utf8')
  );
}

const start1928 = loadFixture('start1928');
const gov1932 = loadFixture('gov1932');

function stackBlocks(html) {
  const re = /<div class="dc-stack">([\s\S]*?)<\/div>/g;
  const blocks = [];
  let m;
  while ((m = re.exec(html))) {
    blocks.push(m[1]);
  }
  return blocks;
}

function segmentWidths(block) {
  const re = /width:([\d.]+)%/g;
  const widths = [];
  let m;
  while ((m = re.exec(block))) {
    widths.push(parseFloat(m[1]));
  }
  return widths;
}

const renderPolls = Readouts.renderPolls;

test('normal mode shows the By group heading and one bar per group, each summing to 100%', () => {
  const html = renderPolls(start1928);
  assert.match(html, /<div class="dc-sub">By group<\/div>/);
  for (const label of ['Workers', 'New middle class', 'Old middle class', 'Rural', 'Unemployed', 'Catholics']) {
    assert.ok(html.includes('<div class="dc-sub">' + label + '</div>'), `missing group label: ${label}`);
  }
  const blocks = stackBlocks(html);
  assert.equal(blocks.length, 6);
  blocks.forEach((block, i) => {
    const total = segmentWidths(block).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(total - 100) < 0.1, `block ${i} summed to ${total}`);
  });
});

test('normal mode falls back to the raw quality when its _display sibling is absent', () => {
  // start1928 has no *_display qualities at all; workers_spd (60) is 60% of
  // the group's 100 raw total, so the SPD segment should read 60%.
  assert.match(renderPolls(start1928), /title="SPD 60%"/);
});

test('normal mode prefers the _display quality over the raw one when both exist', () => {
  // Isolate the workers group to just kpd (raw 20) and spd: give spd a
  // _display of 40 that disagrees with its raw 60. Total is 20 + 40 = 60,
  // so spd should read 67% (40/60), never 75% (the value if raw 60 had
  // been used instead) or 60% (the raw share on its own).
  const q = Object.assign({}, start1928, {
    workers_ddp: 0, workers_dnvp: 0, workers_dvp: 0, workers_nsdap: 0,
    workers_other: 0, workers_z: 0, workers_kpd: 20,
    workers_spd: 60, workers_spd_display: 40
  });
  const html = renderPolls(q);
  assert.match(html, /title="SPD 67%"/);
  assert.match(html, /title="KPD 33%"/);
  assert.doesNotMatch(html, /title="SPD 75%"/);
  assert.doesNotMatch(html, /title="SPD 60%"/);
});

test('normal mode never shows a BVP segment, even when a bvp quality exists for a group', () => {
  const q = Object.assign({}, start1928, { workers_bvp: 50, workers_bvp_display: 50 });
  assert.doesNotMatch(renderPolls(q), /title="BVP/);
});

test('normal mode omits SAPD until it forms, then includes it', () => {
  const withoutSapd = Object.assign({}, start1928, { workers_sapd: 20 });
  assert.doesNotMatch(renderPolls(withoutSapd), /title="SAPD/);

  const withSapd = Object.assign({}, gov1932, { workers_sapd: 20 });
  assert.match(renderPolls(withSapd), /title="SAPD/);
});

test('normal mode ends with the seat-chart note', () => {
  const html = renderPolls(start1928);
  assert.ok(html.includes(
    "<div class=\"dc-note\">The seat chart's Polls toggle shows the projected Reichstag.</div>"
  ));
});

function republic(pro_republic) {
  return renderPolls(Object.assign({}, start1928, { historical_mode: 1, pro_republic }));
}

test('historical mode shows one meter with its band word, and no group bars, needle, or note', () => {
  const html = republic(40);
  assert.match(html, /<div class="dc-sub">Support for the Republic<\/div>/);
  assert.equal((html.match(/class="dc-meter"/g) || []).length, 1);
  assert.match(html, /<span class="dc-meter-word">moderate<\/span>/);
  assert.doesNotMatch(html, /By group/);
  assert.doesNotMatch(html, /dc-stack|dc-note|sc-gauge|svg/);
});

test('historical mode meter fills pro_republic against a 0-100 max, clamped', () => {
  assert.match(republic(0), /class="fill" style="width:0%"/);
  assert.match(republic(40), /class="fill" style="width:40%"/);
  assert.match(republic(100), /class="fill" style="width:100%"/);
  assert.match(republic(140), /class="fill" style="width:100%"/);
  assert.match(republic(-5), /class="fill" style="width:0%"/);
});

test('historical mode band words run from very low to very high in fifths', () => {
  const word = (v) => republic(v).match(/dc-meter-word">([^<]+)</)[1];
  assert.equal(word(0), 'very low');
  assert.equal(word(19), 'very low');
  assert.equal(word(20), 'low');
  assert.equal(word(59), 'moderate');
  assert.equal(word(60), 'high');
  assert.equal(word(80), 'very high');
  assert.equal(word(100), 'very high');
});
