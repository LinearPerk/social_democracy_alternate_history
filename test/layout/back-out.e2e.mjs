#!/usr/bin/env node
'use strict';

// End-to-end checks for the back-out styling (out/html/depth-column/back-out.js
// and back-out.css). Like run.mjs it drives an already-built, already-served
// game in headless Chrome:
//
//   node test/layout/back-out.e2e.mjs --url http://127.0.0.1:8024/
//
// It lives beside the layout harness, not in checks/, because it needs the
// page's text and click behaviour, which the harness's measurements don't
// carry. It opens cards through the engine (playCard, playPinnedCard) so each
// case names the exact card it tests.

import { closeChrome, launchChrome } from './lib/chrome.mjs';
import { openPage } from './lib/cdp.mjs';
import { parseArgs } from './lib/cli.mjs';
import {
  evaluate,
  navigate,
  setViewport,
  stubAlert,
  waitAndClickByText,
  watchConsole,
} from './lib/driver.mjs';
import { exitCode, formatLine } from './lib/report.mjs';
import { VIEWPORTS } from './lib/viewports.mjs';

const ENGINE = 'dendryUI.dendryEngine';

async function startGame(page, url, difficultyLabel) {
  await navigate(page, url);
  await stubAlert(page);
  await waitAndClickByText(page, '#content a', 'Start game');
  await waitAndClickByText(page, '#content a', difficultyLabel);
  await evaluate(page, `new Promise((r) => { const t = setInterval(() => { if (document.querySelector('ul.hand')) { clearInterval(t); r(true); } }, 50); })`);
}

// Opens a regular card through the engine, as clicking it in the hand would.
function openCard(page, id) {
  return evaluate(page, `(() => { ${ENGINE}.playCard(${JSON.stringify(id)}); return true; })()`);
}

function openAdvisor(page, id) {
  return evaluate(page, `(() => { ${ENGINE}.playPinnedCard(${JSON.stringify(id)}); return true; })()`);
}

// What the page's choice list looks like: every li's text and class, in order.
function readChoices(page) {
  return evaluate(page, `(() => {
    const ul = document.querySelector('#content ul.choices');
    if (!ul) return null;
    const lis = Array.from(ul.children);
    const last = lis[lis.length - 1];
    const first = lis[0];
    const cs = last && getComputedStyle(last);
    const fs = first && getComputedStyle(first);
    return {
      items: lis.map((li) => ({ text: li.textContent.trim(), backout: li.classList.contains('dc-backout') })),
      lastBorderTopStyle: cs && cs.borderTopStyle,
      lastBorderTopWidth: cs && cs.borderTopWidth,
      lastFontSize: cs && parseFloat(cs.fontSize),
      firstFontSize: fs && parseFloat(fs.fontSize),
      lastLinkColor: last && last.querySelector('a') && getComputedStyle(last.querySelector('a')).color,
      firstLinkColor: first && first.querySelector('a') && getComputedStyle(first.querySelector('a')).color,
    };
  })()`);
}

const q = (page, name) => evaluate(page, `${ENGINE}.state.qualities[${JSON.stringify(name)}] || 0`);
const sceneId = (page) => evaluate(page, `${ENGINE}.state.sceneId`);
const handIds = (page) => evaluate(page, `Object.values(${ENGINE}.state.currentHands).flat().map((c) => c.id)`);

const results = [];
async function tryStep(problems, step) {
  try {
    await step();
  } catch (err) {
    problems.push(err.message);
  }
}
function record(name, problems) {
  results.push(problems.length === 0 ? { name, ok: true } : { name, ok: false, reason: problems.join('; ') });
}

async function backoutStyledLast(page, url, name, difficulty, open, label) {
  await startGame(page, url, difficulty);
  await open();
  const c = await readChoices(page);
  const problems = [];
  if (!c) return record(name, ['no ul.choices on the page']);
  const marked = c.items.filter((i) => i.backout);
  const last = c.items[c.items.length - 1];
  if (marked.length !== 1) problems.push(`expected one .dc-backout, found ${marked.length}`);
  else if (!last.backout) problems.push('.dc-backout is not the last choice');
  else if (last.text !== label) problems.push(`label is "${last.text}", expected "${label}"`);
  if (marked.length === 1) {
    if (c.lastBorderTopStyle !== 'double') problems.push(`border-top is ${c.lastBorderTopStyle}, expected double`);
    if (!(c.lastFontSize < c.firstFontSize)) problems.push(`font ${c.lastFontSize}px not smaller than the first choice's ${c.firstFontSize}px`);
    if (c.lastLinkColor === c.firstLinkColor) problems.push(`link colour ${c.lastLinkColor} is not muted against the first choice`);
  }
  record(name, problems);
  return c;
}

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

      // Normal difficulty: a regular card.
      const c = await backoutStyledLast(page, url, 'back-out:normal:card:styled-and-last', 'Normal',
        () => openCard(page, 'party_disunity'), '↩ Return card to hand');
      record('back-out:normal:card:in-fiction-choices-untouched', (() => {
        const problems = [];
        if (!c) return ['no choices'];
        const others = c.items.slice(0, -1);
        if (others.length === 0) problems.push('no other choices');
        if (others.some((i) => i.backout || i.text.startsWith('↩'))) problems.push('a real choice was marked as a back-out');
        return problems;
      })());

      // Clicking the relabelled back-out still returns the card.
      {
        const problems = [];
        await startGame(page, url, 'Normal');
        // Campaigning is always viewable, so it stays in the hand on return; a
        // card whose view-if fails would vanish for reasons unrelated to the
        // back-out. It is put in the hand and clicked there, as a player would.
        const card = 'campaigning';
        await evaluate(page, `(() => { const de = ${ENGINE}; const h = de.state.currentHands.main; h.length = 0; h.push({ id: '${card}', title: 'x' }); de.displayChoices(); return true; })()`);
        const actions = await q(page, 'month_actions');
        await evaluate(page, `document.querySelector('li.card-in-hand a.card').click()`);
        await tryStep(problems, () => waitAndClickByText(page, '#content ul.choices li a', '↩ Return card to hand', { timeoutMs: 1000 }));
        if ((await sceneId(page)) !== 'main') problems.push(`scene is ${await sceneId(page)}, expected main`);
        if ((await q(page, 'month_actions')) !== actions) problems.push(`month_actions ${await q(page, 'month_actions')}, expected ${actions}`);
        if (!(await handIds(page)).includes(card)) problems.push(`${card} is not back in the hand`);
        record('back-out:normal:card:click-returns-card-to-hand', problems);
      }

      // Clicking the li itself (outside the link) works too: the engine's
      // delegated handler reads data-choice, which moving the li keeps.
      {
        const problems = [];
        await startGame(page, url, 'Normal');
        await openCard(page, 'party_disunity');
        await tryStep(problems, () => evaluate(page, `document.querySelector('#content ul.choices li.dc-backout').click()`));
        if ((await sceneId(page)) !== 'main') problems.push(`scene is ${await sceneId(page)}, expected main`);
        record('back-out:normal:card:click-on-li-returns', problems);
      }

      // A menu card keeps its in-fiction decline where it was.
      {
        await startGame(page, url, 'Normal');
        await openCard(page, 'agricultural_policy');
        const a = await readChoices(page);
        const problems = [];
        const decline = a && a.items.find((i) => /Do not enact any policies/.test(i.text));
        if (!decline) problems.push('decline choice not found');
        else if (decline.backout) problems.push('the in-fiction decline was styled as a back-out');
        if (a && a.items.filter((i) => i.backout).length !== 1) problems.push('expected exactly one back-out on the card');
        if (a && !a.items[a.items.length - 1].backout) problems.push('back-out is not last');
        record('back-out:normal:agricultural-policy:decline-untouched', problems);
      }

      // Easy difficulty shows it too.
      await backoutStyledLast(page, url, 'back-out:easy:card:styled-and-last', 'Easy',
        () => openCard(page, 'response_to_antisemitism'), '↩ Return card to hand');

      // Advisor card: "Return to main" is the back-out, relabelled.
      await backoutStyledLast(page, url, 'back-out:normal:advisor:styled-and-last', 'Normal',
        () => openAdvisor(page, 'hilferding'), '↩ Put it back');
      {
        const problems = [];
        await startGame(page, url, 'Normal');
        await openAdvisor(page, 'hilferding');
        await tryStep(problems, () => waitAndClickByText(page, '#content ul.choices li a', '↩ Put it back', { timeoutMs: 1000 }));
        if ((await sceneId(page)) !== 'main') problems.push(`scene is ${await sceneId(page)}, expected main`);
        record('back-out:normal:advisor:click-returns-to-hub', problems);
      }

      // Hard difficulty: easy_discard's own view-if hides it, so there is
      // nothing to style, and nothing may be relabelled.
      {
        await startGame(page, url, 'Hard');
        await openCard(page, 'party_disunity');
        const h = await readChoices(page);
        const problems = [];
        if (!h) problems.push('no choices');
        else {
          if (h.items.some((i) => i.backout || i.text.startsWith('↩'))) problems.push('back-out shown on hard');
        }
        record('back-out:hard:card:no-back-out', problems);
      }

      // Headless Chrome blocks audio without a user gesture; that is not ours.
      const errors = watch.errors.filter((e) => !/play\(\) failed/.test(e));
      record('back-out:no-console-errors', errors.length === 0 ? [] : errors);
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
