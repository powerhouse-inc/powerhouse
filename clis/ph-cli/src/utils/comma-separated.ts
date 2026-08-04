import type { Type } from "cmd-ts";

/** Splits comma-separated values so `-t "a,b"` means the same as `-t a -t b`
 * instead of yielding the single value `"a,b"`, which matches nothing. */
export function splitCommaSeparated(values: string[]): string[] {
  return values
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

/** `multioption` type accepting repeated and/or comma-separated values. */
export const CommaSeparatedStrings: Type<string[], string[]> = {
  from: (values) => Promise.resolve(splitCommaSeparated(values)),
};
