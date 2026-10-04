// "Nobody knows whether that write landed", as a property an error carries.
//
// A step whose host call wrote something and then did not get an answer in
// time is neither a success nor a failure, and reporting it as FAILED is a
// claim nobody can stand behind — which is what the 10s host-call cap was
// doing to a reactor dispatch under load (backlog item 6).
//
// The marker is an ENUMERABLE OWN PROPERTY rather than a class, because the
// error is usually thrown in the forked child and reaches the coordinator as a
// `SerializedPieceError`: a name, a message, and the error's own enumerable
// properties. The class does not survive; the property does.

/** The property name, so both sides spell it once. */
export const INDETERMINATE_FLAG = "indeterminate";

/** Marks an error as indeterminate, in place. */
export function markIndeterminate<T extends Error>(error: T): T {
  Object.defineProperty(error, INDETERMINATE_FLAG, {
    value: true,
    enumerable: true,
    writable: false,
    configurable: false,
  });
  return error;
}

function flagged(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  return (value as Record<string, unknown>)[INDETERMINATE_FLAG] === true;
}

/**
 * Whether this error means "the write may have landed".
 *
 * Three places to look, in the order the error can reach us: the error itself
 * (thrown in the reactor process), the `properties` record of the
 * `SerializedPieceError` a `PieceWorkerError` carries (thrown in the child),
 * and the `cause` chain (a piece that wrapped it).
 */
export function isIndeterminateError(error: unknown): boolean {
  if (flagged(error)) return true;
  const serialized = (error as { serialized?: { properties?: unknown } })
    ?.serialized;
  if (flagged(serialized?.properties)) return true;
  const cause = (error as { cause?: unknown })?.cause;
  return cause !== undefined && cause !== error && flagged(cause);
}
