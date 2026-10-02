'use strict';

import { close, lte } from '../lib/assert.mjs';

// Checks that the three column boxes share a top edge, the date line sits
// above the decision column only, and the header and date line have their
// own backing so they read over the full-screen background art. 1px
// tolerance, matching the other check files.
function topsCheck(viewport, depth) {
  return {
    name: `alignment:tops:${viewport}:depth-${depth ? 'filled' : 'empty'}`,
    viewport,
    state: depth ? 'hub' : 'hub-month',
    ...(depth ? { depth: true } : {}),
    selectors: ['#tools_wrapper', '#content', '#depth_column', '#date-line'],
    test(m) {
      const [state] = m.elements['#tools_wrapper'];
      const [content] = m.elements['#content'];
      const [depthColumn] = m.elements['#depth_column'];
      const [dateLine] = m.elements['#date-line'];
      if (!state || !content || !depthColumn || !dateLine) {
        return 'one of #tools_wrapper, #content, #depth_column, #date-line not found';
      }

      const problems = [];
      if (!close(state.rect.top, content.rect.top)) {
        problems.push(`state top ${state.rect.top} != content top ${content.rect.top}`);
      }
      if (!close(depthColumn.rect.top, content.rect.top)) {
        problems.push(`depth top ${depthColumn.rect.top} != content top ${content.rect.top}`);
      }
      if (!lte(dateLine.rect.bottom, content.rect.top)) {
        problems.push(`date line bottom ${dateLine.rect.bottom} below content top ${content.rect.top}`);
      }
      // The date line belongs to the decision column alone.
      if (!close(dateLine.rect.left, content.rect.left) || !close(dateLine.rect.right, content.rect.right)) {
        problems.push(
          `date line ${dateLine.rect.left}-${dateLine.rect.right} != content ${content.rect.left}-${content.rect.right}`
        );
      }
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

function isOpaque(color) {
  if (!color || color === 'transparent') return false;
  const match = color.match(/^rgba\(\s*[\d.]+,\s*[\d.]+,\s*[\d.]+,\s*([\d.]+)\s*\)$/);
  return match ? Number(match[1]) > 0 : true;
}

// Two columns: the date line still sits above the decision column only, so
// the state box starts level with #content.
const twoColumnTopsCheck = {
  name: 'alignment:tops:two-col:depth-filled',
  viewport: 'two-col',
  state: 'hub',
  depth: true,
  selectors: ['#tools_wrapper', '#content', '#date-line'],
  test(m) {
    const [state] = m.elements['#tools_wrapper'];
    const [content] = m.elements['#content'];
    const [dateLine] = m.elements['#date-line'];
    if (!state || !content || !dateLine) {
      return 'one of #tools_wrapper, #content, #date-line not found';
    }
    const problems = [];
    if (!close(state.rect.top, content.rect.top)) {
      problems.push(`state top ${state.rect.top} != content top ${content.rect.top}`);
    }
    if (!lte(dateLine.rect.bottom, content.rect.top)) {
      problems.push(`date line bottom ${dateLine.rect.bottom} below content top ${content.rect.top}`);
    }
    return problems.length === 0 ? true : problems.join('; ');
  },
};

const backingCheck = {
  name: 'alignment:backing:laptop',
  viewport: 'laptop',
  state: 'hub',
  selectors: ['header', '#date-line'],
  test(m) {
    const [header] = m.elements['header'];
    const [dateLine] = m.elements['#date-line'];
    if (!header || !dateLine) return 'header or #date-line not found';
    const problems = [];
    if (!isOpaque(header.backgroundColor)) {
      problems.push(`header background ${header.backgroundColor}, expected a colour`);
    }
    if (!isOpaque(dateLine.backgroundColor)) {
      problems.push(`#date-line background ${dateLine.backgroundColor}, expected a colour`);
    }
    return problems.length === 0 ? true : problems.join('; ');
  },
};

export default [
  ...['monitor', 'laptop'].flatMap((viewport) => [topsCheck(viewport, false), topsCheck(viewport, true)]),
  twoColumnTopsCheck,
  backingCheck,
];
