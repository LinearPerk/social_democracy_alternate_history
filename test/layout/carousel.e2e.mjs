#!/usr/bin/env node
'use strict';

// End-to-end checks for the title page's carousels (out/html/layout/carousel.js).
// Like run.mjs it drives an already-built, already-served game in headless
// Chrome:
//
//   node test/layout/carousel.e2e.mjs --url http://127.0.0.1:8074/
//
// It covers what needs time or several steps: the auto-advance (8 s, the
// panels never changing together), the pause on hover and on focus, the
// reduced-motion setting, and the carousels' removal, timers included, when a
// game starts or a save is loaded from the title page. Static geometry and
// the keys are in checks/carousel.mjs. The run takes about a minute.

import { setTimeout as delay } from 'node:timers/promises';

import { closeChrome, launchChrome } from './lib/chrome.mjs';
import { openPage } from './lib/cdp.mjs';
import { parseArgs } from './lib/cli.mjs';
import {
  evaluate,
  navigate,
  setViewport,
  stubAlert,
  waitAndClickByText,
  waitForCondition,
  watchConsole,
} from './lib/driver.mjs';
import { exitCode, formatLine } from './lib/report.mjs';
import { reachState } from './lib/states.mjs';
import { VIEWPORTS } from './lib/viewports.mjs';

const results = [];
function record(name, problems) {
  results.push(problems.length === 0 ? { name, ok: true } : { name, ok: false, reason: problems.join('; ') });
}

// Records every timer the carousel code starts and whether it is still
// pending, so "no timers run" can be read off the page. Installed before the
// page's own scripts.
const TIMER_SPY = `(() => {
  const pending = new Set();
  const set = window.setTimeout.bind(window);
  const clear = window.clearTimeout.bind(window);
  window.setTimeout = function (fn, ms, ...rest) {
    if (!/carousel\\.js/.test(new Error().stack || '')) return set(fn, ms, ...rest);
    const id = set(function () { pending.delete(id); return fn.apply(this, arguments); }, ms, ...rest);
    pending.add(id);
    return id;
  };
  window.clearTimeout = function (id) { pending.delete(id); return clear(id); };
  window.__carouselTimers = () => pending.size;
})();`;

async function fresh(page, url, { reduced = false } = {}) {
  await page.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }],
  });
  await setViewport(page, VIEWPORTS.desktop);
  await navigate(page, url);
  await stubAlert(page);
  await waitForCondition(() => evaluate(page, `(() => {
    const panels = ['carousel-state', 'carousel-depth'].map((id) => document.getElementById(id));
    return panels.every((p) => p && p.querySelectorAll('.cr-img').length > 0
      && Array.from(p.querySelectorAll('.cr-img')).every((i) => i.complete && i.naturalWidth > 0));
  })()`), { timeoutMs: 8000 });
}

// Each panel's captions, top to bottom, as one string (the wall holds two at
// this window size, the portrait panel one).
const names = (page) => evaluate(page, `(() => {
  const read = (id) => Array.from(document.querySelectorAll('#' + id + ' .cr-name')).map((n) => n.textContent).join(' | ');
  return { state: read('carousel-state'), depth: read('carousel-depth') };
})()`);

// The wall's captions as a list, one per stacked picture.
const wallNames = (page) => evaluate(page, `Array.from(document.querySelectorAll('#carousel-state .cr-name')).map((n) => n.textContent)`);

// Samples both panels' captions every 100 ms for `ms`; returns when each
// panel's caption changed, in ms from the start.
async function watchChanges(page, ms) {
  const changes = { state: [], depth: [] };
  let last = await names(page);
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    await delay(100);
    const now = await names(page);
    for (const side of ['state', 'depth']) {
      if (now[side] !== last[side]) changes[side].push(Date.now() - t0);
    }
    last = now;
  }
  return changes;
}

async function moveMouse(page, x, y) {
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
}

const centre = (page, id) => evaluate(page, `(() => {
  const r = document.getElementById(${JSON.stringify(id)}).getBoundingClientRect();
  return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
})()`);

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
      await page.send('Page.addScriptToEvaluateOnNewDocument', { source: TIMER_SPY });
      // Headless Chrome's page has no focus, so focus events would not fire.
      await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
      const watch = watchConsole(page);

      // The auto-advance: each panel moves on about every 8 s, and the two
      // never move together.
      {
        const problems = [];
        await fresh(page, url);
        const changes = await watchChanges(page, 18000);
        if (changes.state.length < 1) problems.push('the state panel did not advance in 18 s');
        if (changes.depth.length < 2) problems.push(`the depth panel advanced ${changes.depth.length} times in 18 s, expected 2 or more`);
        for (const t of changes.state) {
          if (t < 6000) problems.push(`the state panel advanced at ${t} ms, before 8 s`);
          for (const u of changes.depth) {
            if (Math.abs(t - u) < 500) problems.push(`the panels changed together (${t} ms and ${u} ms)`);
          }
        }
        record('carousel:auto-advance:8s-and-never-together', problems);
      }

      // The wall changes one slot per tick, the oldest first, and never shows
      // a picture twice at once: the first tick replaces the top picture, the
      // second the one below it.
      {
        const problems = [];
        await fresh(page, url);
        const seen = [await wallNames(page)];
        if (seen[0].length !== 2) problems.push(`the wall holds ${seen[0].length} pictures at the desktop size, expected 2`);
        const t0 = Date.now();
        while (Date.now() - t0 < 18000) {
          await delay(100);
          const now = await wallNames(page);
          if (now.join('|') !== seen[seen.length - 1].join('|')) seen.push(now);
        }
        if (seen.length < 3) problems.push(`the wall changed ${seen.length - 1} times in 18 s, expected 2`);
        for (let i = 1; i < seen.length; i += 1) {
          const changed = seen[i].map((n, k) => (n !== seen[i - 1][k] ? k : -1)).filter((k) => k >= 0);
          if (changed.length !== 1) problems.push(`change ${i} moved ${changed.length} pictures, expected one`);
          else if (changed[0] !== (i - 1) % seen[0].length) problems.push(`change ${i} replaced picture ${changed[0] + 1}, not the oldest`);
          if (new Set(seen[i]).size !== seen[i].length) problems.push(`change ${i} shows a picture twice`);
        }
        record('carousel:wall-replaces-the-oldest-picture-each-tick', problems);
      }

      // Hover pauses the panel pointed at, not the other one.
      {
        const problems = [];
        await fresh(page, url);
        const at = await centre(page, 'carousel-state');
        await moveMouse(page, at.x, at.y);
        const changes = await watchChanges(page, 11000);
        if (changes.state.length > 0) problems.push(`the state panel advanced under the pointer (${changes.state.join(', ')} ms)`);
        if (changes.depth.length < 1) problems.push('the other panel stopped with the pointer on the first');
        await moveMouse(page, 5, 600);
        const after = await watchChanges(page, 9500);
        if (after.state.length < 1) problems.push('the panel did not resume after the pointer left');
        record('carousel:pause-on-hover', problems);
      }

      // Focus pauses the panel.
      {
        const problems = [];
        await fresh(page, url);
        await evaluate(page, `document.querySelector('#carousel-depth .cr-next').focus(); true`);
        const changes = await watchChanges(page, 9500);
        if (changes.depth.length > 0) problems.push(`the panel advanced while focused (${changes.depth.join(', ')} ms)`);
        await evaluate(page, `document.activeElement.blur(); true`);
        const after = await watchChanges(page, 9500);
        if (after.depth.length < 1) problems.push('the panel did not resume after focus left');
        record('carousel:pause-on-focus', problems);
      }

      // Reduced motion: no auto-advance and no crossfade; the buttons still work.
      {
        const problems = [];
        await fresh(page, url, { reduced: true });
        const changes = await watchChanges(page, 9500);
        if (changes.state.length + changes.depth.length > 0) problems.push('a panel advanced by itself under reduced motion');
        const live = await evaluate(page, `window.__carouselTimers()`);
        if (live !== 0) problems.push(`${live} timers pending under reduced motion`);
        const fade = await evaluate(page, `getComputedStyle(document.querySelector('.cr-img')).transitionDuration`);
        if (fade !== '0s') problems.push(`the crossfade is still on (${fade})`);
        const before = (await names(page)).state;
        await evaluate(page, `document.querySelector('#carousel-state .cr-next').click(); true`);
        if ((await names(page)).state === before) problems.push('the next button did nothing under reduced motion');
        record('carousel:reduced-motion', problems);
      }

      // A game starting removes the panels and clears their timers.
      {
        const problems = [];
        await fresh(page, url);
        const running = await evaluate(page, `window.__carouselTimers()`);
        if (running < 2) problems.push(`only ${running} timers pending on the title page`);
        const before = await evaluate(page, `({
          hero: document.querySelectorAll('#content .tp-hero').length,
          frames: document.querySelectorAll('.cr-frame').length,
          heading: getComputedStyle(document.querySelector('#content h1')).display,
        })`);
        if (before.hero !== 1 || before.frames !== 2 || before.heading !== 'none') {
          problems.push(`the title page does not show its masthead first: ${JSON.stringify(before)}`);
        }
        await waitAndClickByText(page, '#content a', 'Start game');
        await delay(500);
        const after = await evaluate(page, `({
          panels: document.querySelectorAll('.cr-panel').length,
          active: window.Carousel.active(),
          timers: window.__carouselTimers(),
          frames: document.querySelectorAll('.cr-frame').length,
          hero: document.querySelectorAll('.tp-hero, .tp-fleuron').length,
          marked: document.querySelectorAll('#content.tp-title').length,
        })`);
        if (after.frames !== 0 || after.hero !== 0 || after.marked !== 0) {
          problems.push(`the frame or hero is still up after Start game: ${JSON.stringify(after)}`);
        }
        if (after.panels !== 0) problems.push(`${after.panels} panels left after Start game`);
        if (after.active !== 0 || after.timers !== 0) problems.push(`${after.active} live, ${after.timers} timers pending after Start game`);
        await delay(9000);
        if ((await evaluate(page, `document.querySelectorAll('.cr-panel').length`)) !== 0) problems.push('a panel came back');
        record('carousel:removed-when-the-game-starts', problems);
      }

      // A save loaded from the title page removes them too.
      {
        const problems = [];
        await fresh(page, url);
        await reachState(page, 'hub');
        await evaluate(page, `dendryUI.saveSlot(1); true`);
        await fresh(page, url);
        await evaluate(page, `dendryUI.loadSlot(1); true`);
        await delay(800);
        const after = await evaluate(page, `({
          panels: document.querySelectorAll('.cr-panel').length,
          active: window.Carousel.active(),
          timers: window.__carouselTimers(),
          started: !!dendryUI.dendryEngine.state.qualities.started,
          frames: document.querySelectorAll('.cr-frame').length,
          hero: document.querySelectorAll('.tp-hero, .tp-fleuron').length,
        })`);
        if (!after.started) problems.push('the save did not load');
        if (after.frames !== 0 || after.hero !== 0) problems.push(`the frame or hero is still up after a load: ${JSON.stringify(after)}`);
        if (after.panels !== 0) problems.push(`${after.panels} panels left after a load`);
        if (after.active !== 0 || after.timers !== 0) problems.push(`${after.active} live, ${after.timers} timers pending after a load`);
        await evaluate(page, `dendryUI.deleteSlot(1); true`);
        record('carousel:removed-when-a-save-loads', problems);
      }

      // Images that fail to load leave the empty panels as they were.
      {
        const problems = [];
        await page.send('Network.enable');
        await page.send('Network.setBlockedURLs', { urls: ['*/img/*'] });
        await setViewport(page, VIEWPORTS.desktop);
        await navigate(page, url);
        await delay(2500);
        const shown = await evaluate(page, `({
          panels: document.querySelectorAll('.cr-panel').length,
          stateDisplay: getComputedStyle(document.getElementById('tools_wrapper')).display,
          depthDisplay: getComputedStyle(document.getElementById('depth_column')).display,
          height: document.getElementById('tools_wrapper').getBoundingClientRect().height,
        })`);
        await page.send('Network.setBlockedURLs', { urls: [] });
        if (shown.panels !== 0) problems.push(`${shown.panels} panels stay with no images`);
        if (shown.stateDisplay === 'none' || shown.depthDisplay === 'none' || shown.height < 480) {
          problems.push(`the empty panels did not come back: ${JSON.stringify(shown)}`);
        }
        record('carousel:no-images-leaves-the-empty-panels', problems);
      }

      const errors = watch.errors.filter((e) => !/play\(\) failed|Failed to load resource/.test(e));
      record('carousel:no-console-errors', errors.length === 0 ? [] : errors);
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
