import { execFile } from "node:child_process";
import path from "node:path";
import { killTree, treePids } from "./kill-tree.js";
import { isPidAlive, processStartedAtMs } from "./run-record.js";

/**
 * The processes below a supervised one, so that those it leaves behind when
 * it ends by itself can be ended too. A process that exits takes no
 * descendant with it: on Windows `taskkill /T` no longer finds them once
 * their parent is gone, elsewhere they are handed to init.
 */

/** Windows: every process as `pid parent created`, created in ticks. */
function windowsProcessTable(): Promise<[number, number, number][]> {
  const powershell = path.join(
    process.env.SystemRoot ?? "C:\\Windows",
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  return new Promise((resolve) => {
    execFile(
      powershell,
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,CreationDate | " +
          'ForEach-Object { "$($_.ProcessId) $($_.ParentProcessId) $($_.CreationDate.Ticks)" }',
      ],
      { windowsHide: true, timeout: 20_000, encoding: "utf8" },
      (error, stdout) => {
        if (error) {
          resolve([]);
          return;
        }
        resolve(
          stdout
            .split(/\r?\n/)
            .map((line) => line.trim().split(/\s+/).map(Number))
            .filter(
              (row): row is [number, number, number] =>
                Number.isInteger(row[0]) && Number.isInteger(row[1]),
            )
            .map(([pid, parent, created]) => [pid, parent, created || 0]),
        );
      },
    );
  });
}

/**
 * The pids of every descendant of `root`, without `root`. Empty when the
 * process table cannot be read.
 */
export async function descendantPids(root: number): Promise<number[]> {
  if (process.platform !== "win32") return treePids(root).slice(1);
  const table = await windowsProcessTable();
  const created = new Map(table.map(([pid, , at]) => [pid, at]));
  const tree = [root];
  for (let i = 0; i < tree.length; i++) {
    const parent = tree[i]!;
    const parentCreated = created.get(parent) ?? 0;
    for (const [pid, ppid, at] of table) {
      // A parent id outlives its process: a child is younger than its parent.
      if (ppid !== parent || tree.includes(pid) || at < parentCreated) continue;
      tree.push(pid);
    }
  }
  return tree.slice(1);
}

/**
 * Ends, with their trees, the processes of `pids` that still run and started
 * before `listedAt` (when the list was taken: a pid given to a newer process
 * since is left alone). Returns the pids it ended.
 */
export function killSurvivors(pids: readonly number[], listedAt: number) {
  const killed: number[] = [];
  for (const pid of pids) {
    if (!isPidAlive(pid)) continue;
    const started = processStartedAtMs(pid);
    if (started === undefined || started > listedAt) continue;
    killTree(pid, "SIGKILL");
    killed.push(pid);
  }
  return killed;
}
