'use strict';

import { evaluate } from '../lib/driver.mjs';

// The browser blocks audio autoplay before any gesture; expected everywhere.
const AUDIO_AUTOPLAY_BLOCK = /NotAllowedError.*play()/s;
const realErrors = (m) => m.consoleErrors.filter((e) => !AUDIO_AUTOPLAY_BLOCK.test(e));

// Checks for the Entry view (out/html/depth-column/entries.js): a click on a
// party name in the state column's ledger, or on any [data-depth-term] span,
// opens an entry in the depth column, and Back returns. These need clicks
// and hovers, so each check drives the page in act() and reads the result
// in test().

// Parties with no "Current relations" line in the Library: us, and the
// catch-all.
const NO_RELATIONS = ['spd', 'other'];

// Runs in the page. Clicks each ledger party name, then Back, and records
// what the column showed.
const OPEN_EACH_PARTY = `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const col = document.getElementById('depth_column');
  const bar = document.getElementById('depth-bar');
  const snap = () => ({
    kind: (col.querySelector('.dc-kind') || {}).textContent || '',
    title: (col.querySelector('.dc-title') || {}).textContent || '',
    body: (col.querySelector('.dc-body') || {}).textContent || '',
    written: ((col.querySelector('.dc-body .dc-entry-text') || {}).textContent || '').trim().length > 0,
    footer: (col.querySelector('.dc-body [data-dc-entry-library]') || {}).textContent || '',
    current: (bar.querySelector('.dc-strip [aria-current]') || {}).textContent || '',
  });
  const ids = Array.from(document.querySelectorAll('[data-sc-party]')).map((row) => row.getAttribute('data-sc-party'));
  const out = [];
  for (const id of ids) {
    // The state column redraws when an entry opens, so find the row afresh.
    document.querySelector('[data-sc-party="' + id + '"] .nm').click();
    await wait(150);
    const opened = snap();
    const backButton = bar.querySelector('[data-dc-back]');
    const backEnabled = !!backButton && !backButton.disabled;
    if (backButton) backButton.click();
    await wait(50);
    out.push({ id, opened, backEnabled, after: snap() });
  }
  return out;
})()`;

const partiesOpenCheck = {
  name: 'entries:hub:monitor:party-names-open-entries',
  viewport: 'monitor',
  state: 'hub-month',
  selectors: [],
  act: (page) => evaluate(page, OPEN_EACH_PARTY),
  test(m) {
    const rows = m.acted;
    if (!rows || rows.length === 0) return 'no [data-sc-party] rows found';
    const problems = [];
    for (const { id, opened, backEnabled, after } of rows) {
      const label = id.toUpperCase();
      if (opened.kind !== 'Entry') problems.push(`${id}: kind label "${opened.kind}", expected Entry`);
      if (!opened.body.trim()) problems.push(`${id}: empty body`);
      if (id !== 'other' && !opened.body.includes(label)) problems.push(`${id}: body lacks its label ${label}`);
      if (!NO_RELATIONS.includes(id) && !opened.body.includes('Current relations')) {
        problems.push(`${id}: body lacks its "Current relations" line`);
      }
      if (opened.footer !== 'Parties') problems.push(`${id}: footer link "${opened.footer}", expected Parties`);
      if (!backEnabled) problems.push(`${id}: Back is disabled on the entry`);
      if (after.current !== 'Polls') problems.push(`${id}: Back showed "${after.current}", expected the resting view Polls`);
    }
    // Only one party's paragraph per entry.
    const z = rows.find((r) => r.id === 'z');
    if (z && /\bDVP\b - /.test(z.opened.body)) problems.push('z: entry carries another party\'s paragraph');
    if (realErrors(m).length > 0) problems.push(`console errors: ${realErrors(m).join(' | ')}`);
    return problems.length === 0 ? true : problems.join('; ');
  },
};

// A [data-depth-term] span added by hand opens its slug's entry: its title,
// its written text, and the Library pointer when the record has one. A slug
// with no record takes the span's text as its title and has no pointer.
const OPEN_TERMS = `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const col = document.getElementById('depth_column');
  const snap = () => ({
    kind: (col.querySelector('.dc-kind') || {}).textContent || '',
    title: (col.querySelector('.dc-title') || {}).textContent || '',
    body: (col.querySelector('.dc-body') || {}).textContent || '',
    written: ((col.querySelector('.dc-body .dc-entry-text') || {}).textContent || '').trim().length > 0,
    footer: (col.querySelector('.dc-body [data-dc-entry-library]') || {}).textContent || '',
  });
  const host = document.getElementById('content');
  const out = {};
  for (const [slug, text] of [['opposition', 'opposition'], ['party-resources', 'Party resources'], ['no-such-slug', 'Some Word']]) {
    const span = document.createElement('span');
    span.setAttribute('data-depth-term', slug);
    span.textContent = text;
    host.appendChild(span);
    span.click();
    await wait(200);
    out[slug] = snap();
    span.remove();
  }
  // Footer link opens the Library view for that section.
  const span = document.createElement('span');
  span.setAttribute('data-depth-term', 'factions');
  span.textContent = 'Factions';
  host.appendChild(span);
  span.click();
  await wait(200);
  const link = col.querySelector('[data-dc-entry-library]');
  if (link) link.click();
  await wait(100);
  const view = window.DepthColumn.view();
  out.footerLink = { kind: view.kind, key: view.key, title: view.title };
  span.remove();
  return out;
})()`;

const termsOpenCheck = {
  name: 'entries:hub:monitor:depth-terms-open-entries',
  viewport: 'monitor',
  state: 'hub',
  selectors: [],
  act: (page) => evaluate(page, OPEN_TERMS),
  test(m) {
    const r = m.acted;
    const problems = [];
    const opp = r.opposition;
    if (opp.kind !== 'Entry') problems.push(`opposition: kind "${opp.kind}", expected Entry`);
    if (opp.title !== 'Opposition') problems.push(`opposition: title "${opp.title}", expected Opposition`);
    if (!opp.written) problems.push('opposition: the entry has no text');
    if (!opp.footer) problems.push('opposition: no Library pointer');
    const res = r['party-resources'];
    if (res.title !== 'Party resources') problems.push(`party-resources: title "${res.title}"`);
    if (!res.written) problems.push('party-resources: the entry has no text');
    if (res.footer) problems.push('party-resources: has a Library pointer, expected none');
    const unknown = r['no-such-slug'];
    if (unknown.title !== 'Some Word') problems.push(`unknown slug: title "${unknown.title}", expected the span's text`);
    if (unknown.footer) problems.push('unknown slug: has a Library pointer');
    const f = r.footerLink;
    if (f.kind !== 'library' || f.key !== 'library.factions') problems.push(`footer link opened ${f.kind}:${f.key}, expected library:library.factions`);
    if (f.title !== 'Internal factions') problems.push(`footer link title "${f.title}", expected the menu label "Internal factions"`);
    if (realErrors(m).length > 0) problems.push(`console errors: ${realErrors(m).join(' | ')}`);
    return problems.length === 0 ? true : problems.join('; ');
  },
};

// The Party tab's own terms open entries: a click on a term's span in the
// tab opens an entry with that title, and Back returns to the view underneath
// (on the game's first hub that is the page's Background; on a later month's
// hub it is the resting Polls). The tab's spans today are "Party resources"
// and "Factions". ("Coalition", while the SPD governs, is on the State tab;
// coalitionTermCheck below covers it.) The position words
// (Opposition, Toleration, Government, Caretaker) sit in the Reichstag block's
// government line instead; positionWordCheck below covers them.
// [slug, the span's text, the entry's title]. The table's header row reads
// "Faction"; its entry is "Factions".
const PARTY_TAB_TERMS = [['party-resources', 'Party resources', 'Party resources'], ['factions', 'Faction', 'Factions']];

const OPEN_PARTY_TAB_TERMS = `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const col = document.getElementById('depth_column');
  const bar = document.getElementById('depth-bar');
  const snap = () => ({
    kind: (col.querySelector('.dc-kind') || {}).textContent || '',
    title: (col.querySelector('.dc-title') || {}).textContent || '',
    body: (col.querySelector('.dc-body') || {}).textContent || '',
    written: ((col.querySelector('.dc-body .dc-entry-text') || {}).textContent || '').trim().length > 0,
    current: (bar.querySelector('.dc-strip [aria-current]') || {}).textContent || '',
    view: window.DepthColumn.view().kind + ':' + window.DepthColumn.view().key,
  });
  const out = {};
  for (const [slug] of ${JSON.stringify(PARTY_TAB_TERMS)}) {
    const span = document.querySelector('#state-column [data-depth-term="' + slug + '"]');
    if (!span) { out[slug] = { missing: true }; continue; }
    const before = snap();
    span.click();
    await wait(250);
    const opened = snap();
    const back = bar.querySelector('[data-dc-back]');
    if (back) back.click();
    await wait(100);
    out[slug] = { before, opened, after: snap(), spanText: span.textContent };
  }
  return out;
})()`;

function partyTabTermCheck(name, state, expectResting) {
  return {
    name,
    viewport: 'monitor',
    state,
    selectors: [],
    act: (page) => evaluate(page, OPEN_PARTY_TAB_TERMS),
    test(m) {
      const problems = [];
      for (const [slug, text, title] of PARTY_TAB_TERMS) {
        const r = m.acted[slug];
        if (r.missing) {
          problems.push(`${slug}: no span in the Party tab`);
          continue;
        }
        if (r.spanText.trim() !== text) problems.push(`${slug}: span reads "${r.spanText}", expected ${text}`);
        if (r.opened.kind !== 'Entry') problems.push(`${slug}: kind label "${r.opened.kind}", expected Entry`);
        if (r.opened.title !== title) problems.push(`${slug}: title "${r.opened.title}", expected ${title}`);
        if (!r.opened.written) problems.push(`${slug}: the entry has no text`);
        if (r.after.view !== r.before.view) problems.push(`${slug}: Back showed ${r.after.view}, expected ${r.before.view}`);
        if (expectResting && r.after.current !== 'Polls') problems.push(`${slug}: Back showed "${r.after.current}" as current, expected Polls`);
      }
      if (realErrors(m).length > 0) problems.push(`console errors: ${realErrors(m).join(' | ')}`);
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

const partyTabTermCheckHub = partyTabTermCheck('entries:hub:monitor:party-tab-term-opens-entry', 'hub', false);
const partyTabTermCheckMonth = partyTabTermCheck('entries:hub-month:monitor:party-tab-term-back-to-polls', 'hub-month', true);

// The position word in the government line opens its entry, and the click
// stays out of the chart's own handler; a click elsewhere on the chart still
// opens the Library. Each step re-finds its element, since the state column
// redraws when the depth column's view changes.
const OPEN_POSITION_WORD = `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const col = document.getElementById('depth_column');
  const bar = document.getElementById('depth-bar');
  const view = () => { const v = window.DepthColumn.view(); return v.kind + ':' + v.key; };
  const snap = () => ({
    kind: (col.querySelector('.dc-kind') || {}).textContent || '',
    title: (col.querySelector('.dc-title') || {}).textContent || '',
    body: (col.querySelector('.dc-body') || {}).textContent || '',
    written: ((col.querySelector('.dc-body .dc-entry-text') || {}).textContent || '').trim().length > 0,
    current: (bar.querySelector('.dc-strip [aria-current]') || {}).textContent || '',
    view: view(),
  });
  const word = document.querySelector('#state-column [data-sc-chart] .sc-govlbl [data-depth-term]');
  if (!word) return { missing: true };
  const before = snap();
  const slug = word.getAttribute('data-depth-term');
  const spanText = word.textContent;
  word.click();
  await wait(250);
  const opened = snap();
  const back = bar.querySelector('[data-dc-back]');
  if (back) back.click();
  await wait(100);
  const after = snap();
  // The chart's own click, on the hemicycle, opens the Reichstag entry.
  document.querySelector('#state-column [data-sc-chart] .sc-hemi').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await wait(250);
  return { slug, spanText, before, opened, after, chartClick: snap() };
})()`;

function positionWordCheck(name, state, expected, expectResting) {
  return {
    name,
    viewport: 'monitor',
    state,
    selectors: [],
    act: (page) => evaluate(page, OPEN_POSITION_WORD),
    test(m) {
      const r = m.acted;
      if (r.missing) return 'no data-depth-term span in the government line';
      const problems = [];
      if (r.slug !== expected.slug) problems.push(`slug "${r.slug}", expected ${expected.slug}`);
      if (r.spanText.trim() !== expected.title) problems.push(`span reads "${r.spanText}", expected ${expected.title}`);
      if (r.opened.kind !== 'Entry') problems.push(`kind label "${r.opened.kind}", expected Entry (did the chart's click take it?)`);
      if (r.opened.title !== expected.title) problems.push(`title "${r.opened.title}", expected ${expected.title}`);
      if (r.opened.view !== 'entry:' + expected.slug) problems.push(`opened ${r.opened.view}, expected entry:${expected.slug}`);
      if (!r.opened.written) problems.push('the entry has no text');
      if (r.after.view !== r.before.view) problems.push(`Back showed ${r.after.view}, expected ${r.before.view}`);
      if (expectResting && r.after.current !== 'Polls') problems.push(`Back showed "${r.after.current}" as current, expected Polls`);
      if (r.chartClick.view !== 'entry:reichstag:seats') problems.push(`a click on the hemicycle showed ${r.chartClick.view}, expected the Reichstag entry`);
      if (realErrors(m).length > 0) problems.push(`console errors: ${realErrors(m).join(' | ')}`);
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

const positionWordOpposition = positionWordCheck(
  'entries:hub-month:monitor:position-word-opens-entry', 'hub-month', { slug: 'opposition', title: 'Opposition' }, true);
const positionWordGovernment = positionWordCheck(
  'entries:hub-government:monitor:position-word-opens-entry', 'hub-government', { slug: 'government', title: 'Government' }, false);

// The dissent block in the State tab (SPD in government) opens its entry. The
// block is a button, so its own text is more than the entry's title: the
// title comes from the entry's record.
const OPEN_COALITION_TERM = `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const col = document.getElementById('depth_column');
  const bar = document.getElementById('depth-bar');
  const view = () => { const v = window.DepthColumn.view(); return v.kind + ':' + v.key; };
  document.querySelector('#state-column [data-sc-tab="state"]').click();
  await wait(100);
  const block = document.querySelector('#state-column .sc-cd[data-depth-entry="coalition-dissent"]');
  if (!block) return { missing: true };
  const before = view();
  block.click();
  await wait(250);
  const opened = {
    kind: (col.querySelector('.dc-kind') || {}).textContent || '',
    title: (col.querySelector('.dc-title') || {}).textContent || '',
    body: (col.querySelector('.dc-body') || {}).textContent || '',
    written: ((col.querySelector('.dc-body .dc-entry-text') || {}).textContent || '').trim().length > 0,
    footer: (col.querySelector('.dc-body [data-dc-entry-library]') || {}).textContent || '',
    view: view(),
  };
  const back = bar.querySelector('[data-dc-back]');
  if (back) back.click();
  await wait(100);
  return { blockTag: block.tagName, before, opened, after: view(),
    oldRow: !!document.querySelector('#state-column .sc-pips, #state-column [data-depth-term="coalition-dissent"]') };
})()`;

const coalitionTermCheck = {
  name: 'entries:hub-government:monitor:coalition-block-opens-entry',
  viewport: 'monitor',
  state: 'hub-government',
  selectors: [],
  act: (page) => evaluate(page, OPEN_COALITION_TERM),
  test(m) {
    const r = m.acted;
    if (r.missing) return 'no coalition dissent block in the State tab';
    const problems = [];
    if (r.blockTag !== 'BUTTON') problems.push(`the block is a ${r.blockTag}, expected a button`);
    if (r.opened.kind !== 'Entry') problems.push(`kind label "${r.opened.kind}", expected Entry`);
    if (r.opened.title !== 'Coalition dissent') problems.push(`title "${r.opened.title}", expected Coalition dissent`);
    if (r.opened.view !== 'entry:coalition-dissent') problems.push(`opened ${r.opened.view}`);
    if (!r.opened.body.includes('vote of no confidence')) problems.push('entry does not mention the vote of no confidence');
    if (r.opened.footer !== 'Current government details') problems.push(`pointer "${r.opened.footer}"`);
    if (r.after !== r.before) problems.push(`Back showed ${r.after}, expected ${r.before}`);
    if (r.oldRow) problems.push('the pip row or its term link is still there');
    if (realErrors(m).length > 0) problems.push(`console errors: ${realErrors(m).join(' | ')}`);
    return problems.length === 0 ? true : problems.join('; ');
  },
};

// Every Party-tab term has a written entry: at most two paragraphs, plain
// <p> and <em> markup, and the pointer that entries.json names.
const TERMS = {
  opposition: 'Opposition',
  toleration: 'Toleration',
  government: 'Government',
  caretaker: 'Caretaker',
  factions: 'Factions',
  'party-resources': 'Party resources',
  'party-dissent': 'Party dissent',
  'coalition-dissent': 'Coalition dissent',
};
const POINTERS = {
  opposition: 'Current government details',
  toleration: 'Current government details',
  government: 'Current government details',
  caretaker: 'Current government details',
  factions: 'Internal factions',
  'party-resources': '',
  'party-dissent': 'Internal factions',
  'coalition-dissent': 'Current government details',
};

const OPEN_ALL_TERMS = `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const col = document.getElementById('depth_column');
  const host = document.getElementById('content');
  const out = {};
  for (const [slug, text] of Object.entries(${JSON.stringify(TERMS)})) {
    const span = document.createElement('span');
    span.setAttribute('data-depth-term', slug);
    span.textContent = text;
    host.appendChild(span);
    span.click();
    await wait(200);
    const body = col.querySelector('.dc-body');
    const holder = body.querySelector('.dc-entry-text') || document.createElement('div');
    out[slug] = {
      title: (col.querySelector('.dc-title') || {}).textContent || '',
      paragraphs: Array.from(holder.children).map((p) => p.textContent),
      other: Array.from(holder.querySelectorAll('*')).map((e) => e.tagName).filter((t) => !['P', 'EM'].includes(t)),
      footer: (body.querySelector('[data-dc-entry-library]') || {}).textContent || '',
    };
    span.remove();
  }
  return out;
})()`;

const allTermsCheck = {
  name: 'entries:hub:monitor:every-term-has-an-entry',
  viewport: 'monitor',
  state: 'hub',
  selectors: [],
  act: (page) => evaluate(page, OPEN_ALL_TERMS),
  test(m) {
    const problems = [];
    for (const [slug, title] of Object.entries(TERMS)) {
      const e = m.acted[slug];
      if (e.title !== title) problems.push(`${slug}: title "${e.title}", expected ${title}`);
      if (e.paragraphs.length < 1 || e.paragraphs.length > 2) problems.push(`${slug}: ${e.paragraphs.length} paragraphs, expected 1 or 2`);
      if (e.paragraphs.some((p) => !p.trim())) problems.push(`${slug}: empty paragraph or no text`);
      if (e.other.length > 0) problems.push(`${slug}: markup beyond p and em (${e.other.join(',')})`);
      if (e.footer !== POINTERS[slug]) problems.push(`${slug}: pointer "${e.footer}", expected "${POINTERS[slug]}"`);
    }
    if (realErrors(m).length > 0) problems.push(`console errors: ${realErrors(m).join(' | ')}`);
    return problems.length === 0 ? true : problems.join('; ');
  },
};

// Clickable names show a pointer, and a dotted underline on hover. Hover
// never changes the column.
const HOVER = `(() => {
  const nm = document.querySelector('[data-sc-party] .nm');
  const span = document.createElement('span');
  span.setAttribute('data-depth-term', 'toleration');
  span.textContent = 'Toleration';
  span.style.cssText = 'position:fixed;left:40px;top:40px;z-index:9999';
  document.body.appendChild(span);
  const rect = (el) => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
  const style = (el) => { const s = getComputedStyle(el); return { cursor: s.cursor, line: s.textDecorationLine, style: s.textDecorationStyle }; };
  return { nm: rect(nm), span: rect(span), rest: { nm: style(nm), span: style(span) }, view: window.DepthColumn.view().kind + ':' + window.DepthColumn.view().key };
})()`;

const READ_HOVER = (which) => `(() => {
  const el = ${which === 'nm' ? "document.querySelector('[data-sc-party] .nm')" : "document.querySelector('[data-depth-term=\"toleration\"]')"};
  const s = getComputedStyle(el);
  const v = window.DepthColumn.view();
  return { cursor: s.cursor, line: s.textDecorationLine, style: s.textDecorationStyle, view: v.kind + ':' + v.key };
})()`;

const hoverCheck = {
  name: 'entries:hub:monitor:names-look-clickable',
  viewport: 'monitor',
  state: 'hub',
  selectors: [],
  async act(page) {
    const start = await evaluate(page, HOVER);
    const out = { start };
    for (const which of ['nm', 'span']) {
      const at = start[which];
      await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y });
      await new Promise((r) => setTimeout(r, 100));
      out[which] = await evaluate(page, READ_HOVER(which));
    }
    return out;
  },
  test(m) {
    const { start, nm, span } = m.acted;
    const problems = [];
    for (const [name, hovered] of [['party name', nm], ['depth term', span]]) {
      if (hovered.cursor !== 'pointer') problems.push(`${name}: cursor ${hovered.cursor}, expected pointer`);
      if (!/underline/.test(hovered.line) || hovered.style !== 'dotted') {
        problems.push(`${name}: hover decoration ${hovered.line} ${hovered.style}, expected dotted underline`);
      }
      if (hovered.view !== start.view) problems.push(`${name}: hover changed the column (${start.view} to ${hovered.view})`);
    }
    for (const [name, rest] of [['party name', start.rest.nm], ['depth term', start.rest.span]]) {
      if (/underline/.test(rest.line)) problems.push(`${name}: underlined at rest`);
    }
    return problems.length === 0 ? true : problems.join('; ');
  },
};

export default [
  partiesOpenCheck, partyTabTermCheckHub, partyTabTermCheckMonth, positionWordOpposition, positionWordGovernment,
  coalitionTermCheck, termsOpenCheck, allTermsCheck, hoverCheck,
];
