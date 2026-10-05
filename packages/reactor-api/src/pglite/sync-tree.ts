import nodeFs from "node:fs";
import path from "node:path";

export interface SyncTreeHostFs {
  fsyncSync(fd: number): void;
}

export interface SyncTreeResult {
  files: number;
  dirs: number;
}

/** One pass over a finished tree; interleaving fsync with writes costs seconds. */
export function syncTree(
  root: string,
  hostFs: SyncTreeHostFs = nodeFs,
): SyncTreeResult {
  const result: SyncTreeResult = { files: 0, dirs: 0 };
  const pending = [path.resolve(root)];
  while (pending.length > 0) {
    const dir = pending.pop()!;
    for (const entry of nodeFs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        pending.push(full);
      } else if (entry.isFile()) {
        syncFile(full, hostFs);
        result.files++;
      }
    }
    syncDirectory(dir, hostFs);
    result.dirs++;
  }
  return result;
}

function syncFile(file: string, hostFs: SyncTreeHostFs): void {
  const fd = nodeFs.openSync(file, "r");
  try {
    hostFs.fsyncSync(fd);
  } finally {
    nodeFs.closeSync(fd);
  }
}

/** fsyncs a directory's entries; false where the platform refuses (Windows). */
export function syncDirectory(
  dir: string,
  hostFs: SyncTreeHostFs = nodeFs,
): boolean {
  let fd: number;
  try {
    fd = nodeFs.openSync(dir, "r");
  } catch {
    return false;
  }
  try {
    hostFs.fsyncSync(fd);
    return true;
  } catch {
    return false;
  } finally {
    nodeFs.closeSync(fd);
  }
}
