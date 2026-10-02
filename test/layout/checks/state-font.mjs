'use strict';

import { TOLERANCE, close, gte, lte } from '../lib/assert.mjs';
import { evaluate, setFontSize } from '../lib/driver.mjs';

// The state column is a graphic readout set in px, so the Options font size
// (an inline em size on #stats_sidebar and #content) must not change it: at
// 1.3em its height and its "Party resources" row match the 1.0em values, no
// row runs past the column's right edge, and #content still grows, so the
// control keeps working where it should. `act` reads the page at the default
// (no inline size), at 1.0em and at 1.3em; the column is fully rendered in
// the state each check reaches, so the three reads compare like for like.

const SIZES = [
  ['default', null],
  ['1.0em', '1.0em'],
  ['1.3em', '1.3em'],
];

function readMetrics() {
  return `(() => {
    const column = document.getElementById('state-column');
    const content = document.getElementById('content');
    const c = column.getBoundingClientRect();
    const label = Array.from(column.querySelectorAll('.sc-row .lbl'))
      .find((el) => el.textContent.trim().startsWith('Party resources'));
    const row = label && label.closest('.sc-row');
    const r = row && row.getBoundingClientRect();
    const overflowing = [];
    for (const el of column.querySelectorAll('*')) {
      const b = el.getBoundingClientRect();
      if (b.width > 0 && b.right > c.right + ${TOLERANCE}) {
        overflowing.push((el.className || el.tagName) + ' right ' + b.right.toFixed(1));
      }
    }
    return {
      columnHeight: c.height,
      columnRight: c.right,
      rowRight: r && r.right,
      labelRight: label && label.getBoundingClientRect().right,
      columnScroll: column.scrollWidth - column.clientWidth,
      overflowing: overflowing.slice(0, 20),
      contentFontPx: parseFloat(getComputedStyle(content).fontSize),
      columnFontPx: parseFloat(getComputedStyle(column).fontSize),
    };
  })()`;
}

async function actAcrossSizes(page) {
  const out = {};
  for (const [key, size] of SIZES) {
    if (size) await setFontSize(page, size);
    else await evaluate(page, `(() => { for (const id of ['content', 'stats_sidebar']) document.getElementById(id).removeAttribute('style'); })()`);
    out[key] = await evaluate(page, readMetrics());
  }
  return out;
}

function fontCheck(viewport) {
  return {
    name: `state-font:hub:${viewport}`,
    viewport,
    state: 'hub',
    act: actAcrossSizes,
    selectors: [],
    test(m) {
      const a = m.acted;
      if (!a['1.0em'] || !a['1.3em']) return 'no measurements';
      const problems = [];
      for (const key of ['default', '1.0em']) {
        const [base, big] = [a[key], a['1.3em']];
        if (!close(base.columnHeight, big.columnHeight)) problems.push(`column height ${base.columnHeight} at ${key} != ${big.columnHeight} at 1.3em`);
        if (base.rowRight == null || big.rowRight == null) problems.push('Party resources row not found');
        else if (!close(base.rowRight, big.rowRight)) problems.push(`Party resources row right ${base.rowRight} at ${key} != ${big.rowRight} at 1.3em`);
        if (!close(base.columnFontPx, big.columnFontPx)) problems.push(`column font ${base.columnFontPx}px at ${key} != ${big.columnFontPx}px at 1.3em`);
      }
      const big = a['1.3em'];
      if (big.rowRight != null && !lte(big.rowRight, big.columnRight)) problems.push(`Party resources row right ${big.rowRight} past column right ${big.columnRight}`);
      if (big.labelRight != null && !lte(big.labelRight, big.columnRight)) problems.push(`Party resources label right ${big.labelRight} past column right ${big.columnRight}`);
      // The tab bar's -2px margin bleeds past the column by design, so
      // overflow is judged against the default size, not against zero.
      const base = a.default;
      if (big.columnScroll > base.columnScroll + TOLERANCE) problems.push(`column scrolls sideways by ${big.columnScroll}px, ${base.columnScroll}px at the default`);
      if (big.overflowing.length > base.overflowing.length) {
        problems.push(`past the column's right edge at 1.3em but not at the default: ${big.overflowing.join(', ')}`);
      }
      // The control still works where it should: #content grows with it.
      if (!gte(a['1.3em'].contentFontPx, a['1.0em'].contentFontPx * 1.2)) {
        problems.push(`#content font ${a['1.0em'].contentFontPx}px at 1.0em, ${a['1.3em'].contentFontPx}px at 1.3em: did not grow`);
      }
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

export default [fontCheck('laptop'), fontCheck('monitor')];
