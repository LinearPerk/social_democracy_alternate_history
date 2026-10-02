'use strict';

import { TOLERANCE } from '../lib/assert.mjs';
import { evaluate } from '../lib/driver.mjs';

// The three state-column tabs (Party, Defense, State) keep one rhythm, written
// once as CSS variables in the column's tokens block: every row is --sc-row
// tall (a Defense row, with its two lines, --sc-row-2: 16px of text and a
// --sc-bar-h bar), the body starts
// --sc-tab-gap under the tab bar, a heading sits --sc-head-gap above its rows,
// and groups are --sc-group-gap apart. `act` opens each tab in turn and reads
// the computed heights and gaps; the check compares them with the variables.
// --sc-lead, the room above the tab bar, is 6px, and 0 in government. The check
// also prints each tab's natural body height (its rows' own, with the box's
// minimum lifted: the box holds the tallest of the three, see
// checks/stable-height.mjs) and the column's height, for the report.

const READ = `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const css = getComputedStyle(document.body);
  const v = (name) => parseFloat(css.getPropertyValue(name));
  const vars = {
    row: v('--sc-row'), row2: v('--sc-row-2'), tab: v('--sc-tab-gap'),
    head: v('--sc-head-gap'), group: v('--sc-group-gap'), bar: v('--sc-bar-h'),
  };
  const colStyle = getComputedStyle(document.getElementById('state-column'));
  vars.lead = parseFloat(colStyle.getPropertyValue('--sc-lead'));
  const tabsTop = document.querySelector('#state-column .sc-tabs').getBoundingClientRect().top;
  const ledgerBottom = document.querySelector('#state-column .sc-ledger-box').getBoundingClientRect().bottom;
  vars.leadGap = tabsTop - ledgerBottom;
  // A tab click redraws the column, so it is looked up afresh each time.
  let col = null;
  const rect = (el) => el.getBoundingClientRect();
  const all = (sel) => Array.from(col.querySelectorAll(sel));
  const heights = (sel) => all(sel).map((el) => rect(el).height);
  const gap = (upper, lower) => (upper && lower) ? rect(lower).top - rect(upper).bottom : null;
  const out = { vars, tabs: {} };
  for (const tab of ['party', 'defense', 'state']) {
    document.querySelector('#state-column [data-sc-tab="' + tab + '"]').click();
    await wait(200);
    col = document.getElementById('state-column');
    const body = col.querySelector('.sc-body');
    const minHeight = body.style.minHeight;
    body.style.minHeight = '';
    const natural = rect(body).height;
    body.style.minHeight = minHeight;
    const t = {
      body: natural,
      column: rect(col).height,
      afterTabs: gap(col.querySelector('.sc-tabs'), body.firstElementChild),
    };
    if (tab === 'party') {
      const head = col.querySelector('.sc-frow.head');
      const first = col.querySelector('.sc-frow:not(.head)');
      t.rows = heights('.sc-frow:not(.head)');
      t.resources = heights('.sc-body > .sc-row');
      t.tracks = all('.sc-frow:not(.head) .trk').map((el) => rect(el).height);
      t.headToRows = gap(head, first);
      t.groupGap = gap(col.querySelector('.sc-body > .sc-row'), head);
    }
    if (tab === 'defense') {
      const groups = all('.sc-dgroup');
      const rows = all('.sc-drow');
      t.rows = rows.map((el) => rect(el).height);
      t.headToRows = gap(groups[0], rows[0]);
      const lastStreet = rows.filter((el) => rect(el).top < rect(groups[1]).top).pop();
      t.groupGap = gap(lastStreet, groups[1]);
    }
    if (tab === 'state') {
      t.rows = heights('.sc-fig');
      t.coalition = heights('.sc-coalition .cd-row');
      t.chart = heights('.sc-econ-svg');
      t.groupGap = gap(col.querySelector('.sc-figs'), col.querySelector('.sc-econ-chart'));
      t.coalitionGap = gap(col.querySelector('.sc-econ-chart'), col.querySelector('.sc-coalition'));
    }
    out.tabs[tab] = t;
  }
  return out;
})()`;

function near(a, b) {
  return typeof a === 'number' && Math.abs(a - b) <= TOLERANCE;
}

function rhythmCheck(state, expectCoalition, lead) {
  return {
    name: `rhythm:${state}:laptop`,
    viewport: 'laptop',
    state,
    selectors: [],
    act: (page) => evaluate(page, READ),
    test(m) {
      const { vars, tabs } = m.acted;
      const problems = [];
      const want = { row: 22, row2: 26, tab: 8, head: 6, group: 10, bar: 10, lead };
      for (const [key, value] of Object.entries(want)) {
        if (vars[key] !== value) problems.push(`--sc-${{ row2: 'row-2', tab: 'tab-gap', head: 'head-gap', group: 'group-gap', bar: 'bar-h' }[key] || key} is ${vars[key]}, expected ${value}`);
      }
      if (!near(vars.leadGap, lead)) problems.push(`the tab bar is ${vars.leadGap}px under the ledger, want ${lead}`);
      const rows = (label, list, height) => {
        if (!list || list.length === 0) problems.push(`${label}: no rows`);
        else if (!list.every((h) => near(h, height))) problems.push(`${label} rows are ${list.join(', ')}px tall, want ${height}`);
      };
      rows('Party resources', tabs.party.resources, vars.row);
      rows('Party faction', tabs.party.rows, vars.row);
      rows('State readout', tabs.state.rows, vars.row);
      rows('Defense', tabs.defense.rows, vars.row2);
      // The dissent block's first line, one per partner, is 16px, the text
      // line of a Defense row.
      if (expectCoalition) rows('State coalition', tabs.state.coalition, 16);
      if (!tabs.party.tracks.every((h) => near(h, vars.bar))) problems.push(`Party bars are ${tabs.party.tracks.join(', ')}px thick, want ${vars.bar}`);
      for (const tab of ['party', 'defense', 'state']) {
        if (!near(tabs[tab].afterTabs, vars.tab)) problems.push(`${tab}: body starts ${tabs[tab].afterTabs}px under the tab bar, want ${vars.tab}`);
      }
      if (!near(tabs.party.headToRows, vars.head)) problems.push(`Party: ${tabs.party.headToRows}px from the header row to the first row, want ${vars.head}`);
      if (!near(tabs.defense.headToRows, vars.head)) problems.push(`Defense: ${tabs.defense.headToRows}px from the heading to the first row, want ${vars.head}`);
      if (!near(tabs.party.groupGap, vars.group)) problems.push(`Party: ${tabs.party.groupGap}px between the resources row and the table, want ${vars.group}`);
      if (!near(tabs.defense.groupGap, vars.group)) problems.push(`Defense: ${tabs.defense.groupGap}px between the groups, want ${vars.group}`);
      if (!near(tabs.state.groupGap, vars.group)) problems.push(`State: ${tabs.state.groupGap}px between readout and chart, want ${vars.group}`);
      if (expectCoalition && !near(tabs.state.coalitionGap, vars.group)) problems.push(`State: ${tabs.state.coalitionGap}px between chart and coalition block, want ${vars.group}`);
      const fmt = (t) => `natural body ${t.body.toFixed(1)}, column ${t.column.toFixed(1)}`;
      console.log(`rhythm ${state} at 1366x768: Party ${fmt(tabs.party)}; Defense ${fmt(tabs.defense)}; State ${fmt(tabs.state)}`);
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

export default [
  rhythmCheck('hub', false, 6),
  rhythmCheck('hub-government', false, 0),
  rhythmCheck('hub-state-full', true, 0),
];
