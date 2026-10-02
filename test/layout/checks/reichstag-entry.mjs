'use strict';

import { evaluate, hasSelector, waitForCondition } from '../lib/driver.mjs';
import { TOLERANCE, gte, lte } from '../lib/assert.mjs';

// Checks for the Reichstag entry: a click on the seat chart opens it in the
// depth column with the five named governments, each a button with members
// and "seats / majority" with a mark; picking one lights its parties on the
// chart (a class on the party groups) and shows partners and requirements
// below; picking again, Back, or a new page clears it. Nothing spills out of
// the column, and the state column stays put.

const ROW_TOTAL = /^\d+ \/ \d+ [✓✗]$/;
const NAMES = ['Weimar Coalition', 'Grand Coalition', 'Popular Front', 'Left Front', 'SPD majority'];

const ENTRY_SELECTORS = [
  '#depth_column',
  '#depth_column .dc-title',
  '#depth_column .dc-entry',
  '#depth_column .rs-row',
  '#depth_column .rs-name',
  '#depth_column .rs-total',
  '#depth_column .rs-members',
  '#depth_column .rs-mem',
  '#depth_column .rs-hint',
  '#depth_column .rs-preview',
  '#depth_column .rs-partner',
  '#depth_column .rs-req li',
  '#depth_column [data-rs-charts]',
  '#depth-bar [data-dc-back]',
  '#depth_column .dc-entry *',
  '#state-column .sc-party-seats.lit',
  '#state-column .sc-party-seats.dim',
  '#state-column .sc-housenum',
  '#state-column .sc-houselbl',
];

function overflow(m, problems) {
  const [depth] = m.elements['#depth_column'];
  for (const el of m.elements['#depth_column .dc-entry *']) {
    if (!gte(el.rect.left, depth.rect.left) || !lte(el.rect.right, depth.rect.right)) {
      problems.push(`"${el.text.slice(0, 30)}" spills out of the depth column`);
      break;
    }
  }
  if (m.scrollWidth > m.clientWidth + TOLERANCE) problems.push(`horizontal overflow: ${m.scrollWidth} > ${m.clientWidth}`);
}

// Height of the entry as drawn, read for the report as well as the test.
const heightOf = (m) => m.elements['#depth_column .dc-entry'][0].rect.height;

function entryCheck(viewport) {
  return {
    name: `reichstag-entry:list:${viewport}`,
    viewport,
    state: 'reichstag-entry',
    selectors: ENTRY_SELECTORS,
    test(m) {
      const problems = [];
      const [depth] = m.elements['#depth_column'];
      if (!depth) return '#depth_column not found';
      const [title] = m.elements['#depth_column .dc-title'];
      if (!title || title.text !== 'Reichstag') problems.push(`title "${title ? title.text : ''}", want Reichstag`);
      if (m.elements['#depth_column .dc-entry'].length !== 1) return 'the Reichstag entry is not in the depth column';
      const rows = m.elements['#depth_column .rs-row'];
      if (rows.length !== 5) problems.push(`${rows.length} coalition rows, want 5`);
      const names = m.elements['#depth_column .rs-name'].map((n) => n.text.replace(/current$/, ''));
      if (names.join('|') !== NAMES.join('|')) problems.push(`rows read "${names.join('|')}"`);
      for (const r of rows) {
        if (r.tagName !== 'button') problems.push(`row "${r.text.slice(0, 20)}" is a ${r.tagName}, not a button`);
      }
      const totals = m.elements['#depth_column .rs-total'];
      for (const t of totals) {
        if (!ROW_TOTAL.test(t.text)) problems.push(`total "${t.text}" is not "seats / majority" with a mark`);
      }
      const last = totals[totals.length - 1];
      if (!last || !last.text.endsWith('✗')) problems.push('the SPD-majority row does not read ✗ at the start');
      if (m.elements['#depth_column .rs-members'].length !== 5) problems.push('a row lacks its member list');
      const [hint] = m.elements['#depth_column .rs-hint'];
      if (!hint || hint.text !== 'Pick a coalition to preview it.') problems.push('the pick-a-coalition hint is missing');
      if (m.elements['#depth_column .rs-preview'].length !== 0) problems.push('a preview shows before a pick');
      if (m.elements['#depth_column [data-rs-charts]'].length !== 1) problems.push('no "Charts and statistics" link');
      const [back] = m.elements['#depth-bar [data-dc-back]'];
      if (!back || back.disabled) problems.push('no enabled Back button');
      if (m.elements['#state-column .sc-party-seats.lit'].length !== 0) problems.push('the chart is highlighted with nothing picked');
      overflow(m, problems);
      // Measured for the report: the whole entry, unpicked.
      if (process.env.REICHSTAG_LOG) console.log(`entry height ${viewport} (list): ${heightOf(m)}px`);
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

// The chart's dots and centre label as drawn, read with the picked state.
const readChart = async (page) => evaluate(
  page,
  `(() => {
    const groups = Array.from(document.querySelectorAll('#state-column .sc-party-seats'));
    const opacity = (g) => parseFloat(getComputedStyle(g).opacity);
    const lit = groups.filter((g) => g.classList.contains('lit')).map((g) => g.getAttribute('data-sc-seats'));
    const dim = groups.filter((g) => g.classList.contains('dim'));
    const num = document.querySelector('#state-column .sc-housenum');
    return {
      lit,
      dimCount: dim.length,
      dimOpacityMax: dim.length ? Math.max(...dim.map(opacity)) : null,
      litOpacityMin: lit.length ? Math.min(...groups.filter((g) => g.classList.contains('lit')).map(opacity)) : null,
      centre: num ? num.textContent : null,
      total: (document.querySelector('#depth_column .rs-row.on .rs-total') || {}).textContent || null,
    };
  })()`
);

function pickedCheck(viewport) {
  return {
    name: `reichstag-entry:picked:${viewport}`,
    viewport,
    state: 'reichstag-picked',
    selectors: ENTRY_SELECTORS,
    act: readChart,
    test(m) {
      const problems = [];
      const chart = m.acted;
      if (m.elements['#depth_column .dc-entry'].length !== 1) return 'the Reichstag entry is not in the depth column';
      const on = m.elements['#depth_column .rs-row'].filter((r) => /rs-row on/.test(r.className));
      if (on.length !== 1 || !on[0].text.startsWith('Weimar Coalition')) problems.push('the Weimar Coalition row is not the one picked');
      if (chart.lit.slice().sort().join(',') !== 'ddp,spd,z') problems.push(`lit parties ${chart.lit.join(',')}, want spd, ddp, z`);
      if (chart.dimCount !== 7) problems.push(`${chart.dimCount} dimmed groups, want 7`);
      if (!(chart.dimOpacityMax < 0.5)) problems.push(`dimmed groups draw at opacity ${chart.dimOpacityMax}`);
      if (chart.litOpacityMin !== 1) problems.push(`lit groups draw at opacity ${chart.litOpacityMin}`);
      const seats = chart.total && chart.total.split(' / ')[0];
      if (!seats || chart.centre !== seats) problems.push(`the chart centre reads "${chart.centre}", the row says "${chart.total}"`);
      const [label] = m.elements['#state-column .sc-houselbl'];
      if (!label || label.text !== 'coalition') problems.push('the chart centre label does not say coalition');
      if (m.elements['#depth_column .rs-hint'].length !== 0) problems.push('the hint still shows under a pick');
      if (m.elements['#depth_column .rs-preview'].length !== 1) problems.push('no preview under the pick');
      if (m.elements['#depth_column .rs-partner'].length !== 2) problems.push(`${m.elements['#depth_column .rs-partner'].length} partners, want Z and DDP`);
      if (m.elements['#depth_column .rs-req li'].length < 2) problems.push('the requirements are missing');
      overflow(m, problems);
      if (process.env.REICHSTAG_LOG) console.log(`entry height ${viewport} (picked): ${heightOf(m)}px`);
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

// A second press on the same row clears the pick and the highlight.
const pressAgain = {
  name: 'reichstag-entry:pick-again-clears:laptop',
  viewport: 'laptop',
  state: 'reichstag-picked',
  selectors: ENTRY_SELECTORS,
  async act(page) {
    await evaluate(page, `(() => { document.querySelector('#depth_column [data-rs-coalition="weimar"]').click(); return true; })()`);
    await waitForCondition(async () => !(await hasSelector(page, '#depth_column .rs-row.on')));
    return readChart(page);
  },
  test(m) {
    const problems = [];
    if (m.acted.lit.length !== 0 || m.acted.dimCount !== 0) problems.push('the chart is still highlighted');
    if (m.elements['#depth_column .rs-hint'].length !== 1) problems.push('the hint did not come back');
    if (m.elements['#depth_column .rs-preview'].length !== 0) problems.push('the preview stayed');
    return problems.length === 0 ? true : problems.join('; ');
  },
};

// Back leaves the entry and the chart clear.
const backCheck = {
  name: 'reichstag-entry:back-clears:laptop',
  viewport: 'laptop',
  state: 'reichstag-back',
  selectors: ENTRY_SELECTORS.concat(['#depth_column .dc-polls']),
  act: readChart,
  test(m) {
    const problems = [];
    if (m.elements['#depth_column .dc-entry'].length !== 0) problems.push('the entry is still open after Back');
    if (m.acted.lit.length !== 0 || m.acted.dimCount !== 0) problems.push('the chart is still highlighted after Back');
    if (m.elements['#depth_column .dc-polls'].length !== 1) problems.push('the resting view (Polls) is not back');
    const [label] = m.elements['#state-column .sc-houselbl'];
    if (!label || label.text !== 'seats') problems.push('the chart centre label did not return to "seats"');
    return problems.length === 0 ? true : problems.join('; ');
  },
};

// The government the SPD sits in carries the "current" marker, and only it.
const currentCheck = {
  name: 'reichstag-entry:current-marker:laptop',
  viewport: 'laptop',
  state: 'reichstag-government',
  selectors: ['#depth_column .rs-row', '#depth_column .rs-cur'],
  test(m) {
    const cur = m.elements['#depth_column .rs-cur'];
    const marked = m.elements['#depth_column .rs-row'].filter((r) => /current/.test(r.className));
    if (cur.length !== 1 || marked.length !== 1) return `${cur.length} current markers on ${marked.length} rows, want 1 and 1`;
    return marked[0].text.startsWith('Weimar Coalition') ? true : `"${marked[0].text}" is marked current, want the Weimar Coalition`;
  },
};

// "Charts and statistics" does what the chart click used to: the Library.
const chartsLink = {
  name: 'reichstag-entry:charts-link-opens-library:laptop',
  viewport: 'laptop',
  state: 'reichstag-entry',
  selectors: ['#depth_column .dc-menu a', '#depth_column .rs-entry'],
  async act(page) {
    await evaluate(page, `(() => { document.querySelector('#depth_column [data-rs-charts]').click(); return true; })()`);
    await waitForCondition(() => hasSelector(page, '#depth_column .dc-menu a'));
    return true;
  },
  test(m) {
    if (m.elements['#depth_column .rs-entry'].length !== 0) return 'the entry is still showing after the link';
    return m.elements['#depth_column .dc-menu a'].length > 0 ? true : "the Library's menu did not open";
  },
};

// A new page ends the pick.
const newPageCheck = {
  name: 'reichstag-entry:new-page-clears:laptop',
  viewport: 'laptop',
  state: 'reichstag-picked',
  selectors: ENTRY_SELECTORS,
  async act(page) {
    // A month's hub again, as a play from card to card would arrive at it.
    await evaluate(page, `(() => { window.dendryUI.dendryEngine.goToScene('post_event'); return true; })()`);
    await waitForCondition(() => hasSelector(page, 'ul.decks'));
    return readChart(page);
  },
  test(m) {
    const problems = [];
    if (m.acted.lit.length !== 0 || m.acted.dimCount !== 0) problems.push('the chart is still highlighted on the new page');
    if (m.elements['#depth_column .rs-row'].length === 5 && m.elements['#depth_column .rs-hint'].length !== 1) {
      problems.push('the entry kept its pick across the page');
    }
    return problems.length === 0 ? true : problems.join('; ');
  },
};

export default [
  entryCheck('laptop'),
  entryCheck('monitor'),
  pickedCheck('laptop'),
  pickedCheck('monitor'),
  pressAgain,
  backCheck,
  currentCheck,
  chartsLink,
  newPageCheck,
];
