'use strict';

import { evaluate, hasSelector, waitForCondition } from '../lib/driver.mjs';

// Headless Chrome refuses the scene's music; not a layout failure.
const AUDIO_AUTOPLAY_BLOCK = /NotAllowedError.*play\(\)/s;
const errorsOf = (m) => m.consoleErrors.filter((e) => !AUDIO_AUTOPLAY_BLOCK.test(e));

// The presidential vote readouts: the scenes' "Name - NN%" lines become the
// result rows through the same placeholder as the Reichstag results. One row
// per candidate standing, the player's candidate marked, a tick at 50 on a
// first round's bars, the word "majority" on a first-round winner, nothing
// reaching past the text width.

const SELECTORS = ['#content', '#content .result-rows .rr'];

// Measured in the page, for the last readout on it (a second round's page
// keeps the first round's above it).
async function survey(page) {
  return evaluate(page, `(() => {
    const content = document.getElementById('content');
    const cs = getComputedStyle(content);
    const right = content.getBoundingClientRect().right - parseFloat(cs.paddingRight);
    const over = [];
    for (const el of content.querySelectorAll('*')) {
      if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > right + 1) {
        over.push(el.tagName.toLowerCase() + '.' + (el.getAttribute('class') || '') + ' ' + Math.round(r.right) + '>' + Math.round(right));
      }
    }
    const holes = content.querySelectorAll('.result-rows');
    const hole = holes[holes.length - 1];
    const rows = Array.from(hole.querySelectorAll('.rr-row')).map((row) => {
      const bar = row.querySelector('.rr-bar').getBoundingClientRect();
      const mark = row.querySelector('.rr-mark');
      const tag = row.querySelector('.rr-tag');
      return {
        label: row.querySelector('.rr-name').textContent.trim(),
        share: parseFloat(row.querySelector('.rr-share').textContent),
        tagName: row.tagName.toLowerCase(),
        entry: row.getAttribute('data-depth-entry') || '',
        player: row.classList.contains('player'),
        hasBadge: !!row.querySelector('.rr-badge .sc-badge'),
        mark: mark ? (mark.getBoundingClientRect().left - bar.left) / bar.width : null,
        tag: tag ? tag.textContent.trim() : '',
      };
    });
    return {
      over, rows,
      holes: holes.length,
      filled: Array.from(holes).map((n) => n.getAttribute('data-results-filled')),
      name: hole.getAttribute('data-results'),
      head: hole.querySelector('.rr-head').textContent,
      choices: content.querySelectorAll('a').length,
      text: content.textContent,
    };
  })()`);
}

function fits(state, viewport) {
  return {
    name: `vote-readouts:${state}:${viewport}:fits-the-column`,
    viewport,
    state,
    selectors: SELECTORS,
    act: survey,
    test(m) {
      const s = m.acted;
      const problems = [];
      if (m.scrollWidth > m.clientWidth + 1) problems.push(`horizontal overflow: ${m.scrollWidth} > ${m.clientWidth}`);
      if (s.over.length) problems.push(`wider than the text width: ${s.over.slice(0, 4).join('; ')}`);
      if (!s.filled.every((f) => f === 'rows')) problems.push(`placeholder state is ${JSON.stringify(s.filled)}, expected rows`);
      if (/Hindenburg - [\d.]+%/.test(s.text) || /Hitler - [\d.]+%/.test(s.text)) problems.push('the "Name - NN%" lines are still on the page');
      if (/Change \(pts\)/.test(s.head)) problems.push('the readout has a change column');
      if (errorsOf(m).length) problems.push(`console errors: ${errorsOf(m).join(' | ')}`);
      return problems.length ? problems.join('; ') : true;
    },
  };
}

// Every bar carries the tick, at the bar's midpoint (the scale is 0-100).
function ticksOk(rows) {
  return rows.every((r) => r.mark !== null && Math.abs(r.mark - 0.5) < 0.02);
}

const round1 = {
  name: 'vote-readouts:1932-round1:laptop:rows-and-tick',
  viewport: 'laptop',
  state: 'vote-1932-round1',
  selectors: SELECTORS,
  act: survey,
  test(m) {
    const s = m.acted;
    const problems = [];
    const labels = s.rows.map((r) => r.label);
    if (s.name !== 'president-round1') problems.push(`placeholder is ${s.name}`);
    if (labels.join() !== 'Hindenburg,Hitler,Thälmann,Braun') problems.push(`rows are ${labels.join()}`);
    const [h] = s.rows;
    if (h && (h.tagName !== 'div' || h.entry || h.hasBadge)) problems.push('Hindenburg has a badge or opens an entry');
    const entries = s.rows.slice(1).map((r) => r.entry);
    if (entries.join() !== 'party:nsdap,party:kpd,party:spd') problems.push(`entries are ${entries.join()}`);
    const players = s.rows.filter((r) => r.player).map((r) => r.label);
    if (players.join() !== 'Braun') problems.push(`player rows are ${JSON.stringify(players)}`);
    if (!ticksOk(s.rows)) problems.push(`the 50 tick is off: ${s.rows.map((r) => r.mark && r.mark.toFixed(2)).join()}`);
    if (s.rows.some((r) => r.tag)) problems.push('a majority word on a vote with no majority');
    if (errorsOf(m).length) problems.push(`console errors: ${errorsOf(m).join(' | ')}`);
    return problems.length ? problems.join('; ') : true;
  },
};

const majority = {
  name: 'vote-readouts:1932-majority:laptop:majority-word',
  viewport: 'laptop',
  state: 'vote-1932-majority',
  selectors: SELECTORS,
  act: survey,
  test(m) {
    const s = m.acted;
    const problems = [];
    const tagged = s.rows.filter((r) => r.tag);
    if (tagged.length !== 1) problems.push(`${tagged.length} rows carry a majority word`);
    else {
      if (tagged[0].tag !== 'majority') problems.push(`the word is "${tagged[0].tag}"`);
      if (!(tagged[0].share >= 50)) problems.push(`the tagged row has ${tagged[0].share}%`);
    }
    if (s.rows.some((r) => !r.tag && r.share >= 50)) problems.push('a row over 50% has no word');
    if (!ticksOk(s.rows)) problems.push('the 50 tick is off');
    if (errorsOf(m).length) problems.push(`console errors: ${errorsOf(m).join(' | ')}`);
    return problems.length ? problems.join('; ') : true;
  },
};

const round2 = {
  name: 'vote-readouts:1932-round2:laptop:no-tick',
  viewport: 'laptop',
  state: 'vote-1932-round2',
  selectors: SELECTORS,
  act: survey,
  test(m) {
    const s = m.acted;
    const problems = [];
    if (s.name !== 'president-round2') problems.push(`placeholder is ${s.name}`);
    if (s.rows.some((r) => r.mark !== null || r.tag)) problems.push('a second round has a tick or a majority word');
    if (!s.rows.length) problems.push('no rows');
    if (errorsOf(m).length) problems.push(`console errors: ${errorsOf(m).join(' | ')}`);
    return problems.length ? problems.join('; ') : true;
  },
};

const y1934round2 = {
  name: 'vote-readouts:1934-round2:laptop:no-tick',
  viewport: 'laptop',
  state: 'vote-1934-round2',
  selectors: SELECTORS,
  act: survey,
  test(m) {
    const s = m.acted;
    const problems = [];
    if (s.name !== 'president-1934-round2') problems.push(`placeholder is ${s.name}`);
    if (s.holes !== 2 || s.filled.some((f) => f !== 'rows')) problems.push(`readouts are ${JSON.stringify(s.filled)}`);
    if (s.rows.some((r) => r.mark !== null || r.tag)) problems.push('a second round has a tick or a majority word');
    if (s.rows.length < 2) problems.push('too few rows');
    if (errorsOf(m).length) problems.push(`console errors: ${errorsOf(m).join(' | ')}`);
    return problems.length ? problems.join('; ') : true;
  },
};

const y1934 = {
  name: 'vote-readouts:1934-round1:laptop:rows-and-tick',
  viewport: 'laptop',
  state: 'vote-1934-round1',
  selectors: SELECTORS,
  act: survey,
  test(m) {
    const s = m.acted;
    const problems = [];
    const labels = s.rows.map((r) => r.label);
    if (s.name !== 'president-1934-round1') problems.push(`placeholder is ${s.name}`);
    for (const want of ['Hitler', 'Seldte', 'Thälmann', 'Adenauer', 'Braun']) {
      if (!labels.includes(want)) problems.push(`no row for ${want} (${labels.join()})`);
    }
    const braun = s.rows.find((r) => r.label === 'Braun');
    if (braun && (!braun.player || braun.entry !== 'party:spd')) problems.push('Braun is not the player\'s SPD row');
    if (s.rows.filter((r) => r.player).length !== 1) problems.push('not exactly one player row');
    if (!ticksOk(s.rows)) problems.push('the 50 tick is off');
    if (errorsOf(m).length) problems.push(`console errors: ${errorsOf(m).join(' | ')}`);
    return problems.length ? problems.join('; ') : true;
  },
};

const clickCheck = {
  name: 'vote-readouts:1932-round1:laptop:braun-row-opens-spd-entry',
  viewport: 'laptop',
  state: 'vote-1932-round1',
  selectors: ['#depth_column'],
  act: async (page) => {
    await evaluate(page, `(() => {
      document.querySelector('#content [data-depth-entry="party:spd"]').click();
      return true;
    })()`);
    await waitForCondition(() => hasSelector(page, '#depth_column[data-view="entry"] .dc-body p'), { timeoutMs: 3000 }).catch(() => {});
    return evaluate(page, `(() => {
      const col = document.getElementById('depth_column');
      const body = col && col.querySelector('.dc-body');
      return { view: col && col.getAttribute('data-view'), entry: !!body, text: body ? body.textContent.slice(0, 200) : '' };
    })()`);
  },
  test(m) {
    const a = m.acted;
    if (!a.entry) return `no entry opened in the depth column (view ${a.view})`;
    if (!/SPD|Social Democrat/i.test(a.text)) return `the entry reads "${a.text}", expected the SPD's`;
    return true;
  },
};

export default [
  fits('vote-1932-round1', 'laptop'),
  fits('vote-1932-round1', 'monitor'),
  fits('vote-1932-round1', 'narrow'),
  fits('vote-1932-round1', 'phone'),
  fits('vote-1932-majority', 'laptop'),
  fits('vote-1934-round1', 'laptop'),
  fits('vote-1934-round1', 'phone'),
  round1,
  majority,
  round2,
  y1934,
  y1934round2,
  clickCheck,
];
