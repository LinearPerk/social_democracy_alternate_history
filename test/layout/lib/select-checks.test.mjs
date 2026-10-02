'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import { selectCheckFiles, unknownNames } from './select-checks.mjs';

const files = [
  { id: 'smoke', checks: ['a'] },
  { id: 'grid', checks: ['b'] },
];

test('selectCheckFiles returns everything when no names are given', () => {
  assert.deepEqual(selectCheckFiles(files, []), files);
});

test('selectCheckFiles filters to the named files', () => {
  assert.deepEqual(selectCheckFiles(files, ['grid']), [files[1]]);
});

test('selectCheckFiles returns nothing when no file matches', () => {
  assert.deepEqual(selectCheckFiles(files, ['nope']), []);
});

test('selectCheckFiles keeps the files array order, not the names order', () => {
  assert.deepEqual(selectCheckFiles(files, ['grid', 'smoke']), files);
});

test('unknownNames returns nothing when no names are given', () => {
  assert.deepEqual(unknownNames(files, []), []);
});

test('unknownNames returns nothing when every name matches a file', () => {
  assert.deepEqual(unknownNames(files, ['smoke', 'grid']), []);
});

test('unknownNames reports names with no matching file', () => {
  assert.deepEqual(unknownNames(files, ['smoke', 'nope']), ['nope']);
});
