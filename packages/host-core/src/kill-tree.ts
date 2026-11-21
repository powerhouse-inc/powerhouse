import { spawnSync } from "node:child_process";
import fs from "node:fs";

/**
 * Kills a child's whole process tree. Attached children share their
 * parent's group on POSIX, so there is no group of their own to signal: the
 * process table is walked instead. On Windows it is `taskkill /T /F`.
 * (Moved from clint's process-platform.ts, which re-exports it.)
 */

const isWindows = process.platform === "win32";

/** POSIX: child pids by parent pid, from /proc on Linux, else `ps`. */
function childrenByParent(): Map<number, number[]> {
  const children = new Map<number, number[]>();
  const add = (pid: number, ppid: number) => {
    if (!Number.isInteger(pid) || !Number.isInteger(ppid)) return;
    const list = children.get(ppid);
    if (list) list.push(pid);
    else children.set(ppid, [pid]);
  };
  if (process.platform === "linux") {
    let entries: string[] = [];
    try {
      entries = fs.readdirSync("/proc").filter((e) => /^\d+$/.test(e));
    } catch {
      // no /proc: fall through to ps
    }
    for (const entry of entries) {
      try {
        // "pid (comm) state ppid ...": comm may hold spaces and parentheses.
        const stat = fs.readFileSync(`/proc/${entry}/stat`, "utf8");
        const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
        add(Number(entry), Number(fields[1]));
      } catch {
        // exited meanwhile
      }
    }
    if (entries.length > 0) return children;
  }
  const ps = spawnSync("ps", ["-A", "-o", "pid=,ppid="], { encoding: "utf8" });
  for (const line of (ps.stdout ?? "").split("\n")) {
    const [pid, ppid] = line.trim().split(/\s+/).map(Number);
    if (pid !== undefined && ppid !== undefined) add(pid, ppid);
  }
  return children;
}

/** POSIX: `pid` and all its descendants. */
function treePids(pid: number): number[] {
  const children = childrenByParent();
  const tree = [pid];
  for (let i = 0; i < tree.length; i++) {
    for (const child of children.get(tree[i]!) ?? []) {
      if (!tree.includes(child)) tree.push(child);
    }
  }
  return tree;
}

/** Kill a supervised child's whole tree. `signal` only applies on POSIX;
 * Windows tree-kill is always forceful (there are no signals to deliver).
 * Never throws: a process already gone is skipped. */
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
  for (const target of treePids(pid)) {
    try {
      process.kill(target, signal);
    } catch {
      // already gone
    }
  }
}
