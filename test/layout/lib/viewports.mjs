'use strict';

// Named viewports the harness measures at: monitor and laptop sizes, the
// two-column and stacked breakpoints, a phone width, a stacked-tier width
// with room to spare (above upstream's own 560px breakpoint, so nothing
// upstream sets there is masking a bug), and an ultrawide monitor to check
// the margins.
export const VIEWPORTS = {
  monitor: { width: 1920, height: 1080 },
  // A full-HD screen as a browser window shows it, under the tab and address bars.
  'browser-hd': { width: 1920, height: 925 },
  laptop: { width: 1366, height: 768 },
  // The size the pre-game panels are checked and screenshotted at.
  desktop: { width: 1400, height: 800 },
  'laptop-l': { width: 1536, height: 864 },
  // 1300px is the three-column breakpoint in out/html/layout/layout.css.
  'three-col-min': { width: 1300, height: 800 },
  'two-col': { width: 1100, height: 800 },
  narrow: { width: 700, height: 900 },
  phone: { width: 420, height: 860 },
  wide: { width: 2560, height: 1440 },
};
