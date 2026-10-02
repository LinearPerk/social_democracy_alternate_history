'use strict';

// Comparison helpers shared by the check files. 1px tolerance throughout,
// since sub-pixel rounding differs between Chrome's layout and rem-to-px math.
export const TOLERANCE = 1;

export function close(a, b, tolerance = TOLERANCE) {
  return Math.abs(a - b) <= tolerance;
}

export function lte(a, b, tolerance = TOLERANCE) {
  return a <= b + tolerance;
}

export function gte(a, b, tolerance = TOLERANCE) {
  return a >= b - tolerance;
}

export function within(value, min, max, tolerance = TOLERANCE) {
  return value >= min - tolerance && value <= max + tolerance;
}
