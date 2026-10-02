'use strict';

import { TOLERANCE, close, lte, gte, within } from '../lib/assert.mjs';
import { evaluate, waitForCondition } from '../lib/driver.mjs';

// Checks for the three-column grid and its width tiers. 1px tolerance
// throughout, since sub-pixel rounding differs between Chrome's layout and
// rem-to-px math. The pixel figures below (336, 448-512, 384-576) are the
// layout's rem tracks (21rem, 28rem-32rem, 24rem-36rem) at a 16px root.

// document.documentElement.clientWidth, not window.innerWidth: body keeps
// its scrollbar gutter always on (game.css `overflow-y: scroll`), and
// innerWidth includes that gutter. clientWidth is what content is actually
// centered and overflow-checked against.
function overflows(m) {
  return m.scrollWidth > m.clientWidth + TOLERANCE;
}

function threeColumnCheck(viewport) {
  return {
    name: `grid:three-column:${viewport}`,
    viewport,
    state: 'hub',
    depth: true,
    selectors: ['#tools_wrapper', '#content', '#depth_column'],
    test(m) {
      const [state] = m.elements['#tools_wrapper'];
      const [decision] = m.elements['#content'];
      const [depth] = m.elements['#depth_column'];
      const problems = [];

      if (!state || !decision || !depth) {
        return 'one of #tools_wrapper, #content, #depth_column not found';
      }

      if (!lte(state.rect.right, decision.rect.left)) {
        problems.push(`state (right ${state.rect.right}) overlaps decision (left ${decision.rect.left})`);
      }
      if (!lte(decision.rect.right, depth.rect.left)) {
        problems.push(`decision (right ${decision.rect.right}) overlaps depth (left ${depth.rect.left})`);
      }
      if (!close(state.rect.width, 336)) {
        problems.push(`state width ${state.rect.width}, expected 336`);
      }
      if (!within(decision.rect.width, 448, 512)) {
        problems.push(`decision width ${decision.rect.width}, expected 448-512`);
      }
      if (!within(depth.rect.width, 384, 576)) {
        problems.push(`depth width ${depth.rect.width}, expected 384-576`);
      }

      const leftMargin = state.rect.left;
      const rightMargin = m.clientWidth - depth.rect.right;
      if (!close(leftMargin, rightMargin)) {
        problems.push(`left margin ${leftMargin} != right margin ${rightMargin}`);
      }

      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

// During play the depth track is always there at this tier, so the page is
// arranged as the finished game will be. It holds Polls by default; whatever
// it holds, the panel keeps some height and must not collapse.
const depthEmptyCheck = {
  name: 'grid:three-column:monitor:depth-panel',
  viewport: 'monitor',
  state: 'hub-month',
  selectors: ['#depth_column', '#tools_wrapper', '#content'],
  test(m) {
    const [depth] = m.elements['#depth_column'];
    const [state] = m.elements['#tools_wrapper'];
    const [decision] = m.elements['#content'];
    const problems = [];

    if (!depth) return '#depth_column not found';
    if (!state || !decision) return '#tools_wrapper or #content not found';
    if (depth.display === 'none') {
      problems.push('#depth_column has display:none, expected a panel');
    }
    if (!within(depth.rect.width, 384, 576)) {
      problems.push(`depth width ${depth.rect.width}, expected 384-576`);
    }
    if (!gte(depth.rect.height, 480)) {
      problems.push(`depth height ${depth.rect.height}, expected >= 480`);
    }
    if (!lte(state.rect.right, decision.rect.left)) {
      problems.push(`state (right ${state.rect.right}) overlaps decision (left ${decision.rect.left})`);
    }
    if (!lte(decision.rect.right, depth.rect.left)) {
      problems.push(`decision (right ${decision.rect.right}) overlaps depth (left ${depth.rect.left})`);
    }

    const leftMargin = state.rect.left;
    const rightMargin = m.clientWidth - depth.rect.right;
    if (!close(leftMargin, rightMargin)) {
      problems.push(`left margin ${leftMargin} != right margin ${rightMargin}`);
    }

    return problems.length === 0 ? true : problems.join('; ');
  },
};

// The decision and depth tracks split spare width evenly until decision
// reaches its cap; after that depth takes the rest. Neither drops below its
// floor, and at a laptop width the decision column is still the wider one.
function decisionWidthCheck(viewport) {
  return {
    name: `grid:three-column:${viewport}:decision-width`,
    viewport,
    state: 'hub',
    selectors: ['#content', '#depth_column'],
    test(m) {
      const [decision] = m.elements['#content'];
      const [depth] = m.elements['#depth_column'];
      if (!decision || !depth) return '#content or #depth_column not found';
      const problems = [];
      if (!gte(decision.rect.width, 448)) {
        problems.push(`decision width ${decision.rect.width}, expected >= 448`);
      }
      if (!gte(depth.rect.width, 384)) {
        problems.push(`depth width ${depth.rect.width}, expected >= 384`);
      }
      if (viewport === 'laptop' && !gte(decision.rect.width, depth.rect.width)) {
        problems.push(`decision width ${decision.rect.width} < depth width ${depth.rect.width}`);
      }
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

// The narrowest three-column viewport: the tracks' minimums must fit.
const threeColumnMinCheck = {
  name: 'grid:three-column:three-col-min',
  viewport: 'three-col-min',
  state: 'hub',
  selectors: ['#tools_wrapper', '#content', '#depth_column'],
  test(m) {
    const [state] = m.elements['#tools_wrapper'];
    const [decision] = m.elements['#content'];
    const [depth] = m.elements['#depth_column'];
    if (!state || !decision || !depth) {
      return 'one of #tools_wrapper, #content, #depth_column not found';
    }
    const problems = [];
    if (overflows(m)) {
      problems.push(`horizontal overflow: scrollWidth ${m.scrollWidth} > clientWidth ${m.clientWidth}`);
    }
    if (!lte(state.rect.right, decision.rect.left)) {
      problems.push(`state (right ${state.rect.right}) overlaps decision (left ${decision.rect.left})`);
    }
    if (!lte(decision.rect.right, depth.rect.left)) {
      problems.push(`decision (right ${decision.rect.right}) overlaps depth (left ${depth.rect.left})`);
    }
    if (!(depth.rect.right <= m.clientWidth + TOLERANCE)) {
      problems.push(`depth right ${depth.rect.right} past clientWidth ${m.clientWidth}`);
    }
    return problems.length === 0 ? true : problems.join('; ');
  },
};

// Two columns, in play: the depth column holds Polls, so it shows below the
// decision column's footer (an empty one takes no space; see the pre-game
// check below).
const twoColumnDepthPollsCheck = {
  name: 'grid:two-column:hub:depth-polls',
  viewport: 'two-col',
  state: 'hub',
  selectors: ['#content', 'footer', '#depth_column'],
  test(m) {
    const [decision] = m.elements['#content'];
    const [decisionFooter] = m.elements['footer'];
    const [depth] = m.elements['#depth_column'];
    if (!decision || !decisionFooter || !depth) return '#content, footer, or #depth_column not found';
    const problems = [];
    if (depth.display === 'none' || depth.rect.height === 0) {
      problems.push(`#depth_column should show Polls, got display ${depth.display}, height ${depth.rect.height}`);
    }
    if (!gte(depth.rect.top, decisionFooter.rect.bottom)) {
      problems.push(`depth (top ${depth.rect.top}) above decision's footer (bottom ${decisionFooter.rect.bottom})`);
    }
    if (!close(depth.rect.left, decision.rect.left)) {
      problems.push(`depth left ${depth.rect.left} != decision left ${decision.rect.left}`);
    }
    return problems.length === 0 ? true : problems.join('; ');
  },
};

const twoColumnCheck = {
  name: 'grid:two-column:hub',
  viewport: 'two-col',
  state: 'hub',
  depth: true,
  selectors: ['#tools_wrapper', '#content', 'footer', '#depth_column'],
  test(m) {
    const [state] = m.elements['#tools_wrapper'];
    const [decision] = m.elements['#content'];
    const [decisionFooter] = m.elements['footer'];
    const [depth] = m.elements['#depth_column'];
    const problems = [];

    if (!state || !decision || !decisionFooter || !depth) {
      return 'one of #tools_wrapper, #content, footer, #depth_column not found';
    }

    if (!lte(state.rect.right, decision.rect.left)) {
      problems.push(`state (right ${state.rect.right}) overlaps decision (left ${decision.rect.left})`);
    }
    if (!gte(depth.rect.top, decisionFooter.rect.bottom)) {
      problems.push(`depth (top ${depth.rect.top}) above decision's footer (bottom ${decisionFooter.rect.bottom})`);
    }
    if (!close(depth.rect.left, decision.rect.left)) {
      problems.push(`depth left ${depth.rect.left} != decision left ${decision.rect.left}`);
    }
    if (!close(depth.rect.width, decision.rect.width)) {
      problems.push(`depth width ${depth.rect.width} != decision width ${decision.rect.width}`);
    }

    return problems.length === 0 ? true : problems.join('; ');
  },
};

const narrowCheck = {
  name: 'grid:stacked:narrow',
  viewport: 'narrow',
  state: 'hub',
  depth: true,
  selectors: ['#tools_wrapper', '#date-line', '#content', '#depth_column'],
  test(m) {
    const [state] = m.elements['#tools_wrapper'];
    const [dateLine] = m.elements['#date-line'];
    const [decision] = m.elements['#content'];
    const [depth] = m.elements['#depth_column'];
    const problems = [];

    if (!state || !decision || !depth) {
      return 'one of #tools_wrapper, #content, #depth_column not found';
    }

    if (state.rect.height <= 0) {
      problems.push(`state height ${state.rect.height}, expected > 0 (float collapse?)`);
    }
    // #date-line sits between state and decision in DOM order; fall back to
    // decision's own top if it's ever missing.
    const afterState = dateLine || decision;
    if (!lte(state.rect.bottom, afterState.rect.top)) {
      problems.push(`state (bottom ${state.rect.bottom}) below what follows it (top ${afterState.rect.top})`);
    }
    if (!lte(decision.rect.bottom, depth.rect.top)) {
      problems.push(`decision (bottom ${decision.rect.bottom}) below depth (top ${depth.rect.top})`);
    }
    if (overflows(m)) {
      problems.push(`horizontal overflow: scrollWidth ${m.scrollWidth} > clientWidth ${m.clientWidth}`);
    }

    return problems.length === 0 ? true : problems.join('; ');
  },
};

const phoneCheck = {
  name: 'grid:stacked:phone',
  viewport: 'phone',
  state: 'hub',
  depth: true,
  selectors: ['#tools_wrapper', '#content', '#depth_column'],
  test(m) {
    const [state] = m.elements['#tools_wrapper'];
    const [decision] = m.elements['#content'];
    const [depth] = m.elements['#depth_column'];
    const problems = [];

    if (!state || !decision || !depth) {
      return 'one of #tools_wrapper, #content, #depth_column not found';
    }

    if (!lte(state.rect.bottom, decision.rect.top)) {
      problems.push(`state (bottom ${state.rect.bottom}) below decision (top ${decision.rect.top})`);
    }
    // Stacked DOM order is state bar, state, date line, decision, depth bar, depth, footer, so
    // #content (not footer) is the element directly above depth here.
    if (!lte(decision.rect.bottom, depth.rect.top)) {
      problems.push(`decision (bottom ${decision.rect.bottom}) below depth (top ${depth.rect.top})`);
    }
    if (overflows(m)) {
      problems.push(`horizontal overflow: scrollWidth ${m.scrollWidth} > clientWidth ${m.clientWidth}`);
    }

    return problems.length === 0 ? true : problems.join('; ');
  },
};

// Before a game starts the page keeps the three-column arrangement at this
// tier: the state and depth columns show as empty panels beside the decision
// column, and the in-play stats content stays hidden. Only the title screen
// (no game started) is in this state. The title page's carousels (carousel.js,
// checked in checks/carousel.mjs) stand in for these panels; they are taken
// out here to measure the empty panels themselves, which return whenever a
// carousel has nothing to show (the public build, which ships no art yet).
function preGameThreeColumnCheck(viewport) {
  return {
    name: `grid:title:three-column:${viewport}`,
    viewport,
    state: 'title',
    async act(page) {
      await waitForCondition(
        () => evaluate(page, `document.querySelectorAll('.cr-panel').length === 2`),
        { timeoutMs: 8000 }
      );
      await evaluate(page, `document.querySelectorAll('.cr-panel').forEach((p) => p.remove()); true`);
    },
    selectors: ['#tools_wrapper', '#stats_sidebar', '#content', '#depth_column'],
    test(m) {
      const [state] = m.elements['#tools_wrapper'];
      const [sidebar] = m.elements['#stats_sidebar'];
      const [decision] = m.elements['#content'];
      const [depth] = m.elements['#depth_column'];
      const problems = [];

      if (!state || !sidebar || !decision || !depth) {
        return 'one of #tools_wrapper, #stats_sidebar, #content, #depth_column not found';
      }

      if (state.display === 'none') {
        problems.push('#tools_wrapper has display:none, expected an empty panel');
      }
      if (depth.display === 'none') {
        problems.push('#depth_column has display:none, expected an empty panel');
      }
      if (sidebar.display !== 'none') {
        problems.push(`#stats_sidebar display ${sidebar.display}, expected none before a game starts`);
      }
      if (!close(state.rect.width, 336)) {
        problems.push(`state width ${state.rect.width}, expected 336`);
      }
      if (!within(depth.rect.width, 384, 576)) {
        problems.push(`depth width ${depth.rect.width}, expected 384-576`);
      }
      if (!gte(state.rect.height, 480) || !gte(depth.rect.height, 480)) {
        problems.push(`panel heights ${state.rect.height} and ${depth.rect.height}, expected >= 480`);
      }
      if (!lte(state.rect.right, decision.rect.left)) {
        problems.push(`state (right ${state.rect.right}) overlaps decision (left ${decision.rect.left})`);
      }
      if (!lte(decision.rect.right, depth.rect.left)) {
        problems.push(`decision (right ${decision.rect.right}) overlaps depth (left ${depth.rect.left})`);
      }
      if (!close(state.rect.top, decision.rect.top) || !close(depth.rect.top, decision.rect.top)) {
        problems.push(`panel tops differ: state ${state.rect.top}, decision ${decision.rect.top}, depth ${depth.rect.top}`);
      }
      if (overflows(m)) {
        problems.push(`horizontal overflow: scrollWidth ${m.scrollWidth} > clientWidth ${m.clientWidth}`);
      }

      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

// Below 1300px the pre-game side columns still take no space.
function preGameCollapsedCheck(name, viewport) {
  return {
    name,
    viewport,
    state: 'title',
    selectors: ['#tools_wrapper', '#depth_column'],
    test(m) {
      const [state] = m.elements['#tools_wrapper'];
      const [depth] = m.elements['#depth_column'];
      if (!state || !depth) return '#tools_wrapper or #depth_column not found';
      const problems = [];
      if (!(state.display === 'none' || state.rect.height === 0)) {
        problems.push(`#tools_wrapper should take no space, got display ${state.display}, height ${state.rect.height}`);
      }
      if (!(depth.display === 'none' || depth.rect.height === 0)) {
        problems.push(`#depth_column should take no space, got display ${depth.display}, height ${depth.rect.height}`);
      }
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

export default [
  ...['monitor', 'laptop', 'laptop-l', 'wide'].map(threeColumnCheck),
  depthEmptyCheck,
  twoColumnCheck,
  twoColumnDepthPollsCheck,
  ...['laptop', 'laptop-l'].map(decisionWidthCheck),
  threeColumnMinCheck,
  narrowCheck,
  phoneCheck,
  ...['desktop', 'monitor', 'three-col-min'].map(preGameThreeColumnCheck),
  preGameCollapsedCheck('grid:title:two-column:collapsed', 'two-col'),
  preGameCollapsedCheck('grid:title:stacked:collapsed', 'narrow'),
  preGameCollapsedCheck('grid:title:phone:collapsed', 'phone'),
];
