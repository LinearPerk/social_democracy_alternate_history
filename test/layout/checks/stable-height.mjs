'use strict';

import { close } from '../lib/assert.mjs';
import { evaluate } from '../lib/driver.mjs';
import { setTimeout as delay } from 'node:timers/promises';

// The dashboard's box is as tall as its tallest tab in the current game state,
// whichever tab is open: the open tab's body carries a minimum height set by
// state-column.js (the tallest of the three bodies, each measured off-screen),
// so Party and State leave a little blank parchment at their foot, the tab bar
// and rows stay where they are, and the three panels end together on every
// tab. The reading panels floor at the box's height (layout/banner.js
// publishes it as --state-h). The box still caps at one screen under the bars,
// where the tallest tab would scroll inside it.
//
// For each state the check opens Party, Defense and State in turn, and reads
// the box, the panel bottoms and the tab bar's place, then each tab's natural
// column (its body's minimum lifted for the reading). The measurer that
// finds those heights is taken out in the same task, so none of it may be
// left in the document: no `.sc-measure`, no duplicated id, no extra tab
// button for Tab or a click to reach.

const SIDEBAR_PADDING = 7.8;
const MARGIN = 8;
const HALF_PIXEL = 0.5;

const READ = `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const rect = (el) => el.getBoundingClientRect();
  const out = { tabs: {}, columnsTop: parseFloat(document.documentElement.style.getPropertyValue('--columns-top')) };
  for (const tab of ['party', 'defense', 'state']) {
    document.querySelector('#state-column [data-sc-tab="' + tab + '"]').click();
    await wait(300);
    const sidebar = document.getElementById('stats_sidebar');
    const col = document.getElementById('state-column');
    const body = col.querySelector('.sc-body');
    const t = {
      sidebar: rect(sidebar).height,
      sidebarBottom: rect(sidebar).bottom,
      contentBottom: rect(document.getElementById('content')).bottom,
      depthBottom: rect(document.getElementById('depth_column')).bottom,
      tabsTop: rect(col.querySelector('.sc-tabs')).top,
      firstRowTop: rect(body.firstElementChild).top,
      bodyBottom: rect(body).bottom,
      columnBottom: rect(col).bottom,
      variable: parseFloat(document.documentElement.style.getPropertyValue('--state-h')),
      minHeight: parseFloat(body.style.minHeight),
      scrolls: sidebar.scrollHeight > sidebar.clientHeight + 1,
    };
    // Natural: the body's minimum and the sidebar's cap lifted for the reading.
    const keep = body.style.minHeight;
    body.style.minHeight = '';
    sidebar.style.maxHeight = 'none';
    t.naturalBody = rect(body).height;
    t.naturalColumn = rect(col).height;
    sidebar.style.maxHeight = '';
    body.style.minHeight = keep;
    out.tabs[tab] = t;
  }
  const ids = Array.from(document.querySelectorAll('[id]')).map((el) => el.id);
  out.duplicateIds = ids.filter((id, i) => ids.indexOf(id) !== i);
  out.measurers = document.querySelectorAll('.sc-measure, .sc-measure *').length;
  out.tabButtons = document.querySelectorAll('[data-sc-tab]').length;
  out.bodies = document.querySelectorAll('.sc-body').length;
  return out;
})()`;

function stableCheck(state, viewport) {
  return {
    name: `stable-height:${state}:${viewport}`,
    viewport,
    state,
    selectors: [],
    async act(page) {
      // Play starts with the banner still collapsing.
      await delay(600);
      return evaluate(page, READ);
    },
    test(m) {
      const { tabs, columnsTop, duplicateIds, measurers, tabButtons, bodies } = m.acted;
      const list = Object.values(tabs);
      const problems = [];
      const first = list[0];
      const tallestBody = Math.max(...list.map((t) => t.naturalBody));

      // The box is the tallest tab's natural column plus its padding, unless
      // that is past the cap (one screen under the bars), where it is the cap.
      const tallest = Math.max(...list.map((t) => t.naturalColumn));
      const cap = m.viewport.height - columnsTop - MARGIN;
      const want = Math.min(tallest + 2 * SIDEBAR_PADDING, cap);
      console.log(`stable-height ${state}, ${viewport}: natural bodies ${list.map((t) => t.naturalBody.toFixed(1)).join(' / ')} (Party / Defense / State), box ${first.sidebar.toFixed(1)}, cap ${cap.toFixed(1)}`);
      for (const [tab, t] of Object.entries(tabs)) {
        if (!close(t.sidebar, want, HALF_PIXEL)) problems.push(`${tab}: box ${t.sidebar}, expected the tallest tab's ${want}`);
        if (!close(t.sidebar, first.sidebar, HALF_PIXEL)) problems.push(`${tab}: box ${t.sidebar}, Party's ${first.sidebar}`);
        if (!close(t.variable, t.sidebar, HALF_PIXEL)) problems.push(`${tab}: --state-h ${t.variable}, box ${t.sidebar}`);
        // Nothing moves above the blank room: the bar and the first row.
        if (!close(t.tabsTop, first.tabsTop, HALF_PIXEL)) problems.push(`${tab}: tab bar at ${t.tabsTop}, Party's ${first.tabsTop}`);
        if (!close(t.firstRowTop, first.firstRowTop, HALF_PIXEL)) problems.push(`${tab}: first row at ${t.firstRowTop}, Party's ${first.firstRowTop}`);
        // All three panels end together at the box's bottom, while the
        // decision panel's own content fits under it.
        if (!close(t.contentBottom, t.sidebarBottom, HALF_PIXEL)) problems.push(`${tab}: decision bottom ${t.contentBottom}, box bottom ${t.sidebarBottom}`);
        if (!close(t.depthBottom, t.sidebarBottom, HALF_PIXEL)) problems.push(`${tab}: depth bottom ${t.depthBottom}, box bottom ${t.sidebarBottom}`);
        // The blank room is inside the body, so the box still ends one
        // padding under the column.
        if (!close(t.bodyBottom, t.columnBottom, HALF_PIXEL)) problems.push(`${tab}: body ends at ${t.bodyBottom}, the column at ${t.columnBottom}`);
        if (t.scrolls && want < cap) problems.push(`${tab}: the box scrolls inside itself`);
        if (!close(t.minHeight, tallestBody, HALF_PIXEL)) problems.push(`${tab}: body minimum ${t.minHeight}, expected the tallest natural body ${tallestBody}`);
      }

      // The measurer is gone: nothing of it in the document.
      if (measurers !== 0) problems.push(`${measurers} measurer elements are still in the document`);
      if (duplicateIds.length > 0) problems.push(`duplicate ids in the document: ${duplicateIds.join(', ')}`);
      if (tabButtons !== 3) problems.push(`${tabButtons} tab buttons in the document, expected 3`);
      if (bodies !== 1) problems.push(`${bodies} tab bodies in the document, expected 1`);
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

const checks = [];
for (const viewport of ['laptop', 'browser-hd']) {
  for (const state of ['hub', 'hub-month', 'hub-government']) {
    checks.push(stableCheck(state, viewport));
  }
}

export default checks;
