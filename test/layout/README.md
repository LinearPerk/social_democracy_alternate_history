# Layout test harness

Checks the built game's layout in headless Chrome, at named viewports and
game states, without a browser session.

## Run it

The game must already be built (`out/html/`) and served over HTTP; this
harness only drives an already-served page:

    node test/layout/run.mjs                        # every check file
    node test/layout/run.mjs smoke                   # only checks/smoke.mjs
    node test/layout/run.mjs --url http://127.0.0.1:8101/ smoke

Prints one PASS/FAIL line per check and exits non-zero if anything failed,
or if a named check file doesn't exist.

## Requirements

- Node 24.
- Chrome. Defaults to `C:/Program Files/Google/Chrome/Application/chrome.exe`;
  override with `CHROME_PATH`.

## Adding a check file

A file in `checks/` exports an array of check objects:

    export default [{
      name: 'my-check:hub',
      viewport: 'laptop',     // a key in lib/viewports.mjs
      state: 'hub',           // see the state list below
      query: '?debug=1',        // optional: appended to the page URL (the URL must have no query of its own)
      depth: true,            // optional: fill #depth_column before measuring
      scrollTo: 'bottom',     // optional: scroll to the page's end first
      act: async (page) => {},// optional: click or hover; the return value arrives as m.acted
      shortContent: true,     // optional: replace #content's HTML with one short paragraph
      fontSize: '1.3em',      // optional: set the Options font size (inline, on #content and #stats_sidebar)
      selectors: ['#content'],
      test(m) {
        // m.scrollWidth, m.clientWidth, m.viewport, m.elements['#content']
        // (every match, each with rect, computed styles, and trimmed text), m.consoleErrors
        return true; // or a string describing what failed
      },
    }];

The `hub-*` states also set the state column's settings, which persist in
localStorage between checks: every hub state resets them to period symbols
and the Party tab first; `hub-badges` then turns symbols off, and
`hub-defense` opens the Defense tab. `hub-defense-entry` (SA) and
`hub-defense-reichswehr` open Defense and click a row, so its entry is in the
depth column (`-badges` variant: symbols off); `hub-defense-entry-back` then
clicks Back. These reach a later month's hub (see `hub-month`), where Back
returns to the resting view.
The game's first hub (`hub`) carries January 1928's narrative as page
depth, so the depth column shows that ("Background") until the player
picks another view. `hub-month` is a later month's hub, with no opening
narrative: the depth column rests on Polls, its default in normal play (Die
Zeit in historical mode). `start` is the page after "Start game": the
title page's epigraph and difficulty table (it waits for the table, which
choice-tables.json draws a moment after the page loads), a game not yet under way.
`hub-historical` starts a historical-mode game at a later month's hub and
waits for Die Zeit to fill the depth column; `hub-historical-polls` then
picks Polls from the view strip.
`hub-government` sets the Grand Coalition flags (SPD in government) and re-renders
the column, since the game itself starts in opposition. `hub-black-thursday`
sets `black_thursday_seen` and
raises the Center's relation within a new month, so its ledger row shows
"very friendly" beside a two-arrow change pill.
`hub-govt-empty` and `hub-govt-empty-government` set June 1928 and make the
Government Affairs deck draw nothing, so the engine shows it unavailable (the
second with the SPD in government); `hub-factions` swaps the three starting
advisors for five from different factions. All three redraw the hub.

## States

Every name `state` accepts (lib/states.mjs):

- `title`, `start`: the page as loaded, and the page after "Start game".
- `hub`, `hub-month`, `hub-easy`, `hub-badges`, `hub-historical`,
  `hub-historical-polls`: a game's first hub, a later month's hub, and the
  variants (easy difficulty, symbols off, historical mode, Polls picked).
- `hub-government`, `hub-black-thursday`, `hub-govt-empty`,
  `hub-govt-empty-government`, `hub-factions`, `party-varied`: hubs with
  qualities set to reach a particular look.
- `hub-defense`, `hub-defense-badges`,
  `hub-defense-entry`, `hub-defense-entry-back`, `hub-defense-reichswehr`,
  `hub-defense-reichswehr-badges`: the Defense tab, and its entries in the
  depth column.
- `hub-state`, `hub-state-government`, `hub-state-full`: the State tab; the
  same with the Grand Coalition in government; and the tallest case (a
  Popular Front, Black Thursday seen, negative growth, June 1930 with 29
  months of history written into `sc_history`).
- `reichstag-entry`, `reichstag-picked`, `reichstag-government`, `reichstag-back`:
  the Reichstag entry opened by a click on the seat chart (a later month's
  hub), with the Weimar Coalition picked, with the SPD in a Weimar Coalition
  (the "current" marker), and after Back.
- `election`: the Reichstag election's results page, run from the hub with
  "May we do our best..." pressed and the result rows drawn.
- `vote-1932-round1`, `vote-1932-majority`, `vote-1932-round2`,
  `vote-1934-round1`, `vote-1934-round2`: the presidential vote readouts. The
  1932 ones set each party's share and go to the scene that prints the vote;
  `majority` has one candidate over 50; the round 2 states press the scene's
  own button, so the page holds both readouts.
- `card`: a card's page. `card-depth`: a card whose page carries depth
  (`response_to_antisemitism`), so the column holds a page view.
- `view-entry-term` (a Party-tab term), `view-entry-party` (a ledger party
  name), `view-entry-advisor` (an advisor's name in a hire menu),
  `view-library-home` (the Library picked from the strip), `library-section`
  (a Library section in the column).
- `library-charts`, `library-link`, `library-link-from-section`: the
  Library through upstream's route and through the header link.

`node test/layout/run.mjs <file-id> [<file-id> ...]` runs only the named
files (the id is the filename without `.mjs`).

## End-to-end files

Three files beside `run.mjs` drive flows that a single measurement can't, each
with `--url` like the harness: `back-out.e2e.mjs` (the back-out choice) and
`banner.e2e.mjs` (the collapsing banner: next page, scroll, hover, motion,
keyboard, the header links in both states, the panels' bottoms through the
motion). Static banner sizes are in `checks/banner.mjs`; the panels' shared
bottom edge at the fold, slim and expanded, is in `checks/panels.mjs`; the
dashboard keeping one height on every tab (the tallest tab's, with the shorter
tabs' blank room at their foot) is in `checks/stable-height.mjs`.

`carousel.e2e.mjs` (the title page's carousels: the 8 s auto-advance, the
wall replacing one picture, the oldest, per tick, pause on hover and focus,
reduced motion, removal with timers, frames and masthead when a game starts or
a save loads, and the empty panels returning when no image loads; about two
minutes). Their geometry (the wall's two pictures on a laptop and three on a
monitor, the portrait's frame), captions, keys and the states with none are in
`checks/carousel.mjs`; the centre panel's masthead (heading hidden, framed
picture and credit, fleuron, ruled menu, plain below 1300px) is in
`checks/title-page.mjs`.

## Unit tests

The pure pieces (argument parsing, check-file selection, PASS/FAIL
formatting) have node:test tests:

    node --test "test/layout/**/*.test.mjs"

(`node --test test/layout` doesn't pick these up on Node 24; use the glob.)
The harness itself, Chrome driving, DOM measurement, and game-state
navigation, is checked by running it, not by unit tests.
