'use strict';

import { TOLERANCE, close } from '../lib/assert.mjs';
import { evaluate } from '../lib/driver.mjs';

// Checks for the hub's treatment (decision-column.js and .css): headings,
// centred rows, the always-visible Government Affairs deck, the empty hand
// slot, and the advisors' faction bars. Measured at a laptop and a monitor.

const VIEWPORTS = ['laptop', 'monitor'];
// Rows may sit off-centre by up to 4px (a bit more than the 1px tolerance
// the other files use, since a centred row's odd leftover pixel can fall on
// either side).
const CENTRE_TOLERANCE = 4;

// The colours the factions graphic uses, as computed rgb().
const COLOURS = {
  left: 'rgb(122, 16, 16)',
  center: 'rgb(179, 38, 30)',
  labor: 'rgb(217, 84, 43)',
  reformist: 'rgb(232, 137, 122)',
  neorev: 'rgb(109, 58, 140)',
  nonfactional: 'rgb(138, 138, 138)',
};

function noOverflow(m) {
  return m.scrollWidth > m.clientWidth + TOLERANCE
    ? `page scrolls horizontally: scrollWidth ${m.scrollWidth} > clientWidth ${m.clientWidth}`
    : null;
}

// The page's date is the date line's; the hub must not print it again as a
// heading (or a bare year, as the first page did).
function dateHeadingCheck(viewport) {
  return {
    name: `decision:${viewport}:no-date-heading`,
    viewport,
    state: 'hub',
    selectors: ['#content h1', '#date-line'],
    test(m) {
      const [dateLine] = m.elements['#date-line'];
      if (!dateLine) return '#date-line not found';
      const repeats = m.elements['#content h1'].filter(
        (h) => h.text.toLowerCase() === dateLine.text.toLowerCase() || /^\d{4}$/.test(h.text)
      );
      return repeats.length === 0 ? true : `#content h1 repeats the date: "${repeats[0].text}"`;
    },
  };
}

function headingsCheck(viewport, state, handText) {
  return {
    name: `decision:${viewport}:${state}:headings`,
    viewport,
    state,
    selectors: [
      '.dc-label',
      'p.deck-description',
      'p.hand-description',
      'p.pinned-text-description',
      '.dc-chip',
    ],
    test(m) {
      const labels = m.elements['.dc-label'].map((l) => l.text);
      const expected = ['Decks', handText, 'Advisors'];
      const problems = [];
      if (labels.join('|') !== expected.join('|')) {
        problems.push(`headings are [${labels.join(', ')}], expected [${expected.join(', ')}]`);
      }
      for (const selector of ['p.deck-description', 'p.hand-description', 'p.pinned-text-description']) {
        const [p] = m.elements[selector];
        if (!p) {
          problems.push(`${selector} not found`);
        } else if (!p.title) {
          problems.push(`${selector} has no title (the how-to hint)`);
        } else if (/^(Decks|Hand|Advisors) -/.test(p.text)) {
          problems.push(`${selector} still reads as the engine's sentence: "${p.text}"`);
        }
      }
      const chips = m.elements['.dc-chip'].map((c) => c.text);
      if (chips.length !== 1 || !/^(Action ready|Next action in \d+ months?)$/.test(chips[0])) {
        problems.push(`expected one Advisors status chip, found [${chips.join(', ')}]`);
      }
      const overflow = noOverflow(m);
      if (overflow) problems.push(overflow);
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

// Each row's cards, first to last, sit centred in the row's box. The first
// and last li stand in for the row's content extent. A row is one line unless
// wrapRows allows more. Easy difficulty's four cards share one line (their
// size shrinks to fit), so every row here is one line.
function centredRowsCheck(viewport, state = 'hub', rows = ['ul.decks', 'ul.hand', 'ul.pinned-cards'], wrapRows = 1) {
  const selectors = rows.flatMap((row) => [row, `${row} > li`]);
  return {
    name: `decision:${viewport}:${state}:rows-centred`,
    viewport,
    state,
    selectors,
    test(m) {
      const problems = [];
      for (const row of rows) {
        const [ul] = m.elements[row];
        const items = m.elements[`${row} > li`];
        if (!ul || items.length === 0) {
          problems.push(`${row} or its cards not found`);
          continue;
        }
        const lines = [];
        for (const li of items) {
          const line = lines.find((l) => close(l[0].rect.top, li.rect.top));
          if (line) line.push(li);
          else lines.push([li]);
        }
        if (lines.length > wrapRows) {
          problems.push(`${row} wraps onto ${lines.length} lines, expected at most ${wrapRows}`);
          continue;
        }
        for (const line of lines) {
          const left = line[0].rect.left - ul.rect.left;
          const right = ul.rect.right - line[line.length - 1].rect.right;
          if (Math.abs(left - right) > CENTRE_TOLERANCE) {
            problems.push(`${row} off-centre: ${left.toFixed(1)}px left, ${right.toFixed(1)}px right`);
          }
        }
      }
      const overflow = noOverflow(m);
      if (overflow) problems.push(overflow);
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

// A caption sits centred under its card (the li is text-align: center, so
// this catches a card or caption pushed off by margins or floats).
function captionsCentredCheck(viewport) {
  return {
    name: `decision:${viewport}:captions-centred`,
    viewport,
    state: 'hub',
    selectors: ['ul.decks a.card', 'ul.decks .dc-ghost', 'ul.pinned-cards a.card', 'ul.decks .card-caption', 'ul.pinned-cards .card-caption'],
    test(m) {
      const cards = [...m.elements['ul.decks a.card'], ...m.elements['ul.decks .dc-ghost'], ...m.elements['ul.pinned-cards a.card']];
      const captions = [...m.elements['ul.decks .card-caption'], ...m.elements['ul.pinned-cards .card-caption']];
      if (cards.length === 0 || cards.length !== captions.length) {
        return `${cards.length} cards but ${captions.length} captions`;
      }
      // Cards and captions come in different lists (link cards, then the
      // stand-in), so compare by nearest caption left edge instead of index.
      const problems = [];
      for (const card of cards) {
        const centre = card.rect.left + card.rect.width / 2;
        const caption = captions.find((c) => Math.abs(c.rect.left + c.rect.width / 2 - centre) <= CENTRE_TOLERANCE);
        if (!caption) problems.push(`no caption centred under the card at x=${centre.toFixed(0)}`);
      }
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

function govtDeckCheck(viewport) {
  return {
    name: `decision:${viewport}:govt-deck-visible-at-start`,
    viewport,
    state: 'hub',
    selectors: ['ul.decks > li', 'ul.decks a[card-id="main.govt"]', 'ul.decks a.card'],
    test(m) {
      const items = m.elements['ul.decks > li'];
      const govt = items.find((li) => li.text.includes('Government Affairs'));
      if (!govt) return 'no Government Affairs deck in ul.decks';
      const problems = [];
      if (govt.ariaDisabled !== 'true') problems.push('Government Affairs is not aria-disabled');
      if (!govt.text.includes('Not in government')) problems.push(`no "Not in government" note: "${govt.text}"`);
      // The stand-in must not be an engine choice: the engine's click handler
      // is bound to 'ul.decks li a', and a link would carry a card-id.
      if (m.elements['ul.decks a[card-id="main.govt"]'].length > 0) problems.push('the stand-in is a card link');
      if (m.elements['ul.decks a.card'].length !== 1) {
        problems.push(`expected only the Party Affairs link in ul.decks, found ${m.elements['ul.decks a.card'].length}`);
      }
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

// The engine's own unavailable deck (present, nothing to draw) gets the same
// treatment, with the note following spd_in_government.
function govtUnavailableCheck(viewport, state, note) {
  return {
    name: `decision:${viewport}:${state}:govt-deck-unavailable`,
    viewport,
    state,
    selectors: ['ul.decks > li', 'ul.decks li.unavailable-card a.card', 'ul.decks .dc-placeholder'],
    test(m) {
      const govt = m.elements['ul.decks > li'].filter((li) => li.text.includes('Government Affairs'));
      if (govt.length !== 1) return `expected one Government Affairs deck, found ${govt.length}`;
      const problems = [];
      if (govt[0].ariaDisabled !== 'true') problems.push('not aria-disabled');
      if (!govt[0].text.includes(note)) problems.push(`no "${note}" note: "${govt[0].text}"`);
      const [link] = m.elements['ul.decks li.unavailable-card a.card'];
      if (!link) problems.push('the engine deck link is gone');
      else if (link.ariaDisabled !== 'true' || link.tabindex !== '-1') problems.push('the link is still reachable by keyboard');
      if (m.elements['ul.decks .dc-placeholder'].length > 0) problems.push('a stand-in was added beside the real deck');
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

function emptySlotCheck(viewport) {
  return {
    name: `decision:${viewport}:empty-hand-slot`,
    viewport,
    state: 'hub',
    selectors: ['ul.hand div.blank-card'],
    test(m) {
      const slots = m.elements['ul.hand div.blank-card'];
      if (slots.length === 0) return 'no empty hand slots';
      const bad = slots.filter((s) => s.borderStyle !== 'dashed' || s.text !== 'Draw from a deck');
      return bad.length === 0
        ? true
        : `${bad.length} slot(s) not a dashed outline reading "Draw from a deck" (border ${bad[0].borderStyle}, text "${bad[0].text}")`;
    },
  };
}

// The four-card rule narrows only card rows. A choice list of exactly four
// keeps full-width rows. The title page shows three without a save, so the
// check copies the last to make four.
function fourChoicesFullWidthCheck(viewport) {
  return {
    name: `decision:${viewport}:title:four-choices-full-width`,
    viewport,
    state: 'title',
    act: (page) => evaluate(page, `(() => {
      const list = document.querySelector('#content ul.choices');
      list.append(list.lastElementChild.cloneNode(true));
      return true;
    })()`),
    selectors: ['#content ul.choices', '#content ul.choices > li'],
    test(m) {
      const [list] = m.elements['#content ul.choices'];
      const rows = m.elements['#content ul.choices > li'];
      if (!list || rows.length !== 4) return `expected one list of 4 choices, found ${rows.length}`;
      // The list's 2px border sits outside its rows.
      const narrow = rows.filter((r) => r.rect.width < list.rect.width - 4 - TOLERANCE);
      return narrow.length === 0
        ? true
        : `${narrow.length} row(s) narrower than the list: ${narrow[0].rect.width.toFixed(0)}px of ${list.rect.width.toFixed(0)}px`;
    },
  };
}

// The three advisors the game starts with are all centrists.
function startAdvisorsCheck(viewport) {
  return {
    name: `decision:${viewport}:advisor-faction-bars`,
    viewport,
    state: 'hub',
    selectors: ['ul.pinned-cards a.card', '.dc-bar', '.dc-faction'],
    test(m) {
      const cards = m.elements['ul.pinned-cards a.card'];
      const bars = m.elements['.dc-bar'];
      const labels = m.elements['.dc-faction'];
      const names = ['Hermann Müller', 'Rudolf Hilferding', 'Otto Wels'];
      if (cards.length !== names.length || bars.length !== names.length || labels.length !== names.length) {
        return `expected 3 advisors with bars and labels, found ${cards.length} cards, ${bars.length} bars, ${labels.length} labels`;
      }
      const problems = [];
      bars.forEach((bar, i) => {
        if (bar.backgroundColor !== COLOURS.center) {
          problems.push(`bar ${i} is ${bar.backgroundColor}, expected ${COLOURS.center}`);
        }
        // Along the bottom edge of the portrait, inside the card's frame.
        const card = cards[i];
        const innerBottom = card.rect.bottom - card.borderWidth;
        if (!close(bar.rect.bottom, innerBottom)) {
          problems.push(`bar ${i} bottom ${bar.rect.bottom}, expected ${innerBottom}`);
        }
        if (bar.rect.width < card.rect.width - 2 * card.borderWidth - 1) problems.push(`bar ${i} is narrower than the portrait`);
        if (labels[i].text !== 'Center') problems.push(`label ${i} is "${labels[i].text}", expected "Center"`);
      });
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

// One advisor per faction plus a non-factional one, matched by name.
function everyFactionCheck(viewport) {
  const expected = [
    ['Paul Levi', 'left', 'Left'],
    ['Theodor Leipart', 'labor', 'Labor'],
    ['Carl Severing', 'reformist', 'Reformist'],
    ['Carlo Mierendorff', 'neorev', 'Neorevisionist'],
    ['Fritz Baade', 'nonfactional', 'Non-factional'],
  ];
  return {
    name: `decision:${viewport}:hub-factions:faction-colours`,
    viewport,
    state: 'hub-factions',
    selectors: ['ul.pinned-cards > li', '.dc-bar', '.dc-faction', '.dc-chip'],
    test(m) {
      const items = m.elements['ul.pinned-cards > li'];
      const bars = m.elements['.dc-bar'];
      if (items.length !== expected.length || bars.length !== expected.length) {
        return `expected ${expected.length} advisors with bars, found ${items.length} cards, ${bars.length} bars`;
      }
      const problems = [];
      for (const [name, faction, label] of expected) {
        const i = items.findIndex((li) => li.text.startsWith(name));
        if (i < 0) {
          problems.push(`${name} not in the row`);
          continue;
        }
        if (bars[i].backgroundColor !== COLOURS[faction]) {
          problems.push(`${name}'s bar is ${bars[i].backgroundColor}, expected ${COLOURS[faction]}`);
        }
        if (!items[i].text.endsWith(label)) problems.push(`${name}'s label is not "${label}": "${items[i].text}"`);
      }
      const [chip] = m.elements['.dc-chip'];
      if (!chip || chip.text !== 'Next action in 3 months') problems.push(`status chip is "${chip && chip.text}"`);
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

// The Cabinet and Shuffle Leadership cards are not people: no bar, no label.
// Shuffle Leadership is only offered on easy difficulty.
const shuffleLeadershipCheck = {
  name: 'decision:laptop:hub-easy:shuffle-leadership-no-bar',
  viewport: 'laptop',
  state: 'hub-easy',
  selectors: ['ul.pinned-cards > li', '.dc-bar', '.dc-faction', 'ul.pinned-cards > li .card-caption'],
  test(m) {
    const items = m.elements['ul.pinned-cards > li'];
    // The card's one-line description sits in its hover tooltip, so the
    // item's text carries it; the caption is the card's name alone.
    const shuffle = m.elements['ul.pinned-cards > li .card-caption'].find((c) => c.text === 'Shuffle Leadership');
    if (!shuffle) return 'Shuffle Leadership card not on the easy hub';
    if (m.elements['.dc-bar'].length !== items.length - 1) {
      return `${m.elements['.dc-bar'].length} bars for ${items.length} pinned cards; Shuffle Leadership should have none`;
    }
    return m.elements['.dc-faction'].length === items.length - 1
      ? true
      : `${m.elements['.dc-faction'].length} faction labels for ${items.length} pinned cards; Shuffle Leadership should have none`;
  },
};

export default [
  ...VIEWPORTS.flatMap((viewport) => [
    dateHeadingCheck(viewport),
    headingsCheck(viewport, 'hub', 'Hand · 0 of 3'),
    centredRowsCheck(viewport),
    captionsCentredCheck(viewport),
    govtDeckCheck(viewport),
    emptySlotCheck(viewport),
    startAdvisorsCheck(viewport),
    fourChoicesFullWidthCheck(viewport),
  ]),
  headingsCheck('laptop', 'hub-easy', 'Hand · 0 of 4'),
  centredRowsCheck('laptop', 'hub-easy', ['ul.decks', 'ul.hand', 'ul.pinned-cards']),
  shuffleLeadershipCheck,
  govtUnavailableCheck('laptop', 'hub-govt-empty', 'Not in government'),
  govtUnavailableCheck('laptop', 'hub-govt-empty-government', 'No cards available'),
  centredRowsCheck('laptop', 'hub-govt-empty', ['ul.decks', 'ul.hand']),
  everyFactionCheck('laptop'),
  everyFactionCheck('monitor'),
];
