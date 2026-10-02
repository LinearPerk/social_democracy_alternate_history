'use strict';

// Change feedback on the tabs: a dot on a shut tab whose figures changed, a
// flash on the open tab's row that changed, and the per-tab lists of
// qualities that drive both.

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const View = require('../../out/html/state-column/view.js');

function loadFixture(name) {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures', name + '.json'), 'utf8')
  );
}

const start1928 = loadFixture('start1928');
const gov1932 = loadFixture('gov1932');
const crisis1930 = loadFixture('crisis1930');

function bar(html) {
  return html.match(/<div class="sc-tabs">[\s\S]*?<\/div>/)[0];
}

function tabButton(html, key) {
  return html.match(new RegExp('<button[^>]*data-sc-tab="' + key + '"[^>]*>[\\s\\S]*?</button>'))[0];
}

// ---- the dot -------------------------------------------------------------------

test('no dot anywhere when nothing has changed since the month began', () => {
  const html = View.render(gov1932, gov1932, { tab: 'party' });
  assert.doesNotMatch(bar(html), /sc-dot/);
});

test('a shut tab whose figure changed since the baseline carries a dot, titled with how many changed', () => {
  const base = Object.assign({}, gov1932, { inflation: 0.2, economic_growth: 3, sa_militancy: 0.1 });
  const html = View.render(gov1932, base, { tab: 'party' });
  // State: inflation and growth changed. Defense: one figure (SA militancy).
  assert.match(tabButton(html, 'state'), /State<i class="sc-dot" role="img" aria-label="2 figures changed" title="2 figures changed"><\/i><\/button>/);
  assert.match(tabButton(html, 'defense'), /Defense<i class="sc-dot" role="img" aria-label="1 figure changed" title="1 figure changed"><\/i><\/button>/);
  assert.doesNotMatch(tabButton(html, 'party'), /sc-dot/);
});

test('the open tab never carries a dot, even with changes under it', () => {
  const base = Object.assign({}, gov1932, { inflation: 0.2, resources: 9, sa_militancy: 0.1 });
  for (const tab of ['party', 'defense', 'state']) {
    const html = View.render(gov1932, base, { tab });
    assert.doesNotMatch(tabButton(html, tab), /sc-dot/, tab);
  }
});

test('the dot is 6px, in the accent red, and a tab carries at most the label and the dot', () => {
  const css = fs.readFileSync(path.join(__dirname, '../../out/html/state-column/state-column.css'), 'utf8');
  const rule = css.match(/#state-column \.sc-tab \.sc-dot \{[^}]*\}/)[0];
  assert.match(rule, /width: 6px;/);
  assert.match(rule, /height: 6px;/);
  assert.match(rule, /background: #E3000F;/);
  const html = View.render(gov1932, Object.assign({}, gov1932, { inflation: 0 }), { tab: 'party' });
  assert.equal(bar(html).replace(/<[^>]+>/g, ''), 'PartyDefenseState');
});

test('opening a tab clears its dot: what the player last saw becomes the reference; the next change brings it back', () => {
  const base = Object.assign({}, gov1932, { inflation: 0.2 });
  // Opened when it stood at gov1932's values: no change since.
  const seenAtOpen = { state: gov1932 };
  assert.equal(View.tabChanges('state', gov1932, base, { seen: seenAtOpen }), 0);
  assert.doesNotMatch(bar(View.render(gov1932, base, { tab: 'party', seen: seenAtOpen })), /sc-dot/);
  // Then something moves: the dot returns.
  const later = Object.assign({}, gov1932, { economic_growth: 5 });
  assert.equal(View.tabChanges('state', later, base, { seen: seenAtOpen }), 1);
  assert.match(tabButton(View.render(later, base, { tab: 'party', seen: seenAtOpen }), 'state'), /sc-dot/);
  // A tab never opened this month falls back to the baseline.
  assert.equal(View.tabChanges('state', later, base, { seen: {} }), 2);
});

test('the dot counts what the tab shows now: unemployment from the first month, but not the Reich police in opposition or coalition dissent out of government', () => {
  const base = Object.assign({}, start1928, { unemployed: 3, interior_police_strength: 1, interior_police_loyalty: 0, coalition_dissent: 3 });
  const q = Object.assign({}, start1928, { unemployed: 9, interior_police_strength: 9, interior_police_loyalty: 4, coalition_dissent: 0 });
  // Unemployment moved, and the State tab shows it from the start.
  assert.equal(View.tabChanges('state', q, base, {}), 1);
  assert.equal(View.tabChanges('defense', q, base, {}), 0);
});

test('the party dissent percentage is not on the Party tab, so it puts no dot there', () => {
  const base = Object.assign({}, gov1932, { dissent_percent: 1 });
  assert.equal(View.tabChanges('party', gov1932, base, {}), 0);
});

// ---- the lists cover what each tab renders --------------------------------------

// Qualities each tab reads that are not figures: switches for which rows
// exist, the date (symbols), the history the chart draws.
// The coalition dissent block (Party and State) reads the government's flags,
// the guards on a vote (spd_r, constructive_vonc), what eases it (the card's
// timer, resources, historical mode), the log of what moved it and the date
// (the caller's badge); the dissents themselves are the figures.
const COALITION_SWITCHES = [
  'spd_in_government', 'in_popular_front', 'in_grand_coalition', 'in_weimar_coalition', 'in_left_front',
  'in_minority_government', 'constructive_vonc', 'spd_r', 'coalition_affairs_timer', 'historical_mode',
  'sc_coalition_log', 'year', 'month',
];

const NOT_FIGURES = {
  party: ['neorevisionism'].concat(COALITION_SWITCHES),
  defense: ['spd_in_government', 'year', 'month'],
  state: ['in_spd_majority', 'resources', 'sc_history'].concat(COALITION_SWITCHES),
};

function readKeys(tab, q, opts) {
  const read = new Set();
  const proxy = new Proxy(q, {
    get(target, key) {
      if (typeof key === 'string') read.add(key);
      return target[key];
    },
  });
  View.renderTab(tab, proxy, q, opts);
  return read;
}

const HISTORY = JSON.stringify([
  { year: 1932, month: 7, inflation: 0.9, growth: 1.5, unemployed: 21, budget: 3 },
  { year: 1932, month: 8, inflation: 0.8, growth: 1.2, unemployed: 21.5, budget: 3 },
]);

const STATES = {
  opposition: start1928,
  'popular front': Object.assign({}, gov1932, { sc_history: HISTORY }),
  'left front': Object.assign({}, gov1932, { in_popular_front: 0, in_left_front: 1, sc_history: HISTORY }),
  'grand coalition': Object.assign({}, gov1932, { in_popular_front: 0, in_grand_coalition: 1, sc_history: HISTORY }),
  'spd majority': Object.assign({}, gov1932, { in_popular_front: 0, in_spd_majority: 1 }),
  tolerating: crisis1930,
};

for (const tab of ['party', 'defense', 'state']) {
  for (const [name, q] of Object.entries(STATES)) {
    test(`${tab} tab (${name}): its quality list is exactly the figures its markup reads`, () => {
      const listed = View.TAB_QUALITIES[tab](q);
      const read = readKeys(tab, q, { symbols: 'period' });
      const missing = listed.filter((k) => !read.has(k));
      assert.deepEqual(missing, [], `listed but the tab never reads them: ${missing.join(', ')}`);
      const unlisted = [...read].filter((k) => !listed.includes(k) && !NOT_FIGURES[tab].includes(k));
      assert.deepEqual(unlisted, [], `read by the tab but missing from its list: ${unlisted.join(', ')}`);
    });
  }
}

test('every tab has a list, and the lists name no quality twice', () => {
  for (const [key] of View.TABS) {
    const list = View.TAB_QUALITIES[key](gov1932);
    assert.ok(list.length > 0, key);
    assert.equal(new Set(list).size, list.length, key);
  }
});

test('the lists follow the game: Neorevisionists, the Reich police, unemployment, the budget, coalition dissents', () => {
  assert.ok(!View.TAB_QUALITIES.party(start1928).includes('neorevisionist_strength'));
  assert.ok(View.TAB_QUALITIES.party(gov1932).includes('neorevisionist_dissent'));
  assert.ok(!View.TAB_QUALITIES.defense(start1928).includes('interior_police_strength'));
  assert.ok(View.TAB_QUALITIES.defense(gov1932).includes('interior_police_loyalty'));
  assert.ok(View.TAB_QUALITIES.defense(gov1932).includes('sa_militancy'));
  assert.ok(View.TAB_QUALITIES.state(start1928).includes('unemployed'));
  assert.ok(!View.TAB_QUALITIES.state(start1928).includes('budget'));
  assert.deepEqual(View.TAB_QUALITIES.state(gov1932), ['inflation', 'economic_growth', 'unemployed', 'budget', 'coalition_dissent', 'kpd_coalition_dissent']);
});

// ---- the flash --------------------------------------------------------------------

function flashed(html) {
  return (html.match(/class="[^"]*\bsc-flash\b[^"]*"/g) || []).length;
}

test('nothing flashes without a previous render to compare with', () => {
  for (const tab of ['party', 'defense', 'state']) {
    assert.equal(flashed(View.renderTab(tab, gov1932, gov1932, { last: null })), 0, tab);
    assert.equal(flashed(View.renderTab(tab, gov1932, gov1932, {})), 0, tab);
  }
});

test('nothing flashes when the previous render held the same figures', () => {
  for (const tab of ['party', 'defense', 'state']) {
    assert.equal(flashed(View.renderTab(tab, gov1932, gov1932, { last: gov1932 })), 0, tab);
  }
});

test('the row of a figure that changed since the last render flashes, and only that row', () => {
  const state = View.renderTab('state', gov1932, gov1932, { last: Object.assign({}, gov1932, { economic_growth: 3 }) });
  assert.equal(flashed(state), 1);
  assert.match(state, /<div class="sc-row sc-fig sc-flash"[^>]*><span class="lbl">Growth</);

  const party = View.renderTab('party', gov1932, gov1932, { last: Object.assign({}, gov1932, { left_dissent: 1 }) });
  assert.equal(flashed(party), 1);
  assert.match(party, /<div class="sc-frow sc-flash" title="Left:/);
  const resources = View.renderTab('party', gov1932, gov1932, { last: Object.assign({}, gov1932, { resources: 7 }) });
  assert.match(resources, /<div class="sc-row sc-flash"><span class="lbl sc-sub">/);

  const defense = View.renderTab('defense', gov1932, gov1932, { last: Object.assign({}, gov1932, { sa_militancy: 0.1 }) });
  assert.equal(flashed(defense), 1);
  assert.match(defense, /<button type="button" class="sc-drow sc-flash" data-depth-entry="defense:sa"/);
  const size = View.renderTab('defense', gov1932, gov1932, { last: Object.assign({}, gov1932, { rb_strength: 1 }) });
  assert.match(size, /class="sc-drow sc-flash" data-depth-entry="defense:rb"/);
});

test('the coalition rows flash too', () => {
  const html = View.renderTab('state', gov1932, gov1932, { last: Object.assign({}, gov1932, { coalition_dissent: 0, kpd_coalition_dissent: 0 }) });
  assert.equal(flashed(html), 2);
});

test('a quality the tab does not show never flashes it', () => {
  const html = View.renderTab('state', gov1932, gov1932, { last: Object.assign({}, gov1932, { resources: 9, year: 1931, sa_militancy: 0.1 }) });
  assert.equal(flashed(html), 0);
});

test('the delta markers stay as they were, with or without the flash', () => {
  const base = Object.assign({}, gov1932, { economic_growth: -1 });
  const plain = View.renderTab('state', gov1932, base, {});
  const withFlash = View.renderTab('state', gov1932, base, { last: base });
  assert.equal(withFlash.replace(' sc-flash', ''), plain);
  assert.match(plain, /sc-delta good/);
});

test('the flash runs 600ms in the accent colour and only for people who allow motion', () => {
  const css = fs.readFileSync(path.join(__dirname, '../../out/html/state-column/state-column.css'), 'utf8');
  const media = css.match(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}/)[0];
  assert.match(media, /\.sc-flash \{[^}]*animation: sc-flash 600ms/);
  // The class itself is outside the media query only as a hook: no animation there.
  const outside = css.replace(media, '');
  assert.doesNotMatch(outside, /\.sc-flash \{[^}]*animation/);
  const keyframes = css.match(/@keyframes sc-flash \{[\s\S]*?\n\}/)[0];
  assert.match(keyframes, /from \{\s*background-color: var\(--sc-flash\);/);
  assert.match(keyframes, /to \{\s*background-color: transparent;/);
  assert.match(css, /--sc-flash: rgba\(227, 0, 15, 0\.2\)/);
});
