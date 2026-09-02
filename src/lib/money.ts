/** Integer paise (₹1 = 100). Existing columns stay rupee floats; all math goes through here. */

export function toPaise(rupees: number | null | undefined): number {
  if (!Number.isFinite(Number(rupees))) return 0;
  return Math.round(Number(rupees) * 100);
}

export function fromPaise(paise: number | null | undefined): number {
  if (!Number.isFinite(Number(paise))) return 0;
  return Math.round(Number(paise)) / 100;
}

export function addPaise(...values: number[]): number {
  return values.reduce((sum, value) => sum + Math.round(Number(value) || 0), 0);
}

export function subtractPaise(left: number, right: number): number {
  return Math.round(Number(left) || 0) - Math.round(Number(right) || 0);
}

export function maxPaise(left: number, right: number): number {
  return Math.max(Math.round(Number(left) || 0), Math.round(Number(right) || 0));
}

export function minPaise(left: number, right: number): number {
  return Math.min(Math.round(Number(left) || 0), Math.round(Number(right) || 0));
}

export function clampPaise(value: number, min = 0): number {
  return Math.max(min, Math.round(Number(value) || 0));
}

/** Whole-rupee display used by receipts today, computed from paise. */
export function roundRupeesFromPaise(paise: number): number {
  return Math.round(fromPaise(paise));
}

export const PAISA_EPSILON = 1;
