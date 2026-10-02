'use strict';

import { gte, lte } from '../lib/assert.mjs';
import { evaluate } from '../lib/driver.mjs';

// Checks for the depth column's resting views during play (on a later
// month's hub, where no page depth has taken the column): Die Zeit is the
// default view in historical mode (masthead, dateline, and at least one entry
// at the 1928 start, no overflow, a strip offering Polls, Die Zeit, and the
// Library); Polls is the default otherwise and can be picked in historical
// mode; before the game starts the column stays empty.

function timesCheck(viewport) {
  return {
    name: `depth-column:times:${viewport}`,
    viewport,
    state: 'hub-historical',
    selectors: [
      '#depth_column',
      '#depth-bar .dc-strip [aria-current]',
      '#depth_column .dc-times-mast',
      '#depth_column .dc-times-dateline',
      '#depth_column .dc-times-entry',
      '#depth_column .dc-times-headline',
    ],
    test(m) {
      const [depth] = m.elements['#depth_column'];
      const [mast] = m.elements['#depth_column .dc-times-mast'];
      const [dateline] = m.elements['#depth_column .dc-times-dateline'];
      const entries = m.elements['#depth_column .dc-times-entry'];
      if (!depth) return '#depth_column not found';
      const problems = [];

      const [active] = m.elements['#depth-bar .dc-strip [aria-current]'];
      if (!active || active.text !== 'Die Zeit') problems.push(`current view "${active ? active.text : ''}", expected "Die Zeit"`);
      if (active && !active.disabled) problems.push('the current view is still clickable');
      if (!mast || mast.text !== 'Die Zeit') problems.push('masthead "Die Zeit" missing');
      if (!dateline || dateline.text.toLowerCase() !== 'january 1928') {
        problems.push(`dateline "${dateline ? dateline.text : ''}", expected "January 1928"`);
      }
      if (entries.length < 1) problems.push('no entries at the 1928 start');

      for (const el of [mast, ...entries, ...m.elements['#depth_column .dc-times-headline']]) {
        if (!el) continue;
        if (!gte(el.rect.left, depth.rect.left) || !lte(el.rect.right, depth.rect.right)) {
          problems.push(`"${el.text.slice(0, 30)}" spills out of the depth column (${el.rect.left}-${el.rect.right} vs ${depth.rect.left}-${depth.rect.right})`);
        }
      }
      if (m.scrollWidth > m.clientWidth) {
        problems.push(`horizontal overflow: scrollWidth ${m.scrollWidth} > clientWidth ${m.clientWidth}`);
      }
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

// Historical mode, switched to Polls: the strip marks Polls, the body is the
// single "Support for the Republic" meter with a band word, and nothing of Die
// Zeit or the group bars is left.
const pollsHistoricalCheck = {
  name: 'depth-column:polls-historical:laptop',
  viewport: 'laptop',
  state: 'hub-historical-polls',
  selectors: [
    '#depth_column',
    '#depth-bar .dc-strip [aria-current]',
    '#depth-bar .dc-strip [data-dc-pick]',
    '#depth_column .dc-meter',
    '#depth_column .dc-meter-word',
    '#depth_column .dc-times-mast',
    '#depth_column .dc-stack',
  ],
  test(m) {
    const [depth] = m.elements['#depth_column'];
    const [active] = m.elements['#depth-bar .dc-strip [aria-current]'];
    const [meter] = m.elements['#depth_column .dc-meter'];
    const [word] = m.elements['#depth_column .dc-meter-word'];
    if (!depth) return '#depth_column not found';
    const problems = [];
    const picks = m.elements['#depth-bar .dc-strip [data-dc-pick]'].map((b) => b.text).join('|');
    if (picks !== 'Polls|Die Zeit|Library') problems.push(`strip offers "${picks}", expected Polls|Die Zeit|Library`);
    if (!active || active.text !== 'Polls') problems.push(`current view "${active ? active.text : ''}", expected "Polls"`);
    if (!/Support for the Republic/.test(depth.text)) problems.push('"Support for the Republic" missing');
    if (!meter || !word || !/^[a-z ]+$/.test(word.text)) problems.push('meter or its band word missing');
    if (m.elements['#depth_column .dc-times-mast'].length > 0) problems.push('Die Zeit still shown beside Polls');
    if (m.elements['#depth_column .dc-stack'].length > 0) problems.push('group bars shown in historical mode');
    if (meter && (meter.rect.left < depth.rect.left || meter.rect.right > depth.rect.right)) {
      problems.push('meter spills out of the depth column');
    }
    if (m.scrollWidth > m.clientWidth) problems.push(`horizontal overflow: ${m.scrollWidth} > ${m.clientWidth}`);
    return problems.length === 0 ? true : problems.join('; ');
  },
};

// Normal mode: Polls is the resting view, and Die Zeit is not offered. The
// strip has Polls and the Library; the body has "By group" and six bars, all
// inside the column.
function pollsNormalCheck(viewport) {
  return {
    name: `depth-column:polls-normal:${viewport}`,
    viewport,
    state: 'hub-month',
    selectors: [
      '#depth_column',
      '#depth-bar .dc-strip [data-dc-pick]',
      '#depth-bar .dc-strip [aria-current]',
      '#depth_column .dc-stack',
      '#depth_column .dc-sub',
    ],
    test(m) {
      const [depth] = m.elements['#depth_column'];
      const [active] = m.elements['#depth-bar .dc-strip [aria-current]'];
      const stacks = m.elements['#depth_column .dc-stack'];
      if (!depth) return '#depth_column not found';
      const problems = [];
      const picks = m.elements['#depth-bar .dc-strip [data-dc-pick]'].map((b) => b.text).join('|');
      if (picks !== 'Polls|Library') problems.push(`strip offers "${picks}", expected Polls|Library`);
      if (!active || active.text !== 'Polls') problems.push(`current view "${active ? active.text : ''}", expected "Polls"`);
      if (!/By group/.test(depth.text)) problems.push('"By group" missing');
      if (stacks.length !== 6) problems.push(`${stacks.length} group bars, expected 6`);
      for (const el of stacks) {
        if (!gte(el.rect.left, depth.rect.left) || !lte(el.rect.right, depth.rect.right)) {
          problems.push('a group bar spills out of the depth column');
          break;
        }
        if (el.rect.width < 200) {
          problems.push(`group bar only ${el.rect.width}px wide`);
          break;
        }
      }
      if (m.scrollWidth > m.clientWidth) problems.push(`horizontal overflow: ${m.scrollWidth} > ${m.clientWidth}`);
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

// The strip switches between the resting views, and each pick leaves Back
// with nowhere to go.
const SWITCH_VIEWS = `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const col = document.getElementById('depth_column');
  const bar = document.getElementById('depth-bar');
  const snap = () => ({
    current: (bar.querySelector('.dc-strip [aria-current]') || {}).textContent || '',
    backDisabled: !!(bar.querySelector('[data-dc-back]') || {}).disabled,
    picks: Array.from(bar.querySelectorAll('.dc-strip [data-dc-pick]')).map((b) => b.textContent).join('|'),
    times: !!col.querySelector('.dc-times-mast'),
    polls: !!col.querySelector('.dc-polls'),
    menu: col.querySelectorAll('.dc-menu li').length,
  });
  const pick = async (kind) => { bar.querySelector('[data-dc-pick="' + kind + '"]').click(); await wait(150); return snap(); };
  const out = { start: snap() };
  out.polls = await pick('polls');
  out.library = await pick('library');
  out.times = await pick('times');
  // An entry opened over Die Zeit gives Back something to do; a pick forgets it.
  window.DepthColumn.show({ kind: 'entry', key: 'opposition', title: 'Opposition' });
  await wait(150);
  out.entry = snap();
  out.afterPick = await pick('polls');
  return out;
})()`;

const switchCheck = {
  name: 'depth-column:strip-switches-views:monitor',
  viewport: 'monitor',
  state: 'hub-historical',
  selectors: [],
  act: (page) => evaluate(page, SWITCH_VIEWS),
  test(m) {
    const r = m.acted;
    const problems = [];
    const expect = (label, got, want) => { if (got !== want) problems.push(`${label}: ${got}, expected ${want}`); };
    expect('start current', r.start.current, 'Die Zeit');
    expect('start Back disabled', r.start.backDisabled, true);
    expect('strip offers', r.start.picks, 'Polls|Die Zeit|Library');
    expect('Polls current', r.polls.current, 'Polls');
    expect('Polls body', r.polls.polls, true);
    expect('Polls: Die Zeit gone', r.polls.times, false);
    expect('Polls Back disabled', r.polls.backDisabled, true);
    expect('Library current', r.library.current, 'Library');
    expect('Library menu items', r.library.menu > 0, true);
    expect('Library Back disabled', r.library.backDisabled, true);
    expect('Die Zeit current', r.times.current, 'Die Zeit');
    expect('Die Zeit body', r.times.times, true);
    expect('Die Zeit Back disabled', r.times.backDisabled, true);
    expect('entry: no view marked current', r.entry.current, '');
    expect('entry: Back enabled', r.entry.backDisabled, false);
    expect('after a pick, Back disabled', r.afterPick.backDisabled, true);
    return problems.length === 0 ? true : problems.join('; ');
  },
};

// Before a game starts the depth column holds nothing: no strip, no polls.
const preGameEmptyCheck = {
  name: 'depth-column:pre-game-stays-empty:monitor',
  viewport: 'monitor',
  state: 'title',
  selectors: ['#depth_column'],
  test(m) {
    const [depth] = m.elements['#depth_column'];
    if (!depth) return '#depth_column not found';
    return depth.text === '' ? true : `#depth_column holds "${depth.text.slice(0, 40)}" before the game starts`;
  },
};

export default [
  ...['monitor', 'laptop'].map(timesCheck),
  pollsHistoricalCheck,
  ...['monitor', 'laptop'].map(pollsNormalCheck),
  switchCheck,
  preGameEmptyCheck,
];
