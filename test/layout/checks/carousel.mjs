'use strict';

import { setTimeout as delay } from 'node:timers/promises';

import { close, gte, lte, within } from '../lib/assert.mjs';
import { evaluate, setViewport, waitForCondition } from '../lib/driver.mjs';

// The title page's carousels (out/html/layout/carousel.js). The left panel is
// a wall: as many captioned landscape pictures stacked as its height holds
// (two on a laptop, three on a large monitor). The right panel is one portrait
// in a photo block (a heavy rule, a hairline, a stud at each corner), with its
// caption under it. Both are as tall as the decision panel beside them, which
// takes the floor it has during play, so all three end at the fold and the
// page does not scroll. None once a game has started, and none below the
// three-column tier. Timers, pausing, the one-slot rotation and the removal
// when a game starts are in carousel.e2e.mjs.

const SELECTORS = ['#carousel-state', '#carousel-depth', '#content'];

// The body's 0.5rem margin, left under the panels at the fold.
const MARGIN = 8;

// How many pictures the wall holds at each viewport: the panel is about 700px
// tall on the laptop and the desktop size, about 1020px on the monitor, and a
// slot (a 3:2 picture, its caption and a rule) is about 300px.
const WALL = { desktop: 2, laptop: 2, monitor: 3, 'three-col-min': 2 };

// Waits until both panels exist with every picture loaded, and reads what
// each shows.
async function loaded(page) {
  await waitForCondition(() => evaluate(page, `(() => {
    const panels = ['carousel-state', 'carousel-depth'].map((id) => document.getElementById(id));
    return panels.every((p) => p && p.querySelectorAll('.cr-img').length > 0
      && Array.from(p.querySelectorAll('.cr-img')).every((i) => i.complete && i.naturalWidth > 0));
  })()`), { timeoutMs: 8000 });
  return evaluate(page, `(() => {
    const box = (node) => {
      const r = node.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
    };
    const read = (id) => {
      const p = document.getElementById(id);
      return {
        panel: box(p),
        dots: p.querySelectorAll('.cr-dot').length,
        lit: p.querySelectorAll('.cr-dot.on').length,
        rules: p.querySelectorAll('.cr-rule').length,
        slots: Array.from(p.querySelectorAll('.cr-slot')).map((slot) => {
          const img = slot.querySelector('.cr-img');
          const cap = slot.querySelector('.cr-cap');
          const credit = slot.querySelector('.cr-credit');
          // The credit's last link is the source page; a licence link may
          // come before it.
          const links = credit.querySelectorAll('a');
          const link = links.length ? links[links.length - 1] : null;
          return {
            name: slot.querySelector('.cr-name').textContent.trim(),
            credit: credit.textContent.trim(),
            href: link ? link.href : '',
            src: img.getAttribute('src'),
            img: box(img),
            cap: box(cap),
            // The link ends the credit; it is clipped if it falls outside.
            link: link ? box(link) : null,
            ratio: img.naturalWidth / img.naturalHeight,
          };
        }),
      };
    };
    const state = read('carousel-state');
    const depth = read('carousel-depth');
    const frame = document.querySelector('#carousel-depth .cr-frame');
    const matte = document.querySelector('#carousel-depth .cr-matte');
    if (frame && matte) {
      const fs = getComputedStyle(frame);
      const ms = getComputedStyle(matte);
      depth.frame = {
        box: box(frame),
        outer: parseFloat(fs.borderTopWidth),
        outerStyle: fs.borderTopStyle,
        hair: parseFloat(ms.borderTopWidth),
        hairStyle: ms.borderTopStyle,
        corners: frame.querySelectorAll('.cr-corner').length,
        cornerBoxes: Array.from(frame.querySelectorAll('.cr-corner')).map(box),
      };
    }
    return { state, depth };
  })()`);
}

function titleCheck(viewport) {
  return {
    name: `carousel:title:${viewport}`,
    viewport,
    state: 'title',
    selectors: SELECTORS,
    act: loaded,
    test(m) {
      const [state] = m.elements['#carousel-state'];
      const [depth] = m.elements['#carousel-depth'];
      const [decision] = m.elements['#content'];
      const left = m.acted.state;
      const right = m.acted.depth;
      const problems = [];
      if (!state || !depth) return 'a carousel panel is missing';
      if (state.display === 'none' || depth.display === 'none') return 'a carousel panel is not displayed';
      if (!close(state.rect.top, decision.rect.top) || !close(depth.rect.top, decision.rect.top)) {
        problems.push(`tops: state ${state.rect.top}, decision ${decision.rect.top}, depth ${depth.rect.top}`);
      }
      if (!close(state.rect.bottom, decision.rect.bottom) || !close(depth.rect.bottom, decision.rect.bottom)) {
        problems.push(`bottoms: state ${state.rect.bottom}, decision ${decision.rect.bottom}, depth ${depth.rect.bottom}`);
      }
      if (!close(state.rect.width, 336)) problems.push(`state width ${state.rect.width}, expected 336`);
      if (!within(depth.rect.width, 384, 576)) problems.push(`depth width ${depth.rect.width}, expected 384-576`);
      if (!lte(state.rect.right, decision.rect.left) || !lte(decision.rect.right, depth.rect.left)) {
        problems.push('a panel overlaps the decision panel');
      }
      const fold = m.viewport.height - MARGIN;
      for (const [side, panel] of [['state', state], ['depth', depth], ['decision', decision]]) {
        if (!close(panel.rect.bottom, fold)) problems.push(`${side} panel bottom ${panel.rect.bottom}, fold ${fold}`);
      }
      if (m.scrollHeight > m.viewport.height + 1) {
        problems.push(`the page scrolls: ${m.scrollHeight} > ${m.viewport.height}`);
      }

      // The wall: its count, each picture whole inside the panel at its own
      // shape, each with a caption and a credit whose link is not clipped,
      // a rule between each pair, and the pictures filling most of the panel.
      if (left.slots.length !== WALL[viewport]) {
        problems.push(`the wall holds ${left.slots.length} pictures, expected ${WALL[viewport]}`);
      }
      if (left.rules !== left.slots.length - 1) problems.push(`${left.rules} rules between ${left.slots.length} pictures`);
      let covered = 0;
      let lastBottom = left.panel.top;
      left.slots.forEach((slot, i) => {
        const where = `wall picture ${i + 1}`;
        covered += slot.img.height;
        if (!gte(slot.img.height, 150)) problems.push(`${where} is ${slot.img.height}px tall, under 150`);
        if (!lte(slot.img.width, left.panel.width)) problems.push(`${where} wider than its panel`);
        if (!close(slot.img.width / slot.img.height, slot.ratio, 0.03 * slot.ratio + 0.02)) {
          problems.push(`${where} shown at ${(slot.img.width / slot.img.height).toFixed(2)}, its own shape is ${slot.ratio.toFixed(2)}`);
        }
        if (slot.img.top < lastBottom - 1) problems.push(`${where} overlaps the one above`);
        lastBottom = slot.cap.bottom;
        if (slot.cap.top < slot.img.bottom - 1) problems.push(`${where}: caption above the picture's foot`);
        if (!slot.name) problems.push(`${where}: no caption`);
        if (!slot.credit) problems.push(`${where}: no credit`);
        if (!/^https:\/\//.test(slot.href)) problems.push(`${where}: credit links to "${slot.href}"`);
        else if (slot.link.bottom > slot.cap.bottom + 1) problems.push(`${where}: the credit's link is clipped`);
        if (!slot.src) problems.push(`${where}: no image`);
      });
      if (lastBottom > left.panel.bottom) problems.push('the wall runs past its panel');
      if (covered < left.panel.height * 0.5) {
        problems.push(`the wall's pictures cover ${covered} of a ${left.panel.height} panel, under half`);
      }
      const srcs = left.slots.map((s) => s.src);
      if (new Set(srcs).size !== srcs.length) problems.push('the wall shows one picture twice');
      if (left.dots < 2) problems.push(`state: ${left.dots} dots`);
      if (left.lit !== left.slots.length) problems.push(`${left.lit} dots lit for ${left.slots.length} pictures`);

      // The portrait: one picture in the photo block, the block no wider than
      // its panel and most of its height.
      if (right.slots.length !== 1) problems.push(`the portrait panel holds ${right.slots.length} pictures`);
      const [one] = right.slots;
      if (!one) return problems.join('; ');
      if (!one.name) problems.push('depth: no caption');
      if (!one.credit) problems.push('depth: no credit');
      if (!/^https:\/\//.test(one.href)) problems.push(`depth: credit links to "${one.href}"`);
      if (right.dots < 2) problems.push(`depth: ${right.dots} dots`);
      const fr = right.frame;
      if (!fr) return [...problems, 'the portrait has no frame'].join('; ');
      if (fr.outer < 3) problems.push(`the frame's heavy rule is ${fr.outer}px, under 3`);
      if (fr.outerStyle !== 'solid') problems.push(`the frame's heavy rule is ${fr.outerStyle}`);
      if (fr.hair < 1 || fr.hair > 1.5) problems.push(`the frame's hairline is ${fr.hair}px`);
      if (fr.hairStyle !== 'solid') problems.push(`the frame's hairline is ${fr.hairStyle}`);
      if (fr.corners !== 4) problems.push(`the frame has ${fr.corners} corner marks, expected 4`);
      else {
        const marks = fr.cornerBoxes.map((c) => [(c.left + c.right) / 2, (c.top + c.bottom) / 2]);
        const want = [[fr.box.left, fr.box.top], [fr.box.right, fr.box.top], [fr.box.left, fr.box.bottom], [fr.box.right, fr.box.bottom]];
        want.forEach(([x, y], i) => {
          if (!marks.some(([mx, my]) => close(mx, x, 1.5) && close(my, y, 1.5))) {
            problems.push(`no corner mark at the frame's corner ${i + 1}`);
          }
        });
      }
      if (fr.box.left < right.panel.left || fr.box.right > right.panel.right) problems.push('the frame is wider than its panel');
      // The frame takes the panel's full width or most of its height: a
      // portrait at the narrowest tier is held by the width.
      const roomy = fr.box.width >= right.panel.width - 22;
      if (!roomy && fr.box.height < right.panel.height * 0.6) {
        problems.push(`the frame is ${fr.box.width} wide and ${fr.box.height} of a ${right.panel.height} panel tall, under 60%`);
      }
      if (!close(one.img.width / one.img.height, one.ratio, 0.02)) {
        problems.push(`the portrait is shown at ${(one.img.width / one.img.height).toFixed(3)}, its own shape is ${one.ratio.toFixed(3)}`);
      }
      if (!gte(one.img.height, 150)) problems.push('the portrait is under 150px tall');
      if (one.cap.top < fr.box.bottom - 1) problems.push('the portrait caption is not under the frame');
      if (srcs.includes(one.src)) problems.push('both sides show the same image');
      if (m.scrollWidth > m.clientWidth) problems.push(`horizontal overflow ${m.scrollWidth} > ${m.clientWidth}`);
      if (m.consoleErrors.length > 0) problems.push(`console errors: ${m.consoleErrors.join(' | ')}`);
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

async function press(page, key, vk) {
  const base = { key, code: key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
  await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}

// The captions a panel shows, top to bottom, as one string.
const nameOf = (page, id) => evaluate(page, `Array.from(document.querySelectorAll('#${id} .cr-name')).map((n) => n.textContent.trim()).join(' | ')`);

// The arrow keys, with a panel focused, move the whole wall on and back; the
// other panel stays where it was. The buttons and a dot do the same, and
// previous from the first set wraps to the last.
const keyboardCheck = {
  name: 'carousel:title:keyboard-and-buttons:laptop',
  viewport: 'laptop',
  state: 'title',
  selectors: [],
  async act(page) {
    await loaded(page);
    const out = {};
    out.start = await nameOf(page, 'carousel-state');
    out.otherStart = await nameOf(page, 'carousel-depth');
    await evaluate(page, `document.getElementById('carousel-state').focus(); true`);
    await press(page, 'ArrowRight', 39);
    out.right = await nameOf(page, 'carousel-state');
    await press(page, 'ArrowLeft', 37);
    out.left = await nameOf(page, 'carousel-state');
    out.other = await nameOf(page, 'carousel-depth');
    await evaluate(page, `document.querySelector('#carousel-state .cr-next').click(); true`);
    out.next = await nameOf(page, 'carousel-state');
    await evaluate(page, `document.querySelector('#carousel-state .cr-prev').click(); true`);
    out.prev = await nameOf(page, 'carousel-state');
    await evaluate(page, `document.querySelectorAll('#carousel-state .cr-dot')[0].click(); true`);
    out.dot = await nameOf(page, 'carousel-state');
    out.dotCurrent = await evaluate(page, `document.querySelectorAll('#carousel-state .cr-dot')[0].getAttribute('aria-current')`);
    out.dotLit = await evaluate(page, `document.querySelectorAll('#carousel-state .cr-dot.on').length`);
    await evaluate(page, `document.querySelector('#carousel-state .cr-prev').click(); true`);
    out.wrap = await nameOf(page, 'carousel-state');
    await delay(50);
    return out;
  },
  test(m) {
    const a = m.acted;
    const problems = [];
    const slotsOf = (s) => s.split(' | ');
    if (a.right === a.start) problems.push('ArrowRight did not step the wall on');
    else if (slotsOf(a.right).some((n) => slotsOf(a.start).includes(n))) problems.push('ArrowRight kept a picture from the old set');
    if (a.left !== a.start) problems.push(`ArrowLeft did not step back: "${a.left}" vs "${a.start}"`);
    if (a.other !== a.otherStart) problems.push('the other panel changed with the first');
    if (a.next === a.start) problems.push('the next button did not step on');
    if (a.prev !== a.start) problems.push('the previous button did not step back');
    if (a.dotCurrent !== 'true') problems.push('the first dot is not current after a click on it');
    if (a.dotLit !== 2) problems.push(`${a.dotLit} dots lit after a click on the first, expected 2`);
    if (!a.dot.startsWith('Berlin, Bankenkrach')) problems.push(`the first dot did not start the wall at the first picture: "${a.dot}"`);
    if (a.wrap === a.dot) problems.push('previous from the first set did not wrap');
    if (m.consoleErrors.length > 0) problems.push(`console errors: ${m.consoleErrors.join(' | ')}`);
    return problems.length === 0 ? true : problems.join('; ');
  },
};

// A started game has no carousel element and no carousel timers.
function absentCheck(state, viewport) {
  return {
    name: `carousel:${state}:none:${viewport}`,
    viewport,
    state,
    selectors: ['.cr-panel'],
    async act(page) {
      await delay(600);
      return evaluate(page, `({ panels: document.querySelectorAll('.cr-panel').length, active: window.Carousel.active() })`);
    },
    test(m) {
      const problems = [];
      if (m.elements['.cr-panel'].length > 0) problems.push('a carousel element exists');
      if (m.acted.panels !== 0) problems.push(`${m.acted.panels} carousel panels in the document`);
      if (m.acted.active !== 0) problems.push(`${m.acted.active} carousel panels or timers still live`);
      if (m.consoleErrors.some((e) => !/play\(\) failed/.test(e))) problems.push(`console errors: ${m.consoleErrors.join(' | ')}`);
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

// Below the three-column tier the carousels take no space, as the empty
// panels they stand in for don't.
function collapsedCheck(viewport) {
  return {
    name: `carousel:title:collapsed:${viewport}`,
    viewport,
    state: 'title',
    selectors: ['.cr-panel'],
    async act(page) {
      await delay(600);
    },
    test(m) {
      const shown = m.elements['.cr-panel'].filter((p) => p.display !== 'none');
      if (shown.length > 0) return `${shown.length} carousel panels displayed`;
      if (m.scrollWidth > m.clientWidth) return `horizontal overflow ${m.scrollWidth} > ${m.clientWidth}`;
      return true;
    },
  };
}

// The Library, opened from the header before a game starts, is a taller page
// in the decision panel than the title page; the carousels grow with it and
// stay level. The window is shortened first, since on the desktop size the
// Library is shorter than the floor.
const libraryCheck = {
  name: 'carousel:title:level-with-a-taller-page:desktop',
  viewport: 'desktop',
  state: 'title',
  selectors: ['#carousel-state', '#carousel-depth', '#content'],
  async act(page) {
    await loaded(page);
    await setViewport(page, { width: 1400, height: 600 });
    await delay(300);
    const before = await evaluate(page, `document.getElementById('content').getBoundingClientRect().height`);
    await evaluate(page, `Array.from(document.querySelectorAll('#header-links a')).find((a) => a.textContent.trim() === 'Library').click(); true`);
    await delay(400);
    return { before };
  },
  test(m) {
    const [state] = m.elements['#carousel-state'];
    const [depth] = m.elements['#carousel-depth'];
    const [decision] = m.elements['#content'];
    const problems = [];
    if (!state || !depth) return 'a carousel panel is missing after the Library opened';
    if (!gte(decision.rect.height, m.acted.before + 40)) problems.push('the Library page is not taller than the title page');
    for (const [side, panel] of [['state', state], ['depth', depth]]) {
      if (!close(panel.rect.top, decision.rect.top) || !close(panel.rect.bottom, decision.rect.bottom)) {
        problems.push(`${side} panel ${panel.rect.top}-${panel.rect.bottom}, decision ${decision.rect.top}-${decision.rect.bottom}`);
      }
    }
    return problems.length === 0 ? true : problems.join('; ');
  },
};

// Every credit the carousel can show, painted into a real slot of its panel
// (landscape slides into the wall's, portraits into the portrait panel's),
// with the source link last: that link must sit inside the credit's box, not
// on a clamped-away line. Done in one evaluation so the rotation cannot
// swap a slide mid-measure; the slot's own credit is put back afterwards.
async function creditFit(page) {
  await loaded(page);
  return evaluate(page, `(async () => {
    const credits = await (await fetch('layout/credits.json')).json();
    const lines = (file, withTitle) => window.Carousel.creditLine(credits[file], withTitle);
    const files = Object.keys(credits);
    const wall = files.filter((f) => f.indexOf('img/portraits/') !== 0 && credits[f].title && f !== window.Carousel.titlePicture);
    const portraits = files.filter((f) => f.indexOf('img/portraits/') === 0);
    const cut = [];
    const run = (panelId, list, withTitle) => {
      const node = document.querySelector('#' + panelId + ' .cr-credit');
      const saved = node.innerHTML;
      list.forEach((file) => {
        window.Carousel.paintCredit(document, node, lines(file, withTitle));
        const links = node.querySelectorAll('a');
        const source = links[links.length - 1].getBoundingClientRect();
        const box = node.getBoundingClientRect();
        if (source.bottom > box.bottom + 1 || source.right > box.right + 1) cut.push(file + ' (' + node.textContent + ')');
      });
      node.innerHTML = saved;
    };
    run('carousel-state', wall, false);
    run('carousel-depth', portraits, true);
    return { cut, checked: wall.length + portraits.length };
  })()`);
}

function creditFitCheck(viewport) {
  return {
    name: `carousel:credit-fit:${viewport}`,
    viewport,
    state: 'title',
    selectors: [],
    act: creditFit,
    test(m) {
      const { cut, checked } = m.acted;
      if (checked < 30) return `only ${checked} credits were checked`;
      return cut.length ? `the source link is cut off for: ${cut.join('; ')}` : true;
    },
  };
}

export default [
  ...['desktop', 'laptop', 'monitor', 'three-col-min'].map(titleCheck),
  ...['laptop', 'three-col-min'].map(creditFitCheck),
  keyboardCheck,
  absentCheck('hub', 'laptop'),
  absentCheck('hub-month', 'monitor'),
  absentCheck('start', 'laptop'),
  ...['two-col', 'narrow', 'phone'].map(collapsedCheck),
  libraryCheck,
];
