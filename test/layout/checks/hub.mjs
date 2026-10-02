'use strict';

import { close, lte } from '../lib/assert.mjs';
import { VIEWPORTS } from '../lib/viewports.mjs';

// Checks for the compact hub: at the small card size, the Decks and Hand rows
// fit above the fold on a laptop, and the whole
// hub (Advisors included) fits on a monitor, on both normal (3 hand slots)
// and easy (4) difficulty. 1px tolerance, matching grid.mjs and header.mjs.

// The Decks row must clear the fold and the Hand row must start above it.
// The rest of the Hand row (and Advisors) may run past it on a laptop.
const laptopDecksFitCheck = {
  name: 'hub:laptop:decks-fit',
  viewport: 'laptop',
  state: 'hub',
  selectors: ['ul.decks', 'ul.hand'],
  test(m) {
    const [decks] = m.elements['ul.decks'];
    const [hand] = m.elements['ul.hand'];
    if (!decks || !hand) return 'ul.decks or ul.hand not found';
    const fold = VIEWPORTS.laptop.height;
    const problems = [];
    if (!lte(decks.rect.bottom, fold)) {
      problems.push(`ul.decks bottom ${decks.rect.bottom}, expected <= ${fold}`);
    }
    if (!(hand.rect.top < fold)) {
      problems.push(`ul.hand top ${hand.rect.top}, expected < ${fold}`);
    }
    return problems.length === 0 ? true : problems.join('; ');
  },
};

// On a laptop the Hand row must end above the fold too, so Decks and Hand are
// both fully visible without scrolling, on normal (3 slots) and easy (4).
function laptopHandFitsCheck(name, state) {
  return {
    name,
    viewport: 'laptop',
    state,
    selectors: ['ul.hand'],
    test(m) {
      const [hand] = m.elements['ul.hand'];
      if (!hand) return 'ul.hand not found';
      const fold = VIEWPORTS.laptop.height;
      return lte(hand.rect.bottom, fold)
        ? true
        : `ul.hand bottom ${hand.rect.bottom}, expected <= ${fold}`;
    },
  };
}

// Easy difficulty has four hand slots. The decision column's content box is
// at most 459px wide, so a row of four shrinks its cards (no narrower than
// 92px) to keep them on one line: each of the hand and advisor rows holds
// four cards of equal width, side by side, inside the row's box.
function easyFourCardRowsCheck(viewport) {
  const rows = ['ul.hand', 'ul.pinned-cards'];
  return {
    name: `hub:${viewport}:hub-easy:four-cards-one-row`,
    viewport,
    state: 'hub-easy',
    selectors: ['#content', ...rows.flatMap((row) => [row, `${row} > li`, `${row} .card-caption`])],
    test(m) {
      const problems = [];
      for (const row of rows) {
        const [ul] = m.elements[row];
        const cards = m.elements[`${row} > li`];
        if (!ul) { problems.push(`${row} not found`); continue; }
        if (cards.length !== 4) { problems.push(`${row}: expected 4 cards, found ${cards.length}`); continue; }
        if (!cards.every((card) => close(card.rect.top, cards[0].rect.top))) {
          problems.push(`${row} cards are not on one line: tops ${cards.map((c) => c.rect.top).join(', ')}`);
        }
        if (!cards.every((card) => close(card.rect.width, cards[0].rect.width))) {
          problems.push(`${row} cards differ in width: ${cards.map((c) => c.rect.width).join(', ')}`);
        }
        if (cards[0].rect.width < 92 - 0.5) problems.push(`${row} cards are ${cards[0].rect.width}px, expected at least 92`);
        const first = cards[0].rect;
        const last = cards[3].rect;
        if (first.left < ul.rect.left - 0.5 || last.right > ul.rect.right + 0.5) {
          problems.push(`${row} cards run ${first.left} to ${last.right}, outside the column ${ul.rect.left} to ${ul.rect.right}`);
        }
        for (let i = 1; i < 4; i += 1) {
          if (cards[i].rect.left - cards[i - 1].rect.right < 8 - 0.5) {
            problems.push(`${row} gap ${i} is ${cards[i].rect.left - cards[i - 1].rect.right}px, expected at least 8`);
          }
        }
        // Captions stay clear of their neighbours.
        const caps = m.elements[`${row} .card-caption`];
        for (let i = 1; i < caps.length; i += 1) {
          if (close(caps[i].rect.top, caps[i - 1].rect.top) && caps[i].rect.left < caps[i - 1].rect.right - 0.5) {
            problems.push(`${row} captions ${i} and ${i + 1} overlap`);
          }
        }
      }
      if (m.scrollWidth > m.clientWidth) problems.push(`page scrolls sideways: ${m.scrollWidth} > ${m.clientWidth}`);
      // A card's hidden hover tip must not widen the column either.
      const [content] = m.elements['#content'];
      if (content && content.scrollWidth > content.clientWidth) {
        problems.push(`#content scrolls sideways: ${content.scrollWidth} > ${content.clientWidth}`);
      }
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

// Rows of one to three cards (normal difficulty) keep the full 116px cards
// and their 14.4px gaps.
function normalCardRowsCheck(viewport) {
  const rows = ['ul.decks', 'ul.hand', 'ul.pinned-cards'];
  return {
    name: `hub:${viewport}:hub:rows-keep-full-size`,
    viewport,
    state: 'hub',
    selectors: rows.map((row) => `${row} > li`),
    test(m) {
      const problems = [];
      for (const row of rows) {
        const cards = m.elements[`${row} > li`];
        if (cards.length === 0 || cards.length > 3) problems.push(`${row}: ${cards.length} cards`);
        for (const card of cards) {
          if (!close(card.rect.width, 116)) problems.push(`${row} card is ${card.rect.width}px wide, expected 116`);
        }
        for (let i = 1; i < cards.length; i += 1) {
          const gap = cards[i].rect.left - cards[i - 1].rect.right;
          if (!close(gap, 14.4)) problems.push(`${row} gap is ${gap}px, expected 14.4`);
        }
      }
      return problems.length === 0 ? true : [...new Set(problems)].join('; ');
    },
  };
}

// The whole hub, Advisors included, must fit above the monitor's fold, on
// normal and on easy difficulty. startOnly relaxes that to the row starting
// above the fold.
function monitorPinnedFitsCheck(name, state, startOnly = false) {
  return {
    name,
    viewport: 'monitor',
    state,
    selectors: ['ul.pinned-cards'],
    test(m) {
      const [pinned] = m.elements['ul.pinned-cards'];
      if (!pinned) return 'ul.pinned-cards not found';
      const fold = VIEWPORTS.monitor.height;
      if (startOnly) {
        return pinned.rect.top < fold
          ? true
          : `ul.pinned-cards top ${pinned.rect.top}, expected < ${fold}`;
      }
      return lte(pinned.rect.bottom, fold)
        ? true
        : `ul.pinned-cards bottom ${pinned.rect.bottom}, expected <= ${fold}`;
    },
  };
}

// Checked at both a laptop and a monitor width: the small card size applies
// at every tier, not just one breakpoint.
function cardSizeCheck(viewport) {
  return {
    name: `hub:${viewport}:card-size`,
    viewport,
    state: 'hub',
    selectors: ['a.card'],
    test(m) {
      const cards = m.elements['a.card'];
      if (cards.length === 0) return 'no a.card found';
      const problems = [];
      for (const card of cards) {
        if (!close(card.rect.width, 116) || !close(card.rect.height, 141)) {
          problems.push(`a.card measured ${card.rect.width}x${card.rect.height}, expected 116x141`);
        }
      }
      return problems.length === 0 ? true : [...new Set(problems)].join('; ');
    },
  };
}

export default [
  laptopDecksFitCheck,
  laptopHandFitsCheck('hub:laptop:hand-fits', 'hub'),
  laptopHandFitsCheck('hub:laptop:hub-easy:hand-fits', 'hub-easy'),
  easyFourCardRowsCheck('laptop'),
  easyFourCardRowsCheck('monitor'),
  normalCardRowsCheck('laptop'),
  normalCardRowsCheck('monitor'),
  monitorPinnedFitsCheck('hub:monitor:pinned-cards-fit', 'hub'),
  monitorPinnedFitsCheck('hub:monitor:hub-easy:pinned-cards-fit', 'hub-easy'),
  cardSizeCheck('laptop'),
  cardSizeCheck('monitor'),
];
