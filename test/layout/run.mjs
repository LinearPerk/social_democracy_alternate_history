#!/usr/bin/env node
'use strict';

// Drives the built game in headless Chrome over the DevTools protocol and
// checks its layout at named viewports and game states. See README.md.

import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { closeChrome, launchChrome } from './lib/chrome.mjs';
import { openPage } from './lib/cdp.mjs';
import { parseArgs } from './lib/cli.mjs';
import {
  fillDepthColumn,
  measure,
  navigate,
  scrollToBottom,
  setFontSize,
  setViewport,
  shortenContent,
  stubAlert,
  watchConsole,
} from './lib/driver.mjs';
import { exitCode, formatLine } from './lib/report.mjs';
import { selectCheckFiles, unknownNames } from './lib/select-checks.mjs';
import { reachState } from './lib/states.mjs';
import { VIEWPORTS } from './lib/viewports.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadCheckFiles() {
  const dir = join(__dirname, 'checks');
  const filenames = (await readdir(dir)).filter((name) => name.endsWith('.mjs')).sort();
  const files = [];
  for (const filename of filenames) {
    const id = filename.slice(0, -'.mjs'.length);
    const mod = await import(pathToFileURL(join(dir, filename)).href);
    files.push({ id, checks: mod.default });
  }
  return files;
}

async function runCheck(page, watch, url, check) {
  try {
    if (!VIEWPORTS[check.viewport]) {
      throw new Error(`unknown viewport: ${check.viewport}`);
    }
    await setViewport(page, VIEWPORTS[check.viewport]);
    watch.clear();
    await navigate(page, check.query ? url + check.query : url);
    await stubAlert(page);
    await reachState(page, check.state);
    if (check.depth) await fillDepthColumn(page);
    if (check.shortContent) await shortenContent(page);
    if (check.fontSize) await setFontSize(page, check.fontSize);
    if (check.scrollTo === 'bottom') await scrollToBottom(page);
    // Optional: a check that needs clicks or hovers drives the page itself
    // and hands what it saw to test() as measurements.acted.
    const acted = check.act ? await check.act(page) : undefined;

    const measurements = await measure(page, check.selectors);
    measurements.acted = acted;
    measurements.consoleErrors = [...watch.errors];

    const result = check.test(measurements);
    return result === true
      ? { name: check.name, ok: true }
      : { name: check.name, ok: false, reason: String(result) };
  } catch (err) {
    return { name: check.name, ok: false, reason: err.message };
  }
}

async function main() {
  const { url, names } = parseArgs(process.argv.slice(2));
  const files = await loadCheckFiles();

  const unknown = unknownNames(files, names);
  if (unknown.length > 0) {
    console.error(`no such check file: ${unknown.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const selected = selectCheckFiles(files, names);
  if (selected.length === 0) {
    console.error('no check files found in test/layout/checks');
    process.exitCode = 1;
    return;
  }

  // A Ctrl+C or a kill signal should still leave Chrome and its profile
  // cleaned up, not orphaned, even if it arrives while Chrome is still
  // starting up. `chrome` is filled in by launchChrome's onSpawn as soon as
  // the process exists, so the handler has something to clean up from the
  // start rather than only after launchChrome resolves.
  let chrome = null;
  let cleanedUp = false;
  const cleanupAndExit = (signal) => {
    if (cleanedUp) return;
    cleanedUp = true;
    const toClose = chrome;
    (toClose ? closeChrome(toClose) : Promise.resolve()).finally(() => {
      process.exit(signal === 'SIGINT' ? 130 : 143);
    });
  };
  process.on('SIGINT', cleanupAndExit);
  process.on('SIGTERM', cleanupAndExit);

  const results = [];
  try {
    chrome = await launchChrome({ onSpawn: (partial) => { chrome = partial; } });

    const page = await openPage(chrome.port);
    try {
      await page.send('Page.enable');
      await page.send('Runtime.enable');
      await page.send('Log.enable');
      const watch = watchConsole(page);

      for (const file of selected) {
        for (const check of file.checks) {
          results.push(await runCheck(page, watch, url, check));
        }
      }
    } finally {
      await page.close();
    }
  } finally {
    cleanedUp = true;
    process.removeListener('SIGINT', cleanupAndExit);
    process.removeListener('SIGTERM', cleanupAndExit);
    if (chrome) await closeChrome(chrome);
  }

  for (const result of results) console.log(formatLine(result));
  process.exitCode = exitCode(results);
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exitCode = 1;
});
