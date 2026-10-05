/**
 * Parse a package specifier into name and version/tag.
 * Supports:
 *   "@scope/pkg"           -> { name: "@scope/pkg", tag: undefined }
 *   "@scope/pkg@dev"       -> { name: "@scope/pkg", tag: "dev" }
 *   "@scope/pkg@1.0.0"     -> { name: "@scope/pkg", tag: "1.0.0" }
 *   "pkg@latest"           -> { name: "pkg", tag: "latest" }
 */
export function parsePackageSpec(spec: string): {
  name: string;
  tag: string | undefined;
} {
  // For scoped packages (@scope/name@tag), split on the last @
  // For unscoped packages (name@tag), split on the first @
  if (spec.startsWith("@")) {
    // Scoped: find the @ after the scope/name portion
    const lastAt = spec.lastIndexOf("@");
    if (lastAt > 0 && lastAt !== spec.indexOf("@")) {
      return { name: spec.slice(0, lastAt), tag: spec.slice(lastAt + 1) };
    }
    return { name: spec, tag: undefined };
  }
  const atIndex = spec.indexOf("@");
  if (atIndex > 0) {
    return { name: spec.slice(0, atIndex), tag: spec.slice(atIndex + 1) };
  }
  return { name: spec, tag: undefined };
}

/** True when tag is a concrete semver, false for dist-tag names or undefined. */
export function isExactVersion(tag?: string): boolean {
  // Strict semver charset: the version flows into the ETag header, so
  // arbitrary characters after the prerelease/build separator must not match.
  return (
    !!tag &&
    /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(tag)
  );
}
