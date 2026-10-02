'use strict';

import { evaluate, waitForCondition, hasSelector, waitAndClickByText } from '../lib/driver.mjs';
import { setTimeout as delay } from 'node:timers/promises';

// The coalition dissent block at the foot of the Party and State tabs: one
// block per partner that can call a vote of no confidence, drawn as a row (the
// label, a track of one segment per step to the vote, the band word), the
// sentence and two notes, as much as the tab has room for (state-column.js
// picks the size so no tab is taller than Defense). The block is a button that
// opens the Coalition dissent entry, whose live part draws the same track.
// Each check starts at the government hub (a Grand Coalition, dissent 0) and
// sets what it needs, as the other state checks do.

const AUDIO_AUTOPLAY_BLOCK = /play\(\) failed because the user didn't interact/;
const realErrors = (m) => m.consoleErrors.filter((e) => !AUDIO_AUTOPLAY_BLOCK.test(e));

const SET = (values) => `(() => {
  Object.assign(window.dendryUI.dendryEngine.state.qualities, ${JSON.stringify(values)});
  window.updateSidebar();
  return true;
})()`;

const NO_GOVERNMENT = {
  in_grand_coalition: 0, in_weimar_coalition: 0, in_popular_front: 0, in_left_front: 0,
  in_minority_government: 0, in_emergency_government: 0, in_spd_majority: 0,
};

// Opens each tab in turn and reads what it shows: the coalition blocks, and
// the tab body's natural height (its minimum lifted, as stable-height does).
const READ = `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const rect = (el) => el.getBoundingClientRect();
  const out = {};
  for (const tab of ['party', 'defense', 'state']) {
    document.querySelector('#state-column [data-sc-tab="' + tab + '"]').click();
    await wait(300);
    const col = document.getElementById('state-column');
    const body = col.querySelector('.sc-body');
    const sidebar = document.getElementById('stats_sidebar');
    const keep = body.style.minHeight;
    body.style.minHeight = '';
    const natural = rect(body).height;
    body.style.minHeight = keep;
    const plain = (el) => {
      const copy = el.cloneNode(true);
      copy.querySelectorAll('.sc-badge').forEach((b) => b.remove());
      return copy.textContent.replace(/\\s+/g, ' ').trim();
    };
    out[tab] = {
      natural,
      scrolls: sidebar.scrollHeight > sidebar.clientHeight + 1,
      pips: col.querySelectorAll('.sc-pips').length,
      blocks: Array.from(col.querySelectorAll('.sc-cd')).map((b) => ({
        tag: b.tagName,
        entry: b.getAttribute('data-depth-entry'),
        cls: b.className,
        name: plain(b.querySelector('.cd-name')),
        // The band word alone: the change arrows sit inside the same span.
        band: b.querySelector('.cd-band').firstChild.textContent.trim(),
        segments: b.querySelectorAll('.cd-track i').length,
        filled: b.querySelectorAll('.cd-track i.on').length,
        voteLabel: plain(b.querySelector('.cd-track i:last-child')),
        say: b.querySelector('.cd-say') ? plain(b.querySelector('.cd-say')) : null,
        hasBadge: !!(b.querySelector('.cd-say .sc-badge')),
        notes: Array.from(b.querySelectorAll('.cd-note')).map(plain),
        right: rect(b).right,
        height: rect(b).height,
      })),
      columnRight: rect(col).right,
    };
  }
  return out;
})()`;

const OPEN_AND_READ_ENTRY = `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelector('#state-column [data-sc-tab="party"]').click();
  await wait(200);
  const block = document.querySelector('#state-column .sc-cd');
  const plain = (el) => {
    const copy = el.cloneNode(true);
    copy.querySelectorAll('.sc-badge').forEach((b) => b.remove());
    return copy.textContent.replace(/\\s+/g, ' ').trim();
  };
  const blockSay = plain(block.querySelector('.cd-say'));
  const blockSegments = block.querySelectorAll('.cd-track i').length;
  const blockFilled = block.querySelectorAll('.cd-track i.on').length;
  block.click();
  await wait(300);
  const col = document.getElementById('depth_column');
  const live = col.querySelector('.cde');
  const v = window.DepthColumn.view();
  return {
    view: v.kind + ':' + v.key,
    title: (col.querySelector('.dc-title') || {}).textContent || '',
    live: !!live,
    segments: live ? live.querySelectorAll('.cd-track i').length : 0,
    filled: live ? live.querySelectorAll('.cd-track i.on').length : 0,
    say: live && live.querySelector('.cde-say') ? plain(live.querySelector('.cde-say')) : '',
    headings: live ? Array.from(live.querySelectorAll('.dc-sub')).map((h) => h.textContent) : [],
    easeItems: live ? live.querySelectorAll('.cde-ease li').length : 0,
    blockSay, blockSegments, blockFilled,
  };
})()`;

const fail = (problems) => (problems.length === 0 ? true : [...new Set(problems)].join('; '));

function blockOn(m, tab, i = 0) {
  return m.acted[tab].blocks[i];
}

// ---- the block, in a Grand Coalition at rest --------------------------------------------

function restingCheck(viewport) {
  return {
    name: `coalition-block:hub-government:${viewport}:both-tabs-three-segments`,
    viewport,
    state: 'hub-government',
    selectors: [],
    async act(page) {
      await delay(600);
      return evaluate(page, READ);
    },
    test(m) {
      const problems = [];
      for (const tab of ['party', 'state']) {
        const t = m.acted[tab];
        if (t.blocks.length !== 1) { problems.push(`${tab}: ${t.blocks.length} blocks, expected 1`); continue; }
        const [b] = t.blocks;
        if (b.tag !== 'BUTTON') problems.push(`${tab}: block is a ${b.tag}`);
        if (b.entry !== 'coalition-dissent') problems.push(`${tab}: opens "${b.entry}"`);
        if (b.name !== 'Coalition dissent') problems.push(`${tab}: head "${b.name}"`);
        if (b.segments !== 3) problems.push(`${tab}: ${b.segments} segments, expected 3`);
        if (b.filled !== 0) problems.push(`${tab}: ${b.filled} filled at dissent 0`);
        if (b.voteLabel.toLowerCase() !== 'vote') problems.push(`${tab}: last segment reads "${b.voteLabel}", expected vote`);
        if (b.band !== 'calm') problems.push(`${tab}: band "${b.band}", expected calm`);
        if (b.say !== 'The partners are content.') problems.push(`${tab}: sentence "${b.say}"`);
        if (t.pips) problems.push(`${tab}: the pip row is still drawn`);
        if (b.right > t.columnRight + 1) problems.push(`${tab}: block runs past the column`);
      }
      if (realErrors(m).length > 0) problems.push(`console errors: ${realErrors(m).join(' | ')}`);
      return fail(problems);
    },
  };
}

// ---- dissent 2: one more step, the DVP ----------------------------------------------------

function strainedCheck(viewport) {
  return {
    name: `coalition-block:hub-government:${viewport}:dissent-2-names-the-dvp`,
    viewport,
    state: 'hub-government',
    selectors: [],
    async act(page) {
      await evaluate(page, SET({ coalition_dissent: 2, resources: 3 }));
      await delay(600);
      return evaluate(page, READ);
    },
    test(m) {
      const problems = [];
      for (const tab of ['party', 'state']) {
        const [b] = m.acted[tab].blocks;
        if (!b) { problems.push(`${tab}: no block`); continue; }
        if (!/^One more step and the DVP calls a vote of no confidence\.$/.test(b.say || '')) problems.push(`${tab}: sentence "${b.say}"`);
        if (!b.hasBadge) problems.push(`${tab}: no party badge in the sentence`);
        if (b.band !== 'strained') problems.push(`${tab}: band "${b.band}"`);
        if (b.segments !== 3 || b.filled !== 2) problems.push(`${tab}: ${b.filled} of ${b.segments} filled, expected 2 of 3`);
        if (!/band-strained/.test(b.cls)) problems.push(`${tab}: class ${b.cls}`);
      }
      // Neither tab may be taller than Defense, where the room under the fold runs out.
      const defense = m.acted.defense.natural;
      for (const tab of ['party', 'state']) {
        if (m.acted[tab].natural > defense + 0.5) problems.push(`${tab} body ${m.acted[tab].natural.toFixed(1)}px, taller than Defense's ${defense.toFixed(1)}px`);
        if (m.acted[tab].scrolls && viewport === 'laptop') problems.push(`${tab}: the box scrolls inside itself`);
      }
      const notes = m.acted.party.blocks[0] ? m.acted.party.blocks[0].notes : [];
      console.log(`coalition-block ${viewport}, dissent 2 in a Grand Coalition: Party ${m.acted.party.natural.toFixed(1)}px (${notes.length} notes, block ${m.acted.party.blocks[0] && m.acted.party.blocks[0].height}px), State ${m.acted.state.natural.toFixed(1)}px (${m.acted.state.blocks[0] && m.acted.state.blocks[0].notes.length} notes), Defense ${defense.toFixed(1)}px`);
      if (realErrors(m).length > 0) problems.push(`console errors: ${realErrors(m).join(' | ')}`);
      return fail(problems);
    },
  };
}

// ---- a Weimar Coalition: four segments, the Center ---------------------------------------

const weimarCheck = {
  name: 'coalition-block:hub-government:laptop:weimar-four-segments-the-centre',
  viewport: 'laptop',
  state: 'hub-government',
  selectors: [],
  async act(page) {
    await evaluate(page, SET({ ...NO_GOVERNMENT, in_weimar_coalition: 1, coalition_dissent: 3 }));
    await delay(600);
    return evaluate(page, READ);
  },
  test(m) {
    const problems = [];
    for (const tab of ['party', 'state']) {
      const [b] = m.acted[tab].blocks;
      if (!b) { problems.push(`${tab}: no block`); continue; }
      if (b.segments !== 4) problems.push(`${tab}: ${b.segments} segments, expected 4`);
      if (b.filled !== 3) problems.push(`${tab}: ${b.filled} filled, expected 3`);
      if (!/^One more step and the Center calls a vote of no confidence\.$/.test(b.say || '')) problems.push(`${tab}: sentence "${b.say}"`);
      if (b.band !== 'strained') problems.push(`${tab}: band "${b.band}" at 3 of 4`);
    }
    if (realErrors(m).length > 0) problems.push(`console errors: ${realErrors(m).join(' | ')}`);
    return fail(problems);
  },
};

// ---- a Popular Front: both partners; a Left Front: the KPD ------------------------------

const popularFrontCheck = {
  name: 'coalition-block:hub-government:laptop:popular-front-both-partners',
  viewport: 'laptop',
  state: 'hub-government',
  selectors: [],
  async act(page) {
    await evaluate(page, SET({ ...NO_GOVERNMENT, in_popular_front: 1, coalition_dissent: 2, kpd_coalition_dissent: 3, resources: 3 }));
    await delay(600);
    return evaluate(page, READ);
  },
  test(m) {
    const problems = [];
    for (const tab of ['party', 'state']) {
      const names = m.acted[tab].blocks.map((b) => b.name);
      if (names.join('|') !== 'Coalition dissent|KPD dissent') problems.push(`${tab}: blocks ${names.join(', ')}`);
      m.acted[tab].blocks.forEach((b) => {
        if (b.segments !== 3) problems.push(`${tab} ${b.name}: ${b.segments} segments`);
      });
      const [, kpd] = m.acted[tab].blocks;
      if (kpd && kpd.band !== 'vote') problems.push(`${tab}: KPD band "${kpd.band}" at 3 of 3`);
      if (kpd && kpd.say && !/^The KPD will call a vote of no confidence this month\.$/.test(kpd.say)) problems.push(`${tab}: KPD sentence "${kpd.say}"`);
      if (m.acted[tab].natural > m.acted.defense.natural + 0.5) problems.push(`${tab} body ${m.acted[tab].natural.toFixed(1)}px, taller than Defense's ${m.acted.defense.natural.toFixed(1)}px`);
    }
    console.log(`coalition-block laptop, Popular Front at 2 and 3: Party ${m.acted.party.natural.toFixed(1)}px, State ${m.acted.state.natural.toFixed(1)}px, Defense ${m.acted.defense.natural.toFixed(1)}px; sizes: Party ${m.acted.party.blocks.map((b) => b.notes.length ? 'full' : b.say === null ? 'line' : 'brief').join('/')}, State ${m.acted.state.blocks.map((b) => b.notes.length ? 'full' : b.say === null ? 'line' : 'brief').join('/')}`);
    if (realErrors(m).length > 0) problems.push(`console errors: ${realErrors(m).join(' | ')}`);
    return fail(problems);
  },
};

const leftFrontCheck = {
  name: 'coalition-block:hub-government:laptop:left-front-kpd-four-segments',
  viewport: 'laptop',
  state: 'hub-government',
  selectors: [],
  async act(page) {
    await evaluate(page, SET({ ...NO_GOVERNMENT, in_left_front: 1, kpd_coalition_dissent: 1 }));
    await delay(600);
    return evaluate(page, READ);
  },
  test(m) {
    const problems = [];
    for (const tab of ['party', 'state']) {
      const list = m.acted[tab].blocks;
      if (list.length !== 1 || list[0].name !== 'KPD dissent') problems.push(`${tab}: blocks ${list.map((b) => b.name).join(', ')}`);
      else if (list[0].segments !== 4) problems.push(`${tab}: ${list[0].segments} segments, expected 4`);
    }
    return fail(problems);
  },
};

const noBlockCheck = {
  name: 'coalition-block:hub-government:laptop:no-block-in-an-emergency-government',
  viewport: 'laptop',
  state: 'hub-government',
  selectors: [],
  async act(page) {
    await evaluate(page, SET({ ...NO_GOVERNMENT, in_emergency_government: 1, coalition_dissent: 2 }));
    await delay(600);
    return evaluate(page, READ);
  },
  test(m) {
    const problems = [];
    for (const tab of ['party', 'state']) {
      if (m.acted[tab].blocks.length !== 0) problems.push(`${tab}: ${m.acted[tab].blocks.length} blocks, expected none`);
    }
    return fail(problems);
  },
};

// ---- the entry ---------------------------------------------------------------------------

function entryCheck(viewport) {
  return {
    name: `coalition-block:hub-government:${viewport}:click-opens-entry-with-the-same-track`,
    viewport,
    state: 'hub-government',
    selectors: [],
    async act(page) {
      await evaluate(page, SET({ coalition_dissent: 2, resources: 3 }));
      await delay(600);
      return evaluate(page, OPEN_AND_READ_ENTRY);
    },
    test(m) {
      const r = m.acted;
      const problems = [];
      if (r.view !== 'entry:coalition-dissent') problems.push(`opened ${r.view}`);
      if (r.title !== 'Coalition dissent') problems.push(`title "${r.title}"`);
      if (!r.live) problems.push('no live part under the entry text');
      if (r.segments !== r.blockSegments) problems.push(`entry track has ${r.segments} segments, the block ${r.blockSegments}`);
      if (r.filled !== r.blockFilled) problems.push(`entry track has ${r.filled} filled, the block ${r.blockFilled}`);
      if (r.say !== r.blockSay) problems.push(`entry sentence "${r.say}", the block's "${r.blockSay}"`);
      if (r.headings.join('|') !== 'Now|What moved it|How to lower it') problems.push(`headings ${r.headings.join(', ')}`);
      if (r.easeItems < 3) problems.push(`${r.easeItems} ways to lower it listed`);
      if (realErrors(m).length > 0) problems.push(`console errors: ${realErrors(m).join(' | ')}`);
      return fail(problems);
    },
  };
}

// ---- playing a card that raises it ----------------------------------------------------

// Labor Rights: "Enforce the 40-hour work week" adds 1
// (government_affairs/labor_rights.scene.dry @working_hours). The card is
// played through the engine as the hand would play it, and the option clicked.
const cardCheck = {
  name: 'coalition-block:hub-government:laptop:last-names-the-card-played',
  viewport: 'laptop',
  state: 'hub-government',
  selectors: [],
  async act(page) {
    // The banner is still sliding as play starts.
    await delay(700);
    await evaluate(page, SET({
      labor_minister_party: 'SPD', labor_affairs_seen: 1, labor_rights_timer: 0, working_hours: 0, coalition_dissent: 0,
    }));
    await evaluate(page, `(() => { window.dendryUI.dendryEngine.playCard('labor_rights'); return true; })()`);
    await waitForCondition(() => hasSelector(page, '#content ul.choices a'));
    await waitAndClickByText(page, '#content ul.choices a', 'Enforce the 40-hour work week.');
    await delay(800);
    const after = await evaluate(page, `(() => ({ dissent: window.dendryUI.dendryEngine.state.qualities.coalition_dissent,
      log: window.dendryUI.dendryEngine.state.qualities.sc_coalition_log }))()`);
    const tabs = await evaluate(page, READ);
    return { after, tabs };
  },
  test(m) {
    const { after, tabs } = m.acted;
    const problems = [];
    if (after.dissent !== 1) problems.push(`coalition_dissent is ${after.dissent} after the card, expected 1`);
    const [b] = tabs.party.blocks;
    const last = b && b.notes.find((n) => /^Last:/.test(n));
    if (!last) problems.push(`Party shows no "Last:" line (notes: ${b && b.notes.join(' | ')}); log ${after.log}`);
    else if (!/^Last: Labor Rights, [A-Z][a-z]+ \d{4}, \+1$/.test(last)) problems.push(`"${last}"`);
    if (realErrors(m).length > 0) problems.push(`console errors: ${realErrors(m).join(' | ')}`);
    return fail(problems);
  },
};

// ---- the change dots ----------------------------------------------------------------------

// A change in either dissent marks the shut tab that shows it: Party and State
// both carry the block, so each is dotted while the other is open.
const dotsCheck = {
  name: 'coalition-block:hub-government:laptop:a-change-dots-both-tabs',
  viewport: 'laptop',
  state: 'hub-government',
  selectors: [],
  async act(page) {
    const dots = () => evaluate(page, `(() => Object.fromEntries(Array.from(document.querySelectorAll('#state-column [data-sc-tab]'))
      .map((b) => [b.getAttribute('data-sc-tab'), !!b.querySelector('.sc-dot')])))()`);
    await evaluate(page, SET({ ...NO_GOVERNMENT, in_popular_front: 1 }));
    // Pull the month's baseline to now, then move the dissent.
    await evaluate(page, `(() => { const q = window.dendryUI.dendryEngine.state.qualities; q.month = Number(q.month) % 12 + 1; window.updateSidebar(); return true; })()`);
    const before = await dots();
    await evaluate(page, SET({ coalition_dissent: 1 }));
    const partyOpen = await dots();
    await evaluate(page, `document.querySelector('#state-column [data-sc-tab="state"]').click()`);
    await delay(200);
    await evaluate(page, SET({ kpd_coalition_dissent: 1 }));
    const stateOpen = await dots();
    return { before, partyOpen, stateOpen };
  },
  test(m) {
    const { before, partyOpen, stateOpen } = m.acted;
    const problems = [];
    if (before.party || before.state) problems.push(`dots before any change: ${JSON.stringify(before)}`);
    if (!partyOpen.state) problems.push('the State tab has no dot after the Coalition dissent moved');
    if (partyOpen.party) problems.push('the open Party tab carries a dot');
    if (!stateOpen.party) problems.push('the Party tab has no dot after the KPD dissent moved');
    if (stateOpen.state) problems.push('the open State tab carries a dot');
    return fail(problems);
  },
};

export default [
  restingCheck('laptop'),
  restingCheck('monitor'),
  strainedCheck('laptop'),
  strainedCheck('monitor'),
  weimarCheck,
  popularFrontCheck,
  leftFrontCheck,
  noBlockCheck,
  entryCheck('laptop'),
  entryCheck('monitor'),
  cardCheck,
  dotsCheck,
];
