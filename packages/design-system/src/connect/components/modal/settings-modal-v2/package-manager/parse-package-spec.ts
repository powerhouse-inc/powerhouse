/**
 * Parse a package specifier into a bare name and an optional tag/version.
 *
 * - Scoped names split on the LAST `@` (since the name itself starts with
 *   `@scope/`): `@scope/pkg@dev` → `{ name: "@scope/pkg", tag: "dev" }`.
 * - Unscoped names split on the first `@`: `pkg@1.2.3` →
 *   `{ name: "pkg", tag: "1.2.3" }`.
 * - A bare name (no separator) returns `{ name, tag: undefined }`.
 * - Trailing/leading whitespace is trimmed; an empty tag (e.g. "pkg@")
 *   is treated as missing.
 */
export function parsePackageSpec(spec: string): {
  name: string;
  tag: string | undefined;
} {
  const trimmed = spec.trim();
  if (trimmed.length === 0) return { name: "", tag: undefined };

  const splitAt = trimmed.startsWith("@")
    ? trimmed.lastIndexOf("@")
    : trimmed.indexOf("@");

  if (splitAt > 0) {
    const name = trimmed.slice(0, splitAt);
    const tag = trimmed.slice(splitAt + 1);
    return { name, tag: tag.length > 0 ? tag : undefined };
  }

  return { name: trimmed, tag: undefined };
}

/**
 * Compose a spec string from a name and optional tag/version. Used by
 * callers that want to re-serialize what `parsePackageSpec` parsed.
 */
export function buildPackageSpec(name: string, tag?: string): string {
  return tag ? `${name}@${tag}` : name;
}
