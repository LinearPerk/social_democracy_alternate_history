'use strict';

// Formats one check's outcome as the PASS/FAIL line run.mjs prints.
export function formatLine(result) {
  return result.ok ? `PASS ${result.name}` : `FAIL ${result.name}: ${result.reason}`;
}

// The process exit code for a full run: non-zero if anything failed.
export function exitCode(results) {
  return results.some((result) => !result.ok) ? 1 : 0;
}
