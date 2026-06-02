/**
 * Walk a parsed path (e.g. from remeda's `stringToPath`) through a runtime-
 * typed object, returning the value or `undefined` if any segment is
 * missing.
 *
 * Remeda's `prop` is overload-typed for compile-time literal paths and
 * doesn't accept a runtime path array via spread, so we walk inline for
 * the dynamic-path case used by `ph connect config --get`.
 */
export function getAtPath(
  obj: unknown,
  parts: ReadonlyArray<string | number>,
): unknown {
  let cur: unknown = obj;
  for (const key of parts) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[String(key)];
  }
  return cur;
}
