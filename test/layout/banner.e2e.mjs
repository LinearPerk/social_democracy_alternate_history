#!/usr/bin/env node
'use strict';

// End-to-end checks for the collapsing banner (out/html/layout/banner.js).
// Like run.mjs it drives an already-built, already-served game in headless
// Chrome:
//
//   node test/layout/banner.e2e.mjs --url http://127.0.0.1:8067/
//
// It covers the cycle that a single measurement can't: the banner collapses
// on the next page and on a scroll, stays put for a small scroll, ignores
// hover, moves without animation under reduced motion, and keeps the title
// and the three links reachable and working from the keyboard in both states.
// The static sizes are in checks/banner.mjs.

import { setTimeout as delay } from 'node:timers/promises';

import { closeChrome, launchChrome } from './lib/chrome.mjs';
import { STUB_AUDIO } from './lib/audio.mjs';
import { openPage } from './lib/cdp.mjs';
import { parseArgs } from './lib/cli.mjs';
import {
  evaluate,
  hasSelector,
  navigate,
  setViewport,
  stubAlert,
  waitForCondition,
  watchConsole,
} from './lib/driver.mjs';
import { exitCode, formatLine } from './lib/report.mjs';
import { reachState } from './lib/states.mjs';
import { VIEWPORTS } from './lib/viewports.mjs';

const ENGINE = 'dendryUI.dendryEngine';
const SETTLE_MS = 450;

const results = [];
function record(name, problems) {
  results.push(problems.length === 0 ? { name, ok: true } : { name, ok: false, reason: problems.join('; ') });
}

const isSlim = (page) => evaluate(page, `document.querySelector('header').classList.contains('slim')`);
const headerHeight = (page) => evaluate(page, `document.querySelector('header').getBoundingClientRect().height`);
const toggle = (page) => evaluate(page, `document.getElementById('banner-toggle').click(); true`);
const expanded = (page) => evaluate(page, `document.getElementById('banner-toggle').getAttribute('aria-expanded')`);
const animations = (page) => evaluate(page, `document.querySelector('header').getAnimations().length`);

async function fresh(page, url, state, viewport = 'laptop') {
  await setViewport(page, VIEWPORTS[viewport]);
  await navigate(page, url);
  await stubAlert(page);
  await reachState(page, state);
  await delay(SETTLE_MS);
}

async function expand(page) {
  await toggle(page);
  await delay(SETTLE_MS);
}

// Goes to the next month's hub through the engine, as a played card's page
// would (states.mjs does the same for `hub-month`).
async function nextPage(page) {
  await evaluate(page, `(() => { ${ENGINE}.goToScene('post_event'); return true; })()`);
  await waitForCondition(() => hasSelector(page, 'ul.hand'));
  await delay(100);
}

async function press(page, name, code, vk, text) {
  const base = { key: name, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
  await page.send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', ...base, ...(text ? { text } : {}) });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}

const focused = (page) => evaluate(page, `(() => {
  const a = document.activeElement;
  return a ? (a.id || a.textContent.trim()) : null;
})()`);

// Clicks Options, Save/Load and Library and checks each did its job, in
// whichever state the banner is in.
async function linksWork(page, label) {
  const problems = [];
  const link = (text) => evaluate(page, `(() => {
    const a = Array.from(document.querySelectorAll('#header-links a')).find((e) => e.textContent.trim() === ${JSON.stringify(text)});
    if (!a) return false;
    a.click();
    return true;
  })()`);
  const shown = (id) => evaluate(page, `getComputedStyle(document.getElementById(${JSON.stringify(id)})).display !== 'none'`);

  if (!(await link('Options'))) problems.push(`${label}: no Options link`);
  else if (!(await shown('options'))) problems.push(`${label}: Options did not open the panel`);
  await evaluate(page, `window.hideOptions(); true`);

  if (!(await link('Save/Load'))) problems.push(`${label}: no Save/Load link`);
  else if (!(await shown('save'))) problems.push(`${label}: Save/Load did not open the panel`);
  await evaluate(page, `document.getElementById('save').style.display = 'none'; true`);

  if (!(await link('Library'))) problems.push(`${label}: no Library link`);
  else {
    await delay(200);
    // The depth column takes the Library over upstream's scene.
    const view = await evaluate(page, `window.DepthColumn.view().kind`);
    if (view !== 'library') problems.push(`${label}: Library left the depth column on "${view}"`);
  }
  return problems;
}

const one = (page, expression) => evaluate(page, expression);
const click = (page, id) => one(page, `document.getElementById(${JSON.stringify(id)}).click(); true`);
const attr = (page, id, name) => one(page, `document.getElementById(${JSON.stringify(id)}).getAttribute(${JSON.stringify(name)})`);
const gone = (page, id) => one(page, `document.getElementById(${JSON.stringify(id)}).getBoundingClientRect().width === 0`);
const optionsShows = (page) => one(page, `(() => ({
  button: document.getElementById('pause-button-text').textContent,
  pauseIcon: document.getElementById('pause-button-image').style.display !== 'none',
  playIcon: document.getElementById('play-button-image').style.display !== 'none',
}))()`);

// Returns [name, problems] pairs for the music controls' behaviour. A stub
// stands in for the track, since headless Chrome refuses to play real audio.
async function musicControls(page, url) {
  const out = [];

  // Pause and play: the track, the header's and Options' buttons agree.
  {
    const problems = [];
    await fresh(page, url, 'hub');
    await one(page, STUB_AUDIO);
    await delay(100);
    if (await gone(page, 'music-play')) problems.push('no play/pause button once the game has a track');
    if ((await attr(page, 'music-play', 'aria-label')) !== 'Pause music') problems.push('the button does not offer "Pause music" while playing');
    await click(page, 'music-play');
    if (!(await one(page, `dendryUI.currentAudio.paused`))) problems.push('clicking pause did not pause the track');
    if ((await attr(page, 'music-play', 'aria-label')) !== 'Play music') problems.push('the button does not offer "Play music" while paused');
    const paused = await optionsShows(page);
    if (paused.button !== 'Play' || !paused.playIcon || paused.pauseIcon) problems.push(`Options did not follow the pause: ${JSON.stringify(paused)}`);
    await click(page, 'music-play');
    if (await one(page, `dendryUI.currentAudio.paused`)) problems.push('clicking play did not resume the track');
    const playing = await optionsShows(page);
    if (playing.button !== 'Pause' || playing.playIcon || !playing.pauseIcon) problems.push(`Options did not follow the resume: ${JSON.stringify(playing)}`);
    // The other way: Options' own button.
    await one(page, `window.togglePausePlay(); true`);
    if ((await attr(page, 'music-play', 'aria-label')) !== 'Play music') problems.push('the header did not follow a pause made in Options');
    out.push(['banner:music:pause-and-play-stay-in-step', problems]);
  }

  // Skip calls upstream's shuffle; the track's name is the control's title.
  {
    const problems = [];
    await fresh(page, url, 'hub');
    await one(page, STUB_AUDIO);
    await click(page, 'music-skip');
    if ((await one(page, `window.__skipped`)) !== 1) problems.push('clicking skip did not move the track on');
    const title = await one(page, `document.getElementById('header-music').title + '|' + document.getElementById('music-play').title`);
    if (!/MarekWeber\.mp3/.test(title)) problems.push(`the track's name is not in the titles: ${title}`);
    await one(page, `window.updateAudio('music/1928_1933/ZurSonne_zurFreiheit.mp3'); true`);
    const next = await one(page, `document.getElementById('header-music').title`);
    if (!/ZurSonne_zurFreiheit\.mp3/.test(next)) problems.push(`the title did not follow the new track: ${next}`);
    out.push(['banner:music:skip-and-track-name', problems]);
  }

  // Mute is volume 0 and unmute restores what the slider had.
  {
    const problems = [];
    await fresh(page, url, 'hub');
    await one(page, STUB_AUDIO);
    await one(page, `window.setVolume(40); true`);
    if ((await attr(page, 'music-mute', 'aria-pressed')) !== 'false') problems.push('mute reads pressed at volume 40');
    await click(page, 'music-mute');
    const muted = await one(page, `({ ui: dendryUI.volume, audio: dendryUI.currentAudio.volume, slider: document.getElementById('volume').value })`);
    if (muted.ui !== 0 || muted.audio !== 0) problems.push(`mute left the volume at ${JSON.stringify(muted)}, expected 0`);
    if (muted.slider !== '0') problems.push(`the Options slider reads ${muted.slider} while muted`);
    if ((await attr(page, 'music-mute', 'aria-pressed')) !== 'true') problems.push('mute does not read pressed while muted');
    // A fade toward the old volume (a new track's fade-in) must not undo it.
    await one(page, `dendryUI.currentAudio.volume = 0.7; true`);
    if ((await one(page, `dendryUI.currentAudio.volume`)) !== 0) problems.push('a fade raised the volume while muted');
    await click(page, 'music-mute');
    const back = await one(page, `({ ui: dendryUI.volume, audio: dendryUI.currentAudio.volume, slider: document.getElementById('volume').value })`);
    if (back.ui !== 0.4 || back.audio !== 0.4 || back.slider !== '40') problems.push(`unmute gave ${JSON.stringify(back)}, expected 0.4 and slider 40`);
    if ((await attr(page, 'music-mute', 'aria-pressed')) !== 'false') problems.push('mute still reads pressed after unmute');
    // A slider dragged to 0 in Options reads as muted in the header.
    await one(page, `window.setVolume(0); true`);
    if ((await attr(page, 'music-mute', 'aria-pressed')) !== 'true') problems.push('the header does not read muted when the slider is at 0');
    out.push(['banner:music:mute-and-unmute', problems]);
  }

  // Music off in Options: only mute shows, and a click turns music on.
  {
    const problems = [];
    await fresh(page, url, 'hub');
    await one(page, STUB_AUDIO);
    await one(page, `document.getElementById('audio_no').click(); true`);
    if (!(await gone(page, 'music-play')) || !(await gone(page, 'music-skip'))) problems.push('play or skip still shows with music off');
    if (await gone(page, 'music-mute')) problems.push('the mute toggle is hidden with music off');
    if ((await attr(page, 'music-mute', 'aria-pressed')) !== 'true') problems.push('the mute toggle does not read "off" with music off');
    await click(page, 'music-mute');
    const after = await one(page, `({ off: dendryUI.disable_audio, yes: document.getElementById('audio_yes').checked })`);
    if (after.off !== false || after.yes !== true) problems.push(`the toggle did not turn music on: ${JSON.stringify(after)}`);
    if (await gone(page, 'music-play')) problems.push('play did not come back with music on');
    if ((await attr(page, 'music-mute', 'aria-pressed')) !== 'false') problems.push('the toggle still reads "off" with music on');
    out.push(['banner:music:off-in-options-and-back', problems]);
  }
  return out;
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

      // Before a game the title button does nothing.
      {
        const problems = [];
        await fresh(page, url, 'title');
        await evaluate(page, `document.getElementById('banner-toggle').click(); true`);
        await delay(SETTLE_MS);
        if (await isSlim(page)) problems.push('a click on the title slimmed the banner before a game');
        if ((await headerHeight(page)) < 34) problems.push('the banner shrank before a game');
        if ((await expanded(page)) !== null) problems.push('the title button carries aria-expanded before a game');
        record('banner:title:never-collapses', problems);
      }

      // The game starts: slim. Expanding, then the next page: slim again.
      {
        const problems = [];
        await fresh(page, url, 'hub');
        if (!(await isSlim(page))) problems.push('not slim at the hub');
        if ((await expanded(page)) !== 'false') problems.push('aria-expanded is not "false" on the strip');
        await expand(page);
        if (await isSlim(page)) problems.push('a click did not expand the banner');
        if ((await expanded(page)) !== 'true') problems.push('aria-expanded is not "true" once expanded');
        // A redraw in place (the sidebar refreshed) is not a new page: the
        // banner stays as the player left it.
        await evaluate(page, `window.updateSidebar(); true`);
        await delay(150);
        if (await isSlim(page)) problems.push('an in-place redraw collapsed the banner');
        await nextPage(page);
        await delay(SETTLE_MS);
        if (!(await isSlim(page))) problems.push('the next page did not collapse the banner');
        record('banner:expand-then-next-page-collapses', problems);
      }

      // A big scroll collapses it; a small one does not.
      {
        const problems = [];
        await fresh(page, url, 'hub');
        // The hub fits a laptop's window now, so the page has nowhere to
        // scroll; room under it stands in for a taller page.
        await evaluate(page, `document.body.style.paddingBottom = '600px'; true`);
        await expand(page);
        await evaluate(page, `window.scrollBy(0, 5); true`);
        await delay(150);
        if (await isSlim(page)) problems.push('a 5px scroll collapsed the banner');
        await evaluate(page, `window.scrollBy(0, 150); true`);
        await delay(150);
        if (!(await isSlim(page))) problems.push('a 150px scroll did not collapse the banner');
        record('banner:scroll-collapses', problems);
      }

      // Hover does nothing.
      {
        const problems = [];
        await fresh(page, url, 'hub');
        await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 100, y: 10 });
        await delay(SETTLE_MS);
        if (!(await isSlim(page))) problems.push('hovering the strip expanded it');
        record('banner:hover-does-nothing', problems);
      }

      // Motion: the height change animates, and under reduced motion it
      // does not.
      {
        const problems = [];
        // Some machines report reduced motion to headless Chrome already.
        await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
        await fresh(page, url, 'hub');
        await toggle(page);
        if ((await animations(page)) < 1) problems.push('the expand did not animate');
        await delay(SETTLE_MS);
        const left = await animations(page);
        if (left !== 0) problems.push(`${left} animation(s) still running after ${SETTLE_MS}ms`);
        if (await evaluate(page, `document.querySelector('header').classList.contains('banner-moving')`)) {
          problems.push('banner-moving left on the header');
        }
        record('banner:animates', problems);
      }
      // The decision and depth panels keep their shared bottom edge, and stay
      // at or below the state panel's, while the banner moves: the columns'
      // top changes every frame, and the dashboard's box and the panels'
      // minimum heights follow. The dashboard is as tall as its column, so
      // every bottom moves down with the expanded banner and back up after.
      {
        const problems = [];
        await fresh(page, url, 'hub-month');
        const bottoms = () => evaluate(page, `['stats_sidebar', 'content', 'depth_column'].map((id) => document.getElementById(id).getBoundingClientRect().bottom)`);
        const FOLD = 768 - 8;
        // The bottoms as [state, decision, depth]: the decision and depth
        // pair must agree, and the state panel must not pass them or the fold.
        const spread = (list) => Math.max(Math.abs(list[1] - list[2]), Math.max(0, list[0] - list[1]), Math.max(0, list[0] - FOLD));
        const first = await bottoms();
        if (spread(first) > 1) problems.push(`slim, the panel bottoms differ: ${first.map((n) => Math.round(n)).join(', ')}`);
        await toggle(page);
        for (const wait of [60, 60, 60]) {
          await delay(wait);
          const list = await bottoms();
          if (spread(list) > 1.5) problems.push(`mid-animation the panel bottoms differ: ${list.map((n) => Math.round(n)).join(', ')}`);
        }
        await delay(SETTLE_MS);
        const settled = await bottoms();
        if (spread(settled) > 1) problems.push(`expanded, the panel bottoms differ: ${settled.map((n) => Math.round(n)).join(', ')}`);
        await toggle(page);
        await delay(SETTLE_MS);
        const slimmed = await bottoms();
        if (spread(slimmed) > 1) problems.push(`slim again, the panel bottoms differ: ${slimmed.map((n) => Math.round(n)).join(', ')}`);
        // The expanded banner pushes every bottom down; slim again, they come
        // back to where they started.
        if (!(settled[0] > first[0] + 8 && settled[1] > first[1] + 8 && settled[2] > first[2] + 8)) problems.push(`expanded, the bottoms did not move down: ${first.map((n) => Math.round(n)).join(', ')} then ${settled.map((n) => Math.round(n)).join(', ')}`);
        if (slimmed.some((n, i) => Math.abs(n - first[i]) > 1)) problems.push(`slim again, the bottoms did not come back: ${first.map((n) => Math.round(n)).join(', ')} then ${slimmed.map((n) => Math.round(n)).join(', ')}`);
        record('banner:panel-bottoms-follow-the-motion', problems);
      }
      {
        const problems = [];
        await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
        await fresh(page, url, 'hub');
        const slimHeight = await headerHeight(page);
        await toggle(page);
        const running = await animations(page);
        if (running !== 0) problems.push(`${running} animation(s) under reduced motion`);
        if (!((await headerHeight(page)) > slimHeight + 8)) problems.push('the banner did not expand at once');
        await toggle(page);
        if ((await headerHeight(page)) !== slimHeight) problems.push('the banner did not collapse at once');
        await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
        record('banner:reduced-motion-no-animation', problems);
      }

      // Keyboard: Tab reaches the title, the music controls and the three
      // links in order on the strip; Enter on the title expands it; Enter
      // again collapses.
      {
        const problems = [];
        await fresh(page, url, 'hub');
        await evaluate(page, STUB_AUDIO);
        await evaluate(page, `document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0); true`);
        const order = [];
        for (let i = 0; i < 7; i += 1) {
          await press(page, 'Tab', 'Tab', 9);
          order.push(await focused(page));
        }
        const want = ['banner-toggle', 'music-play', 'music-skip', 'music-mute', 'stats-link', 'Save/Load', 'Options'];
        if (order.join('|') !== want.join('|')) problems.push(`Tab order ${order.join(', ')}; expected ${want.join(', ')}`);
        await evaluate(page, `document.getElementById('banner-toggle').focus(); true`);
        await press(page, 'Enter', 'Enter', 13, '\r');
        await delay(SETTLE_MS);
        if (await isSlim(page)) problems.push('Enter on the title did not expand the banner');
        await press(page, 'Enter', 'Enter', 13, '\r');
        await delay(SETTLE_MS);
        if (!(await isSlim(page))) problems.push('a second Enter did not collapse the banner');
        record('banner:keyboard', problems);
      }

      // The music controls drive upstream's player, and the Options overlay
      // follows them (and they it).
      for (const [name, problems] of await musicControls(page, url)) record(name, problems);

      // The links work in both states, and on the title page's full banner.
      {
        await fresh(page, url, 'hub');
        record('banner:links:slim', await linksWork(page, 'slim'));
        await fresh(page, url, 'hub');
        await expand(page);
        record('banner:links:expanded', await linksWork(page, 'expanded'));
      }
      {
        const problems = [];
        await fresh(page, url, 'title');
        await evaluate(page, `Array.from(document.querySelectorAll('#header-links a')).find((e) => e.textContent.trim() === 'Options').click(); true`);
        const open = await evaluate(page, `getComputedStyle(document.getElementById('options')).display !== 'none'`);
        if (!open) problems.push('Options did not open on the title page');
        record('banner:links:title', problems);
      }

      const errors = watch.errors.filter((e) => !/play\(\) failed/.test(e));
      record('banner:no-console-errors', errors.length === 0 ? [] : errors);
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
