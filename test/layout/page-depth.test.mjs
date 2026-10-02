'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// links.json is public text that page-depth.js renders as links; a malformed
// entry would break a page view at play time, so the file's shape is pinned.
// That each URL resolves and says what it claims is checked by hand before a release.

const here = dirname(fileURLToPath(import.meta.url));
const links = JSON.parse(readFileSync(join(here, '../../out/html/depth-column/links.json'), 'utf8'));

test('links.json maps scene ids to lists of {text, href}', () => {
  for (const [id, entries] of Object.entries(links)) {
    assert.ok(id, 'scene id is not empty');
    assert.ok(Array.isArray(entries) && entries.length > 0, `${id} has a non-empty list`);
    for (const entry of entries) {
      assert.deepEqual(Object.keys(entry).sort(), ['href', 'text'], `${id}: keys`);
      assert.match(entry.text, /\S/, `${id}: text`);
      assert.match(entry.href, /^https:\/\//, `${id}: ${entry.href} is https`);
    }
  }
});

test('a scene lists each URL once', () => {
  for (const [id, entries] of Object.entries(links)) {
    const hrefs = entries.map((e) => e.href);
    assert.equal(new Set(hrefs).size, hrefs.length, `${id} repeats a URL`);
  }
});
