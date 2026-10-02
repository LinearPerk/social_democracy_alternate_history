'use strict';

import { TOLERANCE, close, gte, lte, within } from '../lib/assert.mjs';
import { evaluate } from '../lib/driver.mjs';

// Checks for the depth column's control strip (in the bar over the column),
// kind label, title, and resting state (out/html/depth-column/). The view machine's logic (history,
// the cap, stale page depth, the resting-view rule) has node:test tests in
// test/layout/depth-column.test.mjs; this file covers what only a real page
// can show: the column's parts exist, stack in order, and take the right
// type.

const COLUMN = '#depth_column';
const BAR = '#depth-bar';
const STRIP = '#depth-bar .dc-strip';
const BUTTONS = '#depth-bar .dc-strip button';
const KIND = '#depth_column .dc-kind';
const TITLE = '#depth_column .dc-title';
const BODY = '#depth_column .dc-body';

const stripAndTitleCheck = {
  name: 'depth:hub:monitor:strip-and-title',
  viewport: 'monitor',
  state: 'hub',
  selectors: [COLUMN, BAR, STRIP, TITLE, BODY],
  test(m) {
    const [column] = m.elements[COLUMN];
    const [bar] = m.elements[BAR];
    const [strip] = m.elements[STRIP];
    const [title] = m.elements[TITLE];
    const [body] = m.elements[BODY];
    if (!column) return '#depth_column not found';
    if (!strip) return 'control strip (.dc-strip) not found in #depth-bar';
    if (!title) return 'title (.dc-title) not found in #depth_column';
    if (!body) return 'body (.dc-body) not found in #depth_column';

    const problems = [];
    if (!lte(strip.rect.bottom, title.rect.top)) {
      problems.push(`strip (bottom ${strip.rect.bottom}) not above title (top ${title.rect.top})`);
    }
    if (!lte(title.rect.bottom, body.rect.top)) {
      problems.push(`title (bottom ${title.rect.bottom}) not above body (top ${body.rect.top})`);
    }
    if (!bar) problems.push('#depth-bar not found');
    else if (!(strip.rect.left >= bar.rect.left && strip.rect.right <= bar.rect.right + 1)) {
      problems.push(`strip ${strip.rect.left}-${strip.rect.right} outside its bar ${bar.rect.left}-${bar.rect.right}`);
    }
    if (!(strip.rect.left >= column.rect.left && strip.rect.right <= column.rect.right + 1)) {
      problems.push(`strip ${strip.rect.left}-${strip.rect.right} outside column ${column.rect.left}-${column.rect.right}`);
    }
    return problems.length === 0 ? true : problems.join('; ');
  },
};

// Back, Polls, and Library, in that order, on one line (normal mode; Die Zeit
// joins in historical mode). The page view names its kind below the strip and
// above the title; the label is small caps in Jost, the body stays in the
// game's serif.
const stripTypeCheck = {
  name: 'depth:hub:monitor:strip-type',
  viewport: 'monitor',
  state: 'hub',
  selectors: [BUTTONS, STRIP, KIND, TITLE, BODY],
  test(m) {
    const buttons = m.elements[BUTTONS];
    const [strip] = m.elements[STRIP];
    const [kind] = m.elements[KIND];
    const [title] = m.elements[TITLE];
    const [body] = m.elements[BODY];
    const problems = [];

    if (buttons.map((b) => b.text).join('|') !== '← Back|Polls|Library') {
      problems.push(`strip buttons "${buttons.map((b) => b.text).join('|')}", expected Back|Polls|Library`);
    } else {
      for (const button of buttons) {
        if (!/Jost/.test(button.fontFamily)) problems.push(`strip button font ${button.fontFamily}, expected Jost`);
      }
      for (let i = 1; i < buttons.length; i++) {
        if (!(buttons[i - 1].rect.right <= buttons[i].rect.left + 1)) problems.push('strip buttons are not in order from left to right');
        if (!(Math.abs(buttons[i - 1].rect.top - buttons[i].rect.top) <= 2)) problems.push('strip wraps onto a second line');
      }
    }
    if (!kind) {
      problems.push('kind label (.dc-kind) not found');
    } else {
      if (strip && kind.rect.top < strip.rect.bottom - 1) problems.push('kind label sits inside the strip');
      if (title && kind.rect.bottom > title.rect.top + 1) problems.push('kind label is not above the title');
      if (!/Jost/.test(kind.fontFamily)) problems.push(`kind label font ${kind.fontFamily}, expected Jost`);
      if (kind.textTransform !== 'uppercase') problems.push(`kind label text-transform ${kind.textTransform}, expected uppercase`);
    }
    if (body && /Jost/.test(body.fontFamily)) problems.push(`body font ${body.fontFamily}, expected the serif`);
    return problems.length === 0 ? true : problems.join('; ');
  },
};

// At the narrowest three-column width the strip still fits its column. The
// historical-mode strip (Back, Polls, Die Zeit, Library) is the longest, so
// it gets the one-line test too.
function stripFitsCheck(name, state) {
  return {
    name,
    viewport: 'three-col-min',
    state,
    selectors: [COLUMN, STRIP, BUTTONS],
    test(m) {
      const [column] = m.elements[COLUMN];
      const [strip] = m.elements[STRIP];
      if (!column || !strip) return '#depth_column or its strip (in #depth-bar) not found';
      const problems = [];
      const buttons = m.elements[BUTTONS];
      if (buttons.length < 3) problems.push(`strip has ${buttons.length} buttons`);
      if (buttons.some((b) => Math.abs(b.rect.top - buttons[0].rect.top) > 2)) problems.push('strip wraps onto a second line');
      if (strip.scrollWidth > strip.clientWidth) problems.push(`strip overflows itself: scrollWidth ${strip.scrollWidth} > clientWidth ${strip.clientWidth}`);
      if (buttons.length && !lte(buttons[buttons.length - 1].rect.right, strip.rect.right)) {
        problems.push(`last button right ${buttons[buttons.length - 1].rect.right} past strip right ${strip.rect.right}`);
      }
      if (m.scrollWidth > m.clientWidth) {
        problems.push(`horizontal overflow: scrollWidth ${m.scrollWidth} > clientWidth ${m.clientWidth}`);
      }
      if (!lte(strip.rect.right, column.rect.right)) {
        problems.push(`strip right ${strip.rect.right} past column right ${column.rect.right}`);
      }
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

// The column draws its resting view during play at every width, and stays
// empty before a game starts, so the layout's empty-column rules hold (no
// space in the two-column tier, no track on the title page).
function restsEmptyCheck(name, viewport, state) {
  return {
    name,
    viewport,
    state,
    selectors: [COLUMN, STRIP],
    test(m) {
      const [column] = m.elements[COLUMN];
      if (!column) return '#depth_column not found';
      const [strip] = m.elements[STRIP];
      if (strip) return `a view drawn (strip found) at ${viewport} in ${state}, expected an empty column`;
      return column.text === '' ? true : `#depth_column holds "${column.text.slice(0, 40)}" at ${viewport} in ${state}`;
    },
  };
}

function restsOnPollsCheck(name, viewport) {
  return {
    name,
    viewport,
    state: 'hub-month',
    selectors: [COLUMN, STRIP, '#depth-bar [aria-current]', '#depth-bar [data-dc-back]', '#depth_column .dc-polls'],
    test(m) {
      const [strip] = m.elements[STRIP];
      if (!strip) return `no strip at ${viewport} during play`;
      const problems = [];
      const [current] = m.elements['#depth-bar [aria-current]'];
      const [back] = m.elements['#depth-bar [data-dc-back]'];
      if (!current || current.text !== 'Polls') problems.push(`current view "${current ? current.text : ''}", expected Polls`);
      if (!back || !back.disabled) problems.push('Back is enabled at rest');
      if (m.elements['#depth_column .dc-polls'].length !== 1) problems.push('the Polls body is missing');
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

// The header's Library link. Beside play (three columns) it opens the
// Library home in the column and leaves the main column alone; below 1300px
// it takes upstream's route, which replaces play with the Library page.
const MENU_LINKS = '#depth_column .dc-menu a';
const MENU_ITEMS = '#depth_column .dc-menu li';
const CONTENT_HEADINGS = '#content h1, #content h2';

function libraryLinkOpensColumnCheck(name, viewport, state) {
  return {
    name,
    viewport,
    state,
    selectors: [TITLE, '#depth-bar [aria-current]', MENU_LINKS, MENU_ITEMS, CONTENT_HEADINGS],
    test(m) {
      const [title] = m.elements[TITLE];
      const [current] = m.elements['#depth-bar [aria-current]'];
      const problems = [];
      // The strip's marked button names the home, so the column draws no title.
      if (title) problems.push(`column title "${title.text}", expected none (the strip names the view)`);
      if (!current || current.text !== 'Library') problems.push(`strip marks "${current && current.text}", expected Library`);
      const links = m.elements[MENU_LINKS];
      if (links.length !== 9) problems.push(`expected 9 Library menu links, found ${links.length}`);
      const inPlace = m.elements[MENU_ITEMS].filter((li) => /\(opens in the main column\)/.test(li.text));
      if (inPlace.length !== 2) problems.push(`expected 2 menu items marked "(opens in the main column)", found ${inPlace.length}`);
      if (m.elements[CONTENT_HEADINGS].some((h) => /The Library/.test(h.text))) {
        problems.push("the main column shows upstream's Library page");
      }
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

function libraryLinkUpstreamCheck(name, viewport) {
  return {
    name,
    viewport,
    state: 'library-link',
    selectors: [MENU_ITEMS, CONTENT_HEADINGS],
    test(m) {
      const problems = [];
      if (!m.elements[CONTENT_HEADINGS].some((h) => /The Library/.test(h.text))) {
        problems.push("upstream's Library page did not open in the main column");
      }
      if (m.elements[MENU_ITEMS].length > 0) problems.push("the column opened its own Library home as well as upstream's page");
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

// Page depth: the title page's Kautsky blockquotes are real depth in the
// source. They move out of the decision column into the page view, and the
// decision column keeps a link that reopens it.
const epigraphMovesCheck = {
  name: 'depth:start:monitor:epigraph-moves',
  viewport: 'monitor',
  state: 'start',
  selectors: ['#content blockquote', '#depth_column blockquote'],
  test(m) {
    const inContent = m.elements['#content blockquote'].length;
    const inColumn = m.elements['#depth_column blockquote'].length;
    const problems = [];
    if (inContent !== 0) problems.push(`#content holds ${inContent} blockquotes, expected 0`);
    if (inColumn !== 2) problems.push(`#depth_column holds ${inColumn} blockquotes, expected 2`);
    return problems.length === 0 ? true : problems.join('; ');
  },
};

// The link stays behind where the epigraph was, one line, arrow in Jost (the
// serif draws a stray glyph), and the notes from links.json follow the quote.
const epigraphLinkCheck = {
  name: 'depth:start:monitor:epigraph-link',
  viewport: 'monitor',
  state: 'start',
  selectors: ['#content .dc-link', '#content .dc-link .dc-arrow', '#depth_column .dc-links a'],
  test(m) {
    const links = m.elements['#content .dc-link'];
    const [arrow] = m.elements['#content .dc-link .dc-arrow'];
    const notes = m.elements['#depth_column .dc-links a'];
    const problems = [];
    if (links.length !== 1) problems.push(`expected 1 link in #content, found ${links.length}`);
    if (!arrow) problems.push('link arrow (.dc-arrow) not found');
    else if (!/Jost/.test(arrow.fontFamily)) problems.push(`arrow font ${arrow.fontFamily}, expected Jost`);
    if (notes.length !== 1) problems.push(`expected 1 Further reading link (Kautsky), found ${notes.length}`);
    return problems.length === 0 ? true : problems.join('; ');
  },
};

// Below 1300px layout.css draws no panel for the column, so a page view needs
// its own parchment box or it sits on the scene art.
function backingCheck(name, viewport) {
  return {
    name,
    viewport,
    state: 'start',
    selectors: [COLUMN],
    test(m) {
      const [column] = m.elements[COLUMN];
      if (!column) return '#depth_column not found';
      if (column.display === 'none') return '#depth_column is not displayed';
      const bg = column.backgroundColor;
      if (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') return `page view has no backing (${bg})`;
      if (m.scrollWidth > m.clientWidth) return `horizontal overflow: scrollWidth ${m.scrollWidth} > clientWidth ${m.clientWidth}`;
      return true;
    },
  };
}

// A section renders in the column with its values filled in: no unrendered
// [+ quality +] markup, and the current-government text carries real numbers.
const sectionRendersCheck = {
  name: 'depth:library-section:monitor:renders-live-values',
  viewport: 'monitor',
  state: 'library-section',
  selectors: [TITLE, BODY, KIND],
  test(m) {
    const [title] = m.elements[TITLE];
    const [body] = m.elements[BODY];
    const [kind] = m.elements[KIND];
    const problems = [];
    if (!title || title.text !== 'Current government details') problems.push(`title "${title && title.text}"`);
    if (!kind || kind.text !== 'Library') problems.push(`kind label "${kind && kind.text}", expected "Library"`);
    if (!body) return 'body not found';
    if (/\[\+|\+\]/.test(body.text)) problems.push('body still holds [+ +] markup');
    if (!/SPD: \d+%/.test(body.text)) problems.push('no live SPD percentage in body');
    return problems.length === 0 ? true : problems.join('; ');
  },
};

// A scene with no heading takes its title from the scene; a title with
// [+ quality +] inserts compiles to a content object and must still read as
// text (papen_chancellor once showed "[object Object]").
const dynamicTitleCheck = {
  name: 'depth:hub-month:monitor:dynamic-scene-title',
  viewport: 'monitor',
  state: 'hub-month',
  selectors: [],
  act: (page) => evaluate(page, `(async () => {
    window.dendryUI.dendryEngine.goToScene('papen_chancellor');
    await new Promise((r) => setTimeout(r, 300));
    const t = document.querySelector('#depth_column .dc-title');
    return t ? t.textContent : null;
  })()`),
  test(m) {
    const title = m.acted;
    if (title == null) return 'no column title after opening papen_chancellor';
    if (/object/.test(title)) return `title reads "${title}"`;
    if (!/^Chancellor .+ replaced by Franz von Papen$/.test(title)) return `unexpected title "${title}"`;
    return true;
  },
};

// Width tiers with a real page view open. grid.mjs measures the tiers with a
// stand-in paragraph in the column; these open the game's own page depth, so
// the column holds its strip, title, moved text, and links. Two states: the
// title page's epigraph (the page after "Start game") and a card whose page carries
// depth (all three columns). The layout's rem tracks at a 16px root: 24rem =
// 384, 36rem = 576, 21rem = 336, 28rem = 448, 32rem = 512.
const BODY_PARTS = '#depth_column .dc-body *, #depth-bar .dc-strip *, #depth_column .dc-title';

// Nothing drawn in the column sticks out past its box (text cut off, a wide
// element, a button pushed past the edge).
function partsInside(column, parts) {
  const escapes = parts.filter(
    (p) => p.rect.width > 0 && (p.rect.right > column.rect.right + TOLERANCE || p.rect.left < column.rect.left - TOLERANCE)
  );
  if (escapes.length === 0) return null;
  const first = escapes[0];
  return `${escapes.length} part(s) outside the column box (first: "${first.text.slice(0, 30)}", ${first.rect.left}-${first.rect.right} vs ${column.rect.left}-${column.rect.right})`;
}

function pageViewNotOpen(column, kind) {
  if (!column) return '#depth_column not found';
  if (column.display === 'none') return '#depth_column is not displayed';
  if (!kind || kind.text !== 'Background') return `column is not showing a page view (kind label "${kind && kind.text}")`;
  return null;
}

// Three columns from 1300px: state, decision, and depth side by side on a
// shared top edge, the depth column between 24rem and 36rem, nothing past the
// viewport.
function threeColumnPageViewCheck(viewport, state) {
  return {
    name: `depth:${state}:${viewport}:three-columns-page-view`,
    viewport,
    state,
    selectors: ['#tools_wrapper', '#content', COLUMN, KIND, BODY_PARTS],
    test(m) {
      const [side] = m.elements['#tools_wrapper'];
      const [decision] = m.elements['#content'];
      const [column] = m.elements[COLUMN];
      const [kind] = m.elements[KIND];
      const notOpen = pageViewNotOpen(column, kind);
      if (notOpen) return notOpen;
      if (!decision) return '#content not found';
      const problems = [];

      if (!side || side.display === 'none') problems.push('state column missing');
      else if (!lte(side.rect.right, decision.rect.left)) {
        problems.push(`state (right ${side.rect.right}) overlaps decision (left ${decision.rect.left})`);
      }
      if (!lte(decision.rect.right, column.rect.left)) {
        problems.push(`decision (right ${decision.rect.right}) overlaps depth (left ${column.rect.left})`);
      }
      if (!within(column.rect.width, 384, 576)) problems.push(`depth width ${column.rect.width}, expected 384-576 (24rem-36rem)`);
      if (!close(column.rect.top, decision.rect.top)) {
        problems.push(`depth top ${column.rect.top} not level with decision top ${decision.rect.top}`);
      }
      if (m.scrollWidth > m.clientWidth + TOLERANCE) {
        problems.push(`horizontal overflow: scrollWidth ${m.scrollWidth} > clientWidth ${m.clientWidth}`);
      }
      if (column.rect.right > m.clientWidth + TOLERANCE) {
        problems.push(`depth right ${column.rect.right} past clientWidth ${m.clientWidth}`);
      }
      const escape = partsInside(column, m.elements[BODY_PARTS]);
      if (escape) problems.push(escape);
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

// Two columns (1100px): the page view sits under the decision column, on its
// left edge and at its width, in its own parchment box.
function twoColumnPageViewCheck(state) {
  return {
    name: `depth:${state}:two-col:page-view-under-decision`,
    viewport: 'two-col',
    state,
    selectors: ['#content', 'footer', COLUMN, KIND, BODY_PARTS],
    test(m) {
      const [decision] = m.elements['#content'];
      const [footer] = m.elements['footer'];
      const [column] = m.elements[COLUMN];
      const [kind] = m.elements[KIND];
      const notOpen = pageViewNotOpen(column, kind);
      if (notOpen) return notOpen;
      if (!decision || !footer) return '#content or footer not found';
      const problems = [];
      if (!gte(column.rect.top, decision.rect.bottom)) {
        problems.push(`depth (top ${column.rect.top}) not below decision (bottom ${decision.rect.bottom})`);
      }
      if (!gte(column.rect.top, footer.rect.bottom)) {
        problems.push(`depth (top ${column.rect.top}) above decision's footer (bottom ${footer.rect.bottom})`);
      }
      if (!close(column.rect.left, decision.rect.left)) {
        problems.push(`depth left ${column.rect.left} != decision left ${decision.rect.left}`);
      }
      if (!close(column.rect.width, decision.rect.width)) {
        problems.push(`depth width ${column.rect.width} != decision width ${decision.rect.width}`);
      }
      if (column.backgroundColor === 'rgba(0, 0, 0, 0)') problems.push('page view has no backing');
      if (m.scrollWidth > m.clientWidth + TOLERANCE) {
        problems.push(`horizontal overflow: scrollWidth ${m.scrollWidth} > clientWidth ${m.clientWidth}`);
      }
      const escape = partsInside(column, m.elements[BODY_PARTS]);
      if (escape) problems.push(escape);
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

// Stacked (phone, and 700px, above upstream's own breakpoint): state,
// decision, depth, top to bottom, all inside the viewport.
function stackedPageViewCheck(viewport) {
  return {
    name: `depth:card-depth:${viewport}:stacked-in-ladder-order`,
    viewport,
    state: 'card-depth',
    selectors: ['#tools_wrapper', '#content', COLUMN, KIND, BODY_PARTS],
    test(m) {
      const [side] = m.elements['#tools_wrapper'];
      const [decision] = m.elements['#content'];
      const [column] = m.elements[COLUMN];
      const [kind] = m.elements[KIND];
      const notOpen = pageViewNotOpen(column, kind);
      if (notOpen) return notOpen;
      if (!side || !decision) return '#tools_wrapper or #content not found';
      const problems = [];
      if (!lte(side.rect.bottom, decision.rect.top)) {
        problems.push(`state (bottom ${side.rect.bottom}) below decision (top ${decision.rect.top})`);
      }
      if (!lte(decision.rect.bottom, column.rect.top)) {
        problems.push(`decision (bottom ${decision.rect.bottom}) below depth (top ${column.rect.top})`);
      }
      if (column.rect.left < -TOLERANCE || column.rect.right > m.clientWidth + TOLERANCE) {
        problems.push(`depth ${column.rect.left}-${column.rect.right} outside the ${m.clientWidth}px viewport`);
      }
      if (m.scrollWidth > m.clientWidth + TOLERANCE) {
        problems.push(`horizontal overflow: scrollWidth ${m.scrollWidth} > clientWidth ${m.clientWidth}`);
      }
      const escape = partsInside(column, m.elements[BODY_PARTS]);
      if (escape) problems.push(escape);
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

export default [
  dynamicTitleCheck,
  libraryLinkOpensColumnCheck('depth:library-link:monitor:opens-in-column', 'monitor', 'library-link'),
  libraryLinkOpensColumnCheck('depth:library-link:laptop:opens-in-column', 'laptop', 'library-link'),
  libraryLinkOpensColumnCheck('depth:library-link-from-section:monitor:returns-home', 'monitor', 'library-link-from-section'),
  libraryLinkUpstreamCheck('depth:library-link:two-col:upstream-route', 'two-col'),
  sectionRendersCheck,
  epigraphMovesCheck,
  epigraphLinkCheck,
  backingCheck('depth:start:two-col:page-view-backing', 'two-col'),
  backingCheck('depth:start:phone:page-view-backing', 'phone'),
  stripAndTitleCheck,
  stripTypeCheck,
  stripFitsCheck('depth:hub:three-col-min:strip-fits', 'hub'),
  stripFitsCheck('depth:hub-historical:three-col-min:strip-fits-longest', 'hub-historical'),
  restsOnPollsCheck('depth:hub-month:two-col:rests-on-polls', 'two-col'),
  restsOnPollsCheck('depth:hub-month:phone:rests-on-polls', 'phone'),
  restsEmptyCheck('depth:title:monitor:rests-empty', 'monitor', 'title'),
  restsEmptyCheck('depth:title:laptop:rests-empty', 'laptop', 'title'),
  restsEmptyCheck('depth:title:three-col-min:rests-empty', 'three-col-min', 'title'),
  restsEmptyCheck('depth:title:two-col:rests-empty', 'two-col', 'title'),
  restsEmptyCheck('depth:title:phone:rests-empty', 'phone', 'title'),
  ...['monitor', 'laptop', 'laptop-l', 'three-col-min'].map((v) => threeColumnPageViewCheck(v, 'card-depth')),
  ...['monitor', 'laptop', 'laptop-l', 'three-col-min'].map((v) => threeColumnPageViewCheck(v, 'start')),
  twoColumnPageViewCheck('card-depth'),
  twoColumnPageViewCheck('start'),
  stackedPageViewCheck('narrow'),
  stackedPageViewCheck('phone'),
];
