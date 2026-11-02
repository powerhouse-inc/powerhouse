import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Supervised, type SupervisedEvent } from "../src/supervisor.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "portle-sup-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function nodeChild(
  script: string,
  events: SupervisedEvent[],
  backoff = { initialMs: 20, maxMs: 40 },
) {
  return new Supervised({
    name: "child",
    command: process.execPath,
    args: ["-e", script],
    cwd: dir,
    logFile: join(dir, "logs", "child.log"),
    backoff,
    healthyAfterMs: 10_000,
    stopTimeoutMs: 2_000,
    onEvent: (e) => events.push(e),
  });
}

describe("Supervised", () => {
  it("starts a hidden child, logs its output, and stops it without restarting", async () => {
    const events: SupervisedEvent[] = [];
    const child = nodeChild(
      'console.log("hello from child"); setInterval(() => {}, 1000)',
      events,
    );
    expect(child.status()).toMatchObject({
      running: false,
      pid: null,
      restarts: 0,
    });
    child.start();
    expect(child.status().running).toBe(true);
    expect(child.status().pid).toBeGreaterThan(0);
    child.start(); // idempotent
    await sleep(300);
    await child.stop();
    expect(child.status().running).toBe(false);
    await sleep(100);
    expect(child.status().restarts).toBe(0);
    expect(readFileSync(join(dir, "logs", "child.log"), "utf8")).toContain(
      "hello from child",
    );
    expect(events.map((e) => e.type)).toEqual(["started", "stopped"]);
  });

  it("restarts a crashing child with growing backoff and records the exit", async () => {
    const events: SupervisedEvent[] = [];
    const child = nodeChild("process.exit(3)", events);
    child.start();
    await vi.waitFor(
      () => expect(child.status().restarts).toBeGreaterThanOrEqual(2),
      { timeout: 5_000, interval: 25 },
    );
    const exits = events.filter((e) => e.type === "exited") as Extract<
      SupervisedEvent,
      { type: "exited" }
    >[];
    expect(exits[0]).toMatchObject({ code: 3, restarting: true, delayMs: 20 });
    expect(exits[1]?.delayMs).toBe(40);
    expect(child.status().lastExit?.code).toBe(3);
    await child.stop();
    const restarts = child.status().restarts;
    await sleep(150);
    expect(child.status().restarts).toBe(restarts);
    expect(child.status().running).toBe(false);
  });

  it("reports a command that cannot be spawned and keeps trying", async () => {
    const events: SupervisedEvent[] = [];
    const child = new Supervised({
      name: "missing",
      command: join(dir, "no-such-binary"),
      args: [],
      cwd: dir,
      logFile: join(dir, "missing.log"),
      backoff: { initialMs: 20, maxMs: 20 },
      onEvent: (e) => events.push(e),
    });
    child.start();
    await vi.waitFor(
      () =>
        expect(
          events.filter((e) => e.type === "spawn-failed").length,
        ).toBeGreaterThanOrEqual(2),
      {
        timeout: 5_000,
        interval: 25,
      },
    );
    await child.stop();
    expect(child.status().running).toBe(false);
  });
});
