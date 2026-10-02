# Tests

Two kinds, both run with Node 24.

## Unit tests

    npm test

Runs the suites in `test/state-column/` and `test/layout/` that need no
build and no browser: the figures behind the dashboard, the election
arithmetic, the depth column's entries, and the harness's own helpers.

Run it through `npm test` rather than a bare `node --test`, which would
also pick up the browser harness below and wait for a page that isn't
being served.

## Layout checks

`test/layout/run.mjs` measures the built page in headless Chrome at ten
screen sizes. It needs the game built and served first; see
[layout/README.md](layout/README.md).

## Tools

`test/tools/build-credits.mjs` regenerates `out/html/layout/credits.json`,
the picture credits shown on the title page. It is run by hand when a
picture or its credit changes.
