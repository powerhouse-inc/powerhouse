// HARNESS-AUTHORED acceptance test (tools/doc-harness), not taken from a recipe.
// It exercises only the contract in the task prompt: Mutex, shouldStart, runWithRetry.
import { describe, expect, it } from "vitest";
import {
  runWithRetry,
  shouldStart,
  type DeploymentStatus,
} from "../src/controller.js";
import { Mutex } from "../src/mutex.js";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

describe("Mutex", () => {
  it("runs callers one at a time, in call order", async () => {
    const mutex = new Mutex();
    const log: string[] = [];
    let active = 0;
    let maxActive = 0;

    const job = (name: string, ms: number) =>
      mutex.run(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        log.push(`${name}:start`);
        await sleep(ms);
        log.push(`${name}:end`);
        active--;
        return name;
      });

    const results = await Promise.all([job("a", 30), job("b", 5), job("c", 10)]);

    expect(results).toEqual(["a", "b", "c"]);
    expect(maxActive).toBe(1);
    expect(log).toEqual([
      "a:start",
      "a:end",
      "b:start",
      "b:end",
      "c:start",
      "c:end",
    ]);
  });

  it("passes the result through", async () => {
    const mutex = new Mutex();
    await expect(mutex.run(() => Promise.resolve(42))).resolves.toBe(42);
  });

  it("releases the lock when a caller rejects", async () => {
    const mutex = new Mutex();
    const failing = mutex.run(() => Promise.reject(new Error("boom")));
    const next = mutex.run(() => Promise.resolve("after"));

    await expect(failing).rejects.toThrow("boom");
    await expect(next).resolves.toBe("after");
  });
});

describe("shouldStart", () => {
  it("starts only on APPROVED", () => {
    const statuses: DeploymentStatus[] = [
      "DRAFT",
      "APPROVED",
      "RUNNING",
      "SUCCEEDED",
      "FAILED",
    ];
    expect(statuses.filter(shouldStart)).toEqual(["APPROVED"]);
  });
});

describe("runWithRetry", () => {
  it("retries a failing effect and reports the attempt count", async () => {
    let calls = 0;
    const effect = () => {
      calls++;
      return calls < 3
        ? Promise.reject(new Error(`fail ${calls}`))
        : Promise.resolve("deployed");
    };

    const outcome = await runWithRetry(effect, {
      maxAttempts: 3,
      timeoutMs: 1000,
    });

    expect(outcome).toEqual({ ok: true, result: "deployed", attempts: 3 });
  });

  it("stops at the first success", async () => {
    let calls = 0;
    const effect = () => {
      calls++;
      return Promise.resolve("first");
    };

    const outcome = await runWithRetry(effect, {
      maxAttempts: 5,
      timeoutMs: 1000,
    });

    expect(calls).toBe(1);
    expect(outcome).toEqual({ ok: true, result: "first", attempts: 1 });
  });

  it("gives up after maxAttempts with the last error", async () => {
    let calls = 0;
    const effect = () => {
      calls++;
      return Promise.reject(new Error(`fail ${calls}`));
    };

    const outcome = await runWithRetry(effect, {
      maxAttempts: 2,
      timeoutMs: 1000,
    });

    expect(calls).toBe(2);
    expect(outcome).toMatchObject({
      ok: false,
      attempts: 2,
      reason: expect.stringContaining("fail 2") as string,
    });
  });

  it("treats an effect that never settles as a failed attempt", async () => {
    const effect = () => new Promise<string>(() => {});

    const outcome = await runWithRetry(effect, {
      maxAttempts: 1,
      timeoutMs: 20,
    });

    expect(outcome).toMatchObject({ ok: false, attempts: 1 });
  });
});
