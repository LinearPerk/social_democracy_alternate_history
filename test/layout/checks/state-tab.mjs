'use strict';

import { TOLERANCE, lte } from '../lib/assert.mjs';
import {
  elementExistsWithText,
  evaluate,
  hasSelector,
  navigate,
  stubAlert,
} from '../lib/driver.mjs';

// Checks for the State tab: the economic readout (one row per figure, two to
// a line), the line chart of inflation, growth and unemployment (about 100px
// tall, the column's width, a firm zero line, a legend), and the coalition
// rows while the SPD governs. The tab's height is read here so it can be
// reported; the fit itself is state-fit's. Also that the chart comes back
// after a save, a reload and a load (the history lives in a quality).

const AUDIO_AUTOPLAY_BLOCK = /play\(\) failed because the user didn't interact/;
const realErrors = (m) => m.consoleErrors.filter((e) => !AUDIO_AUTOPLAY_BLOCK.test(e));

// The rhythm's row height (--sc-row), read in rhythm.mjs.
const ROW = 22;
// The coalition dissent block's first line.
const COALITION_ROW = 16;

const SELECTORS = [
  '#state-column',
  '.sc-body',
  '.sc-figs',
  '.sc-figs .sc-fig',
  '.sc-figs .sc-fig .lbl',
  '.sc-econ-svg',
  '.sc-econ-svg .sc-ln',
  '.sc-econ-svg path.sc-ln',
  '.sc-econ-svg circle.sc-dt',
  '.sc-econ-svg .sc-zero',
  '.sc-econ-svg .sc-legend .sc-key',
  '.sc-coalition .sc-cd',
  '.sc-coalition .cd-row',
];

function stateTabCheck(viewport, state, expected) {
  return {
    name: `state-tab:${state}:${viewport}`,
    viewport,
    state,
    selectors: SELECTORS,
    test(m) {
      const problems = [];
      const [column] = m.elements['#state-column'];
      const [body] = m.elements['.sc-body'];
      const [svg] = m.elements['.sc-econ-svg'];
      if (!column || !body) return '#state-column or .sc-body not found';

      const labels = m.elements['.sc-figs .sc-fig .lbl'].map((el) => el.text);
      if (labels.join(',') !== expected.figures.join(',')) problems.push(`readout reads ${labels.join(', ')}, expected ${expected.figures.join(', ')}`);
      // Two figures to a line: the first two share a line, the next two share the next.
      const rows = m.elements['.sc-figs .sc-fig'];
      if (rows.length >= 2 && Math.abs(rows[0].rect.top - rows[1].rect.top) > TOLERANCE) problems.push('the first two figures are not on one line');
      for (const row of rows) {
        if (row.scrollWidth > row.clientWidth + TOLERANCE) problems.push(`figure "${row.text}" overflows its cell`);
        if (Math.abs(row.rect.height - ROW) > TOLERANCE) problems.push(`figure "${row.text}" row is ${row.rect.height}px tall, want the rhythm's ${ROW}`);
      }
      // The dissent block's row (label, track, band word) is 16px, the text
      // line the Defense rows use.
      for (const row of m.elements['.sc-coalition .cd-row']) {
        if (Math.abs(row.rect.height - COALITION_ROW) > TOLERANCE) problems.push(`coalition row is ${row.rect.height}px tall, want ${COALITION_ROW}`);
      }

      if (!svg) {
        problems.push('no chart');
      } else {
        // About 100px: 95 to 105.
        if (svg.rect.height < 95 || svg.rect.height > 105) problems.push(`chart is ${svg.rect.height.toFixed(1)}px tall, want about 100`);
        if (Math.abs(svg.rect.width - body.rect.width) > TOLERANCE) problems.push(`chart is ${svg.rect.width.toFixed(1)}px wide, the column body ${body.rect.width.toFixed(1)}px`);
        // One month of history draws points only; more draws a path per line.
        const paths = m.elements['.sc-econ-svg path.sc-ln'].length;
        if (paths !== expected.paths) problems.push(`${paths} drawn lines, expected ${expected.paths}`);
        if (m.elements['.sc-econ-svg .sc-zero'].length !== 1) problems.push('no zero line');
        const key = m.elements['.sc-econ-svg .sc-legend .sc-key'].map((el) => el.text);
        if (key.length !== expected.lines) problems.push(`legend names ${key.join(', ')}`);
        // The three lines draw from the first point: one month of history is
        // three dots, one per figure.
        if (expected.dots !== undefined) {
          const dots = m.elements['.sc-econ-svg circle.sc-dt'].length;
          if (dots !== expected.dots) problems.push(`${dots} chart dots, expected ${expected.dots}`);
        }
      }

      const coalition = m.elements['.sc-coalition .sc-cd'].length;
      if (coalition !== expected.coalition) problems.push(`${coalition} coalition blocks, expected ${expected.coalition}`);

      for (const [selector, list] of Object.entries(m.elements)) {
        for (const el of list) {
          if (!lte(el.rect.right, column.rect.right)) {
            problems.push(`${selector} right ${el.rect.right} past state column right ${column.rect.right}`);
            break;
          }
        }
      }
      if (realErrors(m).length > 0) problems.push(`console errors: ${realErrors(m).join(' | ')}`);
      return problems.length === 0 ? true : [...new Set(problems)].join('; ');
    },
  };
}

// Reads the natural heights of the three tabs and the Reichstag block in the same
// government state, for the report: not a pass/fail, the check only has to run.
const READ_HEIGHTS = `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = {};
  for (const tab of ['party', 'defense', 'state']) {
    document.querySelector('#state-column [data-sc-tab="' + tab + '"]').click();
    await wait(150);
    // Natural: the box's minimum (the tallest tab's) lifted for the reading.
    const body = document.querySelector('#state-column .sc-body');
    const minHeight = body.style.minHeight;
    body.style.minHeight = '';
    out[tab] = body.getBoundingClientRect().height;
    body.style.minHeight = minHeight;
  }
  out.reichstag = document.querySelector('#state-column .sc-chart').getBoundingClientRect().height;
  out.tabs = document.querySelector('#state-column .sc-tabs').getBoundingClientRect().height;
  return out;
})()`;

const heightsCheck = {
  name: 'state-tab:heights:laptop',
  viewport: 'laptop',
  state: 'hub-state-full',
  selectors: [],
  act: (page) => evaluate(page, READ_HEIGHTS),
  test(m) {
    const h = m.acted;
    console.log(`state-tab heights at 1366x768 (hub-state-full): party ${h.party.toFixed(1)}, defense ${h.defense.toFixed(1)}, state ${h.state.toFixed(1)}, reichstag block ${h.reichstag.toFixed(1)}, tab bar ${h.tabs.toFixed(1)}`);
    return true;
  },
};

// Play two months, save to slot 1, reload the page, load the slot: the State
// tab's chart still shows the months played, from the history the game saved.
const READ_CHART = `(() => {
  const q = window.dendryUI.dendryEngine.state.qualities;
  return {
    month: q.month,
    stored: JSON.parse(q.sc_history || '[]').length,
    chart: !!document.querySelector('.sc-econ-svg'),
    flashing: document.querySelectorAll('#state-column .sc-body .sc-flash').length,
    dots: document.querySelectorAll('#state-column .sc-tab .sc-dot').length,
    labels: Array.from(document.querySelectorAll('.sc-econ-svg text.sc-ax:not(.sc-key)')).map((e) => e.textContent),
  };
})()`;

async function playAMonth(page) {
  await evaluate(page, `(() => {
    const engine = window.dendryUI.dendryEngine;
    engine.state.qualities.month_actions = 1;
    engine.goToScene('post_event');
    return true;
  })()`);
  for (let i = 0; i < 40 && !(await hasSelector(page, 'ul.hand')); i++) {
    if (await elementExistsWithText(page, '#content a', 'Continue')) {
      await evaluate(page, `Array.from(document.querySelectorAll('#content a')).find((a) => a.textContent.includes('Continue')).click()`);
    }
    await new Promise((r) => setTimeout(r, 150));
  }
}

const roundTripCheck = {
  name: 'state-tab:save-reload-load-keeps-chart:laptop',
  viewport: 'laptop',
  state: 'hub-state',
  selectors: [],
  async act(page) {
    const url = await evaluate(page, 'location.href');
    await playAMonth(page);
    await playAMonth(page);
    const before = await evaluate(page, READ_CHART);
    await evaluate(page, 'window.dendryUI.saveSlot(1); true');
    // A load in the same session, over figures that have since moved: the
    // loaded game is a new state, so nothing flashes and no tab is dotted.
    // Redraws come in bursts and each replaces the markup, so a watcher
    // notes any flash or dot that shows up, however briefly.
    await evaluate(page, `(() => {
      window.__sawChange = 0;
      new MutationObserver(() => {
        if (document.querySelector('#state-column .sc-flash, #state-column .sc-tab .sc-dot')) window.__sawChange++;
      }).observe(document.getElementById('qualities'), { childList: true, subtree: true });
      window.dendryUI.dendryEngine.state.qualities.inflation += 3;
      window.updateSidebar();
      return true;
    })()`);
    // Past the flash's own 600ms, so only the load can cause one.
    await new Promise((r) => setTimeout(r, 800));
    await evaluate(page, `(() => {
      window.__sawChange = 0;
      window.dendryUI.loadSlot(1);
      return true;
    })()`);
    await new Promise((r) => setTimeout(r, 400));
    const sameSession = await evaluate(page, `Object.assign(${READ_CHART}, { saw: window.__sawChange })`);
    await navigate(page, url);
    await stubAlert(page);
    const reloaded = await evaluate(page, `!!window.dendryUI.dendryEngine.state.qualities.sc_history`);
    await evaluate(page, 'window.dendryUI.loadSlot(1); true');
    await new Promise((r) => setTimeout(r, 600));
    await evaluate(page, `document.querySelector('#state-column [data-sc-tab="state"]').click(); true`);
    const after = await evaluate(page, READ_CHART);
    return { before, sameSession, reloaded, after };
  },
  test(m) {
    const { before, sameSession, reloaded, after } = m.acted;
    const problems = [];
    if (before.stored !== 3) problems.push(`${before.stored} points stored after two months, expected 3`);
    if (reloaded) problems.push('a fresh page already holds a history');
    if (after.stored !== before.stored) problems.push(`${after.stored} points after the load, ${before.stored} before the save`);
    if (!after.chart) problems.push('no chart after the load');
    // A load is a new game state, not a change: nothing flashes, no tab is dotted.
    if (sameSession.saw !== 0) problems.push(`a flash or a dot showed ${sameSession.saw} times while the same-session load drew`);
    if (sameSession.flashing !== 0 || sameSession.dots !== 0) problems.push(`a load in the same session left ${sameSession.flashing} flashing rows and ${sameSession.dots} tab dots`);
    if (after.flashing !== 0) problems.push(`${after.flashing} rows flash after the load`);
    if (after.dots !== 0) problems.push(`${after.dots} tab dots after the load`);
    if (after.labels.join(',') !== before.labels.join(',')) problems.push(`chart labels ${after.labels.join(' ')} after, ${before.labels.join(' ')} before`);
    if (before.month !== after.month) problems.push(`month ${after.month} after the load, ${before.month} before`);
    if (realErrors(m).length > 0) problems.push(`console errors: ${realErrors(m).join(' | ')}`);
    return problems.length === 0 ? true : problems.join('; ');
  },
};

export default [
  ...['laptop', 'monitor'].flatMap((viewport) => [
    // Unemployment is there from the first hub, its line drawn from the first point.
    stateTabCheck(viewport, 'hub-state', { figures: ['Inflation', 'Growth', 'Unemployment'], lines: 3, paths: 0, dots: 3, coalition: 0 }),
    stateTabCheck(viewport, 'hub-state-government', { figures: ['Inflation', 'Growth', 'Unemployment', 'Budget'], lines: 3, paths: 0, dots: 3, coalition: 1 }),
    stateTabCheck(viewport, 'hub-state-full', { figures: ['Inflation', 'Growth', 'Unemployment', 'Budget'], lines: 3, paths: 3, coalition: 2 }),
  ]),
  heightsCheck,
  roundTripCheck,
];
