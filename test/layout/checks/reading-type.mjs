'use strict';

import { close, lte } from '../lib/assert.mjs';
import { evaluate } from '../lib/driver.mjs';
import { VIEWPORTS } from '../lib/viewports.mjs';

// The reading columns' type (decision-column.css, the depth-column CSS): the
// state column's house style applied to the two columns that hold reading
// text. Body is the game's serif, 16px on a 1.55 line in the decision column
// and 15px in the depth column; headings and labels are Jost small caps with
// 0.12em tracking; the depth column's links out are Jost 12px. The second
// half covers the redundancy cuts: the "Background →" link is gone while the
// depth column shows its page, a title that repeats the page's own heading
// is gone, and so are the Library's repeated headings.

const SERIF_BODY = (m, label, el) => {
  const problems = [];
  if (/Jost/.test(el.fontFamily)) problems.push(`${label} font ${el.fontFamily}, expected the serif`);
  return problems;
};

const fail = (problems) => (problems.length === 0 ? true : problems.join('; '));

// The Begin page: prose paragraphs and the difficulty table, whose cells take
// the serif at the table's own small size (decision-column.css).
function decisionBodyCheck(viewport) {
  return {
    name: `reading-type:${viewport}:decision-body`,
    viewport,
    state: 'start',
    selectors: ['#content > p', '#content ul.choices li', '#content table.choice-table td'],
    test(m) {
      const paragraphs = m.elements['#content > p'].filter((p) => p.text.length > 40);
      const choices = m.elements['#content ul.choices li'].filter((li) => !/choice-table-holder/.test(li.className));
      const cells = m.elements['#content table.choice-table td'];
      if (paragraphs.length === 0 || (choices.length === 0 && cells.length === 0)) return 'the Begin page has no paragraphs or choices';
      const problems = [];
      for (const p of paragraphs) {
        problems.push(...SERIF_BODY(m, 'paragraph', p));
        if (!close(p.fontSize, 16, 0.2)) problems.push(`paragraph is ${p.fontSize}px, expected 16px`);
        if (!close(p.lineHeight, 16 * 1.55, 0.3)) problems.push(`paragraph line height ${p.lineHeight}px, expected 24.8px`);
        if (p.textIndent !== 0) problems.push(`paragraph indent ${p.textIndent}px, expected none`);
        if (!close(p.marginBottom, 9.6, 0.3)) problems.push(`paragraph spacing ${p.marginBottom}px, expected 9.6px (0.6em)`);
        if (p.rect.width > 34 * 16 + 1) problems.push(`paragraph measure ${p.rect.width}px, expected at most 34rem`);
      }
      for (const li of choices) {
        if (!close(li.fontSize, 16, 0.2)) problems.push(`choice is ${li.fontSize}px, expected 16px`);
        if (!close(li.paddingTop, 12.8, 0.3)) problems.push(`choice padding ${li.paddingTop}px, expected 12.8px (0.8em)`);
      }
      for (const td of cells) {
        problems.push(...SERIF_BODY(m, 'table cell', td));
        if (td.fontSize < 12 || td.fontSize > 16) problems.push(`table cell is ${td.fontSize}px, expected 12 to 16px`);
      }
      return fail([...new Set(problems)]);
    },
  };
}

// A card's page: the same body size, so one rule covers every page.
const cardBodyCheck = {
  name: 'reading-type:laptop:card-body',
  viewport: 'laptop',
  state: 'card-depth',
  selectors: ['#content > p', '#content ul.choices li'],
  test(m) {
    const [p] = m.elements['#content > p'];
    const [li] = m.elements['#content ul.choices li'];
    if (!p || !li) return 'the card page has no paragraph or choice';
    const problems = [];
    if (!close(p.fontSize, 16, 0.2)) problems.push(`paragraph is ${p.fontSize}px, expected 16px`);
    if (!close(li.fontSize, 16, 0.2)) problems.push(`choice is ${li.fontSize}px, expected 16px`);
    return fail(problems);
  },
};

// The Options font control still scales the column: a size of 1.3em on
// #content takes the paragraph to 1.3 / 1.1 of 16px.
const fontControlCheck = {
  name: 'reading-type:laptop:font-control-scales-body',
  viewport: 'laptop',
  state: 'start',
  fontSize: '1.3em',
  selectors: ['#content > p'],
  test(m) {
    const paragraphs = m.elements['#content > p'].filter((p) => p.text.length > 40);
    if (paragraphs.length === 0) return 'no paragraph';
    const expected = 1.3 * 16 * (16 / 17.6);
    return close(paragraphs[0].fontSize, expected, 0.3)
      ? true
      : `paragraph is ${paragraphs[0].fontSize}px at 1.3em, expected ${expected.toFixed(1)}px`;
  },
};

// The hub: headings are Jost 500 small caps at 11px with 0.12em tracking;
// captions are 14px serif; the faction word is 11px Jost small caps; a
// greyed deck's note is a 14px muted caption line, and "Government Affairs"
// fits one line above it.
function hubTypeCheck(viewport) {
  return {
    name: `reading-type:${viewport}:hub-type`,
    viewport,
    state: 'hub',
    selectors: [
      'p.deck-description', 'p.hand-description', 'p.pinned-text-description',
      'ul.decks .card-caption', 'ul.pinned-cards .card-caption', '.dc-note', '.dc-faction',
    ],
    test(m) {
      const problems = [];
      for (const selector of ['p.deck-description', 'p.hand-description', 'p.pinned-text-description']) {
        const [h] = m.elements[selector];
        if (!h) {
          problems.push(`${selector} not found`);
          continue;
        }
        if (!/Jost/.test(h.fontFamily)) problems.push(`${selector} font ${h.fontFamily}, expected Jost`);
        if (!close(h.fontSize, 11, 0.2)) problems.push(`${selector} is ${h.fontSize}px, expected 11px`);
        if (!close(h.letterSpacing, 11 * 0.12, 0.05)) problems.push(`${selector} tracking ${h.letterSpacing}px, expected 0.12em`);
        if (h.textTransform !== 'uppercase') problems.push(`${selector} is not small caps (${h.textTransform})`);
        if (!['500', '600', '700'].includes(h.fontWeight)) problems.push(`${selector} weight ${h.fontWeight}, expected 500 to 700`);
      }
      const captions = [...m.elements['ul.decks .card-caption'], ...m.elements['ul.pinned-cards .card-caption']];
      if (captions.length === 0) problems.push('no captions');
      for (const c of captions) {
        if (!close(c.fontSize, 14, 0.2)) problems.push(`caption "${c.text}" is ${c.fontSize}px, expected 14px`);
        if (/Jost/.test(c.fontFamily)) problems.push(`caption "${c.text}" is in ${c.fontFamily}, expected the serif`);
      }
      const faction = m.elements['.dc-faction'];
      if (faction.length === 0) problems.push('no faction labels');
      for (const f of faction) {
        if (!close(f.fontSize, 11, 0.2)) problems.push(`faction label is ${f.fontSize}px, expected 11px`);
        if (!/Jost/.test(f.fontFamily) || f.textTransform !== 'uppercase') problems.push('faction label is not Jost small caps');
      }
      const [note] = m.elements['.dc-note'];
      if (!note) problems.push('no "Not in government" note');
      else if (!close(note.fontSize, 14, 0.2)) problems.push(`note is ${note.fontSize}px, expected 14px`);
      const govt = m.elements['ul.decks .card-caption'].find((c) => c.text === 'Government Affairs');
      if (!govt) problems.push('no Government Affairs caption');
      else if (govt.rect.height > 14 * 1.2 * 1.5) problems.push(`"Government Affairs" wraps (${govt.rect.height}px tall)`);
      if (m.scrollWidth > m.clientWidth + 1) problems.push(`horizontal overflow: ${m.scrollWidth} > ${m.clientWidth}`);
      return fail(problems);
    },
  };
}

// The depth column: a page view (the hub's January 1928 background) takes
// the title in Jost 500 15px, prose at 15px on 1.55, sub-headings at 11px,
// links out at Jost 12px.
const DEPTH_PAGE_PARTS = ['#depth_column .dc-title', '#depth_column .dc-body p', '#depth_column .dc-kind'];

const depthPageCheck = {
  name: 'reading-type:laptop:depth-page',
  viewport: 'laptop',
  state: 'hub',
  selectors: DEPTH_PAGE_PARTS,
  test(m) {
    const [title] = m.elements['#depth_column .dc-title'];
    const paragraphs = m.elements['#depth_column .dc-body p'];
    const problems = [];
    if (!title) problems.push('no title');
    else {
      if (!/Jost/.test(title.fontFamily)) problems.push(`title font ${title.fontFamily}, expected Jost`);
      if (!close(title.fontSize, 15, 0.2)) problems.push(`title is ${title.fontSize}px, expected 15px`);
      if (title.fontWeight !== '500') problems.push(`title weight ${title.fontWeight}, expected 500`);
    }
    if (paragraphs.length === 0) problems.push('no body paragraphs');
    for (const p of paragraphs) {
      if (/Jost/.test(p.fontFamily)) problems.push('body is in Jost, expected the serif');
      if (!close(p.fontSize, 15, 0.2)) problems.push(`body is ${p.fontSize}px, expected 15px`);
      if (!close(p.lineHeight, 15 * 1.55, 0.3)) problems.push(`body line height ${p.lineHeight}px, expected 23.25px`);
      if (!close(p.marginBottom, 9, 0.3)) problems.push(`body paragraph spacing ${p.marginBottom}px, expected 9px (0.6em)`);
      if (p.rect.width > 34 * 16 + 1) problems.push(`body measure ${p.rect.width}px, expected at most 34rem`);
    }
    return fail([...new Set(problems)]);
  },
};

// The epigraph page has Further reading: sub-heading and link type.
const depthLinksCheck = {
  name: 'reading-type:laptop:depth-links',
  viewport: 'laptop',
  state: 'start',
  selectors: ['#depth_column h4.dc-sub', '#depth_column .dc-links a', '#depth_column blockquote'],
  test(m) {
    const [sub] = m.elements['#depth_column h4.dc-sub'];
    const [link] = m.elements['#depth_column .dc-links a'];
    const [quote] = m.elements['#depth_column blockquote'];
    const problems = [];
    if (!sub) problems.push('no Further reading heading');
    else {
      if (!/Jost/.test(sub.fontFamily) || sub.textTransform !== 'uppercase') problems.push('Further reading is not Jost small caps');
      if (!close(sub.fontSize, 11, 0.2)) problems.push(`Further reading is ${sub.fontSize}px, expected 11px`);
      if (!close(sub.letterSpacing, 11 * 0.12, 0.05)) problems.push(`Further reading tracking ${sub.letterSpacing}px, expected 0.12em`);
    }
    if (!link) problems.push('no Further reading link');
    else {
      if (!/Jost/.test(link.fontFamily)) problems.push(`link font ${link.fontFamily}, expected Jost`);
      if (!close(link.fontSize, 12, 0.2)) problems.push(`link is ${link.fontSize}px, expected 12px`);
    }
    if (!quote) problems.push('no epigraph');
    else if (!close(quote.fontSize, 15, 0.2)) problems.push(`epigraph is ${quote.fontSize}px, expected 15px`);
    return fail(problems);
  },
};

// An entry's text is 15px, its footer into the Library is Jost 12px (a party
// entry has one; a term like Party resources may not).
const depthEntryCheck = {
  name: 'reading-type:laptop:depth-entry',
  viewport: 'laptop',
  state: 'view-entry-party',
  selectors: ['#depth_column .dc-body p', '#depth_column .dc-entry-foot', '#depth_column .dc-entry-foot a'],
  test(m) {
    const paragraphs = m.elements['#depth_column .dc-body p'].filter((p) => p.className === '');
    const [foot] = m.elements['#depth_column .dc-entry-foot'];
    const problems = [];
    if (paragraphs.length === 0) problems.push('no entry paragraphs');
    for (const p of paragraphs) {
      if (!close(p.fontSize, 15, 0.2)) problems.push(`entry text is ${p.fontSize}px, expected 15px`);
    }
    if (!foot) problems.push('no "In the Library" footer');
    else {
      if (!/Jost/.test(foot.fontFamily)) problems.push(`footer font ${foot.fontFamily}, expected Jost`);
      if (!close(foot.fontSize, 12, 0.2)) problems.push(`footer is ${foot.fontSize}px, expected 12px`);
    }
    return fail([...new Set(problems)]);
  },
};

// Compact type inside entries is left as it was: the Reichstag entry's
// coalition rows stay at 0.9em of the column's 17.6px.
const compactKeptCheck = {
  name: 'reading-type:laptop:reichstag-rows-keep-compact-type',
  viewport: 'laptop',
  state: 'reichstag-entry',
  selectors: ['#depth_column .rs-row', '#depth_column .rs-house'],
  test(m) {
    const [row] = m.elements['#depth_column .rs-row'];
    const [house] = m.elements['#depth_column .rs-house'];
    if (!row || !house) return 'the Reichstag entry is not drawn';
    const problems = [];
    if (!close(row.fontSize, 17.6 * 0.9, 0.2)) problems.push(`row is ${row.fontSize}px, expected 15.84px`);
    if (!close(house.fontSize, 17.6 * 0.85, 0.2)) problems.push(`house line is ${house.fontSize}px, expected 14.96px`);
    return fail(problems);
  },
};

// The link that opens a page's depth is out of the decision column while
// the depth column, beside it, shows that page. A link is hidden when its
// box has no display, or its line does.
const LINK = '#content .dc-link';

function linkCheck(name, viewport, state, visible) {
  return {
    name,
    viewport,
    state,
    selectors: [LINK, '#content .dc-linkline', '#depth_column .dc-kind'],
    test(m) {
      const links = m.elements[LINK];
      if (links.length !== 1) return `expected 1 link, found ${links.length}`;
      const shown = links[0].display !== 'none' && links[0].rect.width > 0;
      const line = m.elements['#content .dc-linkline'][0];
      const lineShown = !line || (line.display !== 'none' && line.rect.height > 0);
      if (visible) return shown && lineShown ? true : 'the link is hidden, expected it shown';
      return !shown || !lineShown ? true : 'the link is shown, expected it hidden';
    },
  };
}

// A player who leaves the page view (Polls) gets the link back, and opening
// it puts the page view back.
const linkReturnsCheck = {
  name: 'reading-type:laptop:card-depth:link-returns-after-navigating-away',
  viewport: 'laptop',
  state: 'card-depth',
  selectors: [LINK],
  act: (page) => evaluate(page, `(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    document.querySelector('#depth-bar [data-dc-pick="polls"]').click();
    await wait(200);
    const link = document.querySelector('#content .dc-link');
    const awayShown = !!link && getComputedStyle(link).display !== 'none';
    link.click();
    await wait(200);
    const backHidden = getComputedStyle(document.querySelector('#content .dc-link')).display === 'none';
    const view = document.getElementById('depth_column').getAttribute('data-view');
    return { awayShown, backHidden, view };
  })()`),
  test(m) {
    const a = m.acted;
    const problems = [];
    if (!a.awayShown) problems.push('the link stayed hidden after the column moved to Polls');
    if (a.view !== 'page') problems.push(`clicking the link left the column on "${a.view}"`);
    if (!a.backHidden) problems.push('the link is still shown once the column shows the page again');
    return fail(problems);
  },
};

// A card's page repeats its name in the depth column's title unless the
// title is left out; the label alone stays.
const cardTitleCheck = {
  name: 'reading-type:laptop:card-depth:title-not-repeated',
  viewport: 'laptop',
  state: 'card-depth',
  selectors: ['#content h1', '#depth_column .dc-kind', '#depth_column .dc-title'],
  test(m) {
    const [h1] = m.elements['#content h1'];
    const [kind] = m.elements['#depth_column .dc-kind'];
    const titles = m.elements['#depth_column .dc-title'];
    const problems = [];
    if (!h1) problems.push('the card page has no heading');
    if (!kind || kind.text !== 'Background') problems.push(`kind label "${kind && kind.text}", expected Background`);
    if (titles.length > 0) problems.push(`the column repeats the heading as "${titles[0].text}"`);
    return fail(problems);
  },
};

// The title page's "Before the game begins" is not on the page, so it stays.
const epigraphTitleCheck = {
  name: 'reading-type:laptop:start:title-kept-when-page-has-no-heading',
  viewport: 'laptop',
  state: 'start',
  selectors: ['#depth_column .dc-title'],
  test(m) {
    const [title] = m.elements['#depth_column .dc-title'];
    return title && title.text === 'Before the game begins' ? true : `title "${title && title.text}", expected Before the game begins`;
  },
};

// Library sections that open with a heading of their own repeat the
// column's title; the heading is hidden, later headings stay.
const libraryHeadingCheck = {
  name: 'reading-type:laptop:library-section:opening-heading-hidden',
  viewport: 'laptop',
  state: 'library-section',
  selectors: ['#depth_column .dc-title', '#depth_column .dc-section h1'],
  test(m) {
    const [title] = m.elements['#depth_column .dc-title'];
    const headings = m.elements['#depth_column .dc-section h1'];
    const problems = [];
    if (!title) problems.push('no title');
    const shown = headings.filter((h) => h.display !== 'none' && h.rect.height > 0);
    if (shown.length > 0) problems.push(`section shows its opening heading "${shown[0].text}"`);
    return fail(problems);
  },
};

// The Begin page still fits the fold on a laptop: the choice list ends above
// the window's bottom edge, with the link gone and the page shorter.
const beginFitsCheck = {
  name: 'reading-type:laptop:start:begin-page-fits-fold',
  viewport: 'laptop',
  state: 'start',
  selectors: ['#content ul.choices', '#content'],
  test(m) {
    const [choices] = m.elements['#content ul.choices'];
    const [content] = m.elements['#content'];
    if (!choices || !content) return 'the Begin page is not drawn';
    const fold = VIEWPORTS.laptop.height;
    const problems = [];
    if (!lte(choices.rect.bottom, fold)) problems.push(`choices end at ${choices.rect.bottom}, expected <= ${fold}`);
    if (!lte(content.rect.bottom, fold)) problems.push(`#content ends at ${content.rect.bottom}, expected <= ${fold}`);
    if (m.scrollHeight > m.viewport.height + 1) problems.push(`page is ${m.scrollHeight}px tall in a ${m.viewport.height}px window`);
    if (m.scrollWidth > m.clientWidth + 1) problems.push(`horizontal overflow: ${m.scrollWidth} > ${m.clientWidth}`);
    return fail(problems);
  },
};

// No horizontal overflow at the other tiers with the new type.
function noOverflowCheck(viewport, state) {
  return {
    name: `reading-type:${viewport}:${state}:no-overflow`,
    viewport,
    state,
    selectors: [],
    test(m) {
      return m.scrollWidth > m.clientWidth + 1 ? `horizontal overflow: ${m.scrollWidth} > ${m.clientWidth}` : true;
    },
  };
}

export default [
  decisionBodyCheck('laptop'),
  decisionBodyCheck('monitor'),
  cardBodyCheck,
  fontControlCheck,
  hubTypeCheck('laptop'),
  hubTypeCheck('monitor'),
  depthPageCheck,
  depthLinksCheck,
  depthEntryCheck,
  compactKeptCheck,
  linkCheck('reading-type:laptop:card-depth:link-hidden-beside-column', 'laptop', 'card-depth', false),
  linkCheck('reading-type:monitor:card-depth:link-hidden-beside-column', 'monitor', 'card-depth', false),
  linkCheck('reading-type:laptop:start:epigraph-link-hidden-beside-column', 'laptop', 'start', false),
  linkCheck('reading-type:laptop:hub:background-link-hidden-beside-column', 'laptop', 'hub', false),
  linkCheck('reading-type:two-col:card-depth:link-shown', 'two-col', 'card-depth', true),
  linkCheck('reading-type:two-col:start:epigraph-link-shown', 'two-col', 'start', true),
  linkCheck('reading-type:two-col:hub:background-link-shown', 'two-col', 'hub', true),
  linkCheck('reading-type:narrow:card-depth:link-shown', 'narrow', 'card-depth', true),
  linkCheck('reading-type:phone:card-depth:link-shown', 'phone', 'card-depth', true),
  linkReturnsCheck,
  cardTitleCheck,
  epigraphTitleCheck,
  libraryHeadingCheck,
  beginFitsCheck,
  noOverflowCheck('two-col', 'hub'),
  noOverflowCheck('narrow', 'card-depth'),
  noOverflowCheck('phone', 'start'),
  noOverflowCheck('phone', 'hub'),
];
