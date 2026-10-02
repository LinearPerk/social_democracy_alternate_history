'use strict';

import { evaluate, hasSelector, waitForCondition } from '../lib/driver.mjs';

// Headless Chrome refuses the scene's music; not a layout failure.
const AUDIO_AUTOPLAY_BLOCK = /NotAllowedError.*play\(\)/s;
const errorsOf = (m) => m.consoleErrors.filter((e) => !AUDIO_AUTOPLAY_BLOCK.test(e));

// The election results page: the result rows replace the hard-coded
// hemicycle and colour-box table (decision-column.js fills the scene's
// placeholder from results.js). Nothing on the page may reach past the text
// width; the rows are one per seated party, agree with the dashboard ledger's
// seats, carry each party's seat change since the ledger before the election,
// and open the party's entry in the depth column. The headline leads with the
// SPD's seats and their change.

const SELECTORS = ['#content', '#content .result-rows .rr', '#content ul.choices'];

// Measured in the page: everything inside #content against its content box,
// plus the rows' own figures and the dashboard ledger's seat numbers.
async function survey(page) {
  return evaluate(page, `(() => {
    const content = document.getElementById('content');
    const cs = getComputedStyle(content);
    const right = content.getBoundingClientRect().right - parseFloat(cs.paddingRight);
    const over = [];
    for (const el of content.querySelectorAll('*')) {
      if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > right + 1) {
        over.push(el.tagName.toLowerCase() + '.' + (el.getAttribute('class') || '') + ' ' + Math.round(r.right) + '>' + Math.round(right));
      }
    }
    const seats = (n) => (n && n.textContent.trim() !== '' ? parseInt(n.textContent, 10) : null);
    const rows = Array.from(content.querySelectorAll('.result-rows .rr-row')).map((row) => ({
      id: (row.getAttribute('data-depth-entry') || '').replace('party:', ''),
      tag: row.tagName.toLowerCase(),
      player: row.classList.contains('player'),
      seats: seats(row.querySelector('.rr-seats')),
      change: (row.querySelector('.rr-chg') || {}).textContent || null,
      heads: Array.from(row.closest('.rr').querySelectorAll('.rr-head span')).map((n) => n.textContent),
      title: (row.querySelector('.rr-share') || {}).title || '',
    }));
    const ledger = {};
    for (const row of document.querySelectorAll('#state-column .sc-ledger')) {
      ledger[row.getAttribute('data-sc-party')] = seats(row.querySelector('.st'));
    }
    return {
      over, rows, ledger, before: window.__ledgerBefore || null,
      reichstagSvg: !!document.getElementById('reichstag'),
      filled: Array.from(content.querySelectorAll('[data-results]')).map((n) => n.getAttribute('data-results-filled')),
      colourTable: !!content.querySelector('table td .box'),
      coalitionLines: /Potential coalitions/.test(content.textContent),
      choices: content.querySelectorAll('ul.choices li').length,
      text: content.textContent,
    };
  })()`);
}

function layoutCheck(viewport) {
  return {
    name: `election:${viewport}:fits-the-column`,
    viewport,
    state: 'election',
    selectors: SELECTORS,
    act: survey,
    test(m) {
      const s = m.acted;
      const problems = [];
      if (m.scrollWidth > m.clientWidth + 1) problems.push(`horizontal overflow: ${m.scrollWidth} > ${m.clientWidth}`);
      if (s.over.length) problems.push(`wider than the text width: ${s.over.slice(0, 4).join('; ')}`);
      if (s.reichstagSvg) problems.push('the page still holds an #reichstag svg');
      if (s.colourTable) problems.push('the colour-box table is still on the page');
      if (s.coalitionLines) problems.push('the "Potential coalitions" lines are still on the page');
      if (errorsOf(m).length) problems.push(`console errors: ${errorsOf(m).join(' | ')}`);
      return problems.length ? problems.join('; ') : true;
    },
  };
}

const rowsCheck = {
  name: 'election:laptop:rows-and-menu',
  viewport: 'laptop',
  state: 'election',
  selectors: SELECTORS,
  act: survey,
  test(m) {
    const s = m.acted;
    const problems = [];
    if (s.filled.join() !== 'rows') problems.push(`placeholder state is ${JSON.stringify(s.filled)}, expected ["rows"]`);
    const ids = s.rows.map((r) => r.id);
    // One row per seated party: the dashboard ledger lists exactly those.
    const seated = Object.keys(s.ledger);
    if (ids.join() !== seated.join()) problems.push(`rows ${ids.join(',')} differ from the ledger's ${seated.join(',')}`);
    if (s.rows.some((r) => r.tag !== 'button')) problems.push('a party row is not a button');
    const players = s.rows.filter((r) => r.player).map((r) => r.id);
    if (players.join() !== 'spd') problems.push(`player rows are ${JSON.stringify(players)}, expected ["spd"]`);
    for (const r of s.rows) {
      if (r.seats !== s.ledger[r.id]) problems.push(`${r.id}: ${r.seats} seats in the rows, ${s.ledger[r.id]} in the ledger`);
    }
    // Each row's change is its seats less what the ledger showed before.
    const parse = (t) => (/▲/.test(t) ? parseInt(t.replace(/\D/g, ''), 10) : /▼/.test(t) ? -parseInt(t.replace(/\D/g, ''), 10) : 0);
    if (!s.before) problems.push('the ledger before the election was not read');
    for (const r of s.rows) {
      const want = r.seats - ((s.before || {})[r.id] || 0);
      if (parse(r.change || '') !== want) problems.push(`${r.id}: change "${r.change}", want ${want}`);
      if (!/^\d+(\.\d)?%, (up|down) [\d.]+ points?$|^\d+(\.\d)?%, no change$/.test(r.title)) problems.push(`${r.id}: vote title "${r.title}"`);
    }
    if (s.rows.length && s.rows[0].heads.join('|') !== '||Seats|Change||Vote') problems.push(`column heads "${s.rows[0].heads.join('|')}"`);
    const spd = s.rows.find((r) => r.id === 'spd');
    if (spd) {
      const diff = spd.seats - ((s.before || {}).spd || 0);
      const phrase = diff > 0 ? `${diff} more than before` : diff < 0 ? `${-diff} fewer than before` : 'the same as before';
      const want = `The SPD won ${spd.seats} seats, ${phrase}, with `;
      if (!s.text.includes(want)) problems.push(`the headline should read "${want}...": ${s.text.slice(0, 300)}`);
      if (!/of the vote\. (It is the largest party in the Reichstag\.|The [A-Z]+ is the largest party\.)/.test(s.text)) problems.push('the largest-party sentence is missing');
    }
    if (!/potential coalition arrangements/.test(s.text)) problems.push('the coalition sentence is missing');
    // The coalition menu is still the engine's choice list below the rows.
    if (s.choices < 1) problems.push('the coalition menu did not render');
    const [rr] = m.elements['#content .result-rows .rr'];
    const [list] = m.elements['#content ul.choices'];
    if (rr && list && rr.rect.bottom > list.rect.top + 1) problems.push('the rows sit below the coalition menu');
    if (errorsOf(m).length) problems.push(`console errors: ${errorsOf(m).join(' | ')}`);
    return problems.length ? problems.join('; ') : true;
  },
};

const clickCheck = {
  name: 'election:laptop:kpd-row-opens-entry',
  viewport: 'laptop',
  state: 'election',
  selectors: ['#depth_column'],
  act: async (page) => {
    await evaluate(page, `(() => {
      document.querySelector('#content [data-depth-entry="party:kpd"]').click();
      return true;
    })()`);
    await waitForCondition(() => hasSelector(page, '#depth_column[data-view="entry"] .dc-body p'), { timeoutMs: 3000 }).catch(() => {});
    return evaluate(page, `(() => {
      const col = document.getElementById('depth_column');
      const body = col && col.querySelector('.dc-body');
      return { view: col && col.getAttribute('data-view'), entry: !!body, text: body ? body.textContent.slice(0, 200) : '' };
    })()`);
  },
  test(m) {
    const a = m.acted;
    if (!a.entry) return `no entry opened in the depth column (view ${a.view})`;
    if (!/Communist|Kommunist|KPD/i.test(a.text)) return `the entry reads "${a.text}", expected the KPD's`;
    return true;
  },
};

export default [
  layoutCheck('laptop'),
  layoutCheck('monitor'),
  layoutCheck('narrow'),
  layoutCheck('phone'),
  rowsCheck,
  clickCheck,
];
