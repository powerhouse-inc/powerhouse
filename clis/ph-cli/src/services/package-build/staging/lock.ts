import {
  linkSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { hostname } from "node:os";
import { basename, dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { currentBootId } from "./boot-id.js";
import { removeTree } from "./files.js";

const POLL_MS = 100;
const TAKEOVER_RETRY_MS = 10;
// A takeover takes milliseconds, so a contender waiting on one says so only
// when it lasts: the holder may be paused, or gone under a reused pid.
const QUIET_TAKEOVER_WAIT_MS = 1000;

/**
 * A lock's owner: the run, its process, and the machine and boot that
 * process lives in. Only an owner of this machine can be proven dead (see
 * `provenDead`).
 */
type LockOwner = {
  readonly pid: number;
  readonly runId: string;
  readonly host: string;
  /** The OS's id of the boot the process ran in, null where unknown. */
  readonly bootId: string | null;
};

function isOwner(value: unknown): value is LockOwner {
  const owner = value as Partial<LockOwner> | null;
  return (
    typeof owner?.pid === "number" &&
    typeof owner.runId === "string" &&
    typeof owner.host === "string" &&
    (typeof owner.bootId === "string" || owner.bootId === null)
  );
}

/**
 * The owner's process is gone: on this machine, it ran in another boot (so
 * the reboot ended it), or no process is left at its pid. Another host, or a
 * live pid in this boot or an unknown one, is not proof: such an owner may
 * still be building. A pid reused by another process of this boot reads as
 * live, so its lock waits until someone deletes it.
 */
const provenDead = (owner: LockOwner) => {
  if (owner.host !== hostname()) return false;
  const boot = currentBootId();
  if (owner.bootId !== null && boot !== null && owner.bootId !== boot) {
    return true;
  }
  return !isProcessAlive(owner.pid);
};

const errorCode = (error: unknown) => (error as { code?: unknown }).code;

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: alive, owned by another user.
    return errorCode(error) === "EPERM";
  }
}

/** What a waiting build says about who holds a lock or takeover file. */
function described(value: unknown): string {
  const fields = value as Partial<Record<keyof LockOwner, unknown>> | null;
  const parts = (
    [
      ["host", fields?.host],
      ["pid", fields?.pid],
      ["run", fields?.runId],
    ] as const
  ).flatMap(([name, field]) =>
    typeof field === "string" || typeof field === "number"
      ? [`${name} ${field}`]
      : [],
  );
  return parts.length > 0 ? parts.join(", ") : "owner unknown";
}

/**
 * Who holds a lock or takeover file. `id` names that one holding: the
 * owner's run id, or for a file that does not read as an owner, its inode
 * and time, so a replacement never passes for it. Such a file is never
 * proven dead.
 */
type Holder = {
  readonly id: string;
  readonly dead: boolean;
  readonly owner: string;
};

function holderOf(file: string): Holder | undefined {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    if (errorCode(error) === "ENOENT") return undefined;
  }
  if (isOwner(value)) {
    return {
      id: value.runId,
      dead: provenDead(value),
      owner: described(value),
    };
  }
  const stat = lstatSync(file, { throwIfNoEntry: false });
  return (
    stat && {
      id: `file ${stat.ino} ${stat.mtimeMs}`,
      dead: false,
      owner: described(value),
    }
  );
}

/**
 * Creates `file` holding `owner`, or returns false when it exists. The file
 * appears with its content in one link, so no reader sees it empty.
 */
function createOwned(file: string, owner: LockOwner): boolean {
  const pending = join(
    dirname(file),
    `.${basename(file)}.${owner.runId}.pending`,
  );
  writeFileSync(pending, JSON.stringify(owner));
  try {
    linkSync(pending, file);
    return true;
  } catch (error) {
    if (errorCode(error) === "EEXIST") return false;
    throw error;
  } finally {
    rmSync(pending, { force: true });
  }
}

const takeoverFile = (lockFile: string, staleId: string) =>
  `${lockFile}.takeover-${encodeURIComponent(staleId)}`;

/** A file a live or unknown holder keeps, which this build waits for. */
type Blocked = { readonly file: string; readonly holder: Holder };

/**
 * Removes `file` while it still holds the dead holder `stale`. Only the
 * creator of the takeover file keyed to `stale` may remove it, and `stale`
 * cannot come back, so the owner read under that file is the one removed: a
 * contender that judged it stale before someone else took over removes
 * nothing. A takeover file is itself taken over only from a holder proven
 * dead, never for its age, so a paused holder keeps it. Returns what blocks
 * the takeover, or nothing when the caller should try again.
 */
function takeOver(
  lockFile: string,
  file: string,
  stale: Holder,
  me: LockOwner,
): Blocked | undefined {
  const guard = takeoverFile(lockFile, stale.id);
  if (!createOwned(guard, me)) {
    const holder = holderOf(guard);
    if (holder === undefined) return undefined;
    return holder.dead
      ? takeOver(lockFile, guard, holder, me)
      : { file: guard, holder };
  }
  try {
    if (holderOf(file)?.id === stale.id) removeTree(file);
    return undefined;
  } finally {
    if (holderOf(guard)?.id === me.runId) rmSync(guard, { force: true });
  }
}

/**
 * Takeover files left by contenders that died. Safe under the lock: one
 * matters only while the lock holds its stale owner, and the lock is ours.
 * A pending file goes only when its writer is proven dead: a live
 * contender links it next.
 */
function removeTakeoverFiles(lockFile: string): void {
  const takeover = `${basename(lockFile)}.takeover-`;
  const pending = `.${basename(lockFile)}.`;
  for (const entry of readdirSync(dirname(lockFile))) {
    const file = join(dirname(lockFile), entry);
    if (
      entry.startsWith(takeover) ||
      (entry.startsWith(pending) &&
        entry.endsWith(".pending") &&
        holderOf(file)?.dead === true)
    ) {
      rmSync(file, { force: true });
    }
  }
}

/** The package's build lock, held until `release`. */
export type BuildLock = { readonly release: () => void };

/** The file a build waits for and who holds it, as `host …, pid …, run …`. */
export type LockWait = { readonly file: string; readonly owner: string };

/**
 * Takes `.ph/build/lock`, a file created exclusively that names this run.
 * A lock is taken over only from an owner proven dead (see `provenDead`);
 * otherwise this waits, and says once per holder which file it waits for.
 */
export async function acquireBuildLock(
  lockFile: string,
  runId: string,
  onWait: (wait: LockWait) => void,
): Promise<BuildLock> {
  mkdirSync(dirname(lockFile), { recursive: true });
  const me: LockOwner = {
    pid: process.pid,
    runId,
    host: hostname(),
    bootId: currentBootId(),
  };
  const told = new Set<string>();
  const firstBlocked = new Map<string, number>();
  for (;;) {
    if (createOwned(lockFile, me)) {
      removeTakeoverFiles(lockFile);
      let held = true;
      return {
        release: () => {
          if (!held) return;
          held = false;
          if (holderOf(lockFile)?.id === runId) rmSync(lockFile);
        },
      };
    }
    const holder = holderOf(lockFile);
    if (holder === undefined) continue;
    const blocked = holder.dead
      ? takeOver(lockFile, lockFile, holder, me)
      : { file: lockFile, holder };
    if (blocked === undefined) {
      await sleep(TAKEOVER_RETRY_MS);
      continue;
    }
    const key = `${blocked.file}\0${blocked.holder.id}`;
    const since = firstBlocked.get(key) ?? Date.now();
    firstBlocked.set(key, since);
    const quiet =
      blocked.file !== lockFile && Date.now() - since < QUIET_TAKEOVER_WAIT_MS;
    if (!quiet && !told.has(key)) {
      told.add(key);
      onWait({ file: blocked.file, owner: blocked.holder.owner });
    }
    await sleep(blocked.file === lockFile ? POLL_MS : TAKEOVER_RETRY_MS);
  }
}
