'use strict';

import { TOLERANCE, close, lte } from '../lib/assert.mjs';

// Checks the sizes of the period symbols in the state column: 24px tall in
// the party ledger, 20px tall in the Defense list's two-line rows (26px). Plain badges
// (Options: badges only) must give the same row heights, so switching the
// setting never moves the rows. 1px tolerance, matching the other files.

const LEDGER_BADGE = 24;
const FORCE_ICON = 20;
const FORCE_ROW = 26;
const LEDGER_BADGE_MAX_WIDTH = 30;
// A ledger row has no padding: just the 1px rule on top.
const LEDGER_ROW_EXTRA = 1;

function noOverflow(m, problems) {
  const [column] = m.elements['#state-column'];
  if (m.scrollWidth > m.clientWidth + TOLERANCE) {
    problems.push(`page scrolls horizontally: scrollWidth ${m.scrollWidth} > clientWidth ${m.clientWidth}`);
  }
  if (!column) return;
  for (const [selector, list] of Object.entries(m.elements)) {
    for (const el of list) {
      if (!lte(el.rect.right, column.rect.right)) {
        problems.push(`${selector} right ${el.rect.right} past state column right ${column.rect.right}`);
        return;
      }
    }
  }
}

function ledgerCheck(viewport, state, symbols) {
  return {
    name: `symbols:ledger:${viewport}:${symbols ? 'period' : 'badges'}`,
    viewport,
    state,
    selectors: ['#state-column', '.sc-ledger', '.sc-ledger .stripe', '.sc-ledger .sc-badge', '.sc-ledger .sc-badge img'],
    test(m) {
      const rows = m.elements['.sc-ledger'];
      const badges = m.elements['.sc-ledger .sc-badge'];
      const imgs = m.elements['.sc-ledger .sc-badge img'];
      if (rows.length === 0 || badges.length === 0) return 'no ledger rows or badges found';
      const problems = [];
      if (symbols && imgs.length === 0) problems.push('no symbol images rendered in period mode');
      if (!symbols && imgs.length > 0) problems.push(`${imgs.length} symbol images rendered in badges mode`);
      for (const b of badges) {
        if (!close(b.rect.height, LEDGER_BADGE)) problems.push(`badge height ${b.rect.height} != ${LEDGER_BADGE}`);
        if (b.rect.width > LEDGER_BADGE_MAX_WIDTH + TOLERANCE) {
          problems.push(`badge width ${b.rect.width} > ${LEDGER_BADGE_MAX_WIDTH}`);
        }
      }
      for (const img of imgs) {
        if (!close(img.rect.height, LEDGER_BADGE)) problems.push(`badge img height ${img.rect.height} != ${LEDGER_BADGE}`);
      }
      // Every row is as tall as the badge plus its padding and border, in
      // both modes, and the stripe fills the same height.
      const rowHeight = LEDGER_BADGE + LEDGER_ROW_EXTRA;
      for (const r of rows) {
        if (!close(r.rect.height, rowHeight)) problems.push(`row height ${r.rect.height} != ${rowHeight}`);
      }
      for (const s of m.elements['.sc-ledger .stripe']) {
        if (!close(s.rect.height, LEDGER_BADGE)) problems.push(`stripe height ${s.rect.height} != ${LEDGER_BADGE}`);
      }
      noOverflow(m, problems);
      return problems.length === 0 ? true : [...new Set(problems)].join('; ');
    },
  };
}

function forceCheck(viewport, state, symbols) {
  return {
    name: `symbols:defense:${viewport}:${symbols ? 'period' : 'badges'}`,
    viewport,
    state,
    selectors: ['#state-column', '.sc-drow', '.sc-drow .ico', '.sc-drow .sc-fsym img'],
    test(m) {
      const rows = m.elements['.sc-drow'];
      const cells = m.elements['.sc-drow .ico'];
      const imgs = m.elements['.sc-drow .sc-fsym img'];
      if (rows.length === 0) return 'no Defense rows found';
      const problems = [];
      if (symbols && imgs.length === 0) problems.push('no symbol images rendered in period mode');
      if (!symbols && imgs.length > 0) problems.push(`${imgs.length} symbol images rendered in badges mode`);
      for (const img of imgs) {
        if (!close(img.rect.height, FORCE_ICON)) problems.push(`symbol height ${img.rect.height} != ${FORCE_ICON}`);
      }
      for (const c of cells) {
        if (!close(c.rect.height, FORCE_ROW)) problems.push(`icon cell height ${c.rect.height} != ${FORCE_ROW}`);
      }
      for (const r of rows) {
        if (!close(r.rect.height, FORCE_ROW)) problems.push(`row height ${r.rect.height} != ${FORCE_ROW}`);
      }
      noOverflow(m, problems);
      return problems.length === 0 ? true : [...new Set(problems)].join('; ');
    },
  };
}

const checks = [];
for (const viewport of ['laptop', 'monitor']) {
  checks.push(ledgerCheck(viewport, 'hub', true));
  checks.push(ledgerCheck(viewport, 'hub-badges', false));
  checks.push(forceCheck(viewport, 'hub-defense', true));
  checks.push(forceCheck(viewport, 'hub-defense-badges', false));
}

export default checks;
