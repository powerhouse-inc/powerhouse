import { spawnSync } from "node:child_process";

/**
 * NOTE(port): the ph-clint repo was POSIX-only. Its supervision model —
 * `detached: true` to create a process GROUP, then `process.kill(-pid)` to
 * fell the whole tree — does not exist on Windows: negative-pid kills throw,
 * and `detached` forces a new console per child that even `windowsHide`
 * cannot suppress (libuv allocates one for a detached shell). The split:
 *
 *  - POSIX: keep the group model exactly as ported.
 *  - Windows: spawn attached + hidden; kill trees with `taskkill /T /F`,
 *    which walks the child tree the way the group kill does on POSIX.
 */
export const isWindows = process.platform === "win32";

/** Spawn options fragment for a supervised child. */
export function supervisedSpawnOptions(): {
  detached: boolean;
  windowsHide: boolean;
} {
  return { detached: !isWindows, windowsHide: true };
}

/** Kill a supervised child's whole tree. `signal` only applies on POSIX;
 * Windows tree-kill is always forceful (there are no signals to deliver). */
export function killTree(
  pid: number,
  signal: NodeJS.Signals = "SIGTERM",
): void {
  if (isWindows) {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }
  process.kill(-pid, signal);
}
