import { GraphQLError } from "graphql";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InspectionThrottle } from "../src/graphql/inspection/throttle.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function extensionsOf(error: unknown): Record<string, unknown> {
  expect(error).toBeInstanceOf(GraphQLError);
  return (error as GraphQLError).extensions;
}

function thrown(run: () => void): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("expected a throw");
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

describe("InspectionThrottle", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("refuses a caller past its burst until a call refills", () => {
    const throttle = new InspectionThrottle();
    for (let i = 0; i < 6; i++) throttle.charge("a");
    expect(extensionsOf(thrown(() => throttle.charge("a")))).toEqual({
      code: "TOO_MANY_REQUESTS",
      retryAfterMs: 10_000,
    });
    vi.setSystemTime(10_000);
    throttle.charge("a");
    expect(() => throttle.charge("a")).toThrow(GraphQLError);
  });

  it("keeps one bucket per caller", () => {
    const throttle = new InspectionThrottle({ callsPerMinute: 1 });
    throttle.charge("a");
    expect(() => throttle.charge("a")).toThrow(GraphQLError);
    expect(() => throttle.charge("b")).not.toThrow();
  });

  it("queues past the slot cap and refuses past the queue bound", async () => {
    const throttle = new InspectionThrottle({
      maxConcurrent: 1,
      maxQueued: 1,
    });
    const first = deferred<string>();
    const ran: string[] = [];
    const a = throttle.limited(() => {
      ran.push("a");
      return first.promise;
    });
    const b = throttle.limited(() => {
      ran.push("b");
      return Promise.resolve("b");
    });
    const c = throttle.limited(() => Promise.resolve("c"));

    await expect(c).rejects.toSatisfy(
      (error) =>
        extensionsOf(error).code === "TOO_MANY_REQUESTS" &&
        extensionsOf(error).retryAfterMs === 1000,
    );
    await tick();
    expect(ran).toEqual(["a"]);

    first.resolve("a");
    expect(await a).toBe("a");
    expect(await b).toBe("b");
    expect(ran).toEqual(["a", "b"]);
  });

  it("queues an unbounded call past the queue bound", async () => {
    const throttle = new InspectionThrottle({
      maxConcurrent: 1,
      maxQueued: 0,
    });
    const held = deferred<void>();
    const holder = throttle.limited(() => held.promise);

    await expect(
      throttle.limited(() => Promise.resolve("refused")),
    ).rejects.toBeInstanceOf(GraphQLError);
    let done = false;
    const admin = throttle
      .limited(() => Promise.resolve("admin"), { unbounded: true })
      .then((value) => {
        done = true;
        return value;
      });
    await tick();
    expect(done).toBe(false);

    held.resolve();
    await holder;
    expect(await admin).toBe("admin");
  });

  it("shares one run between concurrent calls with one key", async () => {
    const throttle = new InspectionThrottle();
    const result = deferred<{ n: number }>();
    const run = vi.fn(() => result.promise);
    const a = throttle.shared("k", run);
    const b = throttle.shared("k", run);
    result.resolve({ n: 1 });
    expect(await a).toBe(await b);
    expect(run).toHaveBeenCalledTimes(1);

    await throttle.shared("k", run);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("hands a shared rejection to every joiner and keeps none of it", async () => {
    const throttle = new InspectionThrottle();
    const result = deferred<string>();
    const run = vi.fn(() => result.promise);
    const a = throttle.shared("k", run);
    const b = throttle.shared("k", run);
    result.reject(new Error("boom"));
    await expect(a).rejects.toThrow("boom");
    await expect(b).rejects.toThrow("boom");

    run.mockImplementation(() => Promise.resolve("again"));
    expect(await throttle.shared("k", run)).toBe("again");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("lets calls join a shared run still waiting for a slot", async () => {
    const throttle = new InspectionThrottle({
      maxConcurrent: 1,
      maxQueued: 1,
    });
    const held = deferred<void>();
    const holder = throttle.limited(() => held.promise);
    const run = vi.fn(() => Promise.resolve("k"));
    const a = throttle.shared("k", run);
    const b = throttle.shared("k", run);

    await expect(
      throttle.shared("other", () => Promise.resolve("other")),
    ).rejects.toBeInstanceOf(GraphQLError);

    held.resolve();
    await holder;
    expect(await a).toBe("k");
    expect(await b).toBe("k");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("never shares a refused call", async () => {
    const throttle = new InspectionThrottle({
      maxConcurrent: 1,
      maxQueued: 0,
    });
    const held = deferred<void>();
    const holder = throttle.limited(() => held.promise);
    const refused = throttle.shared("k", () => Promise.resolve("reader"));
    const admin = throttle.shared("k", () => Promise.resolve("admin"), {
      unbounded: true,
    });
    await expect(refused).rejects.toBeInstanceOf(GraphQLError);

    held.resolve();
    await holder;
    expect(await admin).toBe("admin");
  });

  it("prunes refilled buckets once it tracks too many callers", () => {
    const throttle = new InspectionThrottle();
    for (let i = 0; i < 10_000; i++) throttle.charge(`old-${i}`);
    for (let i = 0; i < 6; i++) throttle.charge("hot");
    expect(throttle.trackedCallers).toBe(10_001);

    vi.setSystemTime(10_000);
    throttle.charge("new");
    expect(throttle.trackedCallers).toBe(2);
    throttle.charge("hot");
    expect(() => throttle.charge("hot")).toThrow(GraphQLError);
  });
});
