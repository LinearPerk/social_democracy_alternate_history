'use strict';

// Checks for the Party tab: the tab reads "Party" and nothing after it, and
// the depth-term hooks are in place.

const tabCheck = {
  name: 'party-tab:tab-bar:laptop',
  viewport: 'laptop',
  state: 'hub',
  selectors: ['.sc-tab[data-sc-tab="party"]', '.sc-tab[data-sc-tab="party"] .sc-peek'],
  test(m) {
    const [tab] = m.elements['.sc-tab[data-sc-tab="party"]'];
    if (!tab) return 'party tab not found';
    const problems = [];
    if (tab.text !== 'Party') problems.push(`tab reads "${tab.text}", expected "Party"`);
    if (m.elements['.sc-tab[data-sc-tab="party"] .sc-peek'].length > 0) problems.push('the tab still carries a peek');
    return problems.length === 0 ? true : problems.join('; ');
  },
};

// The span's text: the table's header row reads "Faction" (its entry is "Factions").
const SLUGS = {
  factions: 'Faction',
  'party-resources': 'Party resources',
};

const depthTermCheck = {
  name: 'party-tab:depth-terms:laptop',
  viewport: 'laptop',
  state: 'hub',
  selectors: Object.keys(SLUGS).map((slug) => `[data-depth-term="${slug}"]`),
  test(m) {
    const problems = [];
    for (const [slug, text] of Object.entries(SLUGS)) {
      const found = m.elements[`[data-depth-term="${slug}"]`];
      if (found.length !== 1) problems.push(`${slug}: found ${found.length}, expected 1`);
      else if (found[0].text !== text) problems.push(`${slug}: text "${found[0].text}", expected "${text}"`);
    }
    return problems.length === 0 ? true : problems.join('; ');
  },
};

export default [tabCheck, depthTermCheck];
