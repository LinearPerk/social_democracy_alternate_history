'use strict';

import { setTimeout as delay } from 'node:timers/promises';

import { close, gte, lte } from '../lib/assert.mjs';
import { evaluate, waitForCondition } from '../lib/driver.mjs';

// The title page's centre panel as a masthead (out/html/layout/title-page.js
// and title-page.css): the scene's heading hidden, one framed picture with its
// credit under it, a pair of lozenges, the note, and the menu ruled like a
// newspaper list (a double rule above and below, hairlines between). All of it
// in the three-column tier only, on the title scene before a game starts;
// narrower, the page keeps upstream's heading and no frame. The carousels
// beside it are in checks/carousel.mjs.

const MARGIN = 8;

// Reads the centre panel once the picture has loaded.
async function read(page) {
  await waitForCondition(() => evaluate(page, `(() => {
    const img = document.querySelector('#content .tp-hero img');
    return !!img && img.complete && img.naturalWidth > 0;
  })()`), { timeoutMs: 8000 });
  return evaluate(page, `(() => {
    const content = document.getElementById('content');
    const box = (node) => {
      const r = node.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
    };
    const hero = content.querySelector('.tp-hero');
    const img = hero.querySelector('img');
    const frame = hero.querySelector('.cr-frame');
    const matte = hero.querySelector('.cr-matte');
    const fs = getComputedStyle(frame);
    const ms = getComputedStyle(matte);
    // The source link is the credit's last; the licence may be a link too.
    const links = hero.querySelectorAll('.cr-credit a');
    const link = links.length ? links[links.length - 1] : null;
    const fleuron = content.querySelector('.tp-fleuron');
    const note = content.querySelector('p');
    const menu = content.querySelector('ul.choices');
    const us = getComputedStyle(menu);
    const items = Array.from(menu.querySelectorAll('li'));
    const h1 = content.querySelector('h1');
    const before = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    return {
      heroCount: content.querySelectorAll('.tp-hero').length,
      pictures: hero.querySelectorAll('img').length,
      h1Display: h1 ? getComputedStyle(h1).display : 'none',
      content: box(content),
      hero: box(hero),
      frame: box(frame),
      img: box(img),
      ratio: img.naturalWidth / img.naturalHeight,
      outer: parseFloat(fs.borderTopWidth),
      hair: parseFloat(ms.borderTopWidth),
      corners: frame.querySelectorAll('.cr-corner').length,
      caption: hero.querySelector('.cr-name').textContent.trim(),
      credit: hero.querySelector('.cr-credit').textContent.trim(),
      href: link ? link.href : '',
      linkBottom: link ? link.getBoundingClientRect().bottom : 0,
      creditBottom: hero.querySelector('.cr-credit').getBoundingClientRect().bottom,
      fleuron: fleuron ? fleuron.textContent.trim() : '',
      fleuronAlign: fleuron ? getComputedStyle(fleuron).textAlign : '',
      order: [before(hero, fleuron), before(fleuron, note), before(note, menu)],
      note: box(note),
      menu: box(menu),
      menuTop: us.borderTopStyle + ' ' + parseFloat(us.borderTopWidth),
      menuBottom: us.borderBottomStyle + ' ' + parseFloat(us.borderBottomWidth),
      menuBoxed: us.borderLeftStyle !== 'none' || us.borderRightStyle !== 'none',
      itemText: items.map((li) => li.textContent.trim()),
      between: items.map((li) => {
        const s = getComputedStyle(li);
        return s.borderBottomStyle + ' ' + parseFloat(s.borderBottomWidth);
      }),
    };
  })()`);
}

function titleCheck(viewport, state = 'title') {
  return {
    name: `title-page:masthead:${viewport}${state === 'title' ? '' : ':' + state}`,
    viewport,
    state,
    selectors: [],
    act: read,
    test(m) {
      const a = m.acted;
      const problems = [];
      if (a.h1Display !== 'none') problems.push(`the scene's heading is still shown (${a.h1Display})`);
      if (a.heroCount !== 1 || a.pictures !== 1) problems.push(`${a.heroCount} heroes with ${a.pictures} pictures, expected one of each`);
      if (a.caption !== 'Berlin, Reichstag, Verfassungsfeier') problems.push(`the picture's caption is "${a.caption}"`);
      if (!a.credit.includes('CC BY-SA 3.0 de')) problems.push(`the credit does not carry the licence: "${a.credit}"`);
      if (!/^https:\/\//.test(a.href)) problems.push(`the credit links to "${a.href}"`);
      else if (a.linkBottom > a.creditBottom + 1) problems.push('the credit link is clipped');

      // The frame: the same photo block as the portraits.
      if (a.outer < 3) problems.push(`the frame's heavy rule is ${a.outer}px, under 3`);
      if (a.hair < 1 || a.hair > 1.5) problems.push(`the frame's hairline is ${a.hair}px`);
      if (a.corners !== 4) problems.push(`the frame has ${a.corners} corner marks, expected 4`);
      if (!close(a.img.width / a.img.height, a.ratio, 0.02)) {
        problems.push(`the picture is shown at ${(a.img.width / a.img.height).toFixed(3)}, its own shape is ${a.ratio.toFixed(3)}`);
      }
      if (!lte(a.frame.right, a.content.right) || !gte(a.frame.left, a.content.left)) problems.push('the frame runs past the panel');
      if (!gte(a.img.height, 180)) problems.push(`the picture is ${a.img.height}px tall, under 180`);

      // The page's order and the menu's rules.
      if (!a.order.every(Boolean)) problems.push(`the picture, fleuron, note and menu are out of order: ${a.order.join(',')}`);
      if (!a.fleuron) problems.push('no fleuron');
      if (a.fleuronAlign !== 'center') problems.push(`the fleuron is ${a.fleuronAlign}, not centred`);
      if (a.menuTop !== 'double 4' || a.menuBottom !== 'double 4') {
        problems.push(`the menu's rules are "${a.menuTop}" above and "${a.menuBottom}" below, expected double 4`);
      }
      if (a.menuBoxed) problems.push('the menu still has a box round it');
      if (a.itemText.join('|') !== 'Start game|Election simulation|Credits') problems.push(`the menu reads ${a.itemText.join('|')}`);
      a.between.slice(0, -1).forEach((rule, i) => {
        if (rule !== 'solid 1') problems.push(`menu item ${i + 1}'s hairline is "${rule}"`);
      });
      if (!/^(none|solid) 0$|^none/.test(a.between[a.between.length - 1])) {
        problems.push(`the last menu item carries a rule of its own ("${a.between[a.between.length - 1]}")`);
      }

      // Inside the fold: the panel is its floor, the page does not scroll.
      const fold = m.viewport.height - MARGIN;
      if (!close(a.content.bottom, fold)) problems.push(`the panel ends at ${a.content.bottom}, the fold is ${fold}`);
      if (a.menu.bottom > a.content.bottom) problems.push('the menu runs past the panel');
      if (m.scrollHeight > m.viewport.height + 1) problems.push(`the page scrolls: ${m.scrollHeight} > ${m.viewport.height}`);
      if (m.scrollWidth > m.clientWidth) problems.push(`horizontal overflow ${m.scrollWidth} > ${m.clientWidth}`);
      if (m.consoleErrors.length > 0) problems.push(`console errors: ${m.consoleErrors.join(' | ')}`);
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

// Below the three-column tier the page keeps upstream's look: the heading
// shown, no picture, no frame, and the menu in its own box.
function narrowCheck(viewport) {
  return {
    name: `title-page:plain:${viewport}`,
    viewport,
    state: 'title',
    selectors: ['#content h1', '#content ul.choices', '.tp-hero', '.cr-frame'],
    async act() {
      await delay(800);
    },
    test(m) {
      const problems = [];
      const [h1] = m.elements['#content h1'];
      if (!h1 || h1.display === 'none') problems.push('the heading is hidden');
      if (m.elements['.tp-hero'].length > 0) problems.push('the masthead picture exists');
      if (m.elements['.cr-frame'].length > 0) problems.push('a frame exists');
      const [menu] = m.elements['#content ul.choices'];
      if (!menu) problems.push('no menu');
      else if (menu.borderStyle === 'double') problems.push('the menu has the newspaper rules');
      if (m.scrollWidth > m.clientWidth) problems.push(`horizontal overflow ${m.scrollWidth} > ${m.clientWidth}`);
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

// The page after "Start game" is a game under way: no masthead, the heading
// back to whatever upstream shows there.
const startedCheck = {
  name: 'title-page:none-once-started:laptop',
  viewport: 'laptop',
  state: 'start',
  selectors: ['.tp-hero', '.cr-frame', '.tp-fleuron', '#content.tp-title'],
  async act(page) {
    await delay(600);
    return evaluate(page, `window.TitlePage.active()`);
  },
  test(m) {
    const problems = [];
    if (m.acted) problems.push('the masthead reports itself active');
    for (const selector of ['.tp-hero', '.cr-frame', '.tp-fleuron', '#content.tp-title']) {
      if (m.elements[selector].length > 0) problems.push(`${selector} is still in the page`);
    }
    return problems.length === 0 ? true : problems.join('; ');
  },
};

// The frame's ink, the text colour thinned, has to show on the dark theme as
// well as the light: its colour against the panel behind, in both.
function inkCheck(theme) {
  return {
    name: `title-page:frame-ink:${theme}:laptop`,
    viewport: 'laptop',
    state: 'title',
    selectors: [],
    async act(page) {
      await read(page);
      await evaluate(page, `document.body.classList.${theme === 'dark' ? 'add' : 'remove'}('dark-mode'); true`);
      await delay(200);
      return evaluate(page, `(() => {
        // color-mix() computes to color(srgb r g b / a), channels in 0-1.
        const parse = (c) => {
          const n = (c.match(/[\\d.]+/g) || []).map(Number);
          return c.startsWith('color(') ? [n[0] * 255, n[1] * 255, n[2] * 255, ...n.slice(3)] : n;
        };
        const frame = getComputedStyle(document.querySelector('#content .tp-hero .cr-frame'));
        const ground = parse(getComputedStyle(document.getElementById('content')).backgroundColor);
        const ink = parse(frame.borderTopColor);
        const alpha = ink.length > 3 ? ink[3] : 1;
        const mixed = ink.slice(0, 3).map((v, i) => v * alpha + ground[i] * (1 - alpha));
        const lum = (rgb) => {
          const f = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
          return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
        };
        const [hi, lo] = [lum(mixed), lum(ground.slice(0, 3))].sort((a, b) => b - a);
        return { alpha, contrast: (hi + 0.05) / (lo + 0.05) };
      })()`);
    },
    test(m) {
      const { alpha, contrast } = m.acted;
      const problems = [];
      if (alpha >= 1) problems.push('the frame is opaque, expected the text colour thinned');
      if (contrast < 2) problems.push(`the frame's contrast against the panel is ${contrast.toFixed(2)}, under 2`);
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

export default [
  ...['desktop', 'laptop', 'monitor', 'three-col-min'].map((viewport) => titleCheck(viewport)),
  // Back from the election simulation the masthead has to hold its styles.
  titleCheck('laptop', 'title-after-simulation'),
  ...['two-col', 'narrow', 'phone'].map(narrowCheck),
  startedCheck,
  inkCheck('light'),
  inkCheck('dark'),
];
