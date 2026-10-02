'use strict';

import { setTimeout as delay } from 'node:timers/promises';

// Everything that pokes at a live page over CDP: navigation, viewport, DOM
// queries, and measurement. States built from these primitives live in
// states.mjs.

export async function evaluate(page, expression) {
  const result = await page.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    const description = result.exceptionDetails.exception?.description || result.exceptionDetails.text;
    throw new Error(`page evaluation failed: ${description}`);
  }
  return result.result.value;
}

function waitForEvent(page, method, timeoutMs) {
  return new Promise((resolve, reject) => {
    let off;
    const timer = setTimeout(() => {
      off();
      reject(new Error(`timed out waiting for ${method}`));
    }, timeoutMs);
    off = page.on(method, (params) => {
      clearTimeout(timer);
      off();
      resolve(params);
    });
  });
}

export async function navigate(page, url, { timeoutMs = 15000 } = {}) {
  const loaded = waitForEvent(page, 'Page.loadEventFired', timeoutMs);
  // If Page.navigate itself rejects below, `loaded` is left pending and will
  // eventually reject on its own timeout with nothing awaiting it. Give it a
  // silent consumer so that isn't reported as an unhandled rejection; the
  // real error still surfaces from the `await page.send(...)` below.
  loaded.catch(() => {});
  await page.send('Page.navigate', { url });
  await loaded;
}

export async function setViewport(page, { width, height }) {
  await page.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
}

export async function stubAlert(page) {
  await evaluate(page, `(() => { window.alert = () => {}; return true; })()`);
}

export async function hasSelector(page, selector) {
  return evaluate(page, `!!document.querySelector(${JSON.stringify(selector)})`);
}

// The one place that knows how to find an element by its visible text.
// elementExistsWithText and clickByText are both thin wrappers around it.
async function findByText(page, selector, text, { click = false } = {}) {
  return evaluate(
    page,
    `(() => {
      const el = Array.from(document.querySelectorAll(${JSON.stringify(selector)}))
        .find((e) => e.textContent.trim() === ${JSON.stringify(text)});
      if (!el) return false;
      ${click ? 'el.click();' : ''}
      return true;
    })()`
  );
}

export async function elementExistsWithText(page, selector, text) {
  return findByText(page, selector, text);
}

export async function clickByText(page, selector, text) {
  const clicked = await findByText(page, selector, text, { click: true });
  if (!clicked) throw new Error(`no element matching ${selector} with text "${text}"`);
}

// Polls `predicate` (a zero-argument function returning a boolean, or a
// promise of one) until it is truthy, or throws once timeoutMs elapses.
export async function waitForCondition(predicate, { timeoutMs = 5000, intervalMs = 100 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await predicate()) return;
    if (Date.now() >= deadline) throw new Error('timed out waiting for condition');
    await delay(intervalMs);
  }
}

// Waits for a link with this text to exist, then clicks it. Covers the gap
// between a scene changing #content and the new links being queryable; in
// practice the game renders synchronously, so this usually returns at once.
export async function waitAndClickByText(page, selector, text, { timeoutMs = 5000 } = {}) {
  await waitForCondition(() => elementExistsWithText(page, selector, text), { timeoutMs });
  await clickByText(page, selector, text);
}

export async function clickFirst(page, selector) {
  const clicked = await evaluate(
    page,
    `(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      el.click();
      return true;
    })()`
  );
  if (!clicked) throw new Error(`no element matching ${selector}`);
}

export async function fillDepthColumn(page) {
  await evaluate(
    page,
    `(() => {
      const el = document.getElementById('depth_column');
      if (el) el.innerHTML = '<p>Depth test.</p>';
      return true;
    })()`
  );
}

// Replaces #content's HTML with one short paragraph, the way a page with
// little text (a played card's result, a short election page) renders. Long
// prose fills the column and hides any shrink-to-fit sizing.
export async function shortenContent(page) {
  await evaluate(
    page,
    `(() => {
      const el = document.getElementById('content');
      if (el) el.innerHTML = '<p>Short page.</p>';
      return true;
    })()`
  );
}

// Sets the font size the way the Options control does: an inline style on
// #content and #stats_sidebar, replacing whatever style attribute they had.
export async function setFontSize(page, size) {
  await evaluate(
    page,
    `(() => {
      for (const id of ['content', 'stats_sidebar']) {
        const el = document.getElementById(id);
        if (el) el.setAttribute('style', 'font-size: ' + ${JSON.stringify(size)} + ';');
      }
      return true;
    })()`
  );
}

export async function scrollToBottom(page) {
  await evaluate(page, `(() => { window.scrollTo(0, document.documentElement.scrollHeight); return true; })()`);
}

// Collects console errors for the life of `page`: explicit console.error
// calls, uncaught exceptions (including rejected promises, which is how the
// audio autoplay block surfaces), and browser-level error log entries such
// as a failed resource load. The missing favicon is a known, non-layout gap
// in the build, not a check failure, so it's filtered out here rather than
// in every check. Call clear() before each check.
export function watchConsole(page) {
  const errors = [];
  page.on('Runtime.consoleAPICalled', (params) => {
    if (params.type === 'error') {
      errors.push(params.args.map((arg) => arg.value ?? arg.description ?? '').join(' '));
    }
  });
  page.on('Runtime.exceptionThrown', (params) => {
    const details = params.exceptionDetails;
    errors.push(details.exception?.description || details.text || 'unknown exception');
  });
  page.on('Log.entryAdded', (params) => {
    if (params.entry.level !== 'error') return;
    if (params.entry.url && params.entry.url.endsWith('/favicon.ico')) return;
    errors.push(params.entry.text);
  });
  return {
    errors,
    clear() {
      errors.length = 0;
    },
  };
}

// For every match of each selector: getBoundingClientRect (x/y/width/height
// plus top/right/bottom/left), computed display, position, overflow-y,
// background-color, font-family, font size and weight, line height, letter
// spacing, text indent, bottom margin and top padding (all px as numbers),
// text-transform, scroll/client height, and
// scroll/client/offset width (offset minus client is a vertical scrollbar's width).
// Plus tagName, role, aria-current, aria-disabled, tabindex, title, class,
// trimmed text, cursor, the top border style, and the widest of the four
// border widths (px), for checks on what an element looks like it does. Plus the page's scrollWidth and the viewport size.
// A selector with no matches measures as an empty array.
export async function measure(page, selectors) {
  return evaluate(
    page,
    `(() => {
      function describe(el) {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return {
          rect: {
            x: rect.x, y: rect.y, width: rect.width, height: rect.height,
            top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left,
          },
          display: style.display,
          position: style.position,
          overflowY: style.overflowY,
          backgroundColor: style.backgroundColor,
          fontFamily: style.fontFamily,
          fontSize: parseFloat(style.fontSize),
          fontWeight: style.fontWeight,
          lineHeight: parseFloat(style.lineHeight),
          letterSpacing: parseFloat(style.letterSpacing),
          textIndent: parseFloat(style.textIndent),
          marginBottom: parseFloat(style.marginBottom),
          paddingTop: parseFloat(style.paddingTop),
          textTransform: style.textTransform,
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          offsetWidth: el.offsetWidth,
          tagName: el.tagName.toLowerCase(),
          role: el.getAttribute('role'),
          ariaCurrent: el.getAttribute('aria-current'),
          text: el.textContent.trim(),
          cursor: style.cursor,
          borderStyle: style.borderTopStyle,
          className: el.getAttribute('class') || '',
          ariaDisabled: el.getAttribute('aria-disabled'),
          disabled: !!el.disabled,
          tabindex: el.getAttribute('tabindex'),
          title: el.getAttribute('title') || '',
          borderWidth: Math.max(
            parseFloat(style.borderTopWidth), parseFloat(style.borderRightWidth),
            parseFloat(style.borderBottomWidth), parseFloat(style.borderLeftWidth)
          ),
        };
      }
      const elements = {};
      for (const selector of ${JSON.stringify(selectors || [])}) {
        elements[selector] = Array.from(document.querySelectorAll(selector)).map(describe);
      }
      return {
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        // Not window.innerWidth: body keeps its scrollbar gutter always on
        // (game.css \`overflow-y: scroll\`), so innerWidth overstates the
        // width actually available to laid-out content by the scrollbar's
        // width. clientWidth is what content centers and overflows against.
        clientWidth: document.documentElement.clientWidth,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        elements,
      };
    })()`
  );
}
