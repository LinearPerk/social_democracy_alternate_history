'use strict';

import { lte } from '../lib/assert.mjs';
import { VIEWPORTS } from '../lib/viewports.mjs';

// The start page's difficulty menu as a table (decision-column.js with
// decision-column/choice-tables.json): five rows, two columns (the mode and
// one line) at every width. Clicks, Tab, the hover titles and the hover and
// focus looks are in start-table.e2e.mjs.

const MODES = ['Easy', 'Normal', 'Hard', 'Historical', 'Custom settings'];
const HEADS = ['Mode', 'At the start'];
const LINES = [
  'More resources, a bigger hand, friendlier parties.',
  'The standard game.',
  'No starting resources, a restless party, no discarding.',
  'A restless party, no discarding, harder actions. No saves or polls.',
  'Choose each setting yourself.',
];

const SELECTORS = [
  'table.choice-table',
  'table.choice-table thead th',
  'table.choice-table tbody tr',
  'table.choice-table td.ct-mode a',
  '.choice-table-holder .ct-note',
  '#content',
];

const fail = (problems) => (problems.length === 0 ? true : problems.join('; '));
const shown = (list) => list.filter((e) => e.display !== 'none' && e.rect.width > 0);
const noShy = (s) => s.replace(/­/g, '');

function commonProblems(m) {
  const problems = [];
  const [table] = m.elements['table.choice-table'];
  if (!table) return ['no table.choice-table on the start page'];
  const rows = m.elements['table.choice-table tbody tr'];
  const links = m.elements['table.choice-table td.ct-mode a'];
  if (rows.length !== 5) problems.push(`${rows.length} rows, expected 5`);
  const titles = links.map((a) => a.text);
  if (titles.join('|') !== MODES.join('|')) {
    problems.push(`row links are ${JSON.stringify(titles)}`);
  }
  if (m.scrollWidth > m.clientWidth + 1) problems.push(`horizontal overflow: ${m.scrollWidth} > ${m.clientWidth}`);
  const [content] = m.elements['#content'];
  if (content && table.rect.right > content.rect.right + 1) {
    problems.push(`table reaches ${table.rect.right}, past #content at ${content.rect.right}`);
  }
  if (table.borderStyle !== 'double') problems.push(`table border-top is ${table.borderStyle}, expected double`);
  return problems;
}

function twoColumnCheck(viewport) {
  return {
    name: `start-table:${viewport}:two-columns`,
    viewport,
    state: 'start',
    selectors: [...SELECTORS, 'table.choice-table tbody tr td.ct-summary'],
    test(m) {
      const problems = commonProblems(m);
      const heads = shown(m.elements['table.choice-table thead th']);
      const labels = heads.map((h) => noShy(h.text));
      if (labels.join('|') !== HEADS.join('|')) problems.push(`columns are ${JSON.stringify(labels)}`);
      const lines = shown(m.elements['table.choice-table tbody tr td.ct-summary']).map((td) => td.text);
      if (lines.join('|') !== LINES.join('|')) problems.push(`lines are ${JSON.stringify(lines)}`);
      for (const h of heads) {
        if (!/Jost/.test(h.fontFamily)) problems.push(`head "${h.text}" is ${h.fontFamily}, expected Jost`);
        if (h.textTransform !== 'uppercase') problems.push(`head "${h.text}" is not capitalised`);
      }
      const links = m.elements['table.choice-table td.ct-mode a'];
      for (const a of links) {
        if (/Jost/.test(a.fontFamily)) problems.push(`row link "${a.text}" is Jost, expected the serif`);
      }
      const [note] = m.elements['.choice-table-holder .ct-note'];
      if (!note || !/Not recommended for a first playthrough/.test(note.text)) {
        problems.push('the Historical note is missing under the table');
      }
      return fail(problems);
    },
  };
}

// The page still fits a laptop window with the table in place of the list.
const fitsFold = {
  name: 'start-table:laptop:fits-fold',
  viewport: 'laptop',
  state: 'start',
  selectors: SELECTORS,
  test(m) {
    const [table] = m.elements['table.choice-table'];
    if (!table) return 'no table.choice-table on the start page';
    const fold = VIEWPORTS.laptop.height;
    const problems = [];
    if (!lte(table.rect.bottom, fold)) problems.push(`table ends at ${table.rect.bottom}, expected <= ${fold}`);
    if (m.scrollHeight > fold + 1) problems.push(`page is ${m.scrollHeight}px tall in a ${fold}px window`);
    return fail(problems);
  },
};

export default [
  twoColumnCheck('laptop'),
  twoColumnCheck('monitor'),
  twoColumnCheck('three-col-min'),
  twoColumnCheck('two-col'),
  twoColumnCheck('narrow'),
  twoColumnCheck('phone'),
  fitsFold,
];
