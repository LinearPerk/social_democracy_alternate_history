'use strict';

import { evaluate } from '../lib/driver.mjs';

// Change feedback on the tabs. After a scripted change to a quality (written
// straight into the engine's qualities, then the column redrawn, as the game
// does when a card lands):
//   - a shut tab that shows the quality carries a dot, titled with how many
//     figures changed, and the open tab does not;
//   - the dot clears when the player opens the tab, and returns only on the
//     next change;
//   - on the open tab the changed row carries the flash class (an animation
//     only for people who allow motion), and nothing flashes on a first
//     render, on a tab switch, or on a later redraw with nothing new.
// Also that the tab bar keeps its height and three segments with a dot in it.

const READ = `(() => {
  const dots = {};
  for (const tab of document.querySelectorAll('#state-column .sc-tab')) {
    const dot = tab.querySelector('.sc-dot');
    dots[tab.getAttribute('data-sc-tab')] = dot ? dot.getAttribute('title') : null;
  }
  const flashing = Array.from(document.querySelectorAll('#state-column .sc-body .sc-flash'))
    .map((el) => (el.querySelector('.lbl, .nm') || el).textContent.trim().slice(0, 24));
  const bar = document.querySelector('#state-column .sc-tabs').getBoundingClientRect();
  return {
    dots,
    flashing,
    open: document.querySelector('#state-column .sc-tab.on').getAttribute('data-sc-tab'),
    barHeight: bar.height,
    barWidth: bar.width,
    segments: document.querySelectorAll('#state-column .sc-tab').length,
  };
})()`;

// Change qualities, redraw, read.
function change(values) {
  return `(() => {
    Object.assign(window.dendryUI.dendryEngine.state.qualities, ${JSON.stringify(values)});
    window.updateSidebar();
    return ${READ};
  })()`;
}

const click = (tab) => `(() => {
  document.querySelector('#state-column [data-sc-tab="${tab}"]').click();
  return ${READ};
})()`;

const SCRIPT = async (page) => {
  const log = {};
  log.first = await evaluate(page, READ);
  // A change to a Party-tab figure (left dissent) and a State-tab figure
  // (growth) and a Defense-tab figure (SA militancy) in one redraw, Party open.
  const q = JSON.parse(await evaluate(page, `JSON.stringify((({ left_dissent, economic_growth, sa_militancy, inflation }) => ({ left_dissent, economic_growth, sa_militancy, inflation }))(window.dendryUI.dendryEngine.state.qualities))`));
  log.q = q;
  log.changed = await evaluate(page, change({ left_dissent: q.left_dissent + 7, economic_growth: q.economic_growth - 1.5, sa_militancy: q.sa_militancy + 0.2 }));
  // The redraw a moment later, with nothing new: the flash is gone from the markup.
  await new Promise((r) => setTimeout(r, 750));
  log.later = await evaluate(page, `(() => { window.updateSidebar(); return ${READ}; })()`);
  // Open the State tab: its dot clears, and nothing flashes on the switch.
  log.openState = await evaluate(page, click('state'));
  // A change on the open State tab: inflation flashes; Defense keeps its dot.
  log.onState = await evaluate(page, change({ inflation: q.inflation + 1 }));
  // Motion: the flash animates, and doesn't when the person asks for none.
  // Both are emulated: the machine's own setting (Windows can turn animation
  // off) would otherwise decide the first.
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  log.animation = await evaluate(page, `getComputedStyle(document.querySelector('#state-column .sc-body .sc-flash')).animationName`);
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  log.animationReduced = await evaluate(page, `getComputedStyle(document.querySelector('#state-column .sc-body .sc-flash')).animationName`);
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  // Open Defense: its dot clears; nothing flashes.
  log.openDefense = await evaluate(page, click('defense'));
  // Back to Party, where the change was seen as it happened: no dot, no flash.
  log.openParty = await evaluate(page, click('party'));
  // The next change to a shut tab's figure brings its dot back.
  log.again = await evaluate(page, change({ economic_growth: q.economic_growth + 2 }));
  return log;
};

const check = {
  name: 'tab-changes:dots-and-flashes:laptop',
  viewport: 'laptop',
  state: 'hub',
  selectors: [],
  act: SCRIPT,
  test(m) {
    const l = m.acted;
    const problems = [];
    const dotTabs = (r) => Object.entries(r.dots).filter(([, title]) => title).map(([tab]) => tab).join(',');

    if (dotTabs(l.first) !== '' || l.first.flashing.length) problems.push(`first render: dots ${dotTabs(l.first) || 'none'}, flashing ${l.first.flashing.join(', ') || 'none'}; expected neither`);

    // After the change, Party open.
    if (l.changed.open !== 'party') problems.push(`open tab ${l.changed.open}, expected party`);
    if (l.changed.dots.party) problems.push('the open Party tab carries a dot');
    if (l.changed.dots.defense !== '1 figure changed') problems.push(`Defense dot "${l.changed.dots.defense}", expected "1 figure changed"`);
    if (l.changed.dots.state !== '1 figure changed') problems.push(`State dot "${l.changed.dots.state}", expected "1 figure changed"`);
    if (l.changed.flashing.join('|') !== 'Left') problems.push(`flashing after the change: ${l.changed.flashing.join(', ') || 'none'}, expected Left`);
    if (l.changed.segments !== 3) problems.push(`${l.changed.segments} segments with dots showing, expected 3`);
    if (l.changed.barHeight > 28) problems.push(`tab bar ${l.changed.barHeight}px tall with dots showing, max 28`);

    // A redraw with nothing new: no flash, dots stay.
    if (l.later.flashing.length) problems.push(`flashing on a redraw with nothing new: ${l.later.flashing.join(', ')}`);
    if (dotTabs(l.later) !== 'defense,state') problems.push(`dots after the quiet redraw: ${dotTabs(l.later)}, expected defense,state`);

    // Opening State clears its dot; nothing flashes on the switch.
    if (l.openState.dots.state) problems.push('the State dot did not clear on opening the tab');
    if (l.openState.dots.defense !== '1 figure changed') problems.push('the Defense dot went when State opened');
    if (l.openState.flashing.length) problems.push(`flashing on a tab switch: ${l.openState.flashing.join(', ')}`);

    // A change on the open tab flashes its row and doesn't dot the tab.
    if (l.onState.flashing.join('|') !== 'Inflation') problems.push(`flashing on State: ${l.onState.flashing.join(', ') || 'none'}, expected Inflation`);
    if (l.onState.dots.state) problems.push('the open State tab carries a dot for a change made while open');

    // Motion.
    if (l.animation !== 'sc-flash') problems.push(`flash animation "${l.animation}", expected sc-flash`);
    if (l.animationReduced !== 'none') problems.push(`with reduced motion the flash animation is "${l.animationReduced}", expected none`);

    // Defense opens: dot clears, no flash.
    if (l.openDefense.dots.defense) problems.push('the Defense dot did not clear on opening the tab');
    if (l.openDefense.flashing.length) problems.push(`flashing on a tab switch to Defense: ${l.openDefense.flashing.join(', ')}`);
    // Party opens: the change was seen as it happened, so no dot for it.
    if (l.openParty.dots.party || l.openParty.flashing.length) problems.push('Party showed a dot or a flash after a switch back');

    // The next change to a shut tab's figure brings the dot back.
    if (l.again.dots.state !== '1 figure changed') problems.push(`State dot after a later change "${l.again.dots.state}", expected "1 figure changed"`);

    console.log(`tab bar with a dot showing: ${l.changed.barHeight.toFixed(1)}px tall, ${l.changed.barWidth.toFixed(1)}px wide at laptop`);
    return problems.length === 0 ? true : problems.join('; ');
  },
};

export default [check];
