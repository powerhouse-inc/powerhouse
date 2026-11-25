import type { ChildProcess } from "node:child_process";
import os from "node:os";
// The subpath, not the main entry: every Cli loads this module at startup.
import { killTree } from "@powerhousedao/host-core/kill-tree";

/**
 * Supervised children are ATTACHED: no process clint starts may outlive the
 * process that started it. They are spawned without `detached` on every
 * platform (hidden on Windows, where `detached` would also force a console
 * per child), and every one is registered with {@link superviseChild}, which
 * fells the ones still alive when this process ends.
 *
 * Attached children share this process's group on POSIX, so there is no
 * group of their own to signal: {@link killTree} (host-core's, which a
 * compound's own-process members are killed with too) walks the process
 * table instead. On Windows it uses `taskkill /T /F`.
 */
export const isWindows = process.platform === "win32";

export { killTree };

/** Spawn options fragment for a supervised child. */
export function supervisedSpawnOptions(): {
  detached: false;
  windowsHide: true;
} {
  return { detached: false, windowsHide: true };
}

// ── Supervision: children end with this process ──────────────────

/** Supervised children still running. */
const liveChildren = new Set<ChildProcess>();

/** Signals whose default action ends this process. */
const ENDING_SIGNALS: NodeJS.Signals[] = isWindows
  ? ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]
  : ["SIGINT", "SIGTERM", "SIGHUP"];

/** Forcefully fell every supervised child still running (synchronous, so it
 * also works from an `exit` listener). */
function fellLiveChildren(): void {
  for (const child of liveChildren) {
    if (
      child.pid !== undefined &&
      child.exitCode === null &&
      child.signalCode === null
    ) {
      killTree(child.pid, "SIGKILL");
    }
  }
  liveChildren.clear();
}

/**
 * The signal listeners signal-exit (Ink's dependency) installs, one per
 * loaded copy, read from the counts its copies share. Each acts only when
 * signal-exit's listeners are the only ones left, so counted as application
 * handlers they and the guard below would each wait for the other. (The
 * same count as ph-cli's package-build/run-build.ts.)
 */
function exitOnlyListeners(): number {
  const count = (emitter: unknown) => {
    const value = (emitter as { count?: unknown } | undefined)?.count;
    return typeof value === "number" ? value : 0;
  };
  const shared = globalThis as Record<symbol, unknown>;
  const legacy = process as unknown as Record<string, unknown>;
  return (
    count(shared[Symbol.for("signal-exit emitter")]) +
    count(legacy.__signal_exit_emitter__)
  );
}

/**
 * A signal whose default action would end this process. An application
 * listener (the CLI's own shutdown, which stops services gracefully) owns
 * the signal: the guard leaves it alone and the `exit` listener backs it up.
 * With no such listener the process would simply die and leave its children
 * running, so the guard does what the default would, children first.
 */
function onEndingSignal(signal: NodeJS.Signals): void {
  const others = process.listenerCount(signal) - 1 - exitOnlyListeners();
  if (others > 0) return;
  fellLiveChildren();
  const signals = os.constants.signals as Record<string, number | undefined>;
  process.exit(128 + (signals[signal] ?? 0));
}

let guarded = false;

function installGuard(): void {
  if (guarded) return;
  guarded = true;
  process.on("exit", fellLiveChildren);
  for (const signal of ENDING_SIGNALS) process.on(signal, onEndingSignal);
}

function removeGuard(): void {
  if (!guarded) return;
  guarded = false;
  process.removeListener("exit", fellLiveChildren);
  for (const signal of ENDING_SIGNALS) {
    process.removeListener(signal, onEndingSignal);
  }
}

/**
 * Register a spawned child so it cannot outlive this process: when the
 * process exits (normally, through `process.exit`, or on an uncaught error)
 * or is ended by a signal nobody handles, the child's tree is killed. The
 * listeners exist only while a supervised child is running. Graceful stops
 * are the owner's job (the services manager's `stopAll`); this is the last
 * line, and it kills hard. A process killed outright (SIGKILL, Task Manager)
 * runs no code at all, so its children cannot be reached.
 */
export function superviseChild(child: ChildProcess): void {
  if (child.pid === undefined) return; // never started
  installGuard();
  liveChildren.add(child);
  child.once("exit", () => {
    if (!liveChildren.delete(child)) return;
    if (liveChildren.size === 0) removeGuard();
  });
}
