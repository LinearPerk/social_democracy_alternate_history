'use strict';

import { TOLERANCE, lte } from '../lib/assert.mjs';
import { evaluate } from '../lib/driver.mjs';

// Checks the Party tab's factions block: one row per faction (four at the
// start, five once neorevisionism is above 0), each with a strength track
// and a dissent track that are the same width in every row, rows as tall as
// the rhythm's --sc-row (22px), tracks --sc-bar-h (10px) thick, and nothing
// spilling out of the state column or the page. A header row (Faction,
// Strength, Dissent) sits the rhythm's --sc-head-gap above the first row in
// the same small-caps type as the "Party resources" label, and no separate
// "Factions" heading remains.

const VIEWPORTS = ['laptop', 'three-col-min', 'monitor'];

const STATES = [
  { state: 'hub', rows: 4 },
  { state: 'party-varied', rows: 5 },
];

function sameWidths(elements, what) {
  const widths = elements.map((el) => el.rect.width);
  const spread = Math.max(...widths) - Math.min(...widths);
  return spread > TOLERANCE ? `${what} tracks differ in width by ${spread.toFixed(1)}px` : null;
}

// The header cells' and the resources label's type, read in the page.
const READ_TYPE = `(() => {
  const type = (el) => {
    if (!el) return null;
    const s = getComputedStyle(el);
    return [s.fontFamily, s.fontSize, s.textTransform, s.letterSpacing, s.color].join('|');
  };
  const head = document.querySelector('#state-column .sc-frow.head');
  const label = Array.from(document.querySelectorAll('#state-column .sc-row .lbl'))
    .find((el) => el.textContent.trim().startsWith('Party resources'));
  return {
    head: type(head && head.querySelector('.lbl')),
    headBars: Array.from(head ? head.querySelectorAll('.fbar') : []).map(type),
    label: type(label),
    labelSize: label && parseFloat(getComputedStyle(label).fontSize),
    row: parseFloat(getComputedStyle(document.body).getPropertyValue('--sc-row')),
    headGap: parseFloat(getComputedStyle(document.body).getPropertyValue('--sc-head-gap')),
    bar: parseFloat(getComputedStyle(document.body).getPropertyValue('--sc-bar-h')),
  };
})()`;

function factionsCheck(viewport, { state, rows }) {
  const selectors = [
    '.sc-body',
    '.sc-body *',
    '.sc-frow:not(.head)',
    '.sc-frow:not(.head) .lbl',
    '.sc-frow:not(.head) .fbar:nth-child(2) .trk',
    '.sc-frow:not(.head) .fbar:nth-child(3) .trk',
    '.sc-frow:not(.head) .tick',
    '.sc-gauge, .sc-sky, .sc-pdiss, .sc-dmeter',
    '.sc-frow.head',
    '.sc-frow.head .lbl',
    '.sc-frow.head .fbar',
    '.sc-frows > .sc-frow:not(.head)',
    '.sc-body > .sc-sub',
  ];
  return {
    name: `factions:${state}:${viewport}`,
    viewport,
    state,
    selectors,
    act: (page) => evaluate(page, READ_TYPE),
    test(m) {
      const problems = [];
      const [head] = m.elements['.sc-frow.head'];
      const [first] = m.elements['.sc-frows > .sc-frow:not(.head)'];
      if (!head) {
        problems.push('no header row above the factions');
      } else {
        const words = [...m.elements['.sc-frow.head .lbl'], ...m.elements['.sc-frow.head .fbar']].map((el) => el.text);
        if (words.join(',') !== 'Faction,Strength,Dissent') problems.push(`header reads "${words.join(' ')}", expected Faction Strength Dissent`);
        const headGap = m.acted && m.acted.headGap;
        if (first && !(Math.abs(first.rect.top - head.rect.bottom - headGap) <= TOLERANCE)) {
          problems.push(`the first faction row starts ${first.rect.top - head.rect.bottom}px below the header row, expected the rhythm's ${headGap}`);
        }
        const bodyHeadings = m.elements['.sc-body > .sc-sub'].map((el) => el.text);
        if (bodyHeadings.some((t) => /^factions$/i.test(t))) problems.push('a "Factions" heading still stands above the table');
        const a = m.acted;
        if (!a || !a.head || !a.label) {
          problems.push('could not read the header or the Party resources label');
        } else {
          if (a.head !== a.label) problems.push(`header type "${a.head}" differs from the Party resources label's "${a.label}"`);
          if (a.headBars.some((t) => t !== a.label)) problems.push('Strength or Dissent header type differs from the Party resources label');
        }
      }
      if (m.scrollWidth > m.clientWidth + TOLERANCE) {
        problems.push(`page scrolls horizontally: scrollWidth ${m.scrollWidth} > clientWidth ${m.clientWidth}`);
      }
      const [body] = m.elements['.sc-body'];
      if (!body) return '.sc-body not found';
      const wide = m.elements['.sc-body *'].filter((el) => !lte(el.rect.right, body.rect.right));
      if (wide.length > 0) {
        problems.push(`${wide.length} element(s) in the Party tab extend past its right edge ${body.rect.right}`);
      }
      const left = m.elements['.sc-body *'].filter((el) => el.rect.left < body.rect.left - TOLERANCE);
      if (left.length > 0) {
        problems.push(`${left.length} element(s) in the Party tab extend past its left edge ${body.rect.left}`);
      }
      const found = m.elements['.sc-frow:not(.head)'];
      if (found.length !== rows) problems.push(`expected ${rows} faction rows, found ${found.length}`);
      const rowHeight = m.acted && m.acted.row;
      const barHeight = m.acted && m.acted.bar;
      if (!(rowHeight >= 22)) problems.push(`the rhythm's row height is ${rowHeight}, want 22 or more`);
      for (const row of found) {
        if (!(Math.abs(row.rect.height - rowHeight) <= TOLERANCE)) {
          problems.push(`a faction row is ${row.rect.height}px tall, expected the rhythm's ${rowHeight}`);
          break;
        }
      }
      const strength = m.elements['.sc-frow:not(.head) .fbar:nth-child(2) .trk'];
      const dissent = m.elements['.sc-frow:not(.head) .fbar:nth-child(3) .trk'];
      if (strength.length !== rows || dissent.length !== rows) {
        problems.push(`expected ${rows} strength and dissent tracks, found ${strength.length} and ${dissent.length}`);
      } else {
        for (const t of [...strength, ...dissent]) {
          if (!(Math.abs(t.rect.height - barHeight) <= TOLERANCE)) {
            problems.push(`a track is ${t.rect.height}px thick, expected the rhythm's ${barHeight}`);
            break;
          }
        }
        const a = sameWidths(strength, 'strength');
        const b = sameWidths(dissent, 'dissent');
        if (a) problems.push(a);
        if (b) problems.push(b);
      }
      if (m.elements['.sc-frow:not(.head) .tick'].length !== rows) problems.push('a dissent track has no disunity tick');
      const cut = m.elements['.sc-frow:not(.head) .lbl'].filter((el) => el.scrollWidth > el.clientWidth + TOLERANCE);
      if (cut.length > 0) problems.push(`${cut.length} faction name(s) are cut off`);
      if (m.elements['.sc-gauge, .sc-sky, .sc-pdiss, .sc-dmeter'].length > 0) {
        problems.push('old gauge, skyline or dissent-meter markup is still in the Party tab');
      }
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

export default VIEWPORTS.flatMap((viewport) => STATES.map((s) => factionsCheck(viewport, s)));
