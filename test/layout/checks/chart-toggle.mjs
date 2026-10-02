'use strict';

import { evaluate } from '../lib/driver.mjs';

// Checks for the Seats / Polls toggle at the right of the state bar: it wears
// the tab bar's look at a small size (Jost, muted segments, the open one in
// full colour with the red underline), with colours from the column's tokens
// so dark mode follows. A bare <button> draws grey and bevelled in system sans, so the font
// and the marked segment are what tell a styled toggle from an unstyled one.

const MAX_HEIGHT = 24;

// Reads what the two buttons draw, plus what the tokens resolve to on this
// theme (a probe element takes each token through the cascade).
function readToggle(dark) {
  return async (page) => evaluate(
    page,
    `(() => {
      ${dark ? "document.body.classList.add('dark-mode');" : ''}
      const probe = document.createElement('span');
      document.body.appendChild(probe);
      const resolve = (prop, value) => {
        probe.style[prop] = value;
        return getComputedStyle(probe)[prop];
      };
      const tokens = {
        muted: resolve('color', 'var(--sc-muted)'),
        text: resolve('color', 'var(--text-color)'),
      };
      probe.remove();
      const buttons = Array.from(document.querySelectorAll('#state-bar .sc-seg.small button')).map((b) => {
        const s = getComputedStyle(b);
        return {
          text: b.textContent.trim(),
          on: b.classList.contains('on'),
          fontFamily: s.fontFamily,
          color: s.color,
          backgroundColor: s.backgroundColor,
          underline: s.borderBottomColor,
          underlineWidth: parseFloat(s.borderBottomWidth),
          height: b.getBoundingClientRect().height,
        };
      });
      return { tokens, buttons };
    })()`
  );
}

function toggleCheck(viewport, dark) {
  return {
    name: `chart-toggle:hub-month:${viewport}${dark ? ':dark' : ''}`,
    viewport,
    state: 'hub-month',
    selectors: ['#state-bar .sc-seg.small'],
    act: readToggle(dark),
    test(m) {
      if (m.elements['#state-bar .sc-seg.small'].length !== 1) return 'no Seats / Polls toggle in the state bar';
      const { tokens, buttons } = m.acted;
      if (buttons.length !== 2) return `${buttons.length} buttons, want 2`;
      const problems = [];
      for (const b of buttons) {
        if (!/jost/i.test(b.fontFamily)) problems.push(`"${b.text}" is set in ${b.fontFamily}, want Jost`);
        if (b.backgroundColor !== 'rgba(0, 0, 0, 0)') problems.push(`"${b.text}" has a ${b.backgroundColor} background, want none`);
        if (b.height > MAX_HEIGHT) problems.push(`"${b.text}" is ${b.height}px tall, max ${MAX_HEIGHT}`);
      }
      const on = buttons.filter((b) => b.on);
      const off = buttons.filter((b) => !b.on);
      if (on.length !== 1) return problems.concat(`${on.length} marked segments, want 1`).join('; ');
      if (on[0].color !== tokens.text) problems.push(`marked segment is ${on[0].color}, want the text token ${tokens.text}`);
      if (on[0].underline !== 'rgb(227, 0, 15)') problems.push(`marked segment underline is ${on[0].underline}, want the red of the tab bar`);
      if (on[0].underlineWidth < 2) problems.push(`marked underline is ${on[0].underlineWidth}px, want 2`);
      if (off[0].color !== tokens.muted) problems.push(`other segment is ${off[0].color}, want the muted token ${tokens.muted}`);
      if (off[0].underline === on[0].underline && off[0].underlineWidth > 0) {
        problems.push('the other segment carries the marked underline too');
      }
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

export default [
  toggleCheck('laptop', false),
  toggleCheck('laptop', true),
  toggleCheck('monitor', false),
];
