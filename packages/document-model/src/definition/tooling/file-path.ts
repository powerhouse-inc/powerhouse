import { isAbsolute, relative, sep } from "node:path";

/** Renders a platform path with POSIX separators, so a report reads the same on every machine. */
export function toPosixPath(path: string): string {
  return path.split(sep).join("/");
}

/**
 * The package-relative spelling of `path`, or `null` when `path` is outside
 * `root`. Containment is decided on the strings the caller already resolved;
 * the caller decides whether those are real paths or declared ones.
 */
export function relativePathWithin(root: string, path: string): string | null {
  const child = relative(root, path);
  if (
    child === "" ||
    (child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child))
  ) {
    return toPosixPath(child === "" ? "." : child);
  }
  return null;
}
