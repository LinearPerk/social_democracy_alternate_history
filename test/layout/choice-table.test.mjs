'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The choice-table builder in out/html/decision-column/decision-column.js:
// the model it makes from a spec and the engine's choices, and the DOM it
// renders from that model (here on a stub document, which is enough to read
// the structure). The page behaviour (clicks, Tab, the looks) is in
// start-table.e2e.mjs; the shipped figures are checked against the scenes at
// the bottom of this file.

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const { tableModel, renderChoiceTable } = createRequire(import.meta.url)('../../out/html/decision-column/decision-column.js');
const shipped = JSON.parse(readFileSync(join(root, 'out/html/decision-column/choice-tables.json'), 'utf8'));

const spec = {
  firstLabel: 'Mode',
  summaryLabel: 'Summary',
  columns: [
    { key: 'a', label: 'Alpha' },
    { key: 'b', label: 'Beta' },
  ],
  rows: {
    one: { cells: { a: ['A1', 'fine print'], b: 'B1' }, summary: 'First.', detail: 'a figure · another' },
    two: { cells: { b: { lines: ['B2'], title: 'detail' } }, summary: 'Second.' },
    all: { span: 'Settle it yourself', summary: 'Your call.' },
  },
  notes: [{ choice: 'two', subtitleHas: 'Careful.' }],
};

const choice = (id, extra = {}) => ({ id, title: id.toUpperCase(), subtitle: '', canChoose: true, ...extra });

test('rows follow the engine order and match the spec by choice id', () => {
  const m = tableModel(spec, [choice('two'), choice('one')]);
  assert.deepEqual(m.rows.map((r) => r.id), ['two', 'one']);
  assert.deepEqual(m.rows.map((r) => r.index), [0, 1]);
  assert.deepEqual(m.rows.map((r) => r.title), ['TWO', 'ONE']);
  assert.deepEqual(m.rows[1].cells[0], { lines: ['A1', 'fine print'], title: '' });
  assert.deepEqual(m.columns.map((c) => c.label), ['Alpha', 'Beta']);
  assert.equal(m.firstLabel, 'Mode');
});

test('a cell is a string, a list of lines or lines with a hover title; a missing one is empty', () => {
  const m = tableModel(spec, [choice('one'), choice('two')]);
  assert.deepEqual(m.rows[0].cells[1], { lines: ['B1'], title: '' });
  assert.deepEqual(m.rows[1].cells[0], { lines: [], title: '' });
  assert.deepEqual(m.rows[1].cells[1], { lines: ['B2'], title: 'detail' });
});

test('a choice the spec does not know falls back to a row of its label alone', () => {
  const m = tableModel(spec, [choice('one'), choice('stray', { subtitle: 'Hello.' })]);
  const stray = m.rows[1];
  assert.equal(stray.known, false);
  assert.equal(stray.title, 'STRAY');
  assert.deepEqual(stray.cells, []);
  assert.equal(stray.summary, '');
  assert.equal(stray.subtitle, 'Hello.');
});

test('inherited object keys are not spec rows', () => {
  const m = tableModel(spec, [choice('constructor'), choice('toString')]);
  assert.deepEqual(m.rows.map((r) => r.known), [false, false]);
});

test('a row carries its hover detail; a row without one has an empty string', () => {
  const m = tableModel(spec, [choice('one'), choice('two'), choice('stray')]);
  assert.deepEqual(m.rows.map((r) => r.detail), ['a figure · another', '', '']);
});

test('a spec with no columns is summary-only: Mode and the one line', () => {
  const lean = { firstLabel: 'Mode', summaryLabel: 'At the start', rows: { one: { summary: 'First.', detail: 'x' } } };
  const m = tableModel(lean, [choice('one')]);
  assert.deepEqual(m.columns, []);
  assert.equal(m.summaryOnly, true);
  assert.equal(m.rows[0].summary, 'First.');
  assert.equal(tableModel(spec, [choice('one')]).summaryOnly, false);
});

test('a row with a span is one merged cell', () => {
  const m = tableModel(spec, [choice('all')]);
  assert.equal(m.rows[0].span, 'Settle it yourself');
  assert.deepEqual(m.rows[0].cells, []);
  assert.equal(m.rows[0].summary, 'Your call.');
});

test('an unavailable choice is marked, and keeps its row', () => {
  const m = tableModel(spec, [choice('one', { canChoose: false })]);
  assert.equal(m.rows[0].available, false);
  assert.equal(m.rows[0].known, true);
});

test('a note shows only when its choice carries the text in its subtitle', () => {
  const withText = tableModel(spec, [choice('two', { subtitle: 'Saves off. Careful.' })]);
  assert.deepEqual(withText.notes, [{ title: 'TWO', text: 'Careful.' }]);
  assert.deepEqual(tableModel(spec, [choice('two', { subtitle: 'Saves off.' })]).notes, []);
  assert.deepEqual(tableModel(spec, [choice('one', { subtitle: 'Careful.' })]).notes, []);
});

// A document stub: elements with a class, text, attributes and children.
function stubDoc() {
  const node = (tag) => ({
    tag, className: '', textContent: '', title: '', attrs: {}, children: [],
    setAttribute(k, v) { this.attrs[k] = v; },
    appendChild(c) { this.children.push(c); return c; },
  });
  return { createElement: node, createTextNode: (text) => ({ tag: '#text', textContent: text, children: [] }) };
}
const find = (n, pred, out = []) => {
  if (pred(n)) out.push(n);
  n.children.forEach((c) => find(c, pred, out));
  return out;
};
const hasClass = (n, name) => (n.className || '').split(/\s+/).includes(name);

function render(choices) {
  const doc = stubDoc();
  const links = {};
  choices.forEach((c, i) => {
    if (c.canChoose !== false) {
      const a = doc.createElement('a');
      a.textContent = c.title;
      a.attrs['data-choice'] = String(i);
      links[i] = a;
    }
  });
  return renderChoiceTable(doc, tableModel(spec, choices), links);
}

test('the table has a head cell and a row cell for every column, plus the narrow summary', () => {
  const holder = render([choice('one'), choice('two')]);
  const [table] = find(holder, (n) => n.tag === 'table');
  assert.ok(hasClass(table, 'choice-table') && hasClass(table, 'rule-double'));
  const heads = find(table, (n) => n.tag === 'th');
  assert.deepEqual(heads.map((h) => h.textContent), ['Mode', 'Alpha', 'Beta', 'Summary']);
  assert.deepEqual(heads.map((h) => h.className), ['ct-mode', 'ct-wide', 'ct-wide', 'ct-narrow']);
  const rows = find(table, (n) => n.tag === 'tr' && n.attrs['data-choice-id']);
  assert.deepEqual(rows.map((r) => r.attrs['data-choice-id']), ['one', 'two']);
  rows.forEach((r) => {
    assert.deepEqual(r.children.map((c) => c.className), ['ct-mode', 'ct-wide', 'ct-wide', 'ct-narrow']);
  });
  const summary = rows[0].children[3];
  assert.equal(summary.textContent, 'First.');
});

test('a row\'s detail is its hover title; a row without one has none', () => {
  const holder = render([choice('one'), choice('two')]);
  const [one, two] = find(holder, (n) => n.tag === 'tr' && n.attrs['data-choice-id']);
  assert.equal(one.title, 'a figure · another');
  assert.equal(two.title, '');
});

test('a summary-only table has Mode and the summary, and the summary shows at every width', () => {
  const lean = { firstLabel: 'Mode', summaryLabel: 'At the start', rows: { one: { summary: 'First.' } } };
  const doc = stubDoc();
  const link = doc.createElement('a');
  link.textContent = 'ONE';
  const holder = renderChoiceTable(doc, tableModel(lean, [choice('one'), choice('stray', { subtitle: 'Hi.' })]), { 0: link });
  const [table] = find(holder, (n) => n.tag === 'table');
  assert.ok(hasClass(table, 'ct-summary-only'));
  const heads = find(table, (n) => n.tag === 'th');
  assert.deepEqual(heads.map((h) => [h.className, h.textContent]), [['ct-mode', 'Mode'], ['ct-summary', 'At the start']]);
  const rows = find(table, (n) => n.tag === 'tr' && n.attrs['data-choice-id']);
  assert.deepEqual(rows[0].children.map((c) => c.className), ['ct-mode', 'ct-summary']);
  assert.equal(rows[0].children[1].textContent, 'First.');
  assert.equal(rows[1].children[0].attrs.colspan, '2');
});

test('the engine link moves into the first cell; the other cells hold lines', () => {
  const holder = render([choice('one')]);
  const [row] = find(holder, (n) => n.tag === 'tr' && n.attrs['data-choice-id']);
  const first = row.children[0];
  assert.equal(first.children[0].tag, 'a');
  assert.equal(first.children[0].attrs['data-choice'], '0');
  const alpha = row.children[1];
  assert.deepEqual(alpha.children.map((c) => [c.className, c.textContent]), [['ct-main', 'A1'], ['ct-detail', 'fine print']]);
});

test('a merged row spans the detail columns; the narrow summary still shows', () => {
  const holder = render([choice('all')]);
  const [row] = find(holder, (n) => n.tag === 'tr' && n.attrs['data-choice-id']);
  assert.deepEqual(row.children.map((c) => c.className), ['ct-mode', 'ct-wide ct-merged', 'ct-narrow']);
  assert.equal(row.children[1].attrs.colspan, '2');
  assert.equal(row.children[2].textContent, 'Your call.');
});

test('a fallback row is its label across the whole width, with its subtitle', () => {
  const holder = render([choice('stray', { subtitle: 'Hello.' })]);
  const [row] = find(holder, (n) => n.tag === 'tr' && n.attrs['data-choice-id']);
  assert.equal(row.children.length, 1);
  assert.equal(row.children[0].attrs.colspan, '4');
  assert.equal(find(row, (n) => n.className === 'ct-detail')[0].textContent, 'Hello.');
});

test('an unavailable choice has no link and its row says so', () => {
  const holder = render([choice('one', { canChoose: false })]);
  const [row] = find(holder, (n) => n.tag === 'tr' && n.attrs['data-choice-id']);
  assert.equal(row.className, 'ct-unavailable');
  assert.equal(find(row, (n) => n.tag === 'a').length, 0);
  assert.equal(row.children[0].children[0].textContent, 'ONE');
});

test('a note is drawn under the table, titled with its choice', () => {
  const holder = render([choice('two', { subtitle: 'Careful.' })]);
  const [note] = find(holder, (n) => hasClass(n, 'ct-note'));
  assert.equal(note.children[0].textContent, 'TWO');
  assert.equal(note.children[1].textContent, ' Careful.');
});

// The shipped start-page table, checked against the scenes it describes: two
// columns (the mode and one line), the figures in each row's hover detail.

const root_dry = readFileSync(join(root, 'source/scenes/root.scene.dry'), 'utf8').replace(/\r\n/g, '\n');
const start = shipped['root.start'];

// Choice targets listed under @start (`- @1928_easy: Easy`).
function startChoices() {
  const after = root_dry.slice(root_dry.indexOf('\n- @1928_easy'));
  return [...after.matchAll(/^- @(\w+): (.+)$/gm)].map((m) => ({ id: `root.${m[1]}`, title: m[2] }));
}

// The scene's block: from its @id line to the next scene.
function sceneBlock(id) {
  const from = root_dry.indexOf(`\n@${id}\n`);
  assert.ok(from >= 0, `scene @${id}`);
  const next = root_dry.indexOf('\n@', from + 2);
  return root_dry.slice(from, next < 0 ? undefined : next);
}

// Quality settings a scene makes: `on-arrival: a = 1; b = 2;` on one line, or
// `Q.a = 1;` lines in a code block.
function settings(block) {
  const out = {};
  for (const m of block.matchAll(/\bQ\.(\w+) = (-?[\d.]+);/g)) out[m[1]] = Number(m[2]);
  const line = block.match(/^on-arrival: (.+)$/m);
  if (line) for (const m of line[1].matchAll(/(\w+) = (-?[\d.]+);/g)) out[m[1]] = Number(m[2]);
  return out;
}

// What @start sets before the difficulty scenes change any of it: the first
// assignment of each quality (the normal game).
const defaults = settings(root_dry.slice(root_dry.indexOf('\n@start\n'), root_dry.indexOf('\n@1928_easy')));

// The detail line a mode's scene calls for, built from its own settings.
function expectedDetail(scene) {
  const own = scene === null ? {} : settings(sceneBlock(scene));
  const get = (k) => (k in own ? own[k] : defaults[k]);
  const noDiscard = own.discard_disabled === 1;
  const historical = own.historical_mode === 1;
  const parts = [
    `${get('resources')} resources, dues ${get('dues')}${historical ? `, +${own.annual_income} each January` : ''}`,
    `Reichsbanner ${(get('rb_strength') / 1000).toFixed(1)}m`,
    `budget ${get('budget')}`,
    `hand of ${get('hand_size')}${noDiscard ? ', no discarding' : ''}`,
    `Left dissent ${get('left_dissent')}`,
    `relations Z ${get('z_relation')}, DVP ${get('dvp_relation')}, KPD ${get('kpd_relation')}`,
  ];
  if (own.saves_disabled === 1) parts.push('no saves or polls');
  return parts.join(' · ');
}

test('the start table has no detail columns, only the mode and one line', () => {
  assert.equal(start.columns, undefined);
  assert.equal(tableModel(start, []).summaryOnly, true);
  assert.equal(start.firstLabel, 'Mode');
});

test('the table has a row for each start choice, in order, and no others', () => {
  const choices = startChoices();
  assert.deepEqual(choices.map((c) => c.title), ['Easy', 'Normal', 'Hard', 'Historical', 'Custom settings']);
  assert.deepEqual(Object.keys(start.rows), choices.map((c) => c.id));
});

test('every row has one short line with no figures in it', () => {
  for (const [id, row] of Object.entries(start.rows)) {
    assert.ok(row.summary, `${id}: a line`);
    assert.ok(row.summary.length <= 70, `${id}: the line is short`);
    assert.ok(!/\d/.test(row.summary), `${id}: no figures in the line`);
  }
});

const SCENES = {
  'root.1928_easy': '1928_easy',
  'root.1928_main': null,
  'root.1928_hard': '1928_hard',
  'root.1928_historical': '1928_historical',
};

for (const [id, scene] of Object.entries(SCENES)) {
  test(`${id}: the hover detail matches the scene`, () => {
    assert.equal(start.rows[id].detail, expectedDetail(scene));
  });
}

test('the custom row has no figures to show', () => {
  assert.equal(start.rows['root.1928_custom'].detail, undefined);
});

// The lines make comparative claims; each is checked against the scenes.
test('the lines are true of the scenes', () => {
  const easy = settings(sceneBlock('1928_easy'));
  const hard = settings(sceneBlock('1928_hard'));
  const hist = settings(sceneBlock('1928_historical'));
  // Easy: more resources, a bigger hand, friendlier parties.
  assert.ok(easy.resources > defaults.resources && easy.hand_size > defaults.hand_size);
  for (const k of ['z_relation', 'dvp_relation', 'kpd_relation']) assert.ok(easy[k] > defaults[k], k);
  // Hard: no starting resources, a restless party, no discarding.
  assert.equal(hard.resources, 0);
  assert.ok(hard.left_dissent > defaults.left_dissent && hard.reformist_dissent > defaults.reformist_dissent);
  assert.equal(hard.discard_disabled, 1);
  // Historical: Hard's dissent and no discarding, historical mode on, saves
  // off. It starts with resources, so its line must not say "as Hard".
  for (const k of ['left_dissent', 'reformist_dissent', 'labor_dissent', 'center_dissent']) assert.equal(hist[k], hard[k], k);
  assert.equal(hist.discard_disabled, 1);
  assert.equal(hist.historical_mode, 1);
  assert.equal(hist.saves_disabled, 1);
  assert.ok(hist.resources > 0);
  assert.ok(!/as hard/i.test(start.rows['root.1928_historical'].summary));
});

test('the note quotes the historical choice\'s own subtitle', () => {
  const block = sceneBlock('1928_historical');
  assert.ok(block.includes(start.notes[0].subtitleHas), 'the subtitle carries the note text');
});
