'use strict';

import { VIEWPORTS } from '../lib/viewports.mjs';

// The console error a rejected audio play() throws when Chrome blocks
// autoplay before any user gesture. Expected on every state, so it doesn't
// count as a failure here.
const AUDIO_AUTOPLAY_BLOCK = /NotAllowedError.*play\(\)/s;

const STATES = ['title', 'hub'];

function smokeCheck(viewport, state) {
  return {
    name: `smoke:${viewport}:${state}`,
    viewport,
    state,
    selectors: ['#content'],
    test(m) {
      const problems = [];

      // Not m.viewport.width: body keeps its scrollbar gutter always on
      // (game.css `overflow-y: scroll`), and window.innerWidth (what
      // m.viewport measures) includes that gutter, letting ~17px of real
      // overflow through undetected. clientWidth is the actual content box.
      if (m.scrollWidth > m.clientWidth) {
        problems.push(`horizontal overflow: scrollWidth ${m.scrollWidth} > clientWidth ${m.clientWidth}`);
      }

      const [content] = m.elements['#content'];
      if (!content) {
        problems.push('#content not found');
      } else if (content.display === 'none' || content.rect.width === 0 || content.rect.height === 0) {
        problems.push(`#content not visible (display: ${content.display}, rect: ${content.rect.width}x${content.rect.height})`);
      }

      const unexpected = m.consoleErrors.filter((error) => !AUDIO_AUTOPLAY_BLOCK.test(error));
      if (unexpected.length > 0) {
        problems.push(`console error(s): ${unexpected.join(' | ')}`);
      }

      return problems.length === 0 ? true : problems.join('; ');
    },
  };
}

export default Object.keys(VIEWPORTS).flatMap((viewport) => STATES.map((state) => smokeCheck(viewport, state)));
