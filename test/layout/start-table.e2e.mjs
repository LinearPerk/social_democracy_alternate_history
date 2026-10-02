#!/usr/bin/env node
'use strict';

// End-to-end checks for the start page's difficulty table (the choice-table
// builder in out/html/decision-column/decision-column.js). Like run.mjs it
// drives an already-built, already-served game in headless Chrome:
//
//   node test/layout/start-table.e2e.mjs --url http://127.0.0.1:8079/
//
// The layout and shape are in checks/start-table.mjs; this file covers what
// the page does: a click anywhere on a row begins the game at that
// difficulty, Tab walks the rows, Enter begins, each row's hover title carries
// its figures, and the hover and focus looks appear. Real mouse and key events, so the engine's own handlers run.

import { setTimeout as delay } from 'node:timers/promises';

import { closeChrome, launchChrome } from './lib/chrome.mjs';
import { openPage } from './lib/cdp.mjs';
import { parseArgs } from './lib/cli.mjs';
import {
  evaluate,
  hasSelector,
  navigate,
  setViewport,
  stubAlert,
  waitAndClickByText,
  waitForCondition,
  watchConsole,
} from './lib/driver.mjs';
import { exitCode, formatLine } from './lib/report.mjs';
import { VIEWPORTS } from './lib/viewports.mjs';

const ENGINE = 'dendryUI.dendryEngine';

const results = [];
function record(name, problems) {
  results.push(problems.length === 0 ? { name, ok: true } : { name, ok: false, reason: problems.join('; ') });
}
async function tryStep(problems, step) {
  try {
    await step();
  } catch (err) {
    problems.push(err.message);
  }
}

const q = (page, name) => evaluate(page, `${ENGINE}.state.qualities[${JSON.stringify(name)}]`);
const sceneId = (page) => evaluate(page, `${ENGINE}.state.sceneId`);

async function openStart(page, url) {
  await navigate(page, url);
  await stubAlert(page);
  await waitAndClickByText(page, '#content a', 'Start game');
  await waitForCondition(() => hasSelector(page, 'table.choice-table'));
}

// The middle of a cell of the named mode's row, in viewport coordinates.
// `cell` is the 0-based index among the row's cells (0 is the link's cell).
function cellCentre(page, mode, cell) {
  return evaluate(page, `(() => {
    const row = Array.from(document.querySelectorAll('table.choice-table tbody tr'))
      .find((tr) => tr.querySelector('td.ct-mode').textContent.trim() === ${JSON.stringify(mode)});
    const td = row && row.children[${cell}];
    if (!td) return null;
    const r = td.getBoundingClientRect();
    return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
  })()`);
}

async function click(page, { x, y }) {
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}

async function press(page, name, code, vk, text) {
  const base = { key: name, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
  await page.send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', ...base, ...(text ? { text } : {}) });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}

const focusedText = (page) => evaluate(page, `(() => {
  const a = document.activeElement;
  return a ? a.textContent.trim() : null;
})()`);

async function begun(page) {
  await waitForCondition(() => hasSelector(page, 'ul.hand'));
}

// What each row sets, read from the scenes: difficulty and Reichsbanner
// strength (thousands).
const MODES = [
  { mode: 'Easy', difficulty: -1, rb: 2500, hand: 4 },
  { mode: 'Normal', difficulty: 0, rb: 2000, hand: 3 },
  { mode: 'Hard', difficulty: 1, rb: 1000, hand: 3 },
  { mode: 'Historical', difficulty: 2, rb: 2000, hand: 3 },
];

async function main() {
  const { url } = parseArgs(process.argv.slice(2));
  let chrome = null;
  try {
    chrome = await launchChrome({ onSpawn: (partial) => { chrome = partial; } });
    const page = await openPage(chrome.port);
    try {
      await page.send('Page.enable');
      await page.send('Runtime.enable');
      await page.send('Log.enable');
      const watch = watchConsole(page);
      await setViewport(page, VIEWPORTS.monitor);

      // A click on the line beside the link (the second cell) begins the game
      // at that row's difficulty.
      for (const m of MODES) {
        const problems = [];
        await tryStep(problems, async () => {
          await openStart(page, url);
          const at = await cellCentre(page, m.mode, 1);
          if (!at) throw new Error(`no ${m.mode} row`);
          await click(page, at);
          await begun(page);
          const got = { difficulty: await q(page, 'difficulty'), rb: await q(page, 'rb_strength'), hand: await q(page, 'hand_size') };
          if (got.difficulty !== m.difficulty) problems.push(`difficulty ${got.difficulty}, expected ${m.difficulty}`);
          if (got.rb !== m.rb) problems.push(`rb_strength ${got.rb}, expected ${m.rb}`);
          if (got.hand !== m.hand) problems.push(`hand_size ${got.hand}, expected ${m.hand}`);
        });
        record(`start-table:click-row:${m.mode}`, problems);
      }

      // The link itself still reaches the engine.
      {
        const problems = [];
        await tryStep(problems, async () => {
          await openStart(page, url);
          const at = await cellCentre(page, 'Hard', 0);
          await click(page, at);
          await begun(page);
          if ((await q(page, 'difficulty')) !== 1) problems.push(`difficulty ${await q(page, 'difficulty')}, expected 1`);
          if ((await q(page, 'rb_strength')) !== 1000) problems.push(`rb_strength ${await q(page, 'rb_strength')}, expected 1000`);
        });
        record('start-table:click-link:Hard', problems);
      }

      // The merged Custom settings row opens the custom difficulty page.
      {
        const problems = [];
        await tryStep(problems, async () => {
          await openStart(page, url);
          const at = await cellCentre(page, 'Custom settings', 1);
          await click(page, at);
          await waitForCondition(async () => /custom_difficulty/.test(await sceneId(page)));
        });
        record('start-table:click-row:Custom-settings', problems);
      }

      // A click on the head or the note does nothing: the engine's handler on
      // the list item would otherwise press the first link.
      {
        const problems = [];
        await tryStep(problems, async () => {
          await openStart(page, url);
          const head = await evaluate(page, `(() => {
            const r = document.querySelector('table.choice-table thead th:nth-child(2)').getBoundingClientRect();
            return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
          })()`);
          await click(page, head);
          const note = await evaluate(page, `(() => {
            const r = document.querySelector('.choice-table-holder .ct-note').getBoundingClientRect();
            return { x: r.left + 20, y: (r.top + r.bottom) / 2 };
          })()`);
          await click(page, note);
          await delay(300);
          if ((await sceneId(page)) !== 'root.start') problems.push(`a click outside the rows went to ${await sceneId(page)}`);
        });
        record('start-table:click-outside-rows-does-nothing', problems);
      }

      // Tab moves through the rows in order; the focused row is outlined; Enter begins.
      {
        const problems = [];
        await tryStep(problems, async () => {
          await openStart(page, url);
          await evaluate(page, `document.querySelector('table.choice-table td.ct-mode a').focus()`);
          const seen = [await focusedText(page)];
          for (let i = 0; i < 4; i += 1) {
            await press(page, 'Tab', 'Tab', 9);
            seen.push(await focusedText(page));
          }
          const want = ['Easy', 'Normal', 'Hard', 'Historical', 'Custom settings'];
          if (seen.join('|') !== want.join('|')) problems.push(`Tab visited ${JSON.stringify(seen)}`);
          await evaluate(page, `document.querySelector('table.choice-table td.ct-mode a').focus()`);
          await press(page, 'Tab', 'Tab', 9);
          const ring = await evaluate(page, `(() => {
            const tr = document.activeElement.closest('tr');
            const cs = getComputedStyle(tr);
            const own = getComputedStyle(document.activeElement);
            return { style: cs.outlineStyle, width: cs.outlineWidth, ownStyle: own.outlineStyle, ownWidth: own.outlineWidth };
          })()`);
          if (ring.style !== 'solid' || ring.width !== '2px') problems.push(`focused row outline is ${ring.width} ${ring.style}, expected 2px solid`);
          if (ring.ownStyle !== 'none' && parseFloat(ring.ownWidth) > 0) problems.push('the focused link also draws its own outline');
          await press(page, 'Enter', 'Enter', 13, '\r');
          await begun(page);
          if ((await q(page, 'difficulty')) !== 0) problems.push(`Enter on the second row began difficulty ${await q(page, 'difficulty')}, expected 0 (Normal)`);
        });
        record('start-table:keyboard', problems);
      }

      // Each row's hover title carries the figures its scene sets, in one
      // line; the Custom row has none. (Their match to the scenes is in
      // choice-table.test.mjs.)
      {
        const problems = [];
        await tryStep(problems, async () => {
          await openStart(page, url);
          const titles = await evaluate(page, `Array.from(document.querySelectorAll('table.choice-table tbody tr'))
            .map((tr) => [tr.querySelector('td.ct-mode').textContent.trim(), tr.title])`);
          const byMode = Object.fromEntries(titles);
          for (const [mode, has] of [['Easy', '4 resources'], ['Normal', 'hand of 3'], ['Hard', '0 resources'], ['Historical', 'no saves or polls']]) {
            if (!byMode[mode] || !byMode[mode].includes(has) || byMode[mode].includes('\n')) problems.push(`${mode} title is ${JSON.stringify(byMode[mode])}, expected one line with "${has}"`);
          }
          if (byMode['Custom settings']) problems.push(`Custom settings has a title: ${JSON.stringify(byMode['Custom settings'])}`);
        });
        record('start-table:hover-titles', problems);
      }

      // Hover washes the row.
      {
        const problems = [];
        await tryStep(problems, async () => {
          await openStart(page, url);
          const bg = (mode) => evaluate(page, `(() => {
            const row = Array.from(document.querySelectorAll('table.choice-table tbody tr'))
              .find((tr) => tr.querySelector('td.ct-mode').textContent.trim() === ${JSON.stringify(mode)});
            return Array.from(row.children).map((td) => getComputedStyle(td).backgroundColor);
          })()`);
          const before = await bg('Hard');
          await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...(await cellCentre(page, 'Hard', 1)) });
          const during = await bg('Hard');
          const other = await bg('Easy');
          if (before.some((c) => c !== 'rgba(0, 0, 0, 0)')) problems.push(`row has a background before hover: ${before[0]}`);
          if (during.some((c) => c === 'rgba(0, 0, 0, 0)')) problems.push('hovered row is not washed');
          if (other.some((c) => c !== 'rgba(0, 0, 0, 0)')) problems.push('another row is washed');
        });
        record('start-table:hover-wash', problems);
      }

      // Headless Chrome blocks audio without a user gesture; that is not ours.
      const errors = watch.errors.filter((e) => !/play\(\) failed/.test(e));
      record('start-table:no-console-errors', errors.length === 0 ? [] : errors);
    } finally {
      await page.close();
    }
  } finally {
    if (chrome) await closeChrome(chrome);
  }
  for (const result of results) console.log(formatLine(result));
  process.exitCode = exitCode(results);
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exitCode = 1;
});
