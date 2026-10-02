'use strict';

import { close, gte, lte } from '../lib/assert.mjs';
import { STUB_AUDIO } from '../lib/audio.mjs';
import { evaluate } from '../lib/driver.mjs';
import { setTimeout as delay } from 'node:timers/promises';

// Checks for the collapsing banner (layout/banner.js): full before a game
// starts, a one-line strip during play, and a click on the title expands it
// and pushes the grid down. The e2e file (banner.e2e.mjs) covers the rest of
// the cycle: next page, scroll, reduced motion, keyboard, the links.

// Where the columns started on the hub before the banner could shrink, at
// both desktop sizes (the full banner is 37px tall plus its margins).
const CONTENT_TOP_FULL = 83.9;
const GAIN = 20;
const SLIM_MAX = 28;
// The full banner, before a game.
const FULL_MIN = 34;

const SELECTORS = ['header', '#game-title', '#game-title button', '#game-author', '#header-links a', '#content', '#state-bar', '#stats_sidebar', '#depth_column'];

function parts(m) {
  return {
    header: m.elements['header'][0],
    title: m.elements['#game-title'][0],
    button: m.elements['#game-title button'][0],
    author: m.elements['#game-author'][0],
    links: m.elements['#header-links a'],
    content: m.elements['#content'][0],
  };
}

function preGameCheck(viewport, state) {
  return {
    name: `banner:${state}:${viewport}:full`,
    viewport,
    state,
    selectors: SELECTORS,
    test(m) {
      const { header, button, author, links } = parts(m);
      if (!header || !button) return 'header or the title button not found';
      const problems = [];
      if (/\bslim\b/.test(header.className)) problems.push('header is slim before a game');
      if (!gte(header.rect.height, FULL_MIN)) problems.push(`header height ${header.rect.height}, expected >= ${FULL_MIN}`);
      if (!button.disabled) problems.push('the title button is enabled before a game');
      if (!author || author.rect.height === 0) problems.push('the author line is hidden');
      if (links.length !== 3) problems.push(`expected 3 header links, found ${links.length}`);
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

// `start` is the page after "Start game": `started` is set there, so the
// banner goes slim with the difficulty choice, as the state column appears.
function slimCheck(viewport, state = 'hub') {
  return {
    name: `banner:${state}:${viewport}:slim`,
    viewport,
    state,
    selectors: SELECTORS,
    test(m) {
      const { header, title, button, author, links, content } = parts(m);
      if (!header || !button || !content) return 'header, title button or #content not found';
      const problems = [];
      if (!/\bslim\b/.test(header.className)) problems.push('header is not slim during play');
      if (!lte(header.rect.height, SLIM_MAX)) problems.push(`header height ${header.rect.height}, expected <= ${SLIM_MAX}`);
      if (button.disabled) problems.push('the title button is disabled during play');
      if (author && author.rect.height !== 0) problems.push(`the author line is shown (${author.rect.height}px tall)`);
      if (links.length !== 3) problems.push(`expected 3 header links, found ${links.length}`);
      for (const link of links) {
        if (link.rect.height === 0) problems.push(`link "${link.text}" is not shown`);
      }
      const top = content.rect.top;
      if (!lte(top, CONTENT_TOP_FULL - GAIN)) {
        problems.push(`columns start at ${top}, expected <= ${CONTENT_TOP_FULL - GAIN} (${GAIN}px above the full banner's ${CONTENT_TOP_FULL})`);
      }
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

// A click on the title grows the banner and moves #content down by exactly
// as much as the banner's box (height and margins) grew; a second click goes
// back.
const SETTLE_MS = 450;
const BOX = `(() => {
  const h = document.querySelector('header');
  const s = getComputedStyle(h);
  const r = h.getBoundingClientRect();
  return {
    slim: h.classList.contains('slim'),
    height: r.height,
    box: r.height + parseFloat(s.marginTop) + parseFloat(s.marginBottom),
    contentTop: document.getElementById('content').getBoundingClientRect().top,
    scrollWidth: document.documentElement.scrollWidth,
  };
})()`;

function expandCheck(viewport) {
  return {
    name: `banner:hub:${viewport}:expand-pushes-content`,
    viewport,
    state: 'hub',
    selectors: [],
    async act(page) {
      const slim = await evaluate(page, BOX);
      await evaluate(page, `document.getElementById('banner-toggle').click(); true`);
      await delay(SETTLE_MS);
      const full = await evaluate(page, BOX);
      await evaluate(page, `document.getElementById('banner-toggle').click(); true`);
      await delay(SETTLE_MS);
      const again = await evaluate(page, BOX);
      return { slim, full, again };
    },
    test(m) {
      const { slim, full, again } = m.acted;
      const problems = [];
      if (slim.slim !== true || full.slim !== false || again.slim !== true) {
        problems.push(`slim flags ${slim.slim}, ${full.slim}, ${again.slim}; expected true, false, true`);
      }
      if (!gte(full.height, FULL_MIN)) problems.push(`expanded height ${full.height}, expected >= ${FULL_MIN}`);
      const pushed = full.contentTop - slim.contentTop;
      const grew = full.box - slim.box;
      if (!close(pushed, grew)) problems.push(`#content moved ${pushed}px, the banner's box grew ${grew}px`);
      if (!(pushed >= 10)) problems.push(`#content moved only ${pushed}px`);
      if (!close(again.contentTop, slim.contentTop)) problems.push(`after collapsing, #content is at ${again.contentTop}, was ${slim.contentTop}`);
      if (full.scrollWidth > (slim.scrollWidth + 1)) problems.push(`expanding added horizontal overflow (${full.scrollWidth} vs ${slim.scrollWidth})`);
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

// The strip stays one line (and inside the window) at every width, even
// where the full banner wraps to three lines.
function narrowCheck(viewport) {
  return {
    name: `banner:hub:${viewport}:slim-one-line`,
    viewport,
    state: 'hub',
    selectors: SELECTORS,
    test(m) {
      const { header, links } = parts(m);
      if (!header) return 'header not found';
      const problems = [];
      if (!lte(header.rect.height, SLIM_MAX)) problems.push(`header height ${header.rect.height}, expected <= ${SLIM_MAX}`);
      if (m.scrollWidth > m.clientWidth) problems.push(`horizontal overflow: scrollWidth ${m.scrollWidth} > clientWidth ${m.clientWidth}`);
      for (const link of links) {
        if (link.rect.right > m.clientWidth + 1 || link.rect.left < 0) problems.push(`link "${link.text}" is outside the window`);
      }
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

// The music controls (layout/music.js) in the header: absent until the game
// has a track, then three buttons in front of the links that add no height to
// the strip or the full banner. Behaviour (pause, skip, mute, Options in
// step, the tab order) is in banner.e2e.mjs.
const MUSIC_SELECTORS = ['header', '#header-music', '#header-music button', '#header-music svg', '#header-links a'];
// The widest the group may be: three buttons of 26px, and a little room.
const MUSIC_MAX_WIDTH = 90;
const SETTLE = 450;

function musicAbsentCheck(viewport, state) {
  return {
    name: `banner:music:${state}:${viewport}:absent`,
    viewport,
    state,
    selectors: MUSIC_SELECTORS,
    test(m) {
      const group = m.elements['#header-music'][0];
      if (!group) return 'the music group is missing from the header';
      if (group.rect.width !== 0) return `the music group is shown (${group.rect.width}px wide) before the game has a track`;
      return true;
    },
  };
}

function musicStripCheck(viewport) {
  return {
    name: `banner:music:hub:${viewport}:slim`,
    viewport,
    state: 'hub',
    selectors: MUSIC_SELECTORS,
    async act(page) {
      await evaluate(page, STUB_AUDIO);
      await delay(200);
      return true;
    },
    test(m) {
      const header = m.elements['header'][0];
      const group = m.elements['#header-music'][0];
      const buttons = m.elements['#header-music button'];
      const icons = m.elements['#header-music svg'];
      const links = m.elements['#header-links a'];
      const problems = [];
      if (!header || !group) return 'header or the music group not found';
      if (!close(header.rect.height, 26)) problems.push(`strip is ${header.rect.height}px tall, expected 26`);
      if (buttons.length !== 3) problems.push(`expected 3 music buttons, found ${buttons.length}`);
      if (!lte(group.rect.width, MUSIC_MAX_WIDTH)) problems.push(`the group is ${group.rect.width}px wide, expected <= ${MUSIC_MAX_WIDTH}`);
      for (const button of buttons) {
        if (button.rect.width === 0) problems.push('a music button is not shown');
        if (!gte(button.rect.top, header.rect.top) || !lte(button.rect.bottom, header.rect.bottom)) problems.push('a music button is taller than the strip');
      }
      for (const icon of icons) {
        if (!close(icon.rect.width, 16) || !close(icon.rect.height, 16)) problems.push(`an icon is ${icon.rect.width} x ${icon.rect.height}, expected 16 x 16`);
      }
      if (links.length !== 3) problems.push(`expected 3 header links, found ${links.length}`);
      if (links[0] && !lte(group.rect.right, links[0].rect.left)) problems.push('the music group overlaps the Library link');
      if (m.scrollWidth > m.clientWidth) problems.push(`horizontal overflow: scrollWidth ${m.scrollWidth} > clientWidth ${m.clientWidth}`);
      for (const link of links) {
        if (link.rect.right > m.clientWidth + 1 || link.rect.left < 0) problems.push(`link "${link.text}" is outside the window`);
      }
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

// Expanded, the controls draw at 18px and leave the banner as tall as it was
// without them.
function musicFullCheck(viewport) {
  return {
    name: `banner:music:hub:${viewport}:full`,
    viewport,
    state: 'hub',
    selectors: MUSIC_SELECTORS,
    async act(page) {
      await evaluate(page, `document.getElementById('banner-toggle').click(); true`);
      await delay(SETTLE);
      const height = () => evaluate(page, `document.querySelector('header').getBoundingClientRect().height`);
      const without = await height();
      await evaluate(page, STUB_AUDIO);
      await delay(200);
      return { without, with: await height() };
    },
    test(m) {
      const group = m.elements['#header-music'][0];
      const buttons = m.elements['#header-music button'];
      const icons = m.elements['#header-music svg'];
      const problems = [];
      if (buttons.length !== 3) problems.push(`expected 3 music buttons, found ${buttons.length}`);
      if (!group || group.rect.width === 0) problems.push('the music group is not shown in the full banner');
      for (const icon of icons) {
        if (!close(icon.rect.width, 18) || !close(icon.rect.height, 18)) problems.push(`an icon is ${icon.rect.width} x ${icon.rect.height}, expected 18 x 18`);
      }
      if (!close(m.acted.with, m.acted.without)) problems.push(`the banner is ${m.acted.with}px tall with the controls, ${m.acted.without}px without`);
      if (m.scrollWidth > m.clientWidth) problems.push(`horizontal overflow: scrollWidth ${m.scrollWidth} > clientWidth ${m.clientWidth}`);
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

// With music off in Options the strip keeps one button: the mute toggle,
// pressed.
function musicOffCheck(viewport) {
  return {
    name: `banner:music:hub:${viewport}:off-leaves-mute`,
    viewport,
    state: 'hub',
    selectors: ['header', '#music-play', '#music-skip', '#music-mute'],
    async act(page) {
      await evaluate(page, STUB_AUDIO);
      await evaluate(page, `window.disableAudio(); true`);
      await delay(200);
      return evaluate(page, `document.getElementById('music-mute').getAttribute('aria-pressed')`);
    },
    test(m) {
      const header = m.elements['header'][0];
      const [play] = m.elements['#music-play'];
      const [skip] = m.elements['#music-skip'];
      const [mute] = m.elements['#music-mute'];
      const problems = [];
      if (play.rect.width !== 0 || skip.rect.width !== 0) problems.push('play or skip is shown while music is off');
      if (mute.rect.width === 0) problems.push('the mute toggle is hidden while music is off');
      if (m.acted !== 'true') problems.push(`aria-pressed is ${m.acted} on the mute toggle while music is off, expected true`);
      if (!close(header.rect.height, 26)) problems.push(`strip is ${header.rect.height}px tall, expected 26`);
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

export default [
  musicAbsentCheck('laptop', 'title'),
  musicAbsentCheck('laptop', 'start'),
  musicStripCheck('laptop'),
  musicStripCheck('monitor'),
  musicStripCheck('narrow'),
  musicStripCheck('phone'),
  musicFullCheck('laptop'),
  musicFullCheck('two-col'),
  musicFullCheck('phone'),
  musicOffCheck('laptop'),
  preGameCheck('laptop', 'title'),
  preGameCheck('phone', 'title'),
  slimCheck('laptop'),
  slimCheck('monitor'),
  slimCheck('laptop', 'start'),
  expandCheck('laptop'),
  expandCheck('monitor'),
  narrowCheck('two-col'),
  narrowCheck('narrow'),
  narrowCheck('phone'),
];
