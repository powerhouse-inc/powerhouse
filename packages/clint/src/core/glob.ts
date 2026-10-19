/**
 * Tiny shell-style glob matcher for tool-name patterns.
 *
 * Pattern syntax:
 *   `*`     — matches any run of characters (including the empty run)
 *   `?`     — matches exactly one character
 *   `[abc]` — matches exactly one character from the set (regex character class
 *             passthrough; `[!abc]` and `[^abc]` for negation behave per the
 *             regex bracket rules)
 *
 * Patterns are anchored to the full string. There is no implicit wildcard at
 * either end; `clint-project` does not match `clint-project-init` unless you
 * write `clint-project*`.
 *
 * Unlike `docTypeGlobToRegex` (spec/types.ts) which segments on `/` for
 * document-type ids, this matcher treats tool names as flat strings — `*`
 * crosses `-` and `__` boundaries freely.
 */

/** Compile a glob pattern to a RegExp anchored to the full string. */
export function compileGlob(pattern: string): RegExp {
  let source = "^";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "*") {
      source += ".*";
    } else if (ch === "?") {
      source += ".";
    } else if (ch === "[") {
      // Find the closing ']' and emit verbatim. If unbalanced, fall through
      // to literal escaping.
      const end = pattern.indexOf("]", i + 1);
      if (end === -1) {
        source += "\\[";
      } else {
        source += pattern.slice(i, end + 1);
        i = end;
      }
    } else if (/[\\.+^$|(){}/]/.test(ch)) {
      source += "\\" + ch;
    } else {
      source += ch;
    }
  }
  source += "$";
  return new RegExp(source);
}

/** True when `name` matches at least one pattern in the list. */
export function matchAny(name: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (compileGlob(pattern).test(name)) return true;
  }
  return false;
}
