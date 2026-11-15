import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Kills `pid` and resolves once it has exited, or after `timeoutMs`. */
export async function stopProcess(
  pid: number | undefined,
  timeoutMs = 30_000,
): Promise<void> {
  if (!pid || !isAlive(pid)) return;
  if (process.platform === "win32") {
    // The whole tree: a signal ends only `pid`, and its children keep the
    // project dir open.
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      windowsHide: true,
    });
  } else {
    try {
      process.kill(pid);
    } catch {
      return;
    }
  }
  const deadline = Date.now() + timeoutMs;
  while (isAlive(pid) && Date.now() < deadline) await sleep(100);
}

/** Removes a project dir; Windows holds it for a moment after its processes exit. */
export function removeDir(dir: string): void {
  rmSync(dir, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 300,
  });
}
