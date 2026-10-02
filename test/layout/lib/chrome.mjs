'use strict';

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const DEFAULT_CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const LAUNCH_TIMEOUT_MS = 10000;
const RMSYNC_ATTEMPTS = 5;
const RMSYNC_RETRY_DELAY_MS = 300;

// Launches headless Chrome with a fresh profile and waits for it to publish
// its DevTools port. The caller drives it over CDP and calls closeChrome()
// when done, pass or fail.
//
// `onSpawn(partial)`, if given, fires the moment the process exists (before
// its DevTools port is known), with the same object this function goes on
// to return. That lets a caller register signal-based cleanup that can
// still reach Chrome if it's interrupted while still starting up.
export async function launchChrome({ onSpawn } = {}) {
  const chromePath = process.env.CHROME_PATH || DEFAULT_CHROME_PATH;
  const userDataDir = mkdtempSync(join(tmpdir(), 'sd-layout-'));
  const proc = spawn(
    chromePath,
    ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${userDataDir}`],
    { stdio: 'ignore' }
  );
  const chrome = { proc, userDataDir, port: null, closed: false };
  if (onSpawn) onSpawn(chrome);

  let launchError = null;
  let exitInfo = null;
  proc.once('error', (err) => {
    launchError = err;
  });
  proc.once('exit', (code, signal) => {
    exitInfo = { code, signal };
  });

  const portFile = join(userDataDir, 'DevToolsActivePort');
  let port = null;
  const deadline = Date.now() + LAUNCH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    // Chrome crashing or failing to start shows up as an early exit; don't
    // keep polling for a port file it will never write.
    if (launchError || exitInfo) break;
    if (existsSync(portFile)) {
      const firstLine = readFileSync(portFile, 'utf8').split('\n')[0].trim();
      if (firstLine) {
        port = Number(firstLine);
        break;
      }
    }
    await delay(100);
  }

  if (!port) {
    chrome.closed = true;
    try { proc.kill(); } catch { /* already gone */ }
    try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* best effort */ }
    const reason = launchError
      ? launchError.message
      : exitInfo
        ? `Chrome exited early (code ${exitInfo.code}, signal ${exitInfo.signal})`
        : `no DevTools port after ${LAUNCH_TIMEOUT_MS}ms (looked for ${portFile})`;
    throw new Error(`could not launch Chrome at ${chromePath}: ${reason}`);
  }

  chrome.port = port;
  return chrome;
}

// Kills Chrome and removes its profile directory. Safe to call once even if
// the run failed partway through; safe to call more than once.
export async function closeChrome(chrome) {
  if (!chrome || chrome.closed) return;
  chrome.closed = true;

  await new Promise((resolve) => {
    if (chrome.proc.exitCode !== null || chrome.proc.signalCode !== null) {
      resolve();
      return;
    }
    chrome.proc.once('exit', resolve);
    try {
      chrome.proc.kill();
    } catch {
      resolve();
      return;
    }
    // Chrome should exit promptly; don't hang the harness if it doesn't, and
    // don't let this fallback timer keep the process alive by itself.
    delay(3000, undefined, { ref: false }).then(resolve);
  });

  for (let attempt = 1; attempt <= RMSYNC_ATTEMPTS; attempt++) {
    try {
      rmSync(chrome.userDataDir, { recursive: true, force: true });
      return;
    } catch (err) {
      if (attempt === RMSYNC_ATTEMPTS) {
        console.error(`warning: could not remove Chrome profile ${chrome.userDataDir}: ${err.message}`);
        // Give a piped stderr a moment to flush before the caller (possibly
        // a signal handler about to force process.exit()) can cut it off.
        await delay(50);
        return;
      }
      // Windows can briefly hold a lock on a just-killed process's files.
      await delay(RMSYNC_RETRY_DELAY_MS);
    }
  }
}
