import { isAbsolute, relative, sep } from "node:path";

/** Renders a platform path with stable POSIX separators for reports and hashes. */
export function toPosixPath(path: string): string {
  return path.split(sep).join("/");
}

/** Returns a stable relative path when a candidate stays within its root. */
export function relativePathWithin(root: string, path: string): string | null {
  const child = relative(root, path);
  if (
    child === "" ||
    (child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child))
  ) {
    return toPosixPath(child || ".");
  }
  return null;
}
