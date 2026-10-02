'use strict';

import { TOLERANCE } from '../lib/assert.mjs';

// Checks for the state column's Party/Defense/State toggle: exactly three
// segments on one line about 24px tall, no Polls tab, the active segment
// marked, and nothing after the labels (no peek text). Reports the bar's
// height and width.

const MAX_HEIGHT = 28;
const LABELS = ['Party', 'Defense', 'State'];

function toggleCheck(viewport, state, active) {
  return {
    name: `tab-toggle:${state}:${viewport}`,
    viewport,
    state,
    selectors: [
      '#state-column',
      '.sc-tabs',
      '.sc-tab',
      '.sc-tab.on',
      '.sc-tab .sc-peek',
      '.sc-tab small',
      '.sc-tab[data-sc-tab="polls"]',
    ],
    test(m) {
      const [bar] = m.elements['.sc-tabs'];
      const tabs = m.elements['.sc-tab'];
      const on = m.elements['.sc-tab.on'];
      if (!bar) return '.sc-tabs not found';
      const problems = [];
      if (tabs.length !== 3) problems.push(`${tabs.length} segments, want 3`);
      if (m.elements['.sc-tab[data-sc-tab="polls"]'].length > 0) problems.push('a Polls tab is still in the state column');
      for (const tab of tabs) {
        if (tab.rect.height > MAX_HEIGHT) problems.push(`segment "${tab.text}" is ${tab.rect.height}px tall, max ${MAX_HEIGHT}`);
      }
      if (tabs.length === 3 && tabs.some((tab) => Math.abs(tab.rect.top - tabs[0].rect.top) > TOLERANCE)) {
        problems.push('segments are not on one line');
      }
      if (on.length !== 1) problems.push(`${on.length} active segments, want 1`);
      else if (!on[0].text.startsWith(active)) problems.push(`active segment "${on[0].text}", expected "${active}"`);
      if (m.elements['.sc-tab .sc-peek'].length > 0 || m.elements['.sc-tab small'].length > 0) problems.push('a tab still carries peek text');
      if (tabs.map((tab) => tab.text).join(',') !== LABELS.join(',')) problems.push(`tabs read ${tabs.map((tab) => `"${tab.text}"`).join(', ')}, expected ${LABELS.join(', ')} and nothing after`);
      for (const tab of tabs) {
        if (tab.scrollWidth > tab.clientWidth + TOLERANCE) problems.push(`segment "${tab.text}" is cut off`);
      }
      if (viewport === 'laptop' && state === 'hub') {
        console.log(`tab bar at ${viewport}: ${bar.rect.height.toFixed(1)}px tall, ${bar.rect.width.toFixed(1)}px wide (segments ${tabs.map((tab) => tab.rect.width.toFixed(1)).join(' + ')})`);
      }
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

export default [
  toggleCheck('laptop', 'hub', 'Party'),
  toggleCheck('laptop', 'hub-defense', 'Defense'),
  toggleCheck('monitor', 'hub', 'Party'),
  toggleCheck('monitor', 'hub-defense', 'Defense'),
  toggleCheck('laptop', 'hub-state', 'State'),
  toggleCheck('monitor', 'hub-state', 'State'),
];
