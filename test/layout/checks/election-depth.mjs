'use strict';

import { setTimeout as delay } from 'node:timers/promises';
import { evaluate, hasSelector, waitForCondition } from '../lib/driver.mjs';
import { TOLERANCE, gte, lte } from '../lib/assert.mjs';

// Checks for the election entry in the depth column. When the results page
// arrives the column takes the large hemicycle and the result rows: its title
// bar names the election, the seats on the drawing and in the rows agree with
// the dashboard's ledger, a click on a party's row or seats opens that party's
// entry (and Back returns here), hovering a row lights the party's seats, and
// the Reichstag entry offers "Last election" once an election has been held.
// Nothing spills out of the column. The view leads with the player's seats and
// their change, and shows each party's gain or loss as a bar from a centre line.

// The console error a rejected audio play() throws when Chrome blocks
// autoplay; the election scene starts the game's music.
const AUDIO_AUTOPLAY_BLOCK = /NotAllowedError.*play()/s;
const errorsOf = (m) => m.consoleErrors.filter((e) => !AUDIO_AUTOPLAY_BLOCK.test(e));

const SELECTORS = [
  '#depth_column',
  '#depth_column .dc-title',
  '#depth_column .dc-kind',
  '#depth_column .el-entry',
  '#depth_column .el-hemi',
  '#depth_column .el-hemi .sc-hemi',
  '#depth_column .el-hemi .sc-housenum',
  '#depth_column .el-hemi .sc-majlbl',
  '#depth_column .rr-row',
  '#depth_column .el-note',
  '#depth_column .el-entry *:not(title)',
  '#depth-bar [data-dc-back]',
];

function overflow(m, problems) {
  const [depth] = m.elements['#depth_column'];
  for (const el of m.elements['#depth_column .el-entry *:not(title)']) {
    // Empty header cells and the like have no box.
    if (el.rect.width === 0 && el.rect.height === 0) continue;
    if (!gte(el.rect.left, depth.rect.left) || !lte(el.rect.right, depth.rect.right)) {
      problems.push(`"${el.text.slice(0, 30)}" (${el.tagName}.${el.className}, ${Math.round(el.rect.left)}-${Math.round(el.rect.right)} against ${Math.round(depth.rect.left)}-${Math.round(depth.rect.right)}) spills out of the depth column`);
      break;
    }
  }
  if (m.scrollWidth > m.clientWidth + TOLERANCE) problems.push(`horizontal overflow: ${m.scrollWidth} > ${m.clientWidth}`);
}

// What the page says: the open view, the title the column shows, and the
// election's own figures read from the game and the ledger.
const read = (page) => evaluate(page, `(() => {
  const dc = window.DepthColumn;
  const view = dc.view();
  const q = window.dendryUI.dendryEngine.state.qualities;
  const ledger = {};
  document.querySelectorAll('#state-column [data-sc-party]').forEach((row) => {
    const n = parseInt(row.querySelector('.st').textContent, 10);
    if (!isNaN(n)) ledger[row.getAttribute('data-sc-party')] = n;
  });
  const rows = {};
  document.querySelectorAll('#depth_column .rr-row[data-depth-entry]').forEach((row) => {
    rows[row.getAttribute('data-depth-entry').replace('party:', '')] = parseInt(row.querySelector('.rr-seats').textContent, 10);
  });
  const groups = Array.from(document.querySelectorAll('#depth_column .el-hemi .sc-party-seats'));
  const drawn = {};
  groups.forEach((g) => { drawn[g.getAttribute('data-sc-seats')] = g.querySelectorAll('circle').length; });
  const box = document.querySelector('#depth_column .el-hemi');
  const record = (q.election_records || [])[(q.election_records || []).length - 1];
  return {
    view: { kind: view.kind, key: view.key },
    title: (document.querySelector('#depth_column .dc-title') || {}).textContent || null,
    ledger, rows, drawn,
    house: box ? Number(box.getAttribute('data-el-house')) : null,
    circles: document.querySelectorAll('#depth_column .el-hemi circle').length,
    records: (q.election_records || []).length,
    date: record ? (record.date instanceof Date ? record.date.toISOString() : record.date) : null,
    lit: groups.filter((g) => g.classList.contains('lit')).map((g) => g.getAttribute('data-sc-seats')),
    dim: groups.filter((g) => g.classList.contains('dim')).length,
    centre: (document.querySelector('#depth_column .el-hemi .sc-housenum') || {}).textContent || null,
    label: (document.querySelector('#depth_column .el-hemi .sc-houselbl:not(.sc-majlbl)') || {}).textContent || null,
    history: dc.history().map((v) => v.kind + ':' + v.key),
  };
})()`);

function arrival(viewport) {
  return {
    name: `election-depth:arrival:${viewport}`,
    viewport,
    state: 'election-night',
    selectors: SELECTORS,
    act: read,
    test(m) {
      const problems = [];
      const a = m.acted;
      const [depth] = m.elements['#depth_column'];
      if (!depth) return '#depth_column not found';
      if (a.view.kind !== 'entry' || a.view.key !== 'election:latest') problems.push(`the column shows ${a.view.kind}:${a.view.key}, want entry:election:latest`);
      const [title] = m.elements['#depth_column .dc-title'];
      const when = a.date ? new Date(a.date) : null;
      const month = when ? ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][when.getMonth()] : '';
      const want = when ? `Reichstag election, ${month} ${when.getFullYear()}` : '(no record)';
      if (!title || title.text !== want) problems.push(`title "${title ? title.text : ''}", want "${want}"`);
      const [kind] = m.elements['#depth_column .dc-kind'];
      if (!kind || kind.text !== 'Entry') problems.push('no Entry label over the title');
      const [hemi] = m.elements['#depth_column .el-hemi .sc-hemi'];
      if (!hemi) return 'no hemicycle in the depth column';
      if (hemi.rect.width < 300) problems.push(`hemicycle ${Math.round(hemi.rect.width)}px wide, want 300 or more`);
      if (!gte(hemi.rect.left, depth.rect.left) || !lte(hemi.rect.right, depth.rect.right)) problems.push('the hemicycle leaves the depth column');
      if (a.circles !== a.house) problems.push(`${a.circles} seats drawn, house ${a.house}`);
      const total = Object.values(a.rows).reduce((x, y) => x + y, 0);
      if (total !== a.house) problems.push(`the rows' seats add to ${total}, house ${a.house}`);
      for (const [id, seats] of Object.entries(a.rows)) {
        if (a.ledger[id] !== seats) problems.push(`${id}: ${seats} in the rows, ${a.ledger[id]} in the ledger`);
        if (a.drawn[id] !== seats) problems.push(`${id}: ${seats} in the rows, ${a.drawn[id]} dots drawn`);
      }
      if (m.elements['#depth_column .rr-row'].length < 6) problems.push('fewer than six result rows');
      if (a.dim !== 0 || a.lit.length !== 0) problems.push('seats are lit or dimmed with nothing hovered');
      if (a.label !== 'seats' || a.centre !== String(a.house)) problems.push(`centre reads "${a.label} ${a.centre}", want "seats ${a.house}"`);
      const [maj] = m.elements['#depth_column .el-hemi .sc-majlbl'];
      if (!maj || !/^\d+ for majority$/.test(maj.text)) problems.push('no "for majority" line in the centre');
      const [note] = m.elements['#depth_column .el-note'];
      if (!note || note.text !== 'Seats follow votes: one for every 60,000.') problems.push('the note on seats is missing');
      const [back] = m.elements['#depth-bar [data-dc-back]'];
      if (!back || back.disabled) problems.push('Back is not enabled');
      overflow(m, problems);
      if (errorsOf(m).length) problems.push(`console errors: ${errorsOf(m).join(' | ')}`);
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

// A click on a party's row opens that party's entry; Back returns to the
// election view; a click on its seats does the same.
const partyClicks = {
  name: 'election-depth:party-click-and-back:laptop',
  viewport: 'laptop',
  state: 'election-night',
  selectors: SELECTORS,
  async act(page) {
    const out = {};
    await evaluate(page, `(() => { document.querySelector('#depth_column .rr-row[data-depth-entry="party:dnvp"]').click(); return true; })()`);
    await waitForCondition(async () => (await read(page)).view.key === 'party:dnvp');
    out.row = await read(page);
    await evaluate(page, `(() => { document.querySelector('#depth-bar [data-dc-back]').click(); return true; })()`);
    await waitForCondition(() => hasSelector(page, '#depth_column .el-entry'));
    out.back = await read(page);
    // The seats are SVG: dispatch the click on a dot's group.
    await evaluate(page, `(() => {
      document.querySelector('#depth_column .el-hemi [data-sc-seats="spd"] circle').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return true;
    })()`);
    await waitForCondition(async () => (await read(page)).view.key === 'party:spd');
    out.seats = await read(page);
    await evaluate(page, `(() => { document.querySelector('#depth-bar [data-dc-back]').click(); return true; })()`);
    await waitForCondition(() => hasSelector(page, '#depth_column .el-entry'));
    out.backAgain = await read(page);
    return out;
  },
  test(m) {
    const problems = [];
    const a = m.acted;
    if (a.row.view.key !== 'party:dnvp') problems.push(`the DNVP row opened ${a.row.view.key}`);
    if (!/German National People's Party|Deutschnationale/.test(a.row.title || '')) problems.push(`the DNVP entry's title is "${a.row.title}"`);
    if (a.back.view.key !== 'election:latest') problems.push(`Back from the DNVP entry shows ${a.back.view.key}`);
    if (a.seats.view.key !== 'party:spd') problems.push(`a click on the SPD's seats opened ${a.seats.view.key}`);
    if (a.backAgain.view.key !== 'election:latest') problems.push(`Back from the SPD entry shows ${a.backAgain.view.key}`);
    if (errorsOf(m).length) problems.push(`console errors: ${errorsOf(m).join(' | ')}`);
    return problems.length === 0 ? true : problems.join('; ');
  },
};

// Hovering or focusing a row lights that party's seats and dims the rest,
// with the party's seats in the centre; moving off clears it.
const hover = {
  name: 'election-depth:row-lights-seats:laptop',
  viewport: 'laptop',
  state: 'election-night',
  selectors: SELECTORS,
  async act(page) {
    const out = {};
    await evaluate(page, `(() => {
      document.querySelector('#depth_column .rr-row[data-depth-entry="party:spd"]')
        .dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      return true;
    })()`);
    out.over = await read(page);
    out.opacity = await evaluate(page, `(() => {
      const op = (s) => parseFloat(getComputedStyle(document.querySelector('#depth_column .el-hemi [data-sc-seats="' + s + '"]')).opacity);
      return { spd: op('spd'), dnvp: op('dnvp') };
    })()`);
    await evaluate(page, `(() => {
      document.querySelector('#depth_column .el-note').dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      return true;
    })()`);
    out.off = await read(page);
    await evaluate(page, `(() => { document.querySelector('#depth_column .rr-row[data-depth-entry="party:kpd"]').dispatchEvent(new FocusEvent('focusin', { bubbles: true })); return true; })()`);
    out.focus = await read(page);
    return out;
  },
  test(m) {
    const problems = [];
    const a = m.acted;
    if (a.over.lit.join() !== 'spd') problems.push(`lit on hover: ${a.over.lit.join()}, want spd`);
    if (a.over.dim < 5) problems.push(`${a.over.dim} groups dimmed on hover`);
    if (String(a.over.centre) !== String(a.over.rows.spd)) problems.push(`centre reads ${a.over.centre}, the SPD row says ${a.over.rows.spd}`);
    if (a.over.label !== 'SPD') problems.push(`centre label "${a.over.label}", want SPD`);
    if (a.opacity.spd !== 1 || !(a.opacity.dnvp < 0.5)) problems.push(`opacities ${JSON.stringify(a.opacity)}`);
    if (a.off.lit.length !== 0 || a.off.dim !== 0 || a.off.label !== 'seats') problems.push('hover did not clear');
    if (a.focus.lit.join() !== 'kpd') problems.push(`lit on focus: ${a.focus.lit.join()}, want kpd`);
    return problems.length === 0 ? true : problems.join('; ');
  },
};

// The Reichstag entry offers "Last election" once there is a record.
const lastLink = {
  name: 'election-depth:last-election-link:laptop',
  viewport: 'laptop',
  state: 'election-night',
  selectors: ['#depth_column .rs-lastlink'],
  async act(page) {
    const out = {};
    await evaluate(page, `(() => { document.querySelector('#depth-bar [data-dc-back]').click(); return true; })()`);
    await evaluate(page, `(() => {
      document.querySelector('#state-column [data-sc-chart] .sc-hemi').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return true;
    })()`);
    await waitForCondition(() => hasSelector(page, '#depth_column .rs-entry'));
    out.hasLink = await hasSelector(page, '#depth_column .rs-lastlink');
    await evaluate(page, `(() => { document.querySelector('#depth_column .rs-lastlink').click(); return true; })()`);
    await waitForCondition(() => hasSelector(page, '#depth_column .el-entry'));
    out.opened = await read(page);
    await evaluate(page, `(() => { document.querySelector('#depth-bar [data-dc-back]').click(); return true; })()`);
    await waitForCondition(() => hasSelector(page, '#depth_column .rs-entry'));
    out.back = await read(page);
    return out;
  },
  test(m) {
    const problems = [];
    const a = m.acted;
    if (!a.hasLink) problems.push('no "Last election" link after the election');
    if (a.opened.view.key !== 'election:latest') problems.push(`the link opened ${a.opened.view.key}`);
    if (!/^Reichstag election, \w+ \d{4}$/.test(a.opened.title || '')) problems.push(`title "${a.opened.title}"`);
    if (a.opened.circles !== a.opened.house) problems.push('the opened view does not draw the house');
    if (a.back.view.key !== 'reichstag:seats') problems.push(`Back from the link shows ${a.back.view.key}`);
    return problems.length === 0 ? true : problems.join('; ');
  },
};

// Before any election the Reichstag entry has no link, and the view, opened
// by key, says so in a sentence.
const beforeElection = {
  name: 'election-depth:before-any-election:laptop',
  viewport: 'laptop',
  state: 'reichstag-entry',
  selectors: ['#depth_column .rs-entry', '#depth_column .rs-lastlink', '#depth_column .el-entry', '#depth_column .el-entry svg'],
  async act(page) {
    const records = await evaluate(page, `window.dendryUI.dendryEngine.state.qualities.election_records.length`);
    const link = await hasSelector(page, '#depth_column .rs-lastlink');
    await evaluate(page, `(() => {
      window.DepthColumn.show({ kind: 'entry', key: 'election:latest', title: 'Reichstag election' });
      return true;
    })()`);
    await waitForCondition(() => hasSelector(page, '#depth_column .el-entry'));
    const text = await evaluate(page, `document.querySelector('#depth_column .el-entry').textContent`);
    return { records, link, text };
  },
  test(m) {
    const problems = [];
    if (m.acted.records !== 0) problems.push(`${m.acted.records} election records at the start of a game`);
    if (m.acted.link) problems.push('"Last election" shows before any election');
    if (!/No Reichstag election has been held in this game yet\./.test(m.acted.text)) problems.push(`the empty view reads "${m.acted.text}"`);
    if (m.elements['#depth_column .el-entry svg'].length !== 0) problems.push('a chart is drawn with no election');
    return problems.length === 0 ? true : problems.join('; ');
  },
};

// Under the rows: the coalition bars and the group bars. Both sit inside the
// column, the first election has no "who moved" line, and the record keeps
// each group's party shares as plain numbers in plain objects.
const SECTION_SELECTORS = [
  '#depth_column',
  '#depth_column .el-coalitions',
  '#depth_column .el-co',
  '#depth_column .el-co-bar',
  '#depth_column .el-groups',
  '#depth_column .el-groups .dc-stack',
  '#depth_column .el-entry *:not(title)',
];

const readSections = (page) => evaluate(page, `(() => {
  const q = window.dendryUI.dendryEngine.state.qualities;
  const records = q.election_records || [];
  const record = records[records.length - 1] || {};
  const groups = record.groups;
  const plain = !!groups && Object.getPrototypeOf(groups) === Object.prototype &&
    Object.values(groups).every((g) => Object.getPrototypeOf(g) === Object.prototype &&
      Object.values(g).every((v) => typeof v === 'number'));
  const roundTrip = JSON.stringify(JSON.parse(JSON.stringify(groups || null))) === JSON.stringify(groups || null);
  return {
    classes: groups ? Object.keys(groups) : [],
    plain, roundTrip,
    bars: Array.from(document.querySelectorAll('#depth_column .el-co')).map((b) => ({
      id: b.getAttribute('data-el-coalition'),
      name: b.querySelector('.el-co-name').textContent,
      word: b.querySelector('.el-co-word').textContent,
      pressed: b.getAttribute('aria-pressed'),
    })),
    moves: document.querySelectorAll('#depth_column .el-move').length,
    heads: Array.from(document.querySelectorAll('#depth_column .el-entry > .el-coalitions > .dc-sub, #depth_column .el-entry > .el-groups > .dc-sub')).map((e) => e.textContent),
    stacks: document.querySelectorAll('#depth_column .el-groups .dc-stack').length,
    scrollable: (() => {
      const body = document.querySelector('#depth_column .dc-body');
      return body ? body.scrollHeight - body.clientHeight : null;
    })(),
  };
})()`);

function sectionsCheck(viewport) {
  return {
    name: `election-depth:coalitions-and-groups:${viewport}`,
    viewport,
    state: 'election-night',
    selectors: SECTION_SELECTORS,
    act: readSections,
    test(m) {
      const problems = [];
      const a = m.acted;
      const [depth] = m.elements['#depth_column'];
      if (!depth) return '#depth_column not found';
      if (a.bars.length !== 5) problems.push(`${a.bars.length} coalition bars, want 5`);
      if (a.heads.join('|') !== 'Coalitions|By group') problems.push(`section heads "${a.heads.join('|')}"`);
      if (a.stacks !== 6) problems.push(`${a.stacks} group bars, want 6`);
      if (a.moves !== 0) problems.push('a "who moved" line shows after the first election');
      a.bars.forEach((b) => {
        if (!/^(majority|short by \d+)$/.test(b.word)) problems.push(`${b.id}: word "${b.word}"`);
      });
      const order = a.bars.map((b) => /^majority$/.test(b.word));
      if (order.indexOf(false) >= 0 && order.lastIndexOf(true) > order.indexOf(false)) problems.push('a majority is listed after a shortfall');
      if (a.classes.length !== 6) problems.push(`the record holds groups ${a.classes.join(',')}`);
      if (!a.plain || !a.roundTrip) problems.push('the record\'s groups are not plain numbers in plain objects');
      for (const sel of ['#depth_column .el-co', '#depth_column .el-co-bar', '#depth_column .el-groups .dc-stack']) {
        for (const el of m.elements[sel]) {
          if (!gte(el.rect.left, depth.rect.left) || !lte(el.rect.right, depth.rect.right)) problems.push(`${sel} leaves the depth column`);
          if (el.rect.width < 100) problems.push(`${sel} is ${Math.round(el.rect.width)}px wide`);
        }
      }
      overflow(m, problems);
      if (errorsOf(m).length) problems.push(`console errors: ${errorsOf(m).join(' | ')}`);
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

// A click on the Grand Coalition's bar lights its members on the large
// hemicycle and dims the rest; a second click lets go; hovering a row while
// one is picked lights that party, and leaving the row returns to the pick.
const coalitionClick = {
  name: 'election-depth:coalition-click-lights-members:laptop',
  viewport: 'laptop',
  state: 'election-night',
  selectors: SECTION_SELECTORS,
  async act(page) {
    const out = {};
    const view = () => evaluate(page, `(() => {
      const groups = Array.from(document.querySelectorAll('#depth_column .el-hemi .sc-party-seats'));
      const bar = document.querySelector('#depth_column [data-el-coalition="grand"]');
      return {
        lit: groups.filter((g) => g.classList.contains('lit')).map((g) => g.getAttribute('data-sc-seats')),
        dim: groups.filter((g) => g.classList.contains('dim')).map((g) => g.getAttribute('data-sc-seats')),
        pressed: bar ? bar.getAttribute('aria-pressed') : null,
        centre: (document.querySelector('#depth_column .el-hemi .sc-housenum') || {}).textContent,
        label: (document.querySelector('#depth_column .el-hemi .sc-houselbl:not(.sc-majlbl)') || {}).textContent,
        seats: bar ? Number(bar.querySelector('.el-co-total b').textContent) : null,
        dots: groups.map((g) => g.getAttribute('data-sc-seats')),
        key: window.DepthColumn.view().key,
        history: window.DepthColumn.history().length,
      };
    })()`);
    const click = (sel) => evaluate(page, `(() => { document.querySelector(${JSON.stringify(sel)}).click(); return true; })()`);
    out.before = await view();
    await click('#depth_column [data-el-coalition="grand"]');
    out.picked = await view();
    await evaluate(page, `(() => {
      document.querySelector('#depth_column .rr-row[data-depth-entry="party:kpd"]').dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      return true;
    })()`);
    out.hover = await view();
    await evaluate(page, `(() => {
      document.querySelector('#depth_column .el-note').dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      document.body.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: null }));
      return true;
    })()`);
    out.left = await view();
    await click('#depth_column [data-el-coalition="grand"]');
    out.released = await view();
    return out;
  },
  test(m) {
    const problems = [];
    const a = m.acted;
    const members = ['spd', 'ddp', 'z', 'bvp', 'dvp'];
    if (a.before.lit.length || a.before.dim.length) problems.push('the chart is lit before a pick');
    if (a.picked.pressed !== 'true') problems.push('the bar is not pressed after the click');
    if (a.picked.lit.slice().sort().join() !== members.slice().sort().join()) problems.push(`lit after the click: ${a.picked.lit.join()}`);
    if (a.picked.lit.length + a.picked.dim.length !== a.picked.dots.length) problems.push('a party is neither lit nor dimmed');
    if (a.picked.dim.length < 3) problems.push(`${a.picked.dim.length} parties dimmed, want the non-members`);
    if (a.picked.label !== 'coalition' || String(a.picked.centre) !== String(a.picked.seats)) problems.push(`centre reads "${a.picked.label} ${a.picked.centre}", the bar says ${a.picked.seats}`);
    if (a.picked.history !== a.before.history) problems.push('the pick added a history step');
    if (a.hover.lit.join() !== 'kpd') problems.push(`hovering a row lit ${a.hover.lit.join()}`);
    if (a.left.lit.slice().sort().join() !== members.slice().sort().join()) problems.push(`leaving the row lit ${a.left.lit.join()}, want the pick back`);
    if (a.released.pressed !== 'false' || a.released.lit.length || a.released.dim.length) problems.push('a second click did not let go');
    if (a.released.label !== 'seats') problems.push(`centre reads "${a.released.label}" after the release`);
    if (errorsOf(m).length) problems.push(`console errors: ${errorsOf(m).join(' | ')}`);
    return problems.length === 0 ? true : problems.join('; ');
  },
};

// A party entry is headed the same wherever it opens: from a result row on
// the results page (decision column) or in this view. The BVP's entry has to
// have text of its own.
const partyTitles = {
  name: 'election-depth:party-entry-titles:laptop',
  viewport: 'laptop',
  state: 'election-night',
  selectors: ['#depth_column'],
  async act(page) {
    const out = {};
    const title = () => evaluate(page, `(document.querySelector('#depth_column .dc-title') || {}).textContent || null`);
    // The results page's own row, in the decision column.
    out.hasRows = await evaluate(page, `document.querySelectorAll('#content .rr-row[data-depth-entry="party:kpd"]').length`);
    await evaluate(page, `(() => { document.querySelector('#content .rr-row[data-depth-entry="party:kpd"]').click(); return true; })()`);
    await waitForCondition(async () => (await read(page)).view.key === 'party:kpd');
    out.fromResults = await title();
    await evaluate(page, `(() => { document.querySelector('#depth-bar [data-dc-back]').click(); return true; })()`);
    await waitForCondition(() => hasSelector(page, '#depth_column .el-entry'));
    await evaluate(page, `(() => { document.querySelector('#depth_column .rr-row[data-depth-entry="party:kpd"]').click(); return true; })()`);
    await waitForCondition(async () => (await read(page)).view.key === 'party:kpd');
    out.fromView = await title();
    await evaluate(page, `(() => { document.querySelector('#depth-bar [data-dc-back]').click(); return true; })()`);
    await waitForCondition(() => hasSelector(page, '#depth_column .el-entry'));
    await evaluate(page, `(() => {
      document.querySelector('#depth_column .el-hemi [data-sc-seats="dnvp"] circle').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return true;
    })()`);
    await waitForCondition(async () => (await read(page)).view.key === 'party:dnvp');
    out.fromSeats = await title();
    await evaluate(page, `(() => { document.querySelector('#depth-bar [data-dc-back]').click(); return true; })()`);
    await waitForCondition(() => hasSelector(page, '#depth_column .el-entry'));
    // The BVP's row, if it has one, and the entry it opens.
    out.bvpRow = await evaluate(page, `document.querySelectorAll('#depth_column .rr-row[data-depth-entry="party:bvp"]').length`);
    await evaluate(page, `(() => {
      const opener = document.createElement('button');
      opener.setAttribute('data-depth-entry', 'party:bvp');
      opener.textContent = 'BVP 3% 15';
      document.querySelector('#depth_column .el-entry').appendChild(opener);
      opener.click();
      return true;
    })()`);
    await waitForCondition(async () => (await read(page)).view.key === 'party:bvp');
    out.bvpTitle = await title();
    out.bvpText = await evaluate(page, `(document.querySelector('#depth_column .dc-body') || {}).textContent || ''`);
    out.bvpWritten = await evaluate(page, `Array.from(document.querySelectorAll('#depth_column .dc-body p:not(.dc-entry-foot)')).map((p) => p.textContent.trim()).join('').length`);
    return out;
  },
  test(m) {
    const problems = [];
    const a = m.acted;
    const kpd = /^Kommunistische Partei Deutschlands \(Communist Party of Germany\)$/;
    if (!a.hasRows) problems.push('no KPD row on the results page');
    if (!kpd.test(a.fromResults || '')) problems.push(`from the results page: "${a.fromResults}"`);
    if (!kpd.test(a.fromView || '')) problems.push(`from the view: "${a.fromView}"`);
    if (!/^Deutschnationale Volkspartei \(German National People's Party\)$/.test(a.fromSeats || '')) problems.push(`from the seats: "${a.fromSeats}"`);
    if (!/Bavarian/.test(a.bvpTitle || '')) problems.push(`the BVP title is "${a.bvpTitle}"`);
    if (!a.bvpWritten) problems.push('the BVP entry has no text');
    if (a.bvpText.length < 120) problems.push(`the BVP entry's text is ${a.bvpText.length} characters`);
    if (errorsOf(m).length) problems.push(`console errors: ${errorsOf(m).join(' | ')}`);
    return problems.length === 0 ? true : problems.join('; ');
  },
};

// A second election in the same session: after the SPD's workers' support
// changes, the view shows who moved, with an SPD change among the workers;
// the Library's election history still draws from both records.
const secondElection = {
  name: 'election-depth:second-election-who-moved:laptop',
  viewport: 'laptop',
  state: 'election-night',
  selectors: SECTION_SELECTORS,
  async act(page) {
    const out = {};
    out.first = await readSections(page);
    await evaluate(page, `(() => {
      const Q = window.dendryUI.dendryEngine.state.qualities;
      Q.workers_spd = Math.max(0, Q.workers_spd - 30);
      Q.next_election_year = Q.year;
      document.getElementById('content').innerHTML = '';
      window.dendryUI.dendryEngine.goToScene('election_1928');
      return true;
    })()`);
    await waitForCondition(() => evaluate(page, `Array.from(document.querySelectorAll('#content a'))
      .some((a) => a.textContent.includes('May we do our best'))`));
    await evaluate(page, `(() => {
      Array.from(document.querySelectorAll('#content a')).find((a) => a.textContent.includes('May we do our best')).click();
      return true;
    })()`);
    await waitForCondition(async () => (await read(page)).records === 2);
    await waitForCondition(() => hasSelector(page, '#depth_column .el-entry'));
    await delay(900);
    out.second = await readSections(page);
    out.workers = await evaluate(page, `(() => {
      const heads = Array.from(document.querySelectorAll('#depth_column .el-group'));
      const g = heads.find((e) => e.querySelector('.dc-sub').textContent === 'Workers');
      return g ? { text: g.textContent, move: (g.querySelector('.el-move') || {}).textContent || null } : null;
    })()`);
    out.record = await evaluate(page, `(() => {
      const r = window.dendryUI.dendryEngine.state.qualities.election_records;
      return { first: r[0].groups.workers.spd, second: r[1].groups.workers.spd };
    })()`);
    await evaluate(page, `(() => { window.dendryUI.dendryEngine.goToScene('library'); return true; })()`);
    await waitForCondition(() => evaluate(page, `Array.from(document.querySelectorAll('#content a'))
      .some((a) => a.textContent.includes('Figures and charts'))`));
    await evaluate(page, `(() => {
      Array.from(document.querySelectorAll('#content a')).find((a) => a.textContent.includes('Figures and charts')).click();
      return true;
    })()`);
    await waitForCondition(() => hasSelector(page, '#election_history path'));
    out.chart = await evaluate(page, `(() => {
      return { paths: document.querySelectorAll('#election_history path').length };
    })()`);
    return out;
  },
  test(m) {
    const problems = [];
    const a = m.acted;
    if (a.first.moves !== 0) problems.push('the first election shows a movement line');
    if (a.second.moves !== 6) problems.push(`${a.second.moves} movement lines after the second election, want 6`);
    if (!a.workers || !a.workers.move || !/SPD [▲▼] \d+/.test(a.workers.move)) problems.push(`the workers' line is "${a.workers && a.workers.move}"`);
    if (!(a.record.second < a.record.first - 1)) problems.push(`the workers' SPD share went ${a.record.first} to ${a.record.second}`);
    if (!a.second.plain || !a.second.roundTrip) problems.push('the second record\'s groups are not plain');
    if (!(a.chart && a.chart.paths > 0)) problems.push('the Library\'s election history did not draw');
    if (errorsOf(m).length) problems.push(`console errors: ${errorsOf(m).join(' | ')}`);
    return problems.length === 0 ? true : problems.join('; ');
  },
};

// The lead line above the hemicycle and the gains-and-losses bars below it,
// against the ledger the dashboard showed before the election.
function seatsFirst(viewport) {
  return {
    name: `election-depth:seats-first:${viewport}`,
    viewport,
    state: 'election-night',
    selectors: SELECTORS.concat(['#depth_column .el-lead', '#depth_column .el-gl-row', '#depth_column .el-gl-num']),
    act: (page) => evaluate(page, `(() => {
      const root = document.querySelector('#depth_column .el-entry');
      const num = (n) => parseInt(n.textContent.replace('−', '-').replace('+', ''), 10);
      const ledger = {};
      document.querySelectorAll('#state-column [data-sc-party]').forEach((row) => {
        const n = parseInt(row.querySelector('.st').textContent, 10);
        if (!isNaN(n)) ledger[row.getAttribute('data-sc-party')] = n;
      });
      const lead = root.querySelector('.el-lead');
      const hemi = root.querySelector('.el-hemi');
      const firstRows = root.querySelector('.rr');
      const sizes = Array.from(root.querySelectorAll('*')).filter((e) => !e.closest('svg') && e.childNodes.length &&
        Array.from(e.childNodes).some((c) => c.nodeType === 3 && c.textContent.trim()) && !e.closest('.el-lead'))
        .map((e) => parseFloat(getComputedStyle(e).fontSize));
      const rows = Array.from(root.querySelectorAll('.el-gl-row')).map((row) => {
        const track = row.querySelector('.el-gl-track').getBoundingClientRect();
        const axis = row.querySelector('.el-gl-axis').getBoundingClientRect();
        const fill = row.querySelector('.el-gl-fill');
        const fr = fill && fill.getBoundingClientRect();
        const nr = row.querySelector('.el-gl-num').getBoundingClientRect();
        const colour = fill ? getComputedStyle(fill).backgroundColor : null;
        return {
          id: row.getAttribute('data-depth-entry').replace('party:', ''),
          tag: row.tagName.toLowerCase(),
          value: num(row.querySelector('.el-gl-num')),
          up: fill ? fill.classList.contains('up') : null,
          bar: fill ? { left: fr.left, right: fr.right, width: fr.width } : null,
          axisX: axis.left, track: { left: track.left, right: track.right, width: track.width },
          numBox: { left: nr.left, right: nr.right },
          colour,
        };
      });
      const heads = Array.from(root.querySelectorAll('.dc-sub')).map((e) => e.textContent);
      const gl = root.querySelector('.el-gl');
      return {
        before: window.__ledgerBefore || null, ledger,
        lead: lead ? { text: lead.textContent.replace(/\\s+/g, ' ').trim(), cls: lead.className,
          bottom: lead.getBoundingClientRect().bottom, size: parseFloat(getComputedStyle(lead).fontSize),
          colour: getComputedStyle(lead).color, hasBadge: !!lead.querySelector('.sc-badge') } : null,
        hemiTop: hemi ? hemi.getBoundingClientRect().top : null,
        hemiBottom: hemi ? hemi.getBoundingClientRect().bottom : null,
        glTop: gl ? gl.getBoundingClientRect().top : null,
        rowsTop: firstRows ? firstRows.getBoundingClientRect().top : null,
        glBottom: gl ? gl.getBoundingClientRect().bottom : null,
        maxOtherSize: Math.max(...sizes), rows, heads,
        goodColour: getComputedStyle(document.body).getPropertyValue('--sc-good').trim(),
      };
    })()`),
    test(m) {
      const problems = [];
      const a = m.acted;
      const [depth] = m.elements['#depth_column'];
      if (!depth) return '#depth_column not found';
      if (!a.before) problems.push('the ledger before the election was not read');
      const mine = a.ledger.spd;
      const diff = mine - ((a.before || {}).spd || 0);
      const arrow = diff > 0 ? `▲ ${diff}` : diff < 0 ? `▼ ${-diff}` : '—';
      if (!a.lead) return 'no lead line';
      if (a.lead.text !== `SPD · ${mine} seats · ${arrow}`) problems.push(`lead line "${a.lead.text}", want "SPD · ${mine} seats · ${arrow}"`);
      if (!a.lead.hasBadge) problems.push('the lead line has no party badge');
      if (!(a.lead.bottom <= a.hemiTop + TOLERANCE)) problems.push('the lead line is not above the hemicycle');
      if (!(a.lead.size > a.maxOtherSize)) problems.push(`the lead line is ${a.lead.size}px, other text up to ${a.maxOtherSize}px`);
      if (!new RegExp(diff > 0 ? 'good' : diff < 0 ? 'bad' : 'same').test(a.lead.cls)) problems.push(`lead class "${a.lead.cls}" for a change of ${diff}`);
      if (a.heads[0] !== 'Gains and losses') problems.push(`first section head "${a.heads[0]}"`);
      if (!(a.glTop >= a.hemiBottom - TOLERANCE && a.glBottom <= a.rowsTop + TOLERANCE)) problems.push('gains and losses is not between the hemicycle and the rows');
      if (a.rows.length < 6) problems.push(`${a.rows.length} gains-and-losses rows`);
      // Each row's number is the party's seats less the ledger before.
      for (const r of a.rows) {
        const want = (a.ledger[r.id] || 0) - ((a.before || {})[r.id] || 0);
        if (r.value !== want) problems.push(`${r.id}: bar says ${r.value}, ledger says ${want}`);
        if (r.tag !== 'button') problems.push(`${r.id}: row is a ${r.tag}`);
      }
      // Largest gain first, largest loss last of the movers, zeros after.
      const values = a.rows.map((r) => r.value);
      const movers = values.filter((v) => v !== 0);
      if (movers.join() !== movers.slice().sort((x, y) => y - x).join()) problems.push(`rows not sorted: ${values.join(',')}`);
      const z = values.indexOf(0);
      if (z >= 0 && values.slice(z).some((v) => v !== 0)) problems.push('a party with no change is not last');
      const top = Math.max(...values.map(Math.abs));
      for (const r of a.rows) {
        if (r.value === 0) { if (r.bar) problems.push(`${r.id}: a bar for no change`); continue; }
        if (!r.bar) { problems.push(`${r.id}: no bar`); continue; }
        if (r.value > 0 && !(r.up && r.bar.left >= r.axisX - 1)) problems.push(`${r.id}: a gain does not grow right of the centre`);
        if (r.value < 0 && !(!r.up && r.bar.right <= r.axisX + 2)) problems.push(`${r.id}: a loss does not grow left of the centre`);
        const want = Math.abs(r.value) / top * r.track.width / 2;
        if (Math.abs(r.bar.width - want) > 1.5) problems.push(`${r.id}: bar ${Math.round(r.bar.width)}px, want ${Math.round(want)}px`);
        if (!gte(r.bar.left, r.track.left - 1) || !lte(r.bar.right, r.track.right + 1)) problems.push(`${r.id}: bar leaves its track`);
        if (!gte(r.numBox.left, depth.rect.left) || !lte(r.numBox.right, depth.rect.right)) problems.push(`${r.id}: number leaves the depth column`);
      }
      overflow(m, problems);
      if (errorsOf(m).length) problems.push(`console errors: ${errorsOf(m).join(' | ')}`);
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

export default [
  seatsFirst('laptop'),
  seatsFirst('monitor'),
  seatsFirst('narrow'),
  arrival('laptop'),
  arrival('monitor'),
  partyClicks,
  hover,
  lastLink,
  beforeElection,
  sectionsCheck('laptop'),
  sectionsCheck('monitor'),
  coalitionClick,
  partyTitles,
  secondElection,
];
