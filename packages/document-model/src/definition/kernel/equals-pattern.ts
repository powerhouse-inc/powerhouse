/**
 * The regular expression source the generator writes for `@equals(value: v)`.
 * The plugin fills its template `/^$1$/` with `String.prototype.replace`, so
 * `v` is inserted unescaped and its replacement tokens (`$&`, `` $` ``, `$'`,
 * `$$`) are expanded first.
 */
export function equalsPattern(value: string): string {
  return "/^$1$/".replace("$1", value).slice(1, -1);
}

const LINE_TERMINATORS = new Set(["\n", "\r", " ", " "]);

/**
 * Why an `@equals` pattern cannot be validated the way the generator does,
 * if it cannot. The generator writes the pattern, as `equalsPattern`
 * expands it, into a regex literal: a `/` outside a character class ends
 * that literal, and a line terminator cannot appear in one, so either leaves
 * generated code that does not compile or does not validate.
 */
export function equalsPatternProblem(pattern: string):
  | {
      readonly message: string;
      readonly expected: string;
      readonly repair: string;
    }
  | undefined {
  const expected =
    "a regular expression pattern the generator can write as /^pattern$/";
  const source = equalsPattern(pattern);
  let inClass = false;
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    const escaped = character === "\\";
    if (escaped) index++;
    if (LINE_TERMINATORS.has(source[index])) {
      return {
        message:
          "The @equals pattern contains a line terminator, which a regular expression literal cannot hold.",
        expected,
        repair:
          "Write the line terminator as an escape such as \\n, which the regular expression reads the same way.",
      };
    }
    if (escaped) continue;
    if (character === "[") inClass = true;
    else if (character === "]") inClass = false;
    else if (character === "/" && !inClass) {
      return {
        message:
          "The @equals pattern contains a / outside a character class, which ends the generated regular expression literal.",
        expected,
        repair:
          'Escape the slash as \\/ (written "\\\\/" in a JavaScript string), or put it in a character class such as [/].',
      };
    }
  }
  try {
    new RegExp(source);
  } catch (error) {
    return {
      message: `The @equals pattern is not a valid regular expression: ${error instanceof Error ? error.message : String(error)}`,
      expected,
      repair:
        "Fix the pattern, or escape the characters that have a meaning in a regular expression.",
    };
  }
  return undefined;
}
