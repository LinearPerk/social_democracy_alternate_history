'use strict';

import { evaluate } from '../lib/driver.mjs';
import { VIEWPORTS } from '../lib/viewports.mjs';
import { lte } from '../lib/assert.mjs';

// Checks for the hire menu (party_affairs/shuffle_leadership.scene.dry): each
// choice shows only its actions line (the author's bio stays in the subtitle,
// hidden), the advisor's name opens that bio in the depth column without
// hiring, and a click anywhere else on the choice hires.
// Advisor entries come from depth-column/entries.js.

const AUDIO_AUTOPLAY_BLOCK = /NotAllowedError.*play()/s;
const realErrors = (m) => m.consoleErrors.filter((e) => !AUDIO_AUTOPLAY_BLOCK.test(e));

// The category menus the advisor menu links to, by the label on its link.
const CATEGORIES = ['Add Centrists', 'Add Leftists', 'Add Reformists', 'Add Labor', 'Add Neorevisionists', 'Add non-factional advisors'];

const IN_PAGE = `
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const engine = () => window.dendryUI.dendryEngine;
const clickText = (text) => {
  const a = Array.from(document.querySelectorAll('#content ul.choices li a')).find((e) => e.textContent.trim().startsWith(text));
  if (!a) throw new Error('no choice starting "' + text + '"');
  a.click();
};
// From the hub to the advisor menu, the way a player goes. A new game starts
// with three advisors and the menu offers nobody until one is removed, so
// remove them all first.
const openAdvisorMenu = async () => {
  // The Neorevisionist menu appears once that movement exists.
  engine().state.qualities.neorevisionism = 1;
  engine().goToScene('shuffle_leadership');
  await wait(200);
  while (Array.from(document.querySelectorAll('#content ul.choices li a')).some((e) => e.textContent.startsWith('Remove '))) {
    clickText('Remove ');
    await wait(150);
  }
  clickText('Add advisors');
  await wait(200);
};
const col = () => document.getElementById('depth_column');
`;

const MEASURE_MENUS = `(async () => {
  ${IN_PAGE}
  const out = [];
  for (const label of ${JSON.stringify(CATEGORIES)}) {
    await openAdvisorMenu();
    clickText(label);
    await wait(200);
    const ul = document.querySelector('#content ul.choices');
    const r = ul.getBoundingClientRect();
    out.push({
      label,
      count: ul.querySelectorAll('li').length,
      top: r.top, bottom: r.bottom, height: r.height,
      // innerText leaves out the hidden bio, as the player sees the subtitle.
      subtitles: Array.from(ul.querySelectorAll('.subtitle')).map((s) => s.innerText.trim()),
      bios: Array.from(ul.querySelectorAll('.subtitle')).map((s) => {
        const bio = s.querySelector('.hire-bio');
        return bio ? { text: bio.textContent.trim(), display: getComputedStyle(bio).display } : null;
      }),
    });
  }
  return out;
})()`;

const menuFitCheck = (viewport) => ({
  name: `hire:${viewport}:menus-fit-and-carry-actions-only`,
  viewport,
  state: 'hub',
  selectors: [],
  act: (page) => evaluate(page, MEASURE_MENUS),
  test(m) {
    const problems = [];
    const fold = VIEWPORTS[viewport].height;
    for (const menu of m.acted) {
      // At 1,920 x 1,080 every menu ends above the fold; a laptop only reports.
      if (viewport === 'monitor' && !lte(menu.bottom, fold)) {
        problems.push(`${menu.label}: menu bottom ${Math.round(menu.bottom)}, expected <= ${fold}`);
      }
      for (const s of menu.subtitles) {
        if (!/^Actions - /.test(s)) problems.push(`${menu.label}: subtitle "${s.slice(0, 50)}..." is not an actions line`);
      }
      for (const b of menu.bios) {
        if (!b || !b.text) problems.push(`${menu.label}: a choice has no hire bio`);
        else if (b.display !== 'none') problems.push(`${menu.label}: a hire bio shows in the menu`);
      }
      // Each menu ends with "Remove advisors instead" and "Stop changing advisors".
      if (menu.count - menu.subtitles.length !== 2) problems.push(`${menu.label}: ${menu.subtitles.length} subtitles for ${menu.count} choices`);
    }
    if (realErrors(m).length > 0) problems.push(`console errors: ${realErrors(m).join(' | ')}`);
    return problems.length === 0 ? true : problems.join('; ');
  },
});

// Click Levi's name: his entry opens, nothing is hired, the menu stays. Then
// click the rest of the choice: he is hired.
const NAME_THEN_CHOICE = `(async () => {
  ${IN_PAGE}
  await openAdvisorMenu();
  clickText('Add Leftists');
  await wait(200);
  const q = () => engine().state.qualities;
  const before = { levi: q().levi_advisor, n: q().n_advisors };
  const sceneBefore = engine().state.sceneId;
  const span = document.querySelector('#content ul.choices [data-depth-advisor="levi"]');
  if (!span) return { error: 'no name span for levi' };
  const hireBio = span.closest('li').querySelector('.hire-bio').textContent.trim();
  span.click();
  await wait(250);
  const lead = col().querySelector('.dc-body .dc-lead');
  const afterName = {
    levi: q().levi_advisor, n: q().n_advisors, sceneSame: engine().state.sceneId === sceneBefore,
    choices: document.querySelectorAll('#content ul.choices li').length,
    kind: (col().querySelector('.dc-kind') || {}).textContent || '',
    title: (col().querySelector('.dc-title') || {}).textContent || '',
    view: window.DepthColumn.view().key,
    lead: lead ? lead.textContent : '',
    leadItalic: lead ? getComputedStyle(lead).fontStyle : '',
    body: (col().querySelector('.dc-body') || {}).textContent || '',
  };
  // Elsewhere on the choice: the subtitle.
  span.closest('li').querySelector('.subtitle').click();
  await wait(250);
  // The hire scenes compile as cards; their subtitle must not turn up as a
  // page lead in the column.
  const afterChoice = {
    levi: q().levi_advisor, n: q().n_advisors,
    kind: window.DepthColumn.view().kind,
    columnText: col().textContent,
  };
  return { before, afterName, afterChoice, hireBio };
})()`;

const nameClickCheck = {
  name: 'hire:monitor:name-opens-bio-without-hiring',
  viewport: 'monitor',
  state: 'hub',
  selectors: [],
  act: (page) => evaluate(page, NAME_THEN_CHOICE),
  test(m) {
    const r = m.acted;
    if (r.error) return r.error;
    const a = r.afterName;
    const problems = [];
    if (r.before.levi !== 0 || r.before.n !== 0) problems.push(`start state ${JSON.stringify(r.before)}`);
    if (a.levi !== 0 || a.n !== 0) problems.push(`name click hired Levi (levi_advisor ${a.levi}, n_advisors ${a.n})`);
    if (!a.sceneSame || a.choices === 0) problems.push('name click left the menu');
    if (a.kind !== 'Entry') problems.push(`kind label "${a.kind}", expected Entry`);
    if (a.title !== 'Paul Levi') problems.push(`title "${a.title}", expected Paul Levi`);
    if (a.view !== 'advisor:levi') problems.push(`view key "${a.view}", expected advisor:levi`);
    if (a.lead !== 'A former leader of the KPD.') problems.push(`lead "${a.lead}"`);
    if (a.leadItalic !== 'italic') problems.push(`lead font-style "${a.leadItalic}", expected italic`);
    if (!r.hireBio.startsWith('Paul Levi is a former KPD leader')) problems.push(`hire bio read as "${r.hireBio}"`);
    if (!a.body.includes(r.hireBio)) problems.push('body lacks the hire bio');
    if (a.body.includes('left over their devotion')) problems.push('body carries the card bio, expected the hire bio');
    if (/Building the Left|Cooperation with the KPD|is now an advisor/.test(a.body)) problems.push('body carries choices or arrival text');
    if (r.afterChoice.levi !== 1 || r.afterChoice.n !== 1) problems.push(`clicking the choice did not hire (${JSON.stringify(r.afterChoice)})`);
    if (r.afterChoice.kind === 'page' || /Actions - /.test(r.afterChoice.columnText)) {
      problems.push(`hiring left a hire subtitle in the column (${r.afterChoice.kind}: "${r.afterChoice.columnText.slice(0, 60)}")`);
    }
    if (realErrors(m).length > 0) problems.push(`console errors: ${realErrors(m).join(' | ')}`);
    return problems.length === 0 ? true : problems.join('; ');
  },
};

// Every hire choice's name opens that advisor's entry: title, a lead, the
// choice's own hire bio, no choices, and (Hilferding has some) Further reading. Names on the menu
// match the card's title.
const OPEN_EVERY_NAME = `(async () => {
  ${IN_PAGE}
  const out = [];
  for (const label of ${JSON.stringify(CATEGORIES)}) {
    await openAdvisorMenu();
    clickText(label);
    await wait(200);
    const spans = Array.from(document.querySelectorAll('#content ul.choices [data-depth-advisor]'));
    for (const span of spans) {
      const id = span.getAttribute('data-depth-advisor');
      const hireBio = span.closest('li').querySelector('.hire-bio').textContent.trim();
      span.click();
      await wait(120);
      const body = col().querySelector('.dc-body');
      const lead = body.querySelector('.dc-lead');
      out.push({
        id,
        hireBio,
        bodyText: body.textContent,
        text: span.textContent.trim(),
        title: (col().querySelector('.dc-title') || {}).textContent || '',
        lead: !!lead && lead.textContent.trim().length > 0,
        paragraphs: body.querySelectorAll('p').length,
        reading: Array.from(body.querySelectorAll('.dc-links a')).map((a) => a.textContent),
        n: engine().state.qualities.n_advisors,
      });
    }
  }
  return out;
})()`;

const everyNameCheck = {
  name: 'hire:monitor:every-name-opens-its-entry',
  viewport: 'monitor',
  state: 'hub',
  selectors: [],
  act: (page) => evaluate(page, OPEN_EVERY_NAME),
  test(m) {
    const problems = [];
    if (m.acted.length !== 24) problems.push(`${m.acted.length} names, expected 24`);
    for (const e of m.acted) {
      if (e.title !== e.text) problems.push(`${e.id}: title "${e.title}" != menu name "${e.text}"`);
      if (!e.lead) problems.push(`${e.id}: no lead`);
      if (e.paragraphs < 2) problems.push(`${e.id}: ${e.paragraphs} paragraphs, expected lead and bio`);
      if (!e.hireBio || !e.bodyText.includes(e.hireBio)) problems.push(`${e.id}: body lacks the hire bio "${e.hireBio}"`);
      if (e.n !== 0) problems.push(`${e.id}: n_advisors is ${e.n}`);
    }
    const hil = m.acted.find((e) => e.id === 'hilferding');
    if (hil && !hil.reading.includes('Rudolf Hilferding')) problems.push('hilferding: lacks its Further reading link');
    if (realErrors(m).length > 0) problems.push(`console errors: ${realErrors(m).join(' | ')}`);
    return problems.length === 0 ? true : problems.join('; ');
  },
};

// The hire bio never replaces the card's: Schumacher's card page still moves
// his own bio into the column, as the author wrote it.
const SCHUMACHER_CARD = `(async () => {
  ${IN_PAGE}
  engine().state.qualities.schumacher_advisor = 1;
  engine().goToScene('schumacher');
  await wait(300);
  const link = document.querySelector('#content [data-dc-page]');
  if (!link) return { error: 'no Background link on the card page' };
  link.click();
  await wait(200);
  return { body: (col().querySelector('.dc-body') || {}).textContent || '', page: document.getElementById('content').textContent };
})()`;

const schumacherCardCheck = {
  name: 'hire:monitor:schumacher-card-keeps-its-own-bio',
  viewport: 'monitor',
  state: 'hub',
  selectors: [],
  act: (page) => evaluate(page, SCHUMACHER_CARD),
  test(m) {
    const r = m.acted;
    if (r.error) return r.error;
    const original = 'A Great War veteran and a Neorevisionist leader, Kurt Schumacher argues for a strong resistance against the Nazis.';
    const problems = [];
    if (!r.body.includes(original)) problems.push('column lacks the original card bio');
    if (r.body.includes('energetic speaker')) problems.push('column carries the hire bio');
    if (realErrors(m).length > 0) problems.push(`console errors: ${realErrors(m).join(' | ')}`);
    return problems.length === 0 ? true : problems.join('; ');
  },
};

export default [menuFitCheck('monitor'), menuFitCheck('laptop'), nameClickCheck, everyNameCheck, schumacherCardCheck];
