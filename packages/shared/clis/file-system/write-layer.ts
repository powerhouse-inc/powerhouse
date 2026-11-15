import { AsyncLocalStorage } from "node:async_hooks";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

/** One file a recorded run would add, change or delete. */
export type FileChange = {
  /** Absolute path. */
  path: string;
  /** The file on disk; undefined when the run would add it. */
  before: string | undefined;
  /** The file after the run; undefined when the run would delete it. */
  after: string | undefined;
};

type Recording = {
  /** What the run wrote, by absolute path. */
  files: Map<string, string>;
  /** Files and folders the run removed. */
  removed: Set<string>;
};

const recording = new AsyncLocalStorage<Recording>();

const isUnder = (path: string, dir: string) => path.startsWith(dir + sep);

function isRemoved(state: Recording, path: string) {
  for (const removed of state.removed) {
    if (path === removed || isUnder(path, removed)) return true;
  }
  return false;
}

function isDirectory(path: string) {
  return statSync(path, { throwIfNoEntry: false })?.isDirectory() ?? false;
}

function diskFilesUnder(dir: string): string[] {
  if (!isDirectory(dir)) return existsSync(dir) ? [dir] : [];
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

function toText(contents: string | Buffer) {
  return typeof contents === "string" ? contents : contents.toString("utf-8");
}

/**
 * The file access of the steps a dry run can preview. Outside a recording
 * every call goes to the disk. Inside {@link recordWrites} the writes and
 * removals are kept in memory, and the reads see them, so a step that reads
 * what an earlier step wrote decides as it would in a real run.
 */
export const projectFiles = {
  /** True inside {@link recordWrites}. */
  isRecording(): boolean {
    return recording.getStore() !== undefined;
  },

  exists(path: string): boolean {
    const state = recording.getStore();
    if (!state) return existsSync(path);
    const file = resolve(path);
    if (state.files.has(file)) return true;
    for (const written of state.files.keys()) {
      if (isUnder(written, file)) return true;
    }
    return !isRemoved(state, file) && existsSync(file);
  },

  /** The file as UTF-8 text; undefined when there is none. */
  read(path: string): string | undefined {
    const state = recording.getStore();
    if (!state) {
      return existsSync(path) ? readFileSync(path, "utf-8") : undefined;
    }
    const file = resolve(path);
    const written = state.files.get(file);
    if (written !== undefined) return written;
    if (isRemoved(state, file) || !existsSync(file)) return undefined;
    return readFileSync(file, "utf-8");
  },

  /** The names in a folder; empty when there is none. */
  list(dir: string): string[] {
    const state = recording.getStore();
    if (!state) return existsSync(dir) ? readdirSync(dir) : [];
    const folder = resolve(dir);
    const names = new Set<string>();
    if (!isRemoved(state, folder) && isDirectory(folder)) {
      for (const name of readdirSync(folder)) {
        if (!state.removed.has(join(folder, name))) names.add(name);
      }
    }
    for (const written of state.files.keys()) {
      if (isUnder(written, folder)) {
        names.add(relative(folder, written).split(sep)[0]);
      }
    }
    return [...names];
  },

  writeSync(path: string, contents: string | Buffer): void {
    const state = recording.getStore();
    if (!state) {
      // Resolved first: bun on Windows fails `mkdir(".", { recursive: true })` (ENOENT on 1.3.8, EEXIST on 1.3.14).
      mkdirSync(dirname(resolve(path)), { recursive: true });
      writeFileSync(path, contents, { encoding: "utf-8" });
      return;
    }
    const file = resolve(path);
    state.removed.delete(file);
    state.files.set(file, toText(contents));
  },

  /** Removes a file or a folder with everything in it; a missing one is fine. */
  remove(path: string): void {
    const state = recording.getStore();
    if (!state) {
      rmSync(path, { recursive: true, force: true });
      return;
    }
    const target = resolve(path);
    for (const written of [...state.files.keys()]) {
      if (written === target || isUnder(written, target)) {
        state.files.delete(written);
      }
    }
    state.removed.add(target);
  },

  /**
   * Runs a writer that takes a file path and writes that file itself (such as
   * `writePackage`). In a recording the writer gets a temporary copy of the
   * file, and what it leaves there is recorded.
   */
  async writeWith(
    path: string,
    writer: (target: string) => Promise<void>,
  ): Promise<void> {
    const state = recording.getStore();
    if (!state) {
      await writer(path);
      return;
    }
    const scratch = mkdtempSync(join(tmpdir(), "ph-write-layer-"));
    try {
      const target = join(scratch, basename(path));
      const current = projectFiles.read(path);
      if (current !== undefined) writeFileSync(target, current);
      await writer(target);
      projectFiles.writeSync(path, readFileSync(target, "utf-8"));
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  },
};

/**
 * Runs `run` with every {@link projectFiles} write and removal recorded
 * instead of applied, and returns what a real run would change on disk,
 * sorted by path. A file written with the content it already has is no
 * change.
 */
export async function recordWrites<T>(
  run: () => Promise<T>,
): Promise<{ result: T; changes: FileChange[] }> {
  const state: Recording = { files: new Map(), removed: new Set() };
  const result = await recording.run(state, run);
  const changes: FileChange[] = [];
  for (const [path, after] of state.files) {
    const before =
      existsSync(path) && !isDirectory(path)
        ? readFileSync(path, "utf-8")
        : undefined;
    if (before !== after) changes.push({ path, before, after });
  }
  for (const removed of state.removed) {
    for (const path of diskFilesUnder(removed)) {
      if (state.files.has(path)) continue;
      changes.push({
        path,
        before: readFileSync(path, "utf-8"),
        after: undefined,
      });
    }
  }
  changes.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { result, changes };
}
