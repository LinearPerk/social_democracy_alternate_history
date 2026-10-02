'use strict';

import { TOLERANCE, close, gte, lte, within } from '../lib/assert.mjs';
import { VIEWPORTS } from '../lib/viewports.mjs';

// Every kind of view the depth column shows, at every width tier, with the
// game's own content in it: nothing drawn escapes the column box, the page
// doesn't scroll sideways, and the columns keep the ladder order (state,
// decision, depth): side by side from 1300px, depth under the decision column
// from 800px, all stacked below that. depth.mjs measures the strip and the
// title; grid.mjs the empty tracks with a stand-in paragraph.

const COLUMN = '#depth_column';
const STRIP = '#depth-bar .dc-strip';
const BUTTONS = '#depth-bar .dc-strip button';
const KIND = '#depth_column .dc-kind';
const TITLE = '#depth_column .dc-title';
const PARTS = '#depth_column .dc-body *, #depth-bar .dc-strip *, #depth_column .dc-title';

const AUDIO_AUTOPLAY_BLOCK = /NotAllowedError.*play()/s;
const realErrors = (m) => m.consoleErrors.filter((e) => !AUDIO_AUTOPLAY_BLOCK.test(e));

// state: how the harness reaches the view. Then what to expect of it: `view`
// is the column's data-view, `current` the strip's marked button (resting
// views), `kind` the label above the title (page and entry views), `title` a
// test on the heading.
const VIEWS = [
  { name: 'polls', state: 'hub-month', view: 'polls', current: 'Polls' },
  { name: 'times', state: 'hub-historical', view: 'times', current: 'Die Zeit' },
  { name: 'page', state: 'card-depth', view: 'page', kind: 'Background' },
  // The defense entry draws its own heading in the body.
  { name: 'entry-defense', state: 'hub-defense-entry', view: 'entry', kind: 'Entry' },
  { name: 'entry-term', state: 'view-entry-term', view: 'entry', kind: 'Entry', title: /^Party resources$/ },
  { name: 'entry-party', state: 'view-entry-party', view: 'entry', kind: 'Entry', title: /./ },
  { name: 'entry-advisor', state: 'view-entry-advisor', view: 'entry', kind: 'Entry', title: /./ },
  { name: 'library-home', state: 'view-library-home', view: 'library', current: 'Library' },
  { name: 'library-section', state: 'library-section', view: 'library', kind: 'Library', title: /^Current government details$/ },
];

const TIERS = ['monitor', 'laptop', 'laptop-l', 'three-col-min', 'two-col', 'narrow', 'phone'];

function tierOf(viewport) {
  const width = VIEWPORTS[viewport].width;
  if (width >= 1300) return 'three';
  if (width >= 800) return 'two';
  return 'stacked';
}

// Problems with what the column shows, as a list, or a string when there is
// no column to look at.
function whatIsOpen(spec, column, buttons, kind, title) {
  if (!column) return '#depth_column not found';
  if (column.display === 'none') return '#depth_column is not displayed';
  const problems = [];
  if (spec.current) {
    const marked = buttons.filter((b) => b.ariaCurrent === 'true').map((b) => b.text);
    if (marked.join('|') !== spec.current) problems.push(`strip marks "${marked.join('|')}", expected ${spec.current}`);
    if (kind) problems.push(`resting view shows a kind label "${kind.text}"`);
  }
  if (spec.kind && (!kind || kind.text !== spec.kind)) problems.push(`kind label "${kind && kind.text}", expected ${spec.kind}`);
  if (spec.title && (!title || !spec.title.test(title.text))) problems.push(`title "${title && title.text}" does not match ${spec.title}`);
  return problems;
}

function check(spec, viewport) {
  const tier = tierOf(viewport);
  return {
    name: `tiers:${spec.name}:${viewport}`,
    viewport,
    state: spec.state,
    selectors: ['#tools_wrapper', '#content', 'footer', COLUMN, STRIP, BUTTONS, KIND, TITLE, PARTS],
    test(m) {
      const [side] = m.elements['#tools_wrapper'];
      const [decision] = m.elements['#content'];
      const [footer] = m.elements['footer'];
      const [column] = m.elements[COLUMN];
      const [strip] = m.elements[STRIP];
      const [kind] = m.elements[KIND];
      const [title] = m.elements[TITLE];
      const open = whatIsOpen(spec, column, m.elements[BUTTONS], kind, title);
      if (typeof open === 'string') return open;
      const problems = open;
      if (!decision) return '#content not found';
      if (!column.text) problems.push('column is empty');
      if (column.rect.height < 60) problems.push(`column only ${column.rect.height}px tall`);

      // Nothing sticks out of the column box, and the column scrolls nowhere.
      const escapes = m.elements[PARTS].filter(
        (p) => p.rect.width > 0 && (p.rect.right > column.rect.right + TOLERANCE || p.rect.left < column.rect.left - TOLERANCE)
      );
      if (escapes.length > 0) {
        const first = escapes[0];
        problems.push(`${escapes.length} part(s) outside the column box (first: "${first.text.slice(0, 30)}", ${first.rect.left}-${first.rect.right} vs ${column.rect.left}-${column.rect.right})`);
      }
      if (column.scrollWidth > column.clientWidth + TOLERANCE) {
        problems.push(`column scrolls sideways: scrollWidth ${column.scrollWidth} > clientWidth ${column.clientWidth}`);
      }
      if (m.scrollWidth > m.clientWidth + TOLERANCE) {
        problems.push(`horizontal overflow: scrollWidth ${m.scrollWidth} > clientWidth ${m.clientWidth}`);
      }
      if (column.rect.left < -TOLERANCE || column.rect.right > m.clientWidth + TOLERANCE) {
        problems.push(`column ${column.rect.left}-${column.rect.right} outside the ${m.clientWidth}px viewport`);
      }
      // The strip stays one line.
      const buttons = m.elements[BUTTONS];
      if (buttons.some((b) => Math.abs(b.rect.top - buttons[0].rect.top) > 2)) problems.push('strip wraps onto a second line');
      if (strip && strip.scrollWidth > strip.clientWidth + TOLERANCE) problems.push('strip overflows itself');

      if (tier === 'three') {
        if (!side || side.display === 'none') problems.push('state column missing');
        else if (!lte(side.rect.right, decision.rect.left)) problems.push(`state (right ${side.rect.right}) overlaps decision (left ${decision.rect.left})`);
        if (!lte(decision.rect.right, column.rect.left)) problems.push(`decision (right ${decision.rect.right}) overlaps depth (left ${column.rect.left})`);
        if (!within(column.rect.width, 384, 576)) problems.push(`depth width ${column.rect.width}, expected 384-576`);
        if (!close(column.rect.top, decision.rect.top)) problems.push(`depth top ${column.rect.top} not level with decision top ${decision.rect.top}`);
      } else if (tier === 'two') {
        if (!gte(column.rect.top, decision.rect.bottom)) problems.push(`depth (top ${column.rect.top}) not below decision (bottom ${decision.rect.bottom})`);
        if (footer && !gte(column.rect.top, footer.rect.bottom)) problems.push(`depth (top ${column.rect.top}) above the footer (bottom ${footer.rect.bottom})`);
        if (!close(column.rect.left, decision.rect.left)) problems.push(`depth left ${column.rect.left} != decision left ${decision.rect.left}`);
        if (!close(column.rect.width, decision.rect.width)) problems.push(`depth width ${column.rect.width} != decision width ${decision.rect.width}`);
        if (column.backgroundColor === 'rgba(0, 0, 0, 0)') problems.push('view has no backing');
      } else {
        if (!side || !lte(side.rect.bottom, decision.rect.top)) problems.push(`state (bottom ${side && side.rect.bottom}) not above decision (top ${decision.rect.top})`);
        if (!lte(decision.rect.bottom, column.rect.top)) problems.push(`decision (bottom ${decision.rect.bottom}) below depth (top ${column.rect.top})`);
        if (column.backgroundColor === 'rgba(0, 0, 0, 0)') problems.push('view has no backing');
      }
      const errors = realErrors(m);
      if (errors.length > 0) problems.push(`console errors: ${errors.join(' | ')}`);
      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

export default VIEWS.flatMap((spec) => TIERS.map((viewport) => check(spec, viewport)));
