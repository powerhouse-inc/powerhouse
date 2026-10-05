/**
 * Judge and verifier limits scale with their input: a long compact transcript
 * needs more reading, more findings need more reproduction. Both stay within
 * 3x the catalog value so a runaway attempt cannot triple the run's ceiling
 * more than once.
 */

export const BUDGET_CAP_FACTOR = 3;
/** One dollar of judge budget per this many bytes of compact transcript. */
export const JUDGE_USD_PER_BYTES = 40_000;
export const VERIFY_USD_PER_FINDING = 0.75;
/** Wall clocks grow this much per this many bytes of compact transcript. */
export const WALL_CLOCK_STEP_MS = 5 * 60_000;
export const WALL_CLOCK_STEP_BYTES = 100_000;
export const WALL_CLOCK_CAP_MS = 45 * 60_000;

function capped(base: number, scaled: number): number {
  return Math.min(Math.max(base, scaled), base * BUDGET_CAP_FACTOR);
}

/** max(catalog, $1 per 40 KB of compact transcript), capped at 3x. */
export function judgeBudgetUsd(
  catalogUsd: number,
  compactBytes: number,
): number {
  return capped(catalogUsd, Math.ceil(compactBytes / JUDGE_USD_PER_BYTES));
}

/** max(catalog, $0.75 per kept finding), capped at 3x. */
export function verifyBudgetUsd(catalogUsd: number, kept: number): number {
  return capped(catalogUsd, VERIFY_USD_PER_FINDING * kept);
}

/** base + 5 min per 100 KB of compact transcript, capped at 45 min. */
export function scaledWallClockMs(
  baseMs: number,
  compactBytes: number,
): number {
  const extra = (compactBytes / WALL_CLOCK_STEP_BYTES) * WALL_CLOCK_STEP_MS;
  return Math.min(
    Math.round(baseMs + extra),
    Math.max(baseMs, WALL_CLOCK_CAP_MS),
  );
}
