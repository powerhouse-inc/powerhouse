/**
 * document-engineering 1.40 writes two Zod calls that Zod 4 deprecates, and
 * the catalog emits the current spelling of each. Zod documents both as
 * equivalent: `.finite()` is a no-op because `z.number()` already rejects
 * infinite values, and `error` replaces the `message` parameter.
 */
const CURRENT_ZOD_SPELLINGS: readonly (readonly [string, string])[] = [
  [".finite()", ""],
  ["{ message: ", "{ error: "],
];

/** A document-engineering 1.40 Zod source as the catalog emits it. */
export function withCurrentZodSpellings(source: string): string {
  return CURRENT_ZOD_SPELLINGS.reduce(
    (text, [deprecated, current]) => text.replaceAll(deprecated, current),
    source,
  );
}
