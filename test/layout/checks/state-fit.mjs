'use strict';

// The state column fits a 1366x768 laptop with each tab open, and the box
// that scrolls, #stats_sidebar, draws no scrollbar. The box is as tall as its
// column (the other panels follow it; see checks/panels.mjs), up to a cap.
// The columns start --columns-top down the page, so at scroll 0 the box can be one
// window tall less that and the body's 0.5rem margin before it crosses the
// fold; layout.css caps it there. When the column plus its padding runs past
// the cap, Chrome draws a bar that narrows the content, and the bar can stay
// behind after the rows reflow shorter. So the check reads the sidebar
// itself: no bar (offsetWidth equals clientWidth), nothing to scroll, and
// the box ends at or above the fold. The government hub and a party with Neorevisionists and every
// faction bar in use are the two tallest Party-tab states; the State tab is
// tallest with the budget, a Popular Front's two coalition dissent blocks and
// a full history chart (hub-state-full). The Defense tab is tallest in government,
// with the interior police's seventh row (hub-government, Defense opened).
// The column is as tall as its tallest tab whichever is open, so each tab's
// state is held to the same budget as the tallest one. Every state prints the column's height against the room the sidebar has,
// for the report, and the room is measured from the page's own
// --columns-top.

import { evaluate } from '../lib/driver.mjs';

// The sidebar pads 7.8px above and below the column, and the body keeps a
// 0.5rem margin under the panels.
const SIDEBAR_PADDING = 7.8;
const MARGIN = 8;
// Room left under the column, in px, that every state keeps.
const SPARE = 4;

// Open a tab of the state column, in the state the check reached (none: leave
// the open tab), and return the page's --columns-top once the banner has
// stopped moving (it slides as the game starts), with the column's natural
// height: measured with the sidebar's cap lifted, since a scrollbar narrows
// the content and skews the height of a column that overflows.
const openTab = (key) => (page) => evaluate(page, `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const top = () => parseFloat(document.documentElement.style.getPropertyValue('--columns-top'));
  ${key ? `document.querySelector('#state-column [data-sc-tab="${key}"]').click();` : ''}
  await wait(400);
  let last = top();
  for (let i = 0; i < 20; i++) {
    await wait(150);
    const now = top();
    if (now === last) break;
    last = now;
  }
  const sidebar = document.getElementById('stats_sidebar');
  sidebar.style.maxHeight = 'none';
  const natural = document.getElementById('state-column').getBoundingClientRect().height;
  sidebar.style.maxHeight = '';
  return { columnsTop: last, natural };
})()`);

function fitCheck(state, tab, { open } = {}) {
  return {
    name: `state-fit:${state}${open ? ':' + open : ''}:laptop`,
    viewport: 'laptop',
    state,
    act: openTab(open),
    selectors: ['#stats_sidebar', '#state-column', '#state-column .sc-tab.on'],
    test(m) {
      const [sidebar] = m.elements['#stats_sidebar'];
      const [column] = m.elements['#state-column'];
      const [on] = m.elements['#state-column .sc-tab.on'];
      if (!column || !sidebar) return '#state-column or #stats_sidebar not found';
      const problems = [];
      if (!on || !on.text.startsWith(tab)) problems.push(`open tab "${on && on.text}", expected ${tab}`);
      const bar = sidebar.offsetWidth - sidebar.clientWidth;
      if (bar !== 0) problems.push(`sidebar draws a ${bar}px scrollbar`);
      if (sidebar.scrollHeight > sidebar.clientHeight) {
        problems.push(`sidebar scrolls inside itself: scrollHeight ${sidebar.scrollHeight} > clientHeight ${sidebar.clientHeight}`);
      }
      // The column's last row is fully inside the sidebar's box.
      const bottom = sidebar.rect.top + sidebar.clientHeight;
      if (column.rect.bottom > bottom) problems.push(`column ends ${column.rect.bottom - bottom}px below the sidebar's bottom edge`);
      // The budget: the window less --columns-top, the margin, and the
      // sidebar's padding. The box itself ends at or above the fold.
      const { columnsTop, natural } = m.acted;
      if (!(columnsTop > 0)) problems.push(`--columns-top is ${columnsTop}`);
      const room = m.viewport.height - columnsTop - MARGIN - 2 * SIDEBAR_PADDING;
      const spare = room - natural;
      console.log(`state-fit ${state}${open ? ' (' + open + ')' : ''}, ${tab} tab: column ${natural.toFixed(1)}px, room ${room.toFixed(1)}px (columns-top ${columnsTop}px), spare ${spare.toFixed(1)}px`);
      if (spare < SPARE) problems.push(`column leaves ${spare.toFixed(1)}px of the ${room.toFixed(1)}px budget, want at least ${SPARE}`);
      if (sidebar.rect.bottom > m.viewport.height - MARGIN + 1) {
        problems.push(`sidebar ends at ${sidebar.rect.bottom}, below the fold (${m.viewport.height - MARGIN})`);
      }
      if (m.scrollWidth > m.clientWidth) problems.push(`horizontal overflow: scrollWidth ${m.scrollWidth} > clientWidth ${m.clientWidth}`);
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

// On a monitor nothing is tight: the box is as tall as its column and its
// padding, with no blank parchment under the last row, well above the fold, in
// opposition and in government, on each tab.
function monitorCheck(state, open) {
  return {
    name: `state-fit:${state}:${open}:monitor`,
    viewport: 'monitor',
    state,
    act: openTab(open),
    selectors: ['#stats_sidebar', '#state-column'],
    test(m) {
      const [sidebar] = m.elements['#stats_sidebar'];
      const [column] = m.elements['#state-column'];
      if (!sidebar || !column) return '#stats_sidebar or #state-column not found';
      const fold = m.viewport.height - MARGIN;
      const problems = [];
      if (sidebar.rect.bottom > fold + 1) problems.push(`sidebar ends at ${sidebar.rect.bottom}, below the fold (${fold})`);
      if (sidebar.scrollHeight > sidebar.clientHeight) problems.push(`sidebar scrolls inside itself: ${sidebar.scrollHeight} > ${sidebar.clientHeight}`);
      // The box ends one padding under the column's last row.
      const blank = sidebar.rect.bottom - column.rect.bottom - SIDEBAR_PADDING;
      if (Math.abs(blank) > 1.5) problems.push(`sidebar ends ${blank.toFixed(1)}px past its column's padding`);
      if (!(fold - sidebar.rect.bottom > 150)) problems.push(`sidebar ends at ${sidebar.rect.bottom}, expected well above the fold (${fold})`);
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

export default [
  fitCheck('hub', 'Party'),
  fitCheck('hub-month', 'Party'),
  fitCheck('hub-government', 'Party'),
  fitCheck('hub-black-thursday', 'Party'),
  fitCheck('hub-factions', 'Party'),
  fitCheck('party-varied', 'Party'),
  fitCheck('hub-defense', 'Defense'),
  fitCheck('hub-defense-badges', 'Defense'),
  fitCheck('hub-defense-entry', 'Defense'),
  fitCheck('hub-government', 'Defense', { open: 'defense' }),
  fitCheck('hub-state', 'State'),
  fitCheck('hub-state-government', 'State'),
  fitCheck('hub-state-full', 'State'),
  monitorCheck('hub', 'party'),
  monitorCheck('hub-government', 'defense'),
  monitorCheck('hub-state-full', 'state'),
];
