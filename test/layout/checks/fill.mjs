'use strict';

import { TOLERANCE, close, lte } from '../lib/assert.mjs';

// Checks that the decision column fills its track: on a short page #content
// is as wide as the date line above it (both are grid items of the same
// track), and at a large Options font size it stays inside that track
// instead of spilling into the gap. 1px tolerance, matching the other files.

function shortPageCheck(viewport) {
  return {
    name: `fill:short-content:${viewport}`,
    viewport,
    state: 'hub',
    shortContent: true,
    selectors: ['#content', '#date-line'],
    test(m) {
      const [content] = m.elements['#content'];
      const [dateLine] = m.elements['#date-line'];
      if (!content || !dateLine) return '#content or #date-line not found';
      return close(content.rect.left, dateLine.rect.left) && close(content.rect.right, dateLine.rect.right)
        ? true
        : `#content ${content.rect.left}-${content.rect.right} != #date-line ${dateLine.rect.left}-${dateLine.rect.right}`;
    },
  };
}

const largeFontCheck = {
  name: 'fill:library-charts:monitor:font-1.3em',
  viewport: 'monitor',
  state: 'library-charts',
  fontSize: '1.3em',
  selectors: ['#content', '#date-line'],
  test(m) {
    const [content] = m.elements['#content'];
    const [dateLine] = m.elements['#date-line'];
    if (!content || !dateLine) return '#content or #date-line not found';
    const problems = [];
    if (!lte(content.rect.right, dateLine.rect.right)) {
      problems.push(`#content right ${content.rect.right} past #date-line right ${dateLine.rect.right}`);
    }
    if (m.scrollWidth > m.clientWidth + TOLERANCE) {
      problems.push(`page scrolls horizontally: scrollWidth ${m.scrollWidth} > clientWidth ${m.clientWidth}`);
    }
    return problems.length === 0 ? true : problems.join('; ');
  },
};

export default [shortPageCheck('monitor'), shortPageCheck('laptop'), largeFontCheck];
