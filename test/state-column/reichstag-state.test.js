'use strict';

// What the Reichstag block shows: the chancellor's party badge and the
// president line. (The economic figures moved to the State tab.)

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

const Z_BADGE = '<span class="sc-badge" title="Deutsche Zentrumspartei (Center Party)" style="background:#1c1c1c;color:#fff">·</span>';
const SPD_BADGE = '<span class="sc-badge" title="Sozialdemokratische Partei Deutschlands (Social Democratic Party of Germany) · Liste 1" style="background:#E3000F;color:#fff">1</span>';


test('the chancellor\'s party badge sits beside his name in the government line', () => {
  const html = View.chart(start1928, start1928, {});
  assert.ok(
    html.includes('<span class="cab"> · ' + Z_BADGE + 'Marx cabinet</span>'),
    'missing Z badge before Marx'
  );
});

test('a coalition label names no chancellor, so the officials line carries him with his badge', () => {
  const html = View.chart(gov1932, gov1932, {});
  assert.match(html, /<span class="cab"> · Popular Front<\/span>/);
  assert.ok(
    html.includes('<span title="Chancellor">Reichskanzler ' + SPD_BADGE + '<b>Wels</b></span>'),
    'missing chancellor with SPD badge on the officials line'
  );
});

test('the officials line names the president, his name marked, under the government line', () => {
  const html = View.chart(start1928, start1928, {});
  assert.ok(html.includes('<div class="sc-officials"><span class="who"><span title="President">Reichspräsident <b>Hindenburg</b></span></span>'));
  assert.ok(html.indexOf('sc-govlbl') < html.indexOf('sc-officials'), 'officials line should follow the government line');
});

test('the officials line is in the full text colour, the names a weight up', () => {
  const css = fs.readFileSync(path.join(__dirname, '../../out/html/state-column/state-column.css'), 'utf8');
  const rule = css.match(/#state-column \.sc-officials \{[^}]*\}/);
  assert.match(rule[0], /color: var\(--text-color\);/);
  const name = css.match(/#state-column \.sc-officials \.who b \{[^}]*\}/);
  assert.ok(name, 'no rule for the names');
  assert.match(name[0], /font-weight: 500;/);
});

test('the government line has no coalition-share bar under it', () => {
  for (const q of [start1928, gov1932]) {
    const html = View.chart(q, q, {});
    assert.doesNotMatch(html, /sc-track|sc-half/);
  }
});

test('the position word in the government line opens the matching entry', () => {
  const cases = [
    [start1928, 'opposition', 'Opposition'],
    [gov1932, 'government', 'Government'],
    [Object.assign({}, gov1932, { spd_in_government: 0, spd_toleration: 1 }), 'toleration', 'Toleration'],
    [Object.assign({}, gov1932, { spd_caretaker: 1 }), 'caretaker', 'Caretaker']
  ];
  for (const [q, slug, word] of cases) {
    const html = View.chart(q, q, {});
    assert.ok(
      html.includes('<span class="pos"><span data-depth-term="' + slug + '">' + word + '</span></span>'),
      slug + ' term missing from the government line'
    );
    assert.equal((html.match(/data-depth-term=/g) || []).length, 1, slug + ': only the position word is a term');
  }
});

test('no badge appears when chancellor_party matches no party', () => {
  const q = Object.assign({}, start1928, { chancellor_party: 'nobody' });
  const html = View.chart(q, q, {});
  assert.match(html, /<span class="cab"> · Marx cabinet<\/span>/);
});

test('with no president and no spare chancellor the line holds only the countdown; with no election either, there is no line', () => {
  const q = Object.assign({}, start1928, { president: '' });
  const html = View.chart(q, q, {});
  assert.doesNotMatch(html, /class="who"/);
  assert.match(html, /<div class="sc-officials"><span class="sc-countdown">/);
  const none = Object.assign({}, q, { next_election_year: 0 });
  assert.doesNotMatch(View.chart(none, none, {}), /sc-officials/);
});

function officialsLine(q) {
  const html = View.chart(q, q, {});
  const m = html.match(/<div class="sc-officials">([^]*?)<[/]div><[/]div><[/]div>$/);
  assert.ok(m, 'no officials line');
  return m[1];
}

test('the countdown sits at the right end of the officials line, after the names, in the old wording', () => {
  const line = officialsLine(start1928);
  assert.ok(line.endsWith('<span class="sc-countdown">Election in <b>4 months</b><small> · May 1928</small></span>'), line);
  assert.ok(line.indexOf('Hindenburg') < line.indexOf('sc-countdown'));
  // One countdown, and it is not a row of its own under the line any more.
  assert.equal((View.chart(start1928, start1928, {}).match(/sc-countdown/g) || []).length, 1);
  assert.doesNotMatch(View.chart(start1928, start1928, {}), /<div class="sc-countdown"/);
});

test('when the full countdown is too long for the names, it shortens to "Election · May 1928" with the months in a title', () => {
  // Eight months out, to September: too long beside "Reichspräsident Hindenburg".
  const q = Object.assign({}, start1928, { next_election_month: 9, next_election_year: 1928 });
  const line = officialsLine(q);
  assert.ok(line.endsWith('<span class="sc-countdown" title="Election in 8 months">Election<small> · September 1928</small></span>'), line);
  assert.doesNotMatch(line, /sc-countdown[^]*<b>/);
});

test('with a chancellor named on the line, nothing shortened fits beside the names: the countdown takes its own line, in full', () => {
  const q = Object.assign({}, gov1932);
  const line = officialsLine(q);
  assert.match(line, /<span class="sc-countdown own">Election in <b>47 months<[/]b><small> · July 1936<[/]small><[/]span>$/);
  assert.match(line, /Reichskanzler .*Wels.*Reichspräsident <b>Braun/);
});

test('one month out reads "1 month" on the officials line', () => {
  const q = Object.assign({}, start1928, { month: 4 });
  assert.match(officialsLine(q), /Election in <b>1 month<[/]b>/);
});

test('the Reichstag block has no economy strip: the figures live on the State tab', () => {
  for (const q of [start1928, gov1932]) {
    const html = View.chart(q, q, {});
    assert.doesNotMatch(html, /sc-economy|Inflation|Growth|Unemployment/);
    assert.match(html, /sc-countdown/);
    assert.match(html, /sc-officials/);
  }
});

test('the officials line is set at 13px on one line', () => {
  const css = fs.readFileSync(path.join(__dirname, '../../out/html/state-column/state-column.css'), 'utf8');
  const rule = css.match(/#state-column \.sc-officials \{[^}]*\}/);
  assert.ok(rule, 'no .sc-officials rule');
  assert.match(rule[0], /font-size: 13px;/);
  assert.match(rule[0], /display: flex;/);
  // The names never wrap: they truncate before they break.
  const who = css.match(/#state-column [.]sc-officials [.]who [{][^}]*[}]/);
  assert.ok(who, 'no .sc-officials .who rule');
  assert.match(who[0], /white-space: nowrap;/, 'the names stay on one line');
});
