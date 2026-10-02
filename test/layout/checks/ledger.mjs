'use strict';

import { TOLERANCE, close, lte } from '../lib/assert.mjs';
import { evaluate } from '../lib/driver.mjs';
import { VIEWPORTS } from '../lib/viewports.mjs';

// Checks the Reichstag ledger and the government bar above it: seats sit
// right after the name, every party but the player's has a relations track,
// the player's row is tinted and carries the "Player" pill, stars mark only a
// sitting government, the government label reads "<position> · <cabinet>" on
// one line, and the chart centre leaves the majority to it. 1px tolerance, matching
// the other files.

const PLAYER = '.sc-ledger[data-sc-party="spd"]';
const OTHERS = '.sc-ledger:not([data-sc-party="spd"])';
// The seat column starts within this many px of the name column's right edge.
const NAME_TO_SEATS_MAX_GAP = 8;
// One line of the government label at 12px type, with room for rounding.
const LABEL_MAX_HEIGHT = 20;

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

// --sc-rel-* light values as computed rgb(): hostile, frigid, cold, cool,
// neutral, warm, friendly, very friendly.
const REL_PALETTE = [
  'rgb(47, 62, 86)', 'rgb(63, 101, 144)', 'rgb(93, 136, 179)', 'rgb(147, 179, 207)',
  'rgb(185, 178, 166)', 'rgb(227, 178, 90)', 'rgb(224, 138, 60)', 'rgb(201, 96, 42)',
];

const SELECTORS = [
  '#state-column',
  '.sc-ledger',
  PLAYER,
  OTHERS,
  `${PLAYER} .sc-you`,
  `${PLAYER} .rl.merged`,
  `${OTHERS} .rl:not(.merged)`,
  `${OTHERS} .rl .fill`,
  '.sc-ledger .nm',
  '.sc-ledger .st',
  '.sc-ledger .gv',
  '.sc-govlbl',
  '.sc-govlbl b',
  '.sc-govlbl > span',
  '.sc-majlbl',
];

function commonProblems(m) {
  const problems = [];
  const rows = m.elements['.sc-ledger'];
  if (rows.length === 0) return ['no ledger rows found'];

  // Seats directly after the name, right-aligned in one column.
  const names = m.elements['.sc-ledger .nm'];
  const seats = m.elements['.sc-ledger .st'];
  names.forEach((nm, i) => {
    const gap = seats[i].rect.left - nm.rect.right;
    if (gap < -TOLERANCE || gap > NAME_TO_SEATS_MAX_GAP) {
      problems.push(`seat cell starts ${gap}px after the name cell (want 0 to ${NAME_TO_SEATS_MAX_GAP})`);
    }
    if (!close(seats[i].rect.right, seats[0].rect.right)) {
      problems.push(`seat cell right edge ${seats[i].rect.right} != ${seats[0].rect.right}`);
    }
  });

  // Every party but the player's has a track, all the same width.
  const tracks = m.elements[`${OTHERS} .rl:not(.merged)`];
  const others = m.elements[OTHERS];
  if (tracks.length !== others.length) {
    problems.push(`${tracks.length} relations tracks for ${others.length} non-player rows`);
  }
  for (const t of tracks) {
    if (!close(t.rect.width, tracks[0].rect.width)) {
      problems.push(`track width ${t.rect.width} != ${tracks[0].rect.width}`);
    }
  }

  // Fills take a band colour from the cold-to-warm palette, never a party's.
  // Empty tracks (width 0) carry no fill colour. The harness runs in light
  // mode, so the light values apply.
  for (const f of m.elements[`${OTHERS} .rl .fill`]) {
    if (f.rect.width > 0 && !REL_PALETTE.includes(f.backgroundColor)) {
      problems.push(`relations fill ${f.backgroundColor} is not a band colour`);
    }
  }

  // The player's row: "Player" pill and a tint.
  const [player] = m.elements[PLAYER];
  if (!player) {
    problems.push('no SPD row found');
  } else {
    if (m.elements[`${PLAYER} .sc-you`].length !== 1) problems.push('SPD row lacks the "Player" pill');
    const [pill] = m.elements[`${PLAYER} .sc-you`];
    const [cell] = m.elements[`${PLAYER} .rl.merged`];
    if (pill) {
      if (pill.text !== 'Player') problems.push(`the pill reads "${pill.text}", want Player`);
      if (pill.rect.height > 16) problems.push(`the pill is ${pill.rect.height}px tall, want at most 16`);
      if (cell && (pill.rect.left < cell.rect.left - TOLERANCE || pill.rect.right > cell.rect.right + TOLERANCE)) {
        problems.push(`the pill spills out of its cell: ${pill.rect.left}-${pill.rect.right} in ${cell.rect.left}-${cell.rect.right}`);
      }
      if (pill.rect.right > player.rect.right + TOLERANCE) problems.push('the pill runs past the row');
    }
    // The pill doesn't make its row taller than the rest.
    for (const o of m.elements[OTHERS]) {
      if (!close(o.rect.height, player.rect.height)) {
        problems.push(`the player's row is ${player.rect.height}px tall, another is ${o.rect.height}`);
        break;
      }
    }
    if (player.backgroundColor === 'rgba(0, 0, 0, 0)' || player.backgroundColor === 'transparent') {
      problems.push('SPD row has no background tint');
    }
  }
  for (const o of others) {
    if (o.backgroundColor !== 'rgba(0, 0, 0, 0)' && o.backgroundColor !== 'transparent') {
      problems.push(`non-player row is tinted (${o.backgroundColor})`);
      break;
    }
  }

  // The government label stays on one line, its seat fraction whole.
  const [label] = m.elements['.sc-govlbl'];
  const [cabinetText] = m.elements['.sc-govlbl b'];
  const [fraction] = m.elements['.sc-govlbl > span'];
  if (!label || !cabinetText || !fraction) {
    problems.push('government label parts not found');
  } else {
    if (label.rect.height > LABEL_MAX_HEIGHT) problems.push(`government label wraps: height ${label.rect.height}`);
    if (cabinetText.rect.right > fraction.rect.left + TOLERANCE) {
      problems.push('government label overlaps the seat fraction');
    }
  }

  // The majority is the seat fraction's second figure, not a line in the
  // chart centre.
  const [majority] = m.elements['.sc-majlbl'];
  if (majority) problems.push(`the chart centre has a majority line: "${majority.text}"`);
  if (fraction && !/^\d+ \/ \d+/.test(fraction.text)) problems.push(`seat fraction reads "${fraction.text}"`);

  noOverflow(m, problems);
  return problems;
}

function openingCheck(viewport) {
  return {
    name: `ledger:opposition:${viewport}`,
    viewport,
    state: 'hub',
    selectors: SELECTORS,
    test(m) {
      const problems = commonProblems(m);
      const stars = m.elements['.sc-ledger .gv'].filter((g) => g.text !== '');
      if (stars.length > 0) problems.push(`${stars.length} stars in opposition, want none`);
      const [cabinetText] = m.elements['.sc-govlbl b'];
      if (cabinetText && cabinetText.text.replace(/\s+/g, ' ') !== 'Opposition · Marx cabinet') {
        problems.push(`government label reads "${cabinetText.text}"`);
      }
      return problems.length === 0 ? true : [...new Set(problems)].join('; ');
    },
  };
}

function governmentCheck(viewport) {
  return {
    name: `ledger:government:${viewport}`,
    viewport,
    state: 'hub-government',
    selectors: SELECTORS,
    test(m) {
      const problems = commonProblems(m);
      // The Grand Coalition is SPD, DDP, Z, BVP, and DVP.
      const starred = m.elements['.sc-ledger .gv'].filter((g) => g.text === '★').length;
      if (starred !== 5) problems.push(`${starred} stars for the Grand Coalition, want 5`);
      const [cabinetText] = m.elements['.sc-govlbl b'];
      if (cabinetText && cabinetText.text.replace(/\s+/g, ' ') !== 'Government · Grand Coalition') {
        problems.push(`government label reads "${cabinetText.text}"`);
      }
      return problems.length === 0 ? true : [...new Set(problems)].join('; ');
    },
  };
}

// The centre label stays whole inside the drawing at the browser zooms a
// player might use. A zoom of z is a CSS viewport 1/z as wide with a device
// scale factor of z, which is what the browser does. Every line's box (its
// SVG bounding box, in drawing units) must end at least 2 units above the
// viewBox's bottom edge, and the rendered text must end above the SVG's own
// bottom edge by the same margin.
const CLEARANCE_UNITS = 2;
const ZOOMS = [1, 0.9, 0.8];

async function readLabelAtZoom(page, viewport, zoom) {
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: Math.round(viewport.width / zoom),
    height: Math.round(viewport.height / zoom),
    deviceScaleFactor: zoom,
    mobile: false,
  });
  return evaluate(page, `(() => {
    const svg = document.querySelector('#state-column .sc-hemi');
    if (!svg) return null;
    const box = svg.viewBox.baseVal;
    const svgRect = svg.getBoundingClientRect();
    return {
      viewBoxHeight: box.height,
      unitPx: svgRect.width / box.width,
      svgBottom: svgRect.bottom,
      lines: Array.from(svg.querySelectorAll('text')).map((t) => {
        const b = t.getBBox();
        return { text: t.textContent, bottom: b.y + b.height, renderedBottom: t.getBoundingClientRect().bottom };
      }),
    };
  })()`);
}

function labelZoomCheck(viewportName, viewport, zoom) {
  return {
    name: `ledger:centre-label-inside:${viewportName}:${Math.round(zoom * 100)}%`,
    viewport: viewportName,
    state: 'hub-month',
    selectors: [],
    act: (page) => readLabelAtZoom(page, viewport, zoom),
    test(m) {
      const r = m.acted;
      if (!r) return 'no hemicycle drawn';
      const problems = [];
      if (r.lines.length !== 2) problems.push(`${r.lines.length} centre lines, want 2`);
      for (const line of r.lines) {
        const clear = r.viewBoxHeight - line.bottom;
        if (clear < CLEARANCE_UNITS) problems.push(`"${line.text}" ends ${clear.toFixed(2)} units above the drawing's bottom edge, want ${CLEARANCE_UNITS}`);
        const clearPx = r.svgBottom - line.renderedBottom;
        if (clearPx < CLEARANCE_UNITS * r.unitPx - TOLERANCE) problems.push(`"${line.text}" is drawn ${clearPx.toFixed(2)}px above the SVG's bottom edge`);
      }
      const last = r.lines[r.lines.length - 1];
      if (last && !/^\d+$/.test(last.text)) problems.push(`last centre line reads "${last.text}"`);
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

// A click on a party's name opens its entry, and the ledger and chart follow:
// the row takes aria-current and the open-entry look, that party's dots light
// and the others dim, the centre reads its name and seats. Back
// clears all three. Runs in the page on a later month's hub (Polls resting).
const PARTY_FOCUS_ACT = (id) => `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const snap = () => {
    const svg = document.querySelector('#state-column .sc-hemi');
    const row = document.querySelector('#state-column .sc-ledger[data-sc-party="${id}"]');
    const style = getComputedStyle(row);
    const box = row.getBoundingClientRect();
    const bar = getComputedStyle(row, '::before');
    return {
      marked: Array.from(document.querySelectorAll('#state-column .sc-ledger[aria-current="true"]')).map((r) => r.getAttribute('data-sc-party')),
      rowHeight: box.height,
      rowBackgroundColor: style.backgroundColor,
      rowBackgroundImage: style.backgroundImage,
      barWidth: bar.content === 'none' ? null : bar.width,
      barColor: bar.backgroundColor,
      lit: Array.from(svg.querySelectorAll('.sc-party-seats.lit')).map((g) => g.getAttribute('data-sc-seats')),
      dim: svg.querySelectorAll('.sc-party-seats.dim').length,
      seatGroups: svg.querySelectorAll('.sc-party-seats').length,
      litSeats: svg.querySelectorAll('.sc-party-seats.lit circle').length,
      label: Array.from(svg.querySelectorAll('text')).map((t) => t.textContent),
      view: document.querySelector('#depth_column').getAttribute('data-view'),
      entryBody: (document.querySelector('#depth_column .dc-body') || {}).textContent || '',
    };
  };
  const out = { before: snap() };
  document.querySelector('#state-column .sc-ledger[data-sc-party="${id}"] .nm').click();
  await wait(700);
  out.open = snap();
  document.querySelector('#depth-bar [data-dc-back]').click();
  await wait(500);
  out.back = snap();
  return out;
})()`;

function partyFocusCheck(viewport, id, label, seats) {
  return {
    name: `ledger:party-click-focus:${id}:${viewport}`,
    viewport,
    state: 'hub-month',
    selectors: [],
    act: (page) => evaluate(page, PARTY_FOCUS_ACT(id)),
    test(m) {
      const { before, open, back } = m.acted;
      const problems = [];
      if (open.view !== 'entry' || !open.entryBody) problems.push(`the click showed view "${open.view}", not the ${label} entry`);
      if (open.marked.join() !== id) problems.push(`rows marked while open: [${open.marked}], want [${id}]`);
      if (open.lit.join() !== id) problems.push(`lit groups while open: [${open.lit}], want [${id}]`);
      if (open.dim !== open.seatGroups - 1) problems.push(`${open.dim} dimmed groups of ${open.seatGroups}, want all but one`);
      if (open.litSeats !== seats) problems.push(`${open.litSeats} dots lit, want ${seats}`);
      if (open.label[0].toLowerCase() !== label.toLowerCase()) problems.push(`centre label reads "${open.label[0]}", want ${label}`);
      if (open.label[1] !== String(seats)) problems.push(`centre number reads "${open.label[1]}", want ${seats}`);
      if (open.label.length !== 2) problems.push(`centre has ${open.label.length} lines, want 2: [${open.label}]`);
      // The open-entry look: the Defense list's 2px red bar and a track wash, layered over any row colour.
      if (open.barWidth !== '2px' || open.barColor !== 'rgb(227, 0, 15)') problems.push(`row bar is ${open.barWidth} ${open.barColor}, want 2px red`);
      if (open.rowBackgroundImage === 'none') problems.push('the marked row has no wash over its background');
      if (open.rowBackgroundColor !== before.rowBackgroundColor) problems.push(`the row's own colour changed from ${before.rowBackgroundColor} to ${open.rowBackgroundColor}`);
      if (Math.abs(open.rowHeight - before.rowHeight) > TOLERANCE) problems.push(`row height ${before.rowHeight} became ${open.rowHeight}`);
      if (back.marked.length !== 0) problems.push(`rows still marked after Back: [${back.marked}]`);
      if (back.lit.length !== 0 || back.dim !== 0) problems.push('the chart is still highlighted after Back');
      if (back.label[0] !== 'seats') problems.push(`centre label reads "${back.label[0]}" after Back, want seats`);
      if (before.marked.length !== 0 || before.lit.length !== 0) problems.push('something was marked before the click');
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

const checks = [];
for (const viewport of ['laptop', 'monitor']) {
  checks.push(openingCheck(viewport));
  checks.push(governmentCheck(viewport));
}

// January 1928: DDP 30 seats, the SPD 128 (under its player wash).
for (const viewport of ['laptop', 'monitor']) {
  checks.push(partyFocusCheck(viewport, 'ddp', 'DDP', 30));
  checks.push(partyFocusCheck(viewport, 'spd', 'SPD', 128));
}

for (const viewportName of ['laptop', 'monitor']) {
  for (const zoom of ZOOMS) checks.push(labelZoomCheck(viewportName, VIEWPORTS[viewportName], zoom));
}

export default checks;
