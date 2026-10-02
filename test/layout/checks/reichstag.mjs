'use strict';

import { TOLERANCE, lte } from '../lib/assert.mjs';
import { evaluate } from '../lib/driver.mjs';

// Checks for the Reichstag block: the tab bar is Party, Defense and State;
// the government line carries the chancellor's party badge; a muted line
// names the president; and the block holds no economic figures (they moved to
// the State tab). Also that the ledger's relation word fits beside a change
// pill without truncating. 1px tolerance, matching the other files.

const SELECTORS = [
  '#state-column',
  '.sc-tab',
  '.sc-govlbl .cab',
  '.sc-govlbl .cab .sc-badge',
  '.sc-officials',
  '#state-column .sc-economy',
  '.sc-ledger[data-sc-party="z"] .wd',
  '.sc-ledger[data-sc-party="z"] .wd .sc-delta',
  '.sc-ledger .wd',
];

function noOverflow(m, problems) {
  const [column] = m.elements['#state-column'];
  if (m.scrollWidth > m.clientWidth + TOLERANCE) {
    problems.push(`page scrolls horizontally: scrollWidth ${m.scrollWidth} > clientWidth ${m.clientWidth}`);
  }
  if (!column) return;
  for (const [selector, list] of Object.entries(m.elements)) {
    // The tab bar bleeds 2px past the column on purpose (negative margin).
    if (selector.startsWith('.sc-tab')) continue;
    for (const el of list) {
      if (!lte(el.rect.right, column.rect.right)) {
        problems.push(`${selector} right ${el.rect.right} past state column right ${column.rect.right}`);
        return;
      }
    }
  }
}

function commonProblems(m) {
  const problems = [];

  // Three tabs; Polls moved to the depth column.
  const tabs = m.elements['.sc-tab'].length;
  if (tabs !== 3) problems.push(`${tabs} tabs, want 3 (Party, Defense, State)`);

  // The chancellor's badge sits in the government line, beside his name.
  const [cab] = m.elements['.sc-govlbl .cab'];
  if (!cab) {
    problems.push('government line has no cabinet part');
  } else if (m.elements['.sc-govlbl .cab .sc-badge'].length !== 1) {
    problems.push('government line lacks the chancellor\'s party badge');
  }

  // A muted line names the president.
  const [officials] = m.elements['.sc-officials'];
  if (!officials || !officials.text.includes('Reichspräsident Hindenburg')) {
    problems.push(`officials line reads "${officials ? officials.text : 'missing'}"`);
  }

  // The economic figures live on the State tab now.
  if (m.elements['#state-column .sc-economy'].length > 0) problems.push('the Reichstag block still holds an economy strip');

  // No relation word is cut short, with or without a pill beside it.
  for (const wd of m.elements['.sc-ledger .wd']) {
    if (wd.scrollWidth > wd.clientWidth + TOLERANCE) {
      problems.push(`relation word "${wd.text}" truncated: scrollWidth ${wd.scrollWidth} > clientWidth ${wd.clientWidth}`);
    }
  }

  noOverflow(m, problems);
  return problems;
}

function openingCheck(viewport) {
  return {
    name: `reichstag:1928-start:${viewport}`,
    viewport,
    state: 'hub',
    selectors: SELECTORS,
    test(m) {
      const problems = commonProblems(m);
      return problems.length === 0 ? true : [...new Set(problems)].join('; ');
    },
  };
}

function blackThursdayCheck(viewport) {
  return {
    name: `reichstag:black-thursday:${viewport}`,
    viewport,
    state: 'hub-black-thursday',
    selectors: SELECTORS,
    test(m) {
      const problems = commonProblems(m);
      // The longest band word beside a two-arrow pill, untruncated (the
      // truncation test is in commonProblems).
      const [word] = m.elements['.sc-ledger[data-sc-party="z"] .wd'];
      const [pill] = m.elements['.sc-ledger[data-sc-party="z"] .wd .sc-delta'];
      if (!word || !word.text.startsWith('very friendly')) {
        problems.push(`Center relation word reads "${word ? word.text : 'missing'}", want "very friendly"`);
      }
      if (!pill || pill.text !== '▲▲') problems.push(`Center change pill reads "${pill ? pill.text : 'missing'}", want two arrows`);
      return problems.length === 0 ? true : [...new Set(problems)].join('; ');
    },
  };
}

// The officials line is 13px, its names stay on one line untruncated, and the
// election countdown rides its right end. Two families of case:
//
// - A chancellor on the line (a coalition label names no one, so Schleicher
//   and Papen in 1932-33 and Breitscheid in a Popular Front meet Hindenburg or
//   Münzenberg): the names alone fill the column, so the countdown takes a line
//   of its own below them, in full.
// - The president alone (the label names the chancellor): the countdown sits
//   on the same line, full when it fits and shortened ("Election · May 1928",
//   the months in a title) when it doesn't. An acting president with a long
//   name can leave no room even for that, and then it too goes below.
//
// The cases are written into the qualities and the column redrawn. `tier` is
// what each should produce.
const WITH_CHANCELLOR = [
  ['Marx', 'Hindenburg'],
  ['Brüning', 'Hindenburg'],
  ['Papen', 'Hindenburg'],
  ['Schleicher', 'Hindenburg'],
  ['Breitscheid', 'Hindenburg'],
  ['Breitscheid', 'Münzenberg'],
  ['Papen', 'Bumke (acting)'],
].map(([chancellor, president]) => ({ chancellor, president, election: [5, 1928], tier: 'own' }));

const PRESIDENT_ALONE = [
  { president: 'Hindenburg', election: [5, 1928], tier: 'full' },
  { president: 'Hindenburg', election: [9, 1928], tier: 'short' },
  { president: 'Hindenburg', election: [12, 1931], tier: 'short' },
  { president: 'Bumke (acting)', election: [5, 1928], tier: 'short' },
  { president: 'Großmann (acting)', election: [12, 1931], tier: 'own' },
];

const READ_OFFICIALS = (cases, flags) => `(() => {
  const q = window.dendryUI.dendryEngine.state.qualities;
  const box = (el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height }; };
  return ${JSON.stringify(cases)}.map((c) => {
    Object.assign(q, ${JSON.stringify(flags)}, { president: c.president, next_election_month: c.election[0], next_election_year: c.election[1] });
    if (c.chancellor) q.chancellor = c.chancellor;
    window.updateSidebar();
    const el = document.querySelector('#state-column .sc-officials');
    if (!el) return { ...c, missing: true };
    const who = el.querySelector('.who');
    const cd = el.querySelector('.sc-countdown');
    const column = document.querySelector('#state-column');
    return {
      ...c,
      text: el.textContent.trim(),
      fontPx: who ? parseFloat(getComputedStyle(who).fontSize) : null,
      whoBox: who ? box(who) : null,
      whoScrollWidth: who ? who.scrollWidth : 0,
      whoClientWidth: who ? who.clientWidth : 0,
      badges: el.querySelectorAll('.sc-badge').length,
      cdBox: cd ? box(cd) : null,
      cdClass: cd ? cd.className : null,
      cdTitle: cd ? cd.getAttribute('title') : null,
      cdText: cd ? cd.textContent.trim() : null,
      columnRight: column.getBoundingClientRect().right,
      blockCountdownRows: document.querySelectorAll('#state-column div.sc-countdown').length,
    };
  });
})()`;

function officialsProblems(rows, { withChancellor }) {
  const problems = [];
  for (const r of rows) {
    const who = withChancellor ? `${r.chancellor} and ${r.president}` : `${r.president}, election ${r.election.join('/')}`;
    if (r.missing) {
      problems.push(`${who}: no officials line`);
      continue;
    }
    if (r.fontPx !== 13) problems.push(`${who}: officials line is ${r.fontPx}px, expected 13`);
    // The names are one line of 13px type (about 17px tall) and untruncated.
    if (r.whoBox.height > 22) problems.push(`${who}: the names wrap (height ${r.whoBox.height})`);
    if (r.whoScrollWidth > r.whoClientWidth + TOLERANCE) {
      problems.push(`${who}: the names are cut off (scrollWidth ${r.whoScrollWidth} > ${r.whoClientWidth})`);
    }
    if (withChancellor) {
      if (r.badges !== 1) problems.push(`${who}: expected the chancellor's badge, found ${r.badges}`);
      if (!r.text.includes(r.chancellor)) problems.push(`${who}: line reads "${r.text}"`);
    }
    if (!r.text.includes(r.president)) problems.push(`${who}: line reads "${r.text}"`);

    // The countdown: there, inside the column, in the form the case calls for.
    if (!r.cdBox) {
      problems.push(`${who}: no countdown on the officials line`);
      continue;
    }
    if (r.blockCountdownRows > 0) problems.push(`${who}: a separate countdown row is still drawn`);
    if (r.cdBox.right > r.columnRight + TOLERANCE) problems.push(`${who}: countdown runs past the column`);
    if (r.cdBox.height > 22) problems.push(`${who}: the countdown wraps (height ${r.cdBox.height})`);
    const own = r.cdClass.split(' ').includes('own');
    const short = r.cdTitle !== null;
    const tier = own ? 'own' : short ? 'short' : 'full';
    if (tier !== r.tier) problems.push(`${who}: countdown is ${tier} ("${r.cdText}"), expected ${r.tier}`);
    if (short && !/^Election · \w+ \d{4}$/.test(r.cdText)) problems.push(`${who}: short countdown reads "${r.cdText}"`);
    if (!short && !/^Election in \d+ months? · \w+ \d{4}$/.test(r.cdText)) problems.push(`${who}: countdown reads "${r.cdText}"`);
    if (own) {
      if (r.cdBox.top < r.whoBox.bottom - TOLERANCE) problems.push(`${who}: the countdown should sit below the names`);
    } else {
      // Beside the names, on their line, clear of them.
      if (r.cdBox.top > r.whoBox.top + 6) problems.push(`${who}: the countdown is not on the names' line`);
      if (r.cdBox.left < r.whoBox.right - TOLERANCE) problems.push(`${who}: the countdown overlaps the names`);
      if (r.cdBox.right < r.columnRight - 4) problems.push(`${who}: the countdown isn't at the line's right end`);
    }
  }
  return problems;
}

function officialsCheck(viewport) {
  return {
    name: `reichstag:officials-one-line:${viewport}`,
    viewport,
    state: 'hub-government',
    selectors: [],
    act: (page) => evaluate(page, READ_OFFICIALS(WITH_CHANCELLOR, { in_grand_coalition: 0, in_popular_front: 1 })),
    test(m) {
      const problems = officialsProblems(m.acted, { withChancellor: true });
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

// Opposition (the first hub): the label names Marx, so the line holds the
// president and the countdown.
function countdownCheck(viewport) {
  return {
    name: `reichstag:officials-countdown:${viewport}`,
    viewport,
    state: 'hub',
    selectors: ['.sc-officials', '.sc-ledhead'],
    act: (page) => evaluate(page, READ_OFFICIALS(PRESIDENT_ALONE, {})),
    test(m) {
      const problems = officialsProblems(m.acted, { withChancellor: false });
      if (m.elements['.sc-ledhead'].length > 0) problems.push('the ledger still draws a column-header row');
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

const checks = [];
for (const viewport of ['laptop', 'monitor']) {
  checks.push(openingCheck(viewport));
  checks.push(blackThursdayCheck(viewport));
}

for (const viewport of ['laptop', 'monitor']) {
  checks.push(officialsCheck(viewport));
  checks.push(countdownCheck(viewport));
}

export default checks;
