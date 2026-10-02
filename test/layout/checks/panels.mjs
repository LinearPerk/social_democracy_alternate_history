'use strict';

import { close, gte, lte } from '../lib/assert.mjs';
import { evaluate, waitForCondition } from '../lib/driver.mjs';
import { setTimeout as delay } from 'node:timers/promises';

// During play the state column (the dashboard) sets the panels' height. Its
// box is as tall as its column plus the box's padding, so no blank parchment
// shows inside it, up to one screen at scroll 0: the window's height less the
// columns' top offset and the body's 0.5rem margin. The decision and depth
// panels take the box's height as their floor, so on a tall window all three
// end where the dashboard ends, well above the fold, and a panel with more
// content than that grows past it alone (the hub's advisor rows on a laptop,
// a long depth entry). The depth panel rises to the decision panel's own
// height; the dashboard never does, so on a hub whose text and cards run a
// little past the dashboard the dashboard ends just above them. The box is as
// tall as its tallest tab whichever tab is open (checks/stable-height.mjs). An expanded
// banner lowers the cap and the panels follow. The empty footer takes no
// space. The rules are in layout.css; the variables are published by
// layout/banner.js.

const MARGIN = 8;
// The sidebar's own padding, above and below the column.
const SIDEBAR_PADDING = 7.8;
const SELECTORS = ['#stats_sidebar', '#state-column', '#content', '#depth_column', 'footer'];

const STATES = ['hub', 'hub-month', 'hub-defense', 'hub-state', 'card', 'reichstag-picked', 'library-section'];

function bottoms(m) {
  const [sidebar] = m.elements['#stats_sidebar'];
  const [column] = m.elements['#state-column'];
  const [content] = m.elements['#content'];
  const [depth] = m.elements['#depth_column'];
  if (!sidebar || !column || !content || !depth) return null;
  return { sidebar: sidebar.rect.bottom, content: content.rect.bottom, depth: depth.rect.bottom, sidebarBox: sidebar, column };
}

// The dashboard's box ends with its column, or at the fold when the column
// is taller than the room (then its box scrolls inside).
function dashboardProblems(b, fold, mode) {
  const problems = [];
  const hugsColumn = close(b.sidebar, b.column.rect.bottom + SIDEBAR_PADDING);
  const atCap = close(b.sidebar, fold);
  if (!hugsColumn && !atCap) {
    problems.push(`state bottom ${b.sidebar} is neither its column's end (${b.column.rect.bottom + SIDEBAR_PADDING}) nor the fold (${fold})`);
  }
  if (!lte(b.sidebar, fold)) problems.push(`state bottom ${b.sidebar} is below the fold (${fold})`);
  // An expanded banner may shrink the box under its column; the fit checks
  // cover the resting (slim) banner.
  if (mode === 'slim' && b.sidebarBox.scrollHeight > b.sidebarBox.clientHeight + 1) {
    problems.push(`the state column scrolls inside: ${b.sidebarBox.scrollHeight} > ${b.sidebarBox.clientHeight}`);
  }
  return problems;
}

async function settle(page, mode) {
  if (mode === 'expanded') await evaluate(page, `window.Banner.expand(); true`);
  // Play starts slim with the collapse still moving; an expand animates too.
  await delay(500);
}

// `short` replaces the decision panel's text with one line, so the dashboard
// is the tallest thing and all three bottoms are its bottom. Otherwise the
// decision and depth panels end at its bottom or below it.
function restingCheck({ state, short }, viewport, mode) {
  return {
    name: `panels:${short ? 'short:' : ''}${state}:${viewport}:${mode}`,
    viewport,
    state,
    shortContent: !!short,
    selectors: SELECTORS,
    async act(page) {
      await settle(page, mode);
    },
    test(m) {
      const b = bottoms(m);
      if (!b) return 'a panel was not found';
      const fold = m.viewport.height - MARGIN;
      const problems = dashboardProblems(b, fold, mode);
      if (!gte(b.content, b.sidebar)) problems.push(`decision bottom ${b.content} is above the state bottom ${b.sidebar}`);
      if (!close(b.depth, b.content)) problems.push(`depth bottom ${b.depth}, decision bottom ${b.content}`);
      if (short && !close(b.content, b.sidebar)) problems.push(`decision bottom ${b.content}, expected the state bottom ${b.sidebar}`);
      // A tall window leaves the parchment well above the fold, unless the
      // page itself is long (a Library section).
      if (viewport === 'monitor') {
        const gap = fold - Math.max(b.content, b.depth);
        console.log(`panels ${short ? 'short ' : ''}${state}, ${viewport} ${mode}: state ${b.sidebar.toFixed(1)}, decision ${b.content.toFixed(1)}, depth ${b.depth.toFixed(1)}, ${gap.toFixed(1)}px above the fold`);
        if (state !== 'library-section' && !(gap > 150)) problems.push(`the panels end ${gap.toFixed(1)}px above the fold, expected well above it`);
      }
      if (m.scrollWidth > m.clientWidth) problems.push(`horizontal overflow: ${m.scrollWidth} > ${m.clientWidth}`);
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

// A depth entry taller than the window: the depth panel extends, the other
// two stay together at the dashboard's bottom.
function tallDepthCheck(viewport, state, mode) {
  return {
    name: `panels:tall-depth:${state}:${viewport}:${mode}`,
    viewport,
    state,
    shortContent: true,
    selectors: SELECTORS,
    async act(page) {
      await evaluate(page, `(() => {
        document.getElementById('depth_column').innerHTML = '<p>' + 'A long entry that runs well past the fold. '.repeat(400) + '</p>';
        return true;
      })()`);
      await settle(page, mode);
    },
    test(m) {
      const b = bottoms(m);
      if (!b) return 'a panel was not found';
      const fold = m.viewport.height - MARGIN;
      const problems = dashboardProblems(b, fold, mode);
      if (!close(b.content, b.sidebar)) problems.push(`decision bottom ${b.content}, expected the state bottom ${b.sidebar}`);
      if (!(b.depth > m.viewport.height * 1.5)) problems.push(`depth bottom ${b.depth}, expected well past the fold`);
      if (m.scrollWidth > m.clientWidth) problems.push(`horizontal overflow: ${m.scrollWidth} > ${m.clientWidth}`);
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

// The footer has nothing to show, so it takes no space: the page ends 8px
// under the panels, or at the window's own height if that is more.
function footerCheck(viewport, state) {
  return {
    name: `panels:footer-takes-no-space:${state}:${viewport}`,
    viewport,
    state,
    selectors: SELECTORS,
    async act(page) {
      await settle(page, 'slim');
    },
    test(m) {
      const b = bottoms(m);
      const [footer] = m.elements['footer'];
      if (!b || !footer) return 'a panel or the footer was not found';
      const problems = [];
      if (footer.rect.height > 1) problems.push(`footer is ${footer.rect.height}px tall`);
      const most = Math.max(Math.max(b.content, b.depth) + MARGIN, m.viewport.height);
      if (!lte(m.scrollHeight, most)) problems.push(`page is ${m.scrollHeight}px tall, expected at most ${most}`);
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

// --state-h is the dashboard's box height, kept current by layout/banner.js:
// at rest, after a tab switch (the box holds the tallest tab's height, so the
// switch changes nothing; checks/stable-height.mjs measures that), and after a
// window resize.
const stateHeightCheck = {
  name: 'panels:state-h-follows-the-dashboard:laptop',
  viewport: 'laptop',
  state: 'hub',
  selectors: SELECTORS,
  async act(page) {
    await settle(page, 'slim');
    const read = () => evaluate(page, `(() => {
      const h = (id) => document.getElementById(id).getBoundingClientRect().height;
      return { variable: parseFloat(document.documentElement.style.getPropertyValue('--state-h')), box: h('stats_sidebar'), content: h('content'), depth: h('depth_column') };
    })()`);
    const rest = await read();
    await evaluate(page, `document.querySelector('#state-column [data-sc-tab="defense"]').click(); true`);
    await delay(400);
    const defense = await read();
    await evaluate(page, `document.querySelector('#state-column [data-sc-tab="party"]').click(); true`);
    await delay(400);
    const back = await read();
    return { rest, defense, back };
  },
  test(m) {
    const { rest, defense, back } = m.acted;
    const problems = [];
    for (const [label, r] of [['at rest', rest], ['on Defense', defense], ['back on Party', back]]) {
      if (!close(r.variable, r.box)) problems.push(`${label}: --state-h ${r.variable}, the dashboard's box ${r.box}`);
      if (!gte(r.content, r.box) || !gte(r.depth, r.box)) problems.push(`${label}: panels ${r.content} and ${r.depth} are shorter than the dashboard ${r.box}`);
    }
    if (!close(defense.box, rest.box, 0.5)) problems.push(`the dashboard changed height on the Defense tab: ${rest.box} then ${defense.box}`);
    if (!close(back.box, rest.box, 0.5)) problems.push(`back on Party the dashboard is ${back.box}, was ${rest.box}`);
    return problems.length === 0 ? true : problems.join('; ');
  },
};

// Two columns: the decision panel ends at the dashboard's bottom or below it;
// the depth box stays below the decision panel with its own height.
function twoColumnCheck(state) {
  return {
    name: `panels:two-col:${state}`,
    viewport: 'two-col',
    state,
    selectors: SELECTORS,
    async act(page) {
      await settle(page, 'slim');
    },
    test(m) {
      const b = bottoms(m);
      if (!b) return 'a panel was not found';
      const [depth] = m.elements['#depth_column'];
      const fold = m.viewport.height - MARGIN;
      const problems = dashboardProblems(b, fold, 'slim');
      if (!gte(b.content, b.sidebar)) problems.push(`decision bottom ${b.content} is above the state bottom ${b.sidebar}`);
      if (depth.rect.height > 0 && depth.rect.top < b.content - 1) {
        problems.push(`depth top ${depth.rect.top} overlaps the decision panel (bottom ${b.content})`);
      }
      if (m.scrollWidth > m.clientWidth) problems.push(`horizontal overflow: ${m.scrollWidth} > ${m.clientWidth}`);
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

// Before a game starts the empty side panels keep their own 30rem floor. The
// title page's carousels stand in for them (checks/carousel.mjs measures
// those, level with the decision panel); they are taken out here to measure
// the panels that come back when a carousel has nothing to show.
const preGameCheck = {
  name: 'panels:title:desktop:unchanged',
  viewport: 'desktop',
  state: 'title',
  selectors: ['#tools_wrapper', '#depth_column'],
  async act(page) {
    await waitForCondition(
      () => evaluate(page, `document.querySelectorAll('.cr-panel').length === 2`),
      { timeoutMs: 8000 }
    );
    await evaluate(page, `document.querySelectorAll('.cr-panel').forEach((p) => p.remove()); true`);
  },
  test(m) {
    const [state] = m.elements['#tools_wrapper'];
    const [depth] = m.elements['#depth_column'];
    if (!state || !depth) return 'a panel was not found';
    const problems = [];
    if (!close(state.rect.height, 480)) problems.push(`state panel ${state.rect.height}px tall, expected 480`);
    if (!close(depth.rect.height, 480)) problems.push(`depth panel ${depth.rect.height}px tall, expected 480`);
    return problems.length === 0 ? true : problems.join('; ');
  },
};

// Stacked, the panels take their own heights: no floor on the decision panel.
const stackedCheck = {
  name: 'panels:narrow:card:no-floor',
  viewport: 'narrow',
  state: 'card',
  selectors: ['#content'],
  async act(page) {
    return evaluate(page, `getComputedStyle(document.getElementById('content')).minHeight`);
  },
  test(m) {
    return m.acted === '0px' ? true : `#content min-height is ${m.acted}, expected 0px`;
  },
};

const checks = [];
for (const viewport of ['laptop', 'monitor']) {
  for (const state of STATES) {
    checks.push(restingCheck({ state }, viewport, 'slim'));
    checks.push(restingCheck({ state }, viewport, 'expanded'));
  }
  checks.push(restingCheck({ state: 'hub-month', short: true }, viewport, 'slim'));
  checks.push(restingCheck({ state: 'hub-month', short: true }, viewport, 'expanded'));
  checks.push(tallDepthCheck(viewport, 'hub-month', 'slim'));
  checks.push(tallDepthCheck(viewport, 'hub-month', 'expanded'));
  checks.push(footerCheck(viewport, 'hub'));
}
checks.push(stateHeightCheck);
checks.push(twoColumnCheck('hub-month'));
checks.push(twoColumnCheck('reichstag-picked'));
checks.push(preGameCheck, stackedCheck);

export default checks;
