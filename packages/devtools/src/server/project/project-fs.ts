import { pathWithin } from "@powerhousedao/shared/clis/real-paths";
import {
  closeSync,
  fstatSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  realpathSync,
  statSync,
} from "node:fs";
import { join, sep } from "node:path";
import { pathToFileURL } from "node:url";

const SKIPPED_DIRECTORIES = new Set(["node_modules", "dist"]);

/** Files that hold secrets wherever they are, as Vite's `server.fs.deny`
 * has them: dot-files such as `.env`, and keys and certificates. */
const holdsSecrets = (name: string) =>
  name.startsWith(".") || /\.(pem|key|crt|p12|pfx)$/i.test(name);

/** Whether a real path stays inside the project and passes the same filters
 * as a name in a listing: a symlink's own name says nothing of its target. */
const shownWithin = (realRoot: string, real: string) => {
  const inside = pathWithin(realRoot, real);
  return (
    inside !== null &&
    !inside
      .split(sep)
      .some((part) => SKIPPED_DIRECTORIES.has(part) || holdsSecrets(part))
  );
};

/** Orders by code unit, so a listing does not depend on the machine's locale. */
export const byText = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0;

export const byKey =
  <T>(key: (item: T) => string) =>
  (left: T, right: T) =>
    byText(key(left), key(right));

/**
 * The files below `dir`, as sorted POSIX paths relative to `root`. Skips
 * `node_modules`, `dist`, dot-directories, dot-files, keys and certificates.
 * A symlink is followed, as the
 * model loader and ts-morph follow it, while its real path stays inside the
 * project and skips none of these; each real directory is entered through a
 * link once. A missing or
 * unreadable directory has none.
 */
export function listFiles(root: string, dir: string): string[] {
  const files: string[] = [];
  let realRoot: string | undefined;
  const linked = new Set<string>();
  /** What a symlink inside the project points at, or undefined to skip it. */
  const followed = (path: string): "file" | "directory" | undefined => {
    try {
      realRoot ??= realpathSync.native(root);
      const real = realpathSync.native(join(root, path));
      if (!shownWithin(realRoot, real)) return undefined;
      const stats = statSync(real);
      if (stats.isFile()) return "file";
      if (!stats.isDirectory() || linked.has(real)) return undefined;
      linked.add(real);
      return "directory";
    } catch {
      return undefined;
    }
  };
  const visit = (relativeDir: string) => {
    let entries;
    try {
      entries = readdirSync(join(root, relativeDir), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort(byKey(({ name }) => name))) {
      const path =
        relativeDir === "" ? entry.name : `${relativeDir}/${entry.name}`;
      const skipped =
        SKIPPED_DIRECTORIES.has(entry.name) || entry.name.startsWith(".");
      const kind = entry.isFile()
        ? "file"
        : entry.isDirectory()
          ? "directory"
          : entry.isSymbolicLink() && !SKIPPED_DIRECTORIES.has(entry.name)
            ? followed(path)
            : undefined;
      if (kind === "file") {
        if (!holdsSecrets(entry.name)) files.push(path);
      } else if (kind === "directory" && !skipped) visit(path);
    }
  };
  visit(dir);
  return files;
}

/** The file's text, or undefined when it is missing or unreadable. */
export function readText(root: string, path: string): string | undefined {
  try {
    return readFileSync(join(root, path), "utf8");
  } catch {
    return undefined;
  }
}

/** Where a cut at `end` leaves `bytes` whole: before a character whose
 * bytes would run past it. */
function utf8Boundary(bytes: Buffer, end: number): number {
  let start = end - 1;
  while (start > end - 4 && start > 0 && (bytes[start] & 0xc0) === 0x80) {
    start -= 1;
  }
  const lead = bytes[start];
  const length = lead >= 0xf0 ? 4 : lead >= 0xe0 ? 3 : lead >= 0xc0 ? 2 : 1;
  return start + length > end ? start : end;
}

/**
 * Up to `limit` bytes of a regular file as text, cut where a character
 * starts. Undefined when the file is missing, unreadable, not a file, or its
 * real path leaves the project.
 */
export function readTextWithin(
  root: string,
  path: string,
  limit: number,
): { text: string; truncated: boolean } | undefined {
  let descriptor: number | undefined;
  try {
    const real = realpathSync.native(join(root, path));
    if (!shownWithin(realpathSync.native(root), real)) return undefined;
    descriptor = openSync(real, "r");
    if (!fstatSync(descriptor).isFile()) return undefined;
    // One byte past the limit says whether the file goes on.
    const buffer = Buffer.alloc(limit + 1);
    const read = readSync(descriptor, buffer, 0, buffer.length, 0);
    const truncated = read > limit;
    const end = truncated ? utf8Boundary(buffer, limit) : read;
    return { text: buffer.toString("utf8", 0, end), truncated };
  } catch {
    return undefined;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

/** What a thrown value says, with the project's own path written as `.`. */
export function projectRelativeMessage(root: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return [pathToFileURL(root).href, root, root.replaceAll("\\", "/")].reduce(
    (text, absolute) => text.replaceAll(absolute, "."),
    message,
  );
}
