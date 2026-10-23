import fs from "node:fs";
import path from "node:path";

/**
 * One process per PGlite store. PGlite is an in-process Postgres with no
 * postmaster to arbitrate: two processes opening the same data dir are two
 * writers on one PGDATA, which tears the store (it then aborts at the next
 * checkpoint or refuses to reopen). Hosts share one `.ph` tree by design
 * (`ph run vetra`, `ph run cli`, `ph run desktop`, classic `ph vetra` /
 * `ph switchboard` all use `.ph/reactor-storage` + `.ph/read-storage`), and the
 * per-host run records cannot see each other — so the guard lives here,
 * below every host: the switchboard takes a lock per store dir before
 * opening it.
 *
 * The lock is a SIBLING file (`<dir>.lock`), not a file inside the data dir:
 * initdb refuses a non-empty directory. A lock whose owner is dead (a
 * hard-killed process) is stale and taken over; the owner releases it on
 * exit. The same process may re-acquire its own lock (in-process restarts).
 */
export interface StoreLockOwner {
  pid: number;
  startedAt: string;
  command: string;
}

export class StoreInUseError extends Error {
  constructor(
    readonly dir: string,
    readonly owner: StoreLockOwner,
  ) {
    super(
      `The PGlite store ${dir} is in use by another process (pid ${owner.pid}, since ${owner.startedAt}: ${owner.command}). ` +
        "Two processes on one PGlite store corrupt it. Stop that process first, or point this one at a different store.",
    );
    this.name = "StoreInUseError";
  }
}

const lockPathOf = (dir: string) => `${path.resolve(dir)}.lock`;

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists but belongs to another user.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function readOwner(file: string): StoreLockOwner | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as StoreLockOwner;
  } catch {
    return undefined;
  }
}

const held = new Set<string>();
let exitHookInstalled = false;

function releaseAll(): void {
  for (const file of held) {
    const owner = readOwner(file);
    if (owner?.pid === process.pid) {
      try {
        fs.rmSync(file);
      } catch {
        // already gone
      }
    }
  }
  held.clear();
}

/** Take the lock for each store dir, or throw StoreInUseError naming the
 * live owner. Idempotent within one process. */
export function acquireStoreLocks(
  dirs: readonly string[],
  isPidAlive: (pid: number) => boolean = isAlive,
): void {
  const mine: StoreLockOwner = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    command: process.argv.slice(1).join(" ").slice(0, 200),
  };
  for (const dir of new Set(dirs.map((d) => path.resolve(d)))) {
    const file = lockPathOf(dir);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const owner = readOwner(file);
    if (owner && owner.pid !== process.pid && isPidAlive(owner.pid)) {
      throw new StoreInUseError(dir, owner);
    }
    // free, stale (dead owner) or already ours: write our claim
    fs.writeFileSync(file, `${JSON.stringify(mine)}\n`);
    held.add(file);
  }
  if (!exitHookInstalled) {
    exitHookInstalled = true;
    process.on("exit", releaseAll);
  }
}

/** Release this process's store locks (tests; orderly shutdown). */
export function releaseStoreLocks(): void {
  releaseAll();
}
