/**
 * Connect's editor document carries no operation history, so a reducer error can't be
 * read from `operation.error` here. A rejected change leaves the state as it was, so the
 * editor compares the state before and after the dispatch.
 */
export function rejectionFor(before: string, after: unknown): string | null {
  return JSON.stringify(after) === before
    ? "The change was not applied. The document rejected it, so the item is unchanged."
    : null;
}

/** Text for an error the dispatch itself reported (invalid input). */
export function errorMessage(errors: Error[]): string {
  return errors[0]?.message || "The change was not applied";
}

/** The global state of a dispatch result, typed without a cast. */
export function globalStateOf(state: unknown): unknown {
  return typeof state === "object" && state !== null && "global" in state
    ? state.global
    : undefined;
}
