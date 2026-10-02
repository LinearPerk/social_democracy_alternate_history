'use strict';

import { TOLERANCE, close, gte, lte } from '../lib/assert.mjs';
import { evaluate } from '../lib/driver.mjs';

// Checks for the Defense tab as a list and its entries in the depth column:
// the rows are two-line buttons that fit (the sidebar fit is state-fit's): the
// symbol, name, status and chevron on the first line, the size bar under the
// name on the second. The Details (text view) button is gone, each bar has an
// equal track, a fill scaled by the square root of strength and a readable
// number (inside the fill of the largest, after the fill of the small ones),
// a row opens its entry in the depth column with Back, and Back restores the
// view. No overflow anywhere. The row height is the rhythm's --sc-row-2.

const READ_ROW_HEIGHT = `parseFloat(getComputedStyle(document.body).getPropertyValue('--sc-row-2'))`;

// The Details (text view) button is gone. (The tab's height is held by the
// state-fit checks against the sidebar's cap; Party and Defense no longer
// need to match each other.)
const detailsCheck = {
  name: 'defense-list:no-details-button:laptop',
  viewport: 'laptop',
  state: 'hub-defense',
  selectors: ['.sc-details', '.sc-tab.on'],
  test(m) {
    const problems = [];
    if (!m.elements['.sc-tab.on'][0].text.startsWith('Defense')) problems.push('Defense tab is not open');
    if (m.elements['.sc-details'].length > 0) problems.push('the Details (text view) button is still there');
    return problems.length === 0 ? true : problems.join('; ');
  },
};

function rowsCheck(viewport) {
  return {
    name: `defense-list:rows:${viewport}`,
    viewport,
    state: 'hub-defense',
    act: (page) => evaluate(page, READ_ROW_HEIGHT),
    selectors: [
      '#state-column',
      '#state-column .sc-body',
      '.sc-drow',
      '.sc-drow .nm',
      '.sc-drow .st',
      '.sc-drow .chev',
      '.sc-drow .ico',
      '.sc-drow .sc-fsym img',
      '.sc-drow .sz',
      '.sc-drow .sz-f',
      '.sc-drow .sz-n',
      '.sc-body .sc-sub',
      '.sc-details',
      '[data-sc-details]',
    ],
    test(m) {
      const [column] = m.elements['#state-column'];
      const rows = m.elements['.sc-drow'];
      if (!column) return '#state-column not found';
      const problems = [];
      const rowHeight = m.acted;
      if (!(rowHeight >= 26)) problems.push(`the rhythm's Defense row height is ${rowHeight}, want at least 26 (two lines)`);
      if (rows.length !== 6) problems.push(`${rows.length} rows, want 6 (SPD not in government yet)`);
      for (const r of rows) {
        if (r.tagName !== 'button') problems.push(`row "${r.text}" is a ${r.tagName}, not a button`);
        if (!close(r.rect.height, rowHeight)) problems.push(`row "${r.text}" is ${r.rect.height}px tall, want ${rowHeight}`);
        if (!gte(r.rect.left, column.rect.left) || !lte(r.rect.right, column.rect.right)) {
          problems.push(`row "${r.text}" spills out of the state column`);
        }
      }
      for (const n of m.elements['.sc-drow .nm']) {
        if (n.scrollWidth > n.clientWidth + TOLERANCE) problems.push(`name "${n.text}" is cut off`);
      }
      for (const s of m.elements['.sc-drow .st']) {
        if (!/^[a-z-]+( [a-z]+)?/.test(s.text)) problems.push(`status "${s.text}" is not a lowercase band word`);
      }
      for (const s of m.elements['.sc-drow .st']) {
        if (s.scrollWidth > s.clientWidth + TOLERANCE) problems.push(`status "${s.text}" is cut off`);
      }
      const tracks = m.elements['.sc-drow .sz'];
      const fills = m.elements['.sc-drow .sz-f'];
      const labels = m.elements['.sc-drow .sz-n'];
      if (tracks.length !== 6 || fills.length !== 6 || labels.length !== 6) {
        problems.push(`${tracks.length} size bars, ${fills.length} fills, ${labels.length} numbers, want 6 each`);
      } else {
        const width = tracks[0].rect.width;
        if (width < 180) problems.push(`size track is ${width}px wide, want at least 180`);
        const names = m.elements['.sc-drow .nm'];
        const chevrons = m.elements['.sc-drow .chev'];
        const statuses = m.elements['.sc-drow .st'];
        const icons = m.elements['.sc-drow .ico'];
        tracks.forEach((t, i) => {
          // Two lines: the bar is under the name, from its left edge to the chevron's right.
          if (!close(t.rect.left, names[i].rect.left)) problems.push(`track ${i} starts at ${t.rect.left}, the name at ${names[i].rect.left}`);
          if (!gte(t.rect.top, names[i].rect.bottom)) problems.push(`track ${i} is not under its name`);
          if (!gte(t.rect.top, statuses[i].rect.bottom) || !gte(t.rect.top, chevrons[i].rect.bottom)) problems.push(`track ${i} is not under its status word and chevron`);
          if (!close(t.rect.right, chevrons[i].rect.right)) problems.push(`track ${i} ends at ${t.rect.right}, the chevron at ${chevrons[i].rect.right}`);
          if (Math.abs((names[i].rect.top + names[i].rect.bottom) - (statuses[i].rect.top + statuses[i].rect.bottom)) > 2 * TOLERANCE) problems.push(`row ${i}: name and status word are not on one line`);
          if (icons[i].rect.height < t.rect.bottom - names[i].rect.top - TOLERANCE) problems.push(`symbol cell ${i} does not span both lines`);
          if (!close(t.rect.width, width)) problems.push(`track ${i} is ${t.rect.width}px, not ${width}: the bars would not compare`);
          if (fills[i].rect.width < 2) problems.push(`fill ${i} is ${fills[i].rect.width}px, not visible`);
          if (fills[i].rect.width > t.rect.width + TOLERANCE) problems.push(`fill ${i} runs past its track`);
          const n = labels[i];
          if (!/^\d+(\.\d)?[km]/.test(n.text)) problems.push(`number "${n.text}" is not a member count`);
          if (!gte(n.rect.left, t.rect.left) || !lte(n.rect.right, t.rect.right)) {
            problems.push(`number "${n.text}" spills out of its track`);
          }
          // A bar of half the track or more holds its number; a shorter one
          // has the number after it.
          const f = fills[i].rect;
          if (f.width >= t.rect.width / 2 - TOLERANCE) {
            if (!gte(n.rect.left, f.left) || !lte(n.rect.right, f.right)) problems.push(`number "${n.text}" is not inside its long fill`);
          } else if (!gte(n.rect.left, f.right)) {
            problems.push(`number "${n.text}" overlaps its short fill`);
          }
        });
        // January 1928: Reichsbanner 2,000 fills the track; the SA at 80
        // (the fourth row) is sqrt(80/2000), a fifth, and still visible.
        if (fills[0].rect.width < width - TOLERANCE) problems.push('the Reichsbanner bar does not fill its track');
        const sa = fills[3].rect.width / width;
        if (sa < 0.15 || sa > 0.25) problems.push(`SA bar is ${Math.round(sa * 100)}% of the track, want about 20%`);
        if (!(fills[3].rect.width < fills[1].rect.width && fills[1].rect.width < fills[2].rect.width)) {
          problems.push('bar lengths do not keep the order of strength (SA < RFB < Stahlhelm)');
        }
      }
      for (const img of m.elements['.sc-drow .sc-fsym img']) {
        if (!close(img.rect.height, 20)) problems.push(`symbol height ${img.rect.height} != 20`);
      }
      const heads = m.elements['.sc-body .sc-sub'].map((h) => h.text);
      if (heads.join('|') !== 'Paramilitaries|State forces') problems.push(`group headings "${heads.join('|')}"`);
      if (m.elements['.sc-details'].length + m.elements['[data-sc-details]'].length > 0) {
        problems.push('the Details (text view) button is still there');
      }
      if (m.scrollWidth > m.clientWidth) problems.push(`horizontal overflow: ${m.scrollWidth} > ${m.clientWidth}`);
      return problems.length === 0 ? true : [...new Set(problems)].join('; ');
    },
  };
}

function entryCheck(viewport) {
  return {
    name: `defense-list:sa-entry:${viewport}`,
    viewport,
    state: 'hub-defense-entry',
    selectors: [
      '#depth_column',
      '#depth_column .dc-entry',
      '#depth-bar [data-dc-back]',
      '#depth-bar .dc-strip [aria-current]',
      '#depth-bar .dc-strip [data-dc-pick]',
      '#depth_column .dc-ename',
      '#depth_column .dc-ede',
      '#depth_column .dc-esym img',
      '#depth_column .dc-stack',
      '#depth_column .dc-steps i.on',
      '#depth_column .dc-library',
      '#depth_column .dc-times-links a',
      '#depth_column .dc-entry *',
      '.sc-drow[aria-current="true"]',
      '.sc-drow[data-depth-entry="defense:sa"]',
    ],
    test(m) {
      const [depth] = m.elements['#depth_column'];
      const [name] = m.elements['#depth_column .dc-ename'];
      const [german] = m.elements['#depth_column .dc-ede'];
      const [symbol] = m.elements['#depth_column .dc-esym img'];
      const [library] = m.elements['#depth_column .dc-library'];
      if (!depth) return '#depth_column not found';
      const problems = [];
      if (m.elements['#depth_column .dc-entry'].length !== 1) problems.push('the SA entry is not in the depth column');
      const [back] = m.elements['#depth-bar [data-dc-back]'];
      if (!back || back.disabled) problems.push('no enabled Back button');
      if (m.elements['#depth-bar .dc-strip [aria-current]'].length !== 0) problems.push('a view is still marked current under the entry');
      if (m.elements['#depth-bar .dc-strip [data-dc-pick]'].length < 1) problems.push('the Polls strip is not reachable');
      if (!name || name.text !== 'SA') problems.push(`heading "${name ? name.text : ''}", want SA`);
      if (!german || german.text !== 'Sturmabteilung') problems.push('German full name missing');
      if (!symbol || !close(symbol.rect.height, 48)) problems.push(`symbol height ${symbol ? symbol.rect.height : 'none'}, want 48`);
      if (m.elements['#depth_column .dc-stack'].length !== 1) problems.push('balance-of-the-street strip missing');
      if (m.elements['#depth_column .dc-steps i.on'].length < 1) problems.push('no militancy step lit');
      if (!library || !/Nazi paramilitary/i.test(library.text)) problems.push("the game's Library text for the SA is missing");
      const links = m.elements['#depth_column .dc-times-links a'];
      if (links.length !== 2) problems.push(`${links.length} Wikipedia links, want 2`);
      const marked = m.elements['.sc-drow[aria-current="true"]'];
      if (marked.length !== 1 || !marked[0].text.startsWith('SA')) problems.push('the SA row is not the one marked aria-current');
      for (const el of m.elements['#depth_column .dc-entry *']) {
        if (!gte(el.rect.left, depth.rect.left) || !lte(el.rect.right, depth.rect.right)) {
          problems.push(`"${el.text.slice(0, 30)}" spills out of the depth column`);
          break;
        }
      }
      if (m.scrollWidth > m.clientWidth) problems.push(`horizontal overflow: ${m.scrollWidth} > ${m.clientWidth}`);
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

const backCheck = {
  name: 'defense-list:back-restores-view:laptop',
  viewport: 'laptop',
  state: 'hub-defense-entry-back',
  selectors: [
    '#depth_column',
    '#depth_column .dc-entry',
    '#depth-bar [data-dc-back]',
    '#depth-bar .dc-strip [aria-current]',
    '#depth_column .dc-polls',
    '.sc-drow[aria-current="true"]',
  ],
  test(m) {
    const problems = [];
    if (m.elements['#depth_column .dc-entry'].length !== 0) problems.push('the entry is still open after Back');
    const [back] = m.elements['#depth-bar [data-dc-back]'];
    if (!back || !back.disabled) problems.push('Back is still enabled at the resting view');
    const [active] = m.elements['#depth-bar .dc-strip [aria-current]'];
    if (!active || active.text !== 'Polls') problems.push('Polls is not the view after Back');
    if (m.elements['#depth_column .dc-polls'].length !== 1) problems.push('the Polls body is not back');
    if (m.elements['.sc-drow[aria-current="true"]'].length !== 0) problems.push('a row is still marked aria-current');
    return problems.length === 0 ? true : problems.join('; ');
  },
};

function stateForceCheck(state, symbols) {
  return {
    name: `defense-list:reichswehr-entry:laptop:${symbols}`,
    viewport: 'laptop',
    state,
    selectors: [
      '#depth_column .dc-entry',
      '#depth_column .dc-ename',
      '#depth_column .dc-axis',
      '#depth_column .dc-loyal',
      '#depth_column .dc-loyal .mark',
      '#depth_column .dc-stack',
      '#depth_column .dc-library',
      '#depth_column .dc-esym img',
      '#depth_column .dc-esym',
    ],
    test(m) {
      const problems = [];
      const [name] = m.elements['#depth_column .dc-ename'];
      if (!name || name.text !== 'Reichswehr') problems.push('Reichswehr entry not shown');
      if (m.elements['#depth_column .dc-axis'].length !== 1) problems.push('loyalty axis missing');
      if (m.elements['#depth_column .dc-loyal .mark'].length !== 1) problems.push('loyalty marker missing');
      if (m.elements['#depth_column .dc-stack'].length !== 0) problems.push('a street strip on a state force');
      const [library] = m.elements['#depth_column .dc-library'];
      if (!library || !/military/i.test(library.text)) problems.push("the game's Library text for the Reichswehr is missing");
      const imgs = m.elements['#depth_column .dc-esym img'];
      if (symbols === 'period' && imgs.length !== 1) problems.push('no period symbol');
      if (symbols === 'badges' && imgs.length !== 0) problems.push('a symbol image in badges mode');
      if (m.scrollWidth > m.clientWidth) problems.push(`horizontal overflow: ${m.scrollWidth} > ${m.clientWidth}`);
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

export default [
  detailsCheck,
  rowsCheck('laptop'),
  rowsCheck('monitor'),
  entryCheck('laptop'),
  entryCheck('monitor'),
  backCheck,
  stateForceCheck('hub-defense-reichswehr', 'period'),
  stateForceCheck('hub-defense-reichswehr-badges', 'badges'),
];
