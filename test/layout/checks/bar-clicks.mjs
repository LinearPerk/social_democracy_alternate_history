'use strict';

import { evaluate, hasSelector, waitForCondition } from '../lib/driver.mjs';
import { close, gte, lte, TOLERANCE } from '../lib/assert.mjs';

// Checks for the two title bars that open entries in the depth column: a
// click on the state column's bar (#state-bar), anywhere but its Seats/Polls
// toggle, opens the Reichstag entry; a click on the date line (#date-line)
// opens that month's entry. Each also answers the keyboard: its text is a
// button, so Enter opens the same entry. Back returns to the resting view.

const AUDIO_AUTOPLAY_BLOCK = /NotAllowedError.*play()/s;
const realErrors = (m) => m.consoleErrors.filter((e) => !AUDIO_AUTOPLAY_BLOCK.test(e));

const SELECTORS = [
  '#state-bar',
  '#state-bar .sc-bar-title',
  '#date-line',
  '#date-line button',
  '#depth_column',
  '#depth_column .dc-month',
  '#depth_column .dc-month *',
];

// What the depth column shows now: the open view, its heading, which resting
// button is current, and the month entry's lead and news.
const SNAP = `(() => {
  const col = document.getElementById('depth_column');
  const v = window.DepthColumn.view();
  const text = (sel) => (col.querySelector(sel) || {}).textContent || '';
  return {
    kind: v.kind,
    key: v.key,
    title: text('.dc-title'),
    current: ((document.querySelector('#depth-bar .dc-strip [aria-current]') || {}).textContent) || '',
    lead: text('.dc-month .dc-lead'),
    records: col.querySelectorAll('.dc-month .dc-times-entry').length,
    none: col.querySelectorAll('.dc-month .dc-times-none').length,
    history: window.DepthColumn.history().length,
    chart: window.StateColumn.chart(),
    date: document.querySelector('#date-line').textContent.trim(),
  };
})()`;

const snap = (page) => evaluate(page, SNAP);

async function back(page) {
  await evaluate(page, `document.querySelector('#depth-bar [data-dc-back]').click()`);
  return snap(page);
}

// A real mouse click at a point in the page.
async function clickAt(page, x, y) {
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}

// Focuses the element, then presses a key as the keyboard would.
async function press(page, selector, key = 'Enter') {
  const focused = await evaluate(page, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    el.focus();
    return document.activeElement === el;
  })()`);
  if (!focused) return false;
  const code = key === 'Enter' ? 'Enter' : 'Space';
  const vk = key === 'Enter' ? 13 : 32;
  const text = key === 'Enter' ? '\r' : ' ';
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, text });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
  return true;
}

async function rectOf(page, selector) {
  return evaluate(page, `(() => {
    const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  })()`);
}

const settle = () => new Promise((r) => setTimeout(r, 200));

// ---- The Reichstag bar -------------------------------------------------------

const reichstagCheck = {
  name: 'bar-clicks:reichstag:laptop',
  viewport: 'laptop',
  state: 'hub-month',
  selectors: SELECTORS,
  async act(page) {
    const out = {};
    // A click on the title.
    const title = await rectOf(page, '#state-bar .sc-bar-title');
    await clickAt(page, (title.left + title.right) / 2, (title.top + title.bottom) / 2);
    await settle();
    out.title = await snap(page);
    out.titleBack = await back(page);
    // A click on the bar's bare part, left of the title.
    const bar = await rectOf(page, '#state-bar');
    await clickAt(page, bar.left + 14, (bar.top + bar.bottom) / 2);
    await settle();
    out.bare = await snap(page);
    out.bareBack = await back(page);
    // The toggle is not part of it: Polls changes the chart, opens nothing.
    const polls = await rectOf(page, '#state-bar [data-sc-chart-source="polls"]');
    await clickAt(page, (polls.left + polls.right) / 2, (polls.top + polls.bottom) / 2);
    await settle();
    out.toggle = await snap(page);
    const seats = await rectOf(page, '#state-bar [data-sc-chart-source="seats"]');
    await clickAt(page, (seats.left + seats.right) / 2, (seats.top + seats.bottom) / 2);
    await settle();
    // The keyboard: Enter on the focused title.
    out.focusable = await press(page, '#state-bar .sc-bar-title');
    await settle();
    out.enter = await snap(page);
    out.enterBack = await back(page);
    // Focus survives the bar's redraw when the title opens the entry.
    await press(page, '#state-bar .sc-bar-title');
    await settle();
    out.focusKept = await evaluate(page, `document.activeElement && document.activeElement.classList.contains('sc-bar-title')`);
    await back(page);
    return out;
  },
  test(m) {
    const a = m.acted;
    const problems = [];
    const [title] = m.elements['#state-bar .sc-bar-title'];
    const [bar] = m.elements['#state-bar'];
    if (!title) return '#state-bar .sc-bar-title not found';
    if (title.tagName !== 'button') problems.push(`the title is a ${title.tagName}, expected a button`);
    if (title.text !== 'Reichstag') problems.push(`the title reads "${title.text}"`);
    if (title.title !== 'Coalitions and the majority') problems.push(`the title's hint is "${title.title}"`);
    if (title.cursor !== 'pointer') problems.push(`the title's cursor is ${title.cursor}`);
    if (bar.cursor !== 'pointer') problems.push(`the bar's cursor is ${bar.cursor}`);
    if (title.borderStyle !== 'none' || !/Jost/.test(title.fontFamily) || title.textTransform !== 'uppercase') {
      problems.push(`the title doesn't look like bar text: border ${title.borderStyle}, ${title.fontFamily}, ${title.textTransform}`);
    }
    for (const [name, s] of [['a click on the title', a.title], ['a click on the bar', a.bare], ['Enter on the title', a.enter]]) {
      if (s.kind !== 'entry' || s.key !== 'reichstag:seats') problems.push(`${name} opened ${s.kind}:${s.key}`);
      if (s.title !== 'Reichstag') problems.push(`${name}: heading "${s.title}"`);
    }
    for (const [name, s] of [['title', a.titleBack], ['bar', a.bareBack], ['Enter', a.enterBack]]) {
      if (s.kind !== 'polls' || s.current !== 'Polls') problems.push(`Back after the ${name} showed ${s.kind} (${s.current})`);
    }
    if (a.toggle.kind !== 'polls') problems.push(`the Seats/Polls toggle opened ${a.toggle.kind}`);
    if (a.toggle.chart !== 'polls') problems.push(`the toggle did not switch the chart: ${a.toggle.chart}`);
    if (!a.focusable) problems.push('the title could not take focus');
    if (!a.focusKept) problems.push('the title lost focus when the bar redrew');
    if (realErrors(m).length > 0) problems.push(`console errors: ${realErrors(m).join(' | ')}`);
    return problems.length === 0 ? true : problems.join('; ');
  },
};

// ---- The date bar ------------------------------------------------------------

function dateChecks(name, state, historical) {
  const lead = historical ? "The month's news" : 'What happened in this month, historically';
  const resting = historical ? 'Die Zeit' : 'Polls';
  return {
    name: `bar-clicks:date:${name}:laptop`,
    viewport: 'laptop',
    state,
    selectors: SELECTORS,
    async act(page) {
      const out = { before: await snap(page) };
      // A click anywhere on the bar: its button fills it.
      const bar = await rectOf(page, '#date-line');
      await clickAt(page, bar.left + 12, (bar.top + bar.bottom) / 2);
      await settle();
      out.click = await snap(page);
      out.clickBack = await back(page);
      out.focusable = await press(page, '#date-line button');
      await settle();
      out.enter = await snap(page);
      out.focusKept = await evaluate(page, `document.activeElement && document.activeElement.tagName === 'BUTTON' && !!document.activeElement.closest('#date-line')`);
      out.enterBack = await back(page);
      // A second click on the open entry adds no history step.
      await clickAt(page, bar.left + 12, (bar.top + bar.bottom) / 2);
      await settle();
      await clickAt(page, bar.left + 12, (bar.top + bar.bottom) / 2);
      await settle();
      out.twice = await snap(page);
      out.twiceBack = await back(page);
      return out;
    },
    test(m) {
      const a = m.acted;
      const problems = [];
      const [dateLine] = m.elements['#date-line'];
      const [button] = m.elements['#date-line button'];
      if (!button) return 'no button in #date-line';
      if (button.text !== a.before.date) problems.push(`the button reads "${button.text}", the date line "${a.before.date}"`);
      if (!/^[A-Z][a-z]+ 19\d\d$/.test(button.text)) problems.push(`the date reads "${button.text}"`);
      if (button.title !== 'This month in history') problems.push(`the button's hint is "${button.title}"`);
      if (button.cursor !== 'pointer' || dateLine.cursor !== 'pointer') problems.push(`cursor ${button.cursor} / ${dateLine.cursor}`);
      if (button.borderStyle !== 'none' || !/Jost/.test(button.fontFamily) || button.textTransform !== 'uppercase') {
        problems.push(`the button doesn't look like bar text: border ${button.borderStyle}, ${button.fontFamily}, ${button.textTransform}`);
      }
      if (!close(button.rect.left, dateLine.rect.left) || !close(button.rect.right, dateLine.rect.right) ||
          !close(button.rect.top, dateLine.rect.top) || !close(button.rect.bottom, dateLine.rect.bottom)) {
        problems.push('the button does not fill the bar');
      }
      for (const [label, s, back] of [['a click', a.click, a.clickBack], ['Enter', a.enter, a.enterBack]]) {
        if (s.kind !== 'entry' || !/^month:19\d\d-\d{1,2}$/.test(s.key)) problems.push(`${label} opened ${s.kind}:${s.key}`);
        if (s.title !== a.before.date) problems.push(`${label}: heading "${s.title}", the date is "${a.before.date}"`);
        if (s.lead !== lead) problems.push(`${label}: lead "${s.lead}", expected "${lead}"`);
        if (historical && s.records < 1) problems.push(`${label}: no news records in historical mode`);
        if (s.records === 0 && s.none !== 1) problems.push(`${label}: neither records nor the no-news line`);
        if (s.records > 0 && s.none !== 0) problems.push(`${label}: records and the no-news line together`);
        if (back.current !== resting || back.kind !== (historical ? 'times' : 'polls')) problems.push(`Back after ${label} showed ${back.kind} (${back.current})`);
      }
      if (a.twice.history !== a.before.history + 1) problems.push(`two clicks made ${a.twice.history - a.before.history} history steps, expected 1`);
      if (a.twiceBack.kind !== (historical ? 'times' : 'polls')) problems.push(`Back after two clicks showed ${a.twiceBack.kind}`);
      if (!a.focusable) problems.push('the date button could not take focus');
      if (!a.focusKept) problems.push('the date button lost focus when the column redrew');
      if (realErrors(m).length > 0) problems.push(`console errors: ${realErrors(m).join(' | ')}`);
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

// A month with no records shows the lead and one line saying so.
const emptyMonthCheck = {
  name: 'bar-clicks:date:empty-month:laptop',
  viewport: 'laptop',
  state: 'hub-month',
  selectors: SELECTORS,
  async act(page) {
    // The file ends in March 1933: April 1933 has no dated news.
    await evaluate(page, `(() => {
      Object.assign(window.dendryUI.dendryEngine.state.qualities, { year: 1933, month: 4 });
      window.updateSidebar();
      return true;
    })()`);
    await evaluate(page, `document.querySelector('#date-line button').click()`);
    await settle();
    return { shown: await snap(page) };
  },
  test(m) {
    const { shown } = m.acted;
    const problems = [];
    if (shown.title !== 'April 1933') problems.push(`heading "${shown.title}"`);
    if (shown.records !== 0 || shown.none !== 1) problems.push(`${shown.records} records, ${shown.none} no-news lines`);
    if (shown.lead !== 'What happened in this month, historically') problems.push(`lead "${shown.lead}"`);
    const none = m.elements['#depth_column .dc-month *'].find((e) => e.text === 'No dated news this month.');
    if (!none) problems.push('the "No dated news this month." line is missing');
    return problems.length === 0 ? true : problems.join('; ');
  },
};

// A busy month fits the column: nothing spills out, and the entry is a
// column's worth of text, not more than a few screens. (March 1928 carries
// four records, the most in the file.)
const busyMonthCheck = {
  name: 'bar-clicks:month-fits:laptop',
  viewport: 'laptop',
  state: 'hub-historical',
  selectors: SELECTORS,
  async act(page) {
    await evaluate(page, `(() => {
      const q = window.dendryUI.dendryEngine.state.qualities;
      Object.assign(q, { year: 1928, month: 3 });
      window.updateSidebar();
      document.querySelector('#date-line button').click();
      return true;
    })()`);
    await waitForCondition(() => hasSelector(page, '#depth_column .dc-month .dc-times-entry'));
    return snap(page);
  },
  test(m) {
    const problems = [];
    const [depth] = m.elements['#depth_column'];
    const [entry] = m.elements['#depth_column .dc-month'];
    if (!entry) return 'the month entry is not in the depth column';
    if (m.acted.records < 4) problems.push(`${m.acted.records} records in March 1928, expected 4`);
    if (m.acted.title !== 'March 1928') problems.push(`heading "${m.acted.title}"`);
    for (const el of m.elements['#depth_column .dc-month *']) {
      if (!gte(el.rect.left, depth.rect.left) || !lte(el.rect.right, depth.rect.right)) {
        problems.push(`"${el.text.slice(0, 30)}" spills out of the depth column`);
        break;
      }
    }
    if (m.scrollWidth > m.clientWidth + TOLERANCE) problems.push(`horizontal overflow: ${m.scrollWidth} > ${m.clientWidth}`);
    if (entry.rect.height > 900) problems.push(`the entry is ${entry.rect.height}px tall`);
    return problems.length === 0 ? true : problems.join('; ');
  },
};

// A new month while the entry is open: the entry follows the date bar, in
// place, so Back still goes straight to the resting view.
const followCheck = {
  name: 'bar-clicks:month-follows-the-date:laptop',
  viewport: 'laptop',
  state: 'hub-historical',
  selectors: SELECTORS,
  async act(page) {
    await evaluate(page, `document.querySelector('#date-line button').click()`);
    await settle();
    const first = await snap(page);
    // The month ends: a new page, with the date moved on, as post_event does.
    await evaluate(page, `(() => {
      const engine = window.dendryUI.dendryEngine;
      const q = engine.state.qualities;
      q.month = q.month === 12 ? 1 : Number(q.month) + 1;
      if (q.month === 1) q.year = Number(q.year) + 1;
      document.getElementById('content').innerHTML = '';
      engine.goToScene('main');
      return true;
    })()`);
    await waitForCondition(() => hasSelector(page, 'ul.decks'));
    await settle();
    const moved = await snap(page);
    const returned = await back(page);
    return { first, moved, returned };
  },
  test(m) {
    const { first, moved, returned } = m.acted;
    const problems = [];
    if (moved.date === first.date) problems.push('the date did not move');
    if (moved.kind !== 'entry' || !/^month:/.test(moved.key)) problems.push(`the page left the ${moved.kind} view open`);
    if (moved.title !== moved.date) problems.push(`the entry reads "${moved.title}", the date bar "${moved.date}"`);
    if (moved.key === first.key) problems.push('the entry kept the old month');
    if (moved.history !== first.history) problems.push(`history went from ${first.history} to ${moved.history}`);
    if (returned.kind !== 'times') problems.push(`Back showed ${returned.kind}, expected Die Zeit`);
    return problems.length === 0 ? true : problems.join('; ');
  },
};

export default [
  reichstagCheck,
  dateChecks('normal', 'hub-month', false),
  dateChecks('historical', 'hub-historical', true),
  emptyMonthCheck,
  busyMonthCheck,
  followCheck,
];
