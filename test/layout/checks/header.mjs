'use strict';

import { close, lte, within } from '../lib/assert.mjs';

// Checks for the header: it spans the grid's full width, the title sits at
// the left and the three links at the right on one short line, and the title
// is set in Jost. 1px tolerance, matching grid.mjs.

// Three-column tier, depth filled or empty: header should span from the
// state column's left edge to the depth column's right edge, since the depth
// track is always there during play (grid.mjs's depthEmptyCheck). Two-column
// tier: depth sits below the decision column rather than beside it
// (grid.mjs's twoColumnCheck), so the decision column is the right edge
// whether or not depth has content.
function fullWidthCheck(name, viewport, { depth = false, rightSelector }) {
  return {
    name,
    viewport,
    state: depth ? 'hub' : 'hub-month',
    ...(depth ? { depth: true } : {}),
    selectors: ['header', '#tools_wrapper', rightSelector],
    test(m) {
      const [header] = m.elements['header'];
      const [state] = m.elements['#tools_wrapper'];
      const [rightEdge] = m.elements[rightSelector];
      if (!header || !state || !rightEdge) {
        return `header, #tools_wrapper, or ${rightSelector} not found`;
      }

      const problems = [];
      if (!close(header.rect.left, state.rect.left)) {
        problems.push(`header left ${header.rect.left} != state left ${state.rect.left}`);
      }
      if (!close(header.rect.right, rightEdge.rect.right)) {
        problems.push(`header right ${header.rect.right} != ${rightSelector} right ${rightEdge.rect.right}`);
      }
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

// One line: title at the left, links at the right, every link's vertical
// centre inside the title's box. EDGE is the most space allowed between the
// header's edge and the title or last link: its 16px padding, plus room for
// the links' own padding, doubled to leave slack.
const EDGE = 32;
const MAX_HEIGHT = 50;

function oneLineCheck(viewport) {
  return {
    name: `header:one-line:${viewport}`,
    viewport,
    state: 'hub',
    selectors: ['header', '#game-title', '#header-links a'],
    test(m) {
      const [header] = m.elements['header'];
      const [title] = m.elements['#game-title'];
      const links = m.elements['#header-links a'];
      if (!header || !title) return 'header or #game-title not found';
      if (links.length !== 3) return `expected 3 header links, found ${links.length}`;

      const problems = [];
      if (!lte(header.rect.height, MAX_HEIGHT)) {
        problems.push(`header height ${header.rect.height}, expected <= ${MAX_HEIGHT}`);
      }
      if (!lte(title.rect.left - header.rect.left, EDGE)) {
        problems.push(`title left ${title.rect.left} is more than ${EDGE}px from header left ${header.rect.left}`);
      }
      const lastLink = links[links.length - 1];
      if (!lte(header.rect.right - lastLink.rect.right, EDGE)) {
        problems.push(`last link right ${lastLink.rect.right} is more than ${EDGE}px from header right ${header.rect.right}`);
      }
      for (const link of links) {
        const centre = link.rect.top + link.rect.height / 2;
        if (!within(centre, title.rect.top, title.rect.bottom)) {
          problems.push(`link centre ${centre} outside title box ${title.rect.top} to ${title.rect.bottom}`);
        }
      }
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

const titleTypeCheck = {
  name: 'header:title-type:laptop',
  viewport: 'laptop',
  state: 'hub',
  selectors: ['#game-title'],
  test(m) {
    const [title] = m.elements['#game-title'];
    if (!title) return '#game-title not found';
    const problems = [];
    if (!/^"?'?Jost/i.test(title.fontFamily)) {
      problems.push(`font-family ${title.fontFamily} does not start with Jost`);
    }
    if (title.textTransform !== 'uppercase') {
      problems.push(`text-transform ${title.textTransform}, expected uppercase`);
    }
    return problems.length === 0 ? true : problems.join('; ');
  },
};

const phoneCheck = {
  name: 'header:phone:title',
  viewport: 'phone',
  state: 'title',
  selectors: ['#header-links a'],
  test(m) {
    const links = m.elements['#header-links a'];
    const problems = [];
    if (!lte(m.scrollWidth, m.clientWidth)) {
      problems.push(`horizontal overflow: scrollWidth ${m.scrollWidth} > clientWidth ${m.clientWidth}`);
    }
    if (links.length !== 3) {
      problems.push(`expected 3 header links, found ${links.length}`);
    }
    for (const link of links) {
      if (!within(link.rect.left, 0, m.clientWidth) || !within(link.rect.right, 0, m.clientWidth)) {
        problems.push(`link outside viewport: left ${link.rect.left}, right ${link.rect.right}, clientWidth ${m.clientWidth}`);
      }
    }
    return problems.length === 0 ? true : problems.join('; ');
  },
};

export default [
  fullWidthCheck('header:full-width:monitor:depth-filled', 'monitor', { depth: true, rightSelector: '#depth_column' }),
  fullWidthCheck('header:full-width:laptop:depth-filled', 'laptop', { depth: true, rightSelector: '#depth_column' }),
  fullWidthCheck('header:full-width:monitor:depth-empty', 'monitor', { rightSelector: '#depth_column' }),
  fullWidthCheck('header:full-width:two-col:depth-filled', 'two-col', { depth: true, rightSelector: '#content' }),
  oneLineCheck('laptop'),
  oneLineCheck('monitor'),
  oneLineCheck('three-col-min'),
  titleTypeCheck,
  phoneCheck,
];
