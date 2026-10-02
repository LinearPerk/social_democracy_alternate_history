'use strict';

import { TOLERANCE, lte } from '../lib/assert.mjs';

// The state column sticks at the two- and three-column tiers (>= 800px), so
// it stays in view while the decision column scrolls past it. Below 800px it
// is an ordinary block: no sticky, no height cap, scrolls away with the page.
// #stats_sidebar (not #tools_wrapper) is the element that actually sticks:
// #tools_wrapper is the grid item and stretches to the full "state" area
// (every row from the content row down), so a sticky position on it has no box left
// to move within. #stats_sidebar is a plain child of that stretched box, so
// it has its own intrinsic height and room to stick inside it.

// The normal and easy hubs fit above a laptop's fold, so the page would not
// scroll and the stuck position would go untested. The hub with five
// advisors wraps its advisor row, which makes the decision column taller than
// the window.
const laptopBottomCheck = {
  name: 'sticky:laptop:top-offset',
  viewport: 'laptop',
  state: 'hub-factions',
  scrollTo: 'bottom',
  selectors: ['#stats_sidebar'],
  test(m) {
    const [state] = m.elements['#stats_sidebar'];
    if (!state) return '#stats_sidebar not found';
    const problems = [];

    if (m.scrollHeight <= m.viewport.height) problems.push('the page does not scroll, so the stuck position is untested');
    if (!(state.rect.top >= 0 - TOLERANCE && state.rect.top <= 32 + TOLERANCE)) {
      problems.push(`state top ${state.rect.top}, expected between 0 and 32`);
    }
    if (!lte(state.rect.bottom, m.viewport.height)) {
      problems.push(`state bottom ${state.rect.bottom}, expected <= viewport height ${m.viewport.height}`);
    }

    return problems.length === 0 ? true : problems.join('; ');
  },
};

const laptopHeightCheck = {
  name: 'sticky:laptop:height-cap',
  viewport: 'laptop',
  state: 'hub',
  selectors: ['#stats_sidebar'],
  test(m) {
    const [state] = m.elements['#stats_sidebar'];
    if (!state) return '#stats_sidebar not found';
    const problems = [];

    if (!lte(state.rect.height, m.viewport.height)) {
      problems.push(`state box height ${state.rect.height}, expected <= viewport height ${m.viewport.height}`);
    }
    if (state.scrollHeight > state.clientHeight && state.overflowY !== 'auto') {
      problems.push(`scrollHeight ${state.scrollHeight} > clientHeight ${state.clientHeight} but overflow-y is ${state.overflowY}`);
    }

    return problems.length === 0 ? true : problems.join('; ');
  },
};

const phoneScrolledAwayCheck = {
  name: 'sticky:phone:scrolls-with-page',
  viewport: 'phone',
  state: 'hub',
  scrollTo: 'bottom',
  selectors: ['#stats_sidebar'],
  test(m) {
    const [state] = m.elements['#stats_sidebar'];
    if (!state) return '#stats_sidebar not found';
    return state.rect.bottom < 0
      ? true
      : `state bottom ${state.rect.bottom}, expected < 0 (scrolled away)`;
  },
};

export default [laptopBottomCheck, laptopHeightCheck, phoneScrolledAwayCheck];
