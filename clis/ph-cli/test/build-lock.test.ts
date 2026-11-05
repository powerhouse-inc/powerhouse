// A build takes the package's lock over only from an owner proven dead, and
// two builds that both find it stale must not both end up holding it. The
// race is made deterministic: the second contender's takeover starts only
// after the first contender judged the lock stale.

import { spawnSync } from "node:child_process";
import type * as NodeFs from "node:fs";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { hostname, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acquireBuildLock } from "../src/services/package-build/staging/lock.js";

// The boot id the OS reports to the lock.
const boot = vi.hoisted(() => ({ id: "this-boot" as string | null }));
vi.mock("../src/services/package-build/staging/boot-id.js", () => ({
  currentBootId: () => boot.id,
}));

// Runs once, just before the first write that moves a stale lock aside or
// claims its takeover: the moment between judging a lock stale and acting.
const interleave = vi.hoisted(() => ({
  beforeTakeover: undefined as (() => void) | undefined,
}));

vi.mock("node:fs", async (importOriginal) => {
  const fs = await importOriginal<typeof NodeFs>();
  const takeover = /lock\.(stale|takeover)-/;
  const before = (...paths: unknown[]) => {
    const run = interleave.beforeTakeover;
    if (run && paths.some((path) => takeover.test(String(path)))) {
      interleave.beforeTakeover = undefined;
      run();
    }
  };
  return {
    ...fs,
    renameSync: (from: NodeFs.PathLike, to: NodeFs.PathLike) => {
      before(from, to);
      fs.renameSync(from, to);
    },
    writeFileSync: (
      file: NodeFs.PathOrFileDescriptor,
      data: string | NodeJS.ArrayBufferView,
      options?: NodeFs.WriteFileOptions,
    ) => {
      before(file);
      fs.writeFileSync(file, data, options);
    },
  };
});

const roots: string[] = [];
afterEach(() => {
  interleave.beforeTakeover = undefined;
  boot.id = "this-boot";
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

// This machine, as a lock owner names it: host, and boot id.
const thisMachine = { host: hostname(), bootId: "this-boot" };
const owner = (pid: number, runId: string) => ({ pid, runId, ...thisMachine });
const deadPid = () => spawnSync(process.execPath, ["-e", ""]).pid!;
const shown = (fields: { pid: number; runId: string; host: string }) =>
  `host ${fields.host}, pid ${fields.pid}, run ${fields.runId}`;

/** The lock file of a package of its own, not yet taken. */
function packageLock(): string {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "ph lock ")));
  roots.push(root);
  const lock = join(root, ".ph", "build", "lock");
  mkdirSync(dirname(lock), { recursive: true });
  return lock;
}

/** A lock file holding `content`, in a package of its own. */
function lockHolding(content: unknown): string {
  const lock = packageLock();
  writeFileSync(lock, JSON.stringify(content));
  return lock;
}

type Wait = { file: string; owner: string };

/** Acquires the lock, or says it is still waiting after `ms`. */
function acquireWithin(lock: string, runId: string, waits: Wait[], ms: number) {
  const held = acquireBuildLock(lock, runId, (wait) => waits.push(wait));
  return {
    held,
    soon: Promise.race([held, sleep(ms).then(() => "still waiting" as const)]),
  };
}

describe("the build lock", () => {
  it("is not taken from a build that took it over after another contender judged it stale", async () => {
    const lock = lockHolding(owner(deadPid(), "dead"));
    let first: ReturnType<typeof acquireBuildLock> | undefined;
    interleave.beforeTakeover = () => {
      first = acquireBuildLock(lock, "first", () => undefined);
    };
    const waits: Wait[] = [];
    let secondHolds = false;

    const second = acquireBuildLock(lock, "second", (wait) =>
      waits.push(wait),
    ).then((held) => {
      secondHolds = true;
      return held;
    });
    await sleep(500);

    expect(first).not.toBe(undefined);
    expect(secondHolds).toBe(false);
    expect(waits).toEqual([
      { file: lock, owner: shown(owner(process.pid, "first")) },
    ]);

    (await first!).release();
    (await second).release();
    expect(secondHolds).toBe(true);
    expect(existsSync(lock)).toBe(false);
  });

  it("waits for a takeover a live contender holds, however long ago it began, and says so", async () => {
    const stale = owner(deadPid(), "dead");
    const lock = lockHolding(stale);
    const takeover = `${lock}.takeover-dead`;
    const paused = owner(process.pid, "paused");
    writeFileSync(takeover, JSON.stringify(paused));
    const longAgo = new Date(Date.now() - 3_600_000);
    utimesSync(takeover, longAgo, longAgo);
    const waits: Wait[] = [];

    const { held, soon } = acquireWithin(lock, "next", waits, 2500);

    expect(await soon).toBe("still waiting");
    expect(waits).toEqual([{ file: takeover, owner: shown(paused) }]);
    expect(JSON.parse(readFileSync(lock, "utf8"))).toEqual(stale);
    rmSync(takeover);
    (await held).release();
    expect(readdirSync(dirname(lock))).toEqual([]);
  });

  it("takes over a takeover whose holder is proven dead", async () => {
    const lock = lockHolding(owner(deadPid(), "dead"));
    writeFileSync(
      `${lock}.takeover-dead`,
      JSON.stringify(owner(deadPid(), "gone")),
    );
    const waits: Wait[] = [];

    const held = await acquireBuildLock(lock, "next", (wait) =>
      waits.push(wait),
    );

    expect(waits).toEqual([]);
    expect(readdirSync(dirname(lock))).toEqual(["lock"]);
    expect(JSON.parse(readFileSync(lock, "utf8"))).toEqual(
      owner(process.pid, "next"),
    );
    held.release();
    expect(existsSync(lock)).toBe(false);
  });

  it("removes the pending files dead contenders left, and keeps a live contender's and one still being written", async () => {
    const lock = packageLock();
    const dir = dirname(lock);
    writeFileSync(
      join(dir, ".lock.dead.pending"),
      JSON.stringify(owner(deadPid(), "dead")),
    );
    writeFileSync(
      join(dir, ".lock.takeover-x.gone.pending"),
      JSON.stringify(owner(deadPid(), "gone")),
    );
    writeFileSync(
      join(dir, ".lock.live.pending"),
      JSON.stringify(owner(process.pid, "live")),
    );
    writeFileSync(join(dir, ".lock.half.pending"), '{"pid":');

    const held = await acquireBuildLock(lock, "next", () => undefined);

    expect(readdirSync(dir).sort()).toEqual([
      ".lock.half.pending",
      ".lock.live.pending",
      "lock",
    ]);
    held.release();
  });

  it("takes over a dead pid of this host whose boot id is unknown", async () => {
    const lock = lockHolding({ ...owner(deadPid(), "dead"), bootId: null });
    const waits: Wait[] = [];

    const held = await acquireBuildLock(lock, "next", (wait) =>
      waits.push(wait),
    );

    expect(waits).toEqual([]);
    expect(JSON.parse(readFileSync(lock, "utf8"))).toEqual(
      owner(process.pid, "next"),
    );
    held.release();
  });

  it("takes over a lock from another boot of this host, even when its pid is live again", async () => {
    const lock = lockHolding({
      ...owner(process.pid, "before-reboot"),
      bootId: "an-earlier-boot",
    });
    const waits: Wait[] = [];

    const held = await acquireBuildLock(lock, "next", (wait) =>
      waits.push(wait),
    );

    expect(waits).toEqual([]);
    expect(JSON.parse(readFileSync(lock, "utf8"))).toEqual(
      owner(process.pid, "next"),
    );
    held.release();
  });

  it("waits for an owner it cannot prove dead, however far the clock jumps: a live pid of this or an unknown boot, another host, a lock without a boot id, an unreadable lock", async () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockImplementation(() => now + 3_600_000);
    const dead = deadPid();
    const live = owner(process.pid, "live");
    const cases: [string, unknown, string][] = [
      ["live pid", live, shown(live)],
      ["live pid, its boot unknown", { ...live, bootId: null }, shown(live)],
      [
        "another host",
        { ...owner(dead, "remote"), host: `not-${thisMachine.host}` },
        shown({ pid: dead, runId: "remote", host: `not-${thisMachine.host}` }),
      ],
      [
        "no boot id",
        { pid: dead, runId: "old", host: thisMachine.host },
        shown(owner(dead, "old")),
      ],
      ["unreadable", "not an owner", "owner unknown"],
    ];
    for (const [name, content, ownerShown] of cases) {
      const lock = lockHolding(content);
      const waits: Wait[] = [];

      const { held, soon } = acquireWithin(lock, "next", waits, 700);

      expect([name, await soon]).toEqual([name, "still waiting"]);
      expect([name, waits]).toEqual([
        name,
        [{ file: lock, owner: ownerShown }],
      ]);
      expect([name, JSON.parse(readFileSync(lock, "utf8"))]).toEqual([
        name,
        content,
      ]);
      rmSync(lock);
      (await held).release();
    }
  });
});
