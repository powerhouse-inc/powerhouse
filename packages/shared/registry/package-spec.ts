export type ParsedPackageSpec = {
  readonly name: string;
  readonly tag: string | undefined;
  /** A path-safe CDN specifier; scoped names retain their required slash. */
  readonly cdnSpecifier: string;
};

function splitPackageSpec(spec: string): {
  name: string;
  tag: string | undefined;
} {
  if (spec.startsWith("@")) {
    const lastAt = spec.lastIndexOf("@");
    return lastAt > 0
      ? { name: spec.slice(0, lastAt), tag: spec.slice(lastAt + 1) }
      : { name: spec, tag: undefined };
  }
  const at = spec.indexOf("@");
  return at > 0
    ? { name: spec.slice(0, at), tag: spec.slice(at + 1) }
    : { name: spec, tag: undefined };
}

/** Parse and validate an npm package spec before interpolating it into a URL. */
export function parsePackageSpec(spec: string): ParsedPackageSpec {
  if (typeof spec !== "string" || spec.length === 0 || spec.length > 512) {
    throw new Error(`Invalid package spec: ${String(spec)}`);
  }
  const { name, tag } = splitPackageSpec(spec);
  const packageNamePattern =
    /^(@[a-z0-9][-a-z0-9._]*\/)?[a-z0-9][-a-z0-9._]*$/i;
  if (
    name.length > 214 ||
    name.includes("..") ||
    !packageNamePattern.test(name)
  ) {
    throw new Error(`Invalid package name: ${name}`);
  }
  if (tag === undefined) return { name, tag, cdnSpecifier: name };

  // Preserve npm tags and semver ranges while excluding every URL/path
  // delimiter, percent escape, control character, and surrounding space.
  if (
    tag.length === 0 ||
    tag.trim() !== tag ||
    !/^[0-9A-Za-z*^~<>=|.+_\- ]+$/.test(tag)
  ) {
    throw new Error(`Invalid package tag: ${tag}`);
  }
  return {
    name,
    tag,
    cdnSpecifier: `${name}@${encodeURIComponent(tag)}`,
  };
}
