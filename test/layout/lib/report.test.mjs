'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import { formatLine, exitCode } from './report.mjs';

test('formatLine prints PASS for a passing check', () => {
  assert.equal(formatLine({ name: 'smoke:phone:title', ok: true }), 'PASS smoke:phone:title');
});

test('formatLine prints FAIL with the reason', () => {
  assert.equal(
    formatLine({ name: 'smoke:phone:title', ok: false, reason: 'overflow' }),
    'FAIL smoke:phone:title: overflow'
  );
});

test('exitCode is 0 when every result passed', () => {
  assert.equal(exitCode([{ ok: true }, { ok: true }]), 0);
});

test('exitCode is 1 when any result failed', () => {
  assert.equal(exitCode([{ ok: true }, { ok: false, reason: 'x' }]), 1);
});

test('exitCode is 0 for an empty result list', () => {
  assert.equal(exitCode([]), 0);
});
