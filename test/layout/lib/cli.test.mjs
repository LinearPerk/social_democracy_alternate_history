'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from './cli.mjs';

test('parseArgs defaults to the local dev server and no name filter', () => {
  assert.deepEqual(parseArgs([]), { url: 'http://127.0.0.1:8000/', names: [] });
});

test('parseArgs reads --url as a separate argument', () => {
  const { url, names } = parseArgs(['--url', 'http://127.0.0.1:8101/', 'smoke']);
  assert.equal(url, 'http://127.0.0.1:8101/');
  assert.deepEqual(names, ['smoke']);
});

test('parseArgs reads --url=value', () => {
  const { url } = parseArgs(['--url=http://127.0.0.1:8101/']);
  assert.equal(url, 'http://127.0.0.1:8101/');
});

test('parseArgs collects multiple check names in order', () => {
  const { names } = parseArgs(['smoke', 'grid']);
  assert.deepEqual(names, ['smoke', 'grid']);
});

test('parseArgs rejects an unknown option', () => {
  assert.throws(() => parseArgs(['--bogus']), /unknown option/);
});

test('parseArgs rejects --url with no value', () => {
  assert.throws(() => parseArgs(['--url']), /--url needs a value/);
});
