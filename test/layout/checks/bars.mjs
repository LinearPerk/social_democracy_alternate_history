'use strict';

import { close, lte } from '../lib/assert.mjs';
import { evaluate } from '../lib/driver.mjs';

// Checks for the column bars: the date line, the state column's bar
// (#state-bar) and the depth column's (#depth-bar) share one look and one
// height, each is as wide as its column, and the layout puts them where the
// tier says. Three columns: one line above the three columns. Two columns:
// the state bar beside the date line, the depth bar over the depth column.
// Stacked: each bar directly over its column. The grid only places them; the
// modules fill them (state-column.js, depth-column.js).

const SELECTORS = ['#state-bar', '#date-line', '#depth-bar', '#tools_wrapper', '#stats_sidebar', '#content', '#depth_column'];

function found(m) {
  const [stateBar] = m.elements['#state-bar'];
  const [dateLine] = m.elements['#date-line'];
  const [depthBar] = m.elements['#depth-bar'];
  const [state] = m.elements['#tools_wrapper'];
  const [sidebar] = m.elements['#stats_sidebar'];
  const [content] = m.elements['#content'];
  const [depth] = m.elements['#depth_column'];
  return { stateBar, dateLine, depthBar, state, sidebar, content, depth };
}

function missing(els) {
  const absent = Object.entries(els).filter(([, el]) => !el).map(([name]) => name);
  return absent.length === 0 ? null : `not found: ${absent.join(', ')}`;
}

// One look: the same backing, type and height as the date line's.
function sameLook(bar, dateLine, name, problems) {
  if (bar.backgroundColor !== dateLine.backgroundColor) {
    problems.push(`${name} background ${bar.backgroundColor} != date line ${dateLine.backgroundColor}`);
  }
  if (!/Jost/.test(bar.fontFamily)) problems.push(`${name} font ${bar.fontFamily}, expected Jost`);
  if (!close(bar.rect.height, dateLine.rect.height)) {
    problems.push(`${name} height ${bar.rect.height} != date line ${dateLine.rect.height}`);
  }
}

function wideAs(bar, column, name, columnName, problems) {
  if (!close(bar.rect.left, column.rect.left) || !close(bar.rect.right, column.rect.right)) {
    problems.push(`${name} ${bar.rect.left}-${bar.rect.right} != ${columnName} ${column.rect.left}-${column.rect.right}`);
  }
}

function sharesLine(bar, dateLine, name, problems) {
  if (!close(bar.rect.top, dateLine.rect.top) || !close(bar.rect.bottom, dateLine.rect.bottom)) {
    problems.push(`${name} ${bar.rect.top}-${bar.rect.bottom} is not on the date line's ${dateLine.rect.top}-${dateLine.rect.bottom}`);
  }
}

// A bar sits just above its column: its bottom is at or above the column's
// top, with no more than the small gap between them.
function justAbove(bar, column, name, columnName, problems) {
  const gap = column.rect.top - bar.rect.bottom;
  if (gap < -1 || gap > 12) {
    problems.push(`${name} bottom ${bar.rect.bottom} is not just above ${columnName} top ${column.rect.top}`);
  }
}

function threeColumnCheck(viewport, state = 'hub') {
  return {
    name: `bars:three-column:${viewport}:${state}`,
    viewport,
    state,
    selectors: SELECTORS,
    test(m) {
      const els = found(m);
      const gone = missing(els);
      if (gone) return gone;
      const { stateBar, dateLine, depthBar, state: stateWrap, sidebar, content, depth } = els;
      const problems = [];
      for (const [name, bar] of [['#state-bar', stateBar], ['#depth-bar', depthBar]]) {
        sameLook(bar, dateLine, name, problems);
        sharesLine(bar, dateLine, name, problems);
      }
      wideAs(stateBar, stateWrap, '#state-bar', '#tools_wrapper', problems);
      wideAs(dateLine, content, '#date-line', '#content', problems);
      wideAs(depthBar, depth, '#depth-bar', '#depth_column', problems);
      // The columns themselves start level, below the bars.
      if (!close(sidebar.rect.top, content.rect.top)) {
        problems.push(`state panel top ${sidebar.rect.top} != content top ${content.rect.top}`);
      }
      if (!close(depth.rect.top, content.rect.top)) {
        problems.push(`depth top ${depth.rect.top} != content top ${content.rect.top}`);
      }
      justAbove(dateLine, content, '#date-line', '#content', problems);
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

// Before a game starts the bars draw nothing: no state bar (the sidebar is
// hidden) and no depth bar (the column is empty on the title page).
function titleCheck(viewport) {
  return {
    name: `bars:title:${viewport}`,
    viewport,
    state: 'title',
    selectors: ['#state-bar', '#depth-bar', '#date-line'],
    test(m) {
      const problems = [];
      for (const selector of ['#state-bar', '#depth-bar', '#date-line']) {
        for (const el of m.elements[selector]) {
          if (el.display !== 'none' || el.rect.height !== 0) problems.push(`${selector} is drawn before a game starts`);
        }
      }
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

// A bar draws exactly when its column does: the state bar with the state
// column's panel, the depth bar with the depth column's content. The first
// page after "Start game" has both; the title page neither (above).
function startCheck(viewport) {
  return {
    name: `bars:start:${viewport}`,
    viewport,
    state: 'start',
    selectors: ['#state-bar', '#depth-bar', '#depth_column', '#stats_sidebar'],
    test(m) {
      const problems = [];
      const [depth] = m.elements['#depth_column'];
      const [sidebar] = m.elements['#stats_sidebar'];
      const [stateBar] = m.elements['#state-bar'];
      const [depthBar] = m.elements['#depth-bar'];
      if (!depth || !sidebar) return '#depth_column or #stats_sidebar not found';
      const drawn = (el) => !!el && el.display !== 'none' && el.rect.height > 0;
      if (drawn(sidebar) !== drawn(stateBar)) problems.push(`state panel drawn ${drawn(sidebar)}, its bar drawn ${drawn(stateBar)}`);
      if ((depth.text !== '') !== drawn(depthBar)) problems.push(`depth column has content ${depth.text !== ''}, its bar drawn ${drawn(depthBar)}`);
      if (!drawn(depthBar)) problems.push('expected the depth bar over the depth column on the start page');
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

// Two columns: the state bar and the date line share a row, each over its
// column; the depth bar sits directly over the depth column, in the
// decision column's width.
function twoColumnCheck(viewport) {
  return {
    name: `bars:two-column:${viewport}`,
    viewport,
    state: 'hub',
    selectors: SELECTORS,
    test(m) {
      const els = found(m);
      const gone = missing(els);
      if (gone) return gone;
      const { stateBar, dateLine, depthBar, state: stateWrap, sidebar, content, depth } = els;
      const problems = [];
      sameLook(stateBar, dateLine, '#state-bar', problems);
      sameLook(depthBar, dateLine, '#depth-bar', problems);
      sharesLine(stateBar, dateLine, '#state-bar', problems);
      wideAs(stateBar, stateWrap, '#state-bar', '#tools_wrapper', problems);
      wideAs(dateLine, content, '#date-line', '#content', problems);
      wideAs(depthBar, depth, '#depth-bar', '#depth_column', problems);
      if (!close(sidebar.rect.top, content.rect.top)) {
        problems.push(`state panel top ${sidebar.rect.top} != content top ${content.rect.top}`);
      }
      justAbove(depthBar, depth, '#depth-bar', '#depth_column', problems);
      if (!lte(content.rect.bottom, depthBar.rect.top)) {
        problems.push(`depth bar top ${depthBar.rect.top} is above the decision column's end ${content.rect.bottom}`);
      }
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

// Stacked: DOM order is state bar, state, date line, decision, depth bar,
// depth, each bar directly over its column and as wide.
function stackedCheck(viewport) {
  return {
    name: `bars:stacked:${viewport}`,
    viewport,
    state: 'hub',
    selectors: SELECTORS,
    test(m) {
      const els = found(m);
      const gone = missing(els);
      if (gone) return gone;
      const { stateBar, dateLine, depthBar, sidebar, content, depth } = els;
      const problems = [];
      sameLook(stateBar, dateLine, '#state-bar', problems);
      sameLook(depthBar, dateLine, '#depth-bar', problems);
      wideAs(stateBar, sidebar, '#state-bar', '#stats_sidebar', problems);
      wideAs(depthBar, depth, '#depth-bar', '#depth_column', problems);
      justAbove(stateBar, sidebar, '#state-bar', '#stats_sidebar', problems);
      justAbove(depthBar, depth, '#depth-bar', '#depth_column', problems);
      justAbove(dateLine, content, '#date-line', '#content', problems);
      if (!lte(content.rect.bottom, depthBar.rect.top)) {
        problems.push(`depth bar top ${depthBar.rect.top} is above the decision column's end ${content.rect.bottom}`);
      }
      if (m.scrollWidth > m.clientWidth) {
        problems.push(`horizontal overflow: scrollWidth ${m.scrollWidth} > clientWidth ${m.clientWidth}`);
      }
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

// The bars wear the page's colours in dark mode too: a solid backing on all
// three, the same one.
const darkCheck = {
  name: 'bars:dark:laptop',
  viewport: 'laptop',
  state: 'hub',
  selectors: [],
  act: (page) => evaluate(
    page,
    `(() => {
      document.body.classList.add('dark-mode');
      return ['#state-bar', '#date-line', '#depth-bar'].map((s) => {
        const el = document.querySelector(s);
        return el ? getComputedStyle(el).backgroundColor : null;
      });
    })()`
  ),
  test(m) {
    const [state, date, depth] = m.acted;
    const problems = [];
    for (const [name, color] of [['#state-bar', state], ['#date-line', date], ['#depth-bar', depth]]) {
      if (!color || color === 'transparent' || /rgba\(.*,\s*0\)$/.test(color)) problems.push(`${name} background ${color}, expected a colour`);
    }
    if (state !== date || depth !== date) problems.push(`backgrounds differ: ${state} / ${date} / ${depth}`);
    return problems.length === 0 ? true : problems.join('; ');
  },
};

// What the bars carry: "Reichstag" centred with the Seats/Polls toggle at the
// right end; Back at the left and the view picks at the right. The column
// itself holds neither the title row nor the strip.
const contentCheck = {
  name: 'bars:content:laptop',
  viewport: 'laptop',
  state: 'hub-month',
  selectors: ['#state-bar', '#state-bar .sc-bar-title', '#state-bar .sc-seg.small', '#state-column .sc-title', '#depth-bar', '#depth-bar [data-dc-back]', '#depth-bar [data-dc-pick]', '#depth_column .dc-strip'],
  test(m) {
    const [bar] = m.elements['#state-bar'];
    const [title] = m.elements['#state-bar .sc-bar-title'];
    const [toggle] = m.elements['#state-bar .sc-seg.small'];
    const [depthBar] = m.elements['#depth-bar'];
    const [back] = m.elements['#depth-bar [data-dc-back]'];
    const picks = m.elements['#depth-bar [data-dc-pick]'];
    const problems = [];
    if (!bar || !title || !toggle) return '#state-bar, its title or its toggle not found';
    if (title.text !== 'Reichstag') problems.push(`state bar title "${title.text}", expected Reichstag`);
    if (m.elements['#state-column .sc-title'].length) problems.push('the column still has a .sc-title row');
    if (toggle.rect.left < title.rect.right) problems.push('the toggle is not right of the title');
    if (toggle.rect.right > bar.rect.right + 1 || toggle.rect.left < bar.rect.left - 1) problems.push('the toggle is outside the bar');
    if (toggle.rect.top < bar.rect.top - 1 || toggle.rect.bottom > bar.rect.bottom + 1) problems.push('the toggle is taller than the bar');
    // The title stays centred in the bar, as the date line's text does.
    const off = Math.abs((title.rect.left + title.rect.right) / 2 - (bar.rect.left + bar.rect.right) / 2);
    if (off > 8) problems.push(`the title is ${off}px off the bar's centre`);
    if (m.elements['#depth_column .dc-strip'].length) problems.push('the depth column still holds a strip');
    if (!back || !depthBar) problems.push('no Back button in #depth-bar');
    if (picks.length < 2) problems.push(`${picks.length} view picks in #depth-bar, expected at least 2`);
    if (back && depthBar && (back.rect.left < depthBar.rect.left || back.rect.left - depthBar.rect.left > 24)) {
      problems.push('Back is not at the left end of the bar');
    }
    if (back && picks.length && !(back.rect.right <= picks[0].rect.left)) problems.push('Back is not left of the view picks');
    const last = picks[picks.length - 1];
    if (last && depthBar && (depthBar.rect.right - last.rect.right > 24 || last.rect.right > depthBar.rect.right + 1)) {
      problems.push('the view picks are not at the right end of the bar');
    }
    for (const b of [back, ...picks].filter(Boolean)) {
      if (b.rect.top < depthBar.rect.top - 1 || b.rect.bottom > depthBar.rect.bottom + 1) problems.push(`"${b.text}" is taller than the bar`);
    }
    return problems.length === 0 ? true : problems.join('; ');
  },
};

export default [
  threeColumnCheck('laptop'),
  threeColumnCheck('monitor'),
  threeColumnCheck('three-col-min'),
  threeColumnCheck('laptop', 'hub-state-full'),
  titleCheck('laptop'),
  titleCheck('two-col'),
  startCheck('laptop'),
  startCheck('two-col'),
  twoColumnCheck('two-col'),
  stackedCheck('narrow'),
  stackedCheck('phone'),
  darkCheck,
  contentCheck,
];
