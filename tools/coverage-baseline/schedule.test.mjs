import assert from "node:assert/strict";
import { test } from "node:test";
import { demand, schedule as scheduleJobs } from "./schedule.mjs";

const schedule = (jobs, limits, execute, settled, signal, admissionIssue) =>
  scheduleJobs(jobs, limits, {
    execute,
    settled,
    signal,
    admissionIssue,
    createWorkspace: (id) => ({ id, root: String(id) }),
    disposeWorkspace: async () => ({ deleted: true }),
    referenceRoot: "reference",
  });

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const limits = { jobs: 3, cloning: 2, cpu: 4, memoryGiB: 4 };
const jobs = ["first", "second", "independent"].map((id, index) => ({
  id,
  index,
  owner: id,
  resources: {
    keys: [`owner:${id}`, index < 2 ? "postgres:shared" : "tcp:separate"],
    cpu: 1,
    memoryGiB: 1,
    priority: 0,
  },
}));

test(
  "temporary disk pressure waits for active cleanup; a persistent shortage leaves jobs unexecuted",
  { timeout: 5000 },
  async () => {
    let blocked = false;
    const started = [],
      results = [];
    const issue = "Insufficient scratch space before execution";
    const execute = async (job, phases) => {
      assert.equal(
        blocked,
        false,
        "Queued job began while disk backpressure was active",
      );
      started.push(job.id);
      phases.cloned();
      if (job.id === "first") blocked = true;
      assert.equal(await phases.acquire(), true);
      phases.release({ valid: true });
      if (job.id === "first") {
        await new Promise((done) => setImmediate(done));
        assert.deepEqual(started, ["first"]);
        blocked = false;
      }
      return { ...job, cleanup: { valid: true }, gaps: [] };
    };
    await schedule(
      jobs.slice(0, 2),
      limits,
      execute,
      (value) => results.push(value),
      new AbortController().signal,
      () => (blocked ? issue : undefined),
    );
    assert.ok(
      results.every((value) => value.gaps.length === 0),
      "Queued job began while disk backpressure was active",
    );
    assert.deepEqual(started, ["first", "second"]);
    const refused = [];
    await schedule(
      jobs.slice(0, 2),
      limits,
      () => assert.fail("A blocked job executed"),
      (value) => refused.push(value),
      new AbortController().signal,
      () => issue,
    );
    assert.equal(refused.length, 2);
    for (const value of refused) {
      assert.deepEqual(value.gaps, [issue]);
      assert.equal(value.collection.valid, false);
    }
  },
);

test(
  "shared native work is exclusive while private phases and independent work overlap",
  { timeout: 5000 },
  async () => {
    const independent = deferred(),
      second = deferred(),
      events = [],
      results = [];
    let sharedActive = false;
    await schedule(
      jobs,
      limits,
      async (job, phases) => {
        phases.cloned();
        assert.equal(await phases.acquire(), true);
        events.push(`${job.id}:native`);
        if (job.id === "independent") independent.resolve();
        else {
          assert.equal(sharedActive, false);
          sharedActive = true;
          if (job.id === "first") await independent.promise;
          if (job.id === "second") second.resolve();
          sharedActive = false;
        }
        phases.release({ valid: true });
        if (job.id === "first") await second.promise;
        events.push(`${job.id}:private-finished`);
        return { ...job, cleanup: { valid: true }, gaps: [] };
      },
      (result) => results.push(result),
      new AbortController().signal,
    );
    assert.equal(results.length, 3);
    assert.ok(
      events.indexOf("independent:native") <
        events.indexOf("first:private-finished"),
    );
    assert.ok(
      events.indexOf("second:native") <
        events.indexOf("first:private-finished"),
    );
    for (const result of results) assert.equal(result.lease.cleanupValid, true);
  },
);

test(
  "independent work is admitted before a conflicting waiter can occupy its slot",
  { timeout: 5000 },
  async () => {
    const controller = new AbortController();
    const otherStarted = deferred(),
      firstFinished = deferred();
    const entered = [],
      results = [];
    controller.signal.addEventListener(
      "abort",
      () => {
        otherStarted.resolve();
        firstFinished.resolve();
      },
      { once: true },
    );
    const timer = setTimeout(() => controller.abort(), 2000);
    const planned = [
      ...jobs,
      {
        id: "other",
        index: 3,
        owner: "other",
        resources: {
          keys: ["owner:other", "tcp:other"],
          cpu: 1,
          memoryGiB: 1,
          priority: 0,
        },
      },
    ];
    try {
      await schedule(
        planned,
        limits,
        async (job, phases) => {
          phases.cloned();
          if (!(await phases.acquire()))
            return {
              ...job,
              gaps: ["Resources unavailable"],
              collection: { valid: false },
            };
          entered.push(job.id);
          if (job.id === "first") await otherStarted.promise;
          if (job.id === "other") otherStarted.resolve();
          phases.release({ valid: true });
          if (job.id === "first") firstFinished.resolve();
          if (job.id === "independent") await firstFinished.promise;
          return { ...job, gaps: [], cleanup: { valid: true } };
        },
        (result) => results.push(result),
        controller.signal,
      );
    } finally {
      clearTimeout(timer);
    }
    assert.equal(
      controller.signal.aborted,
      false,
      "Independent work starved behind a conflicting resident",
    );
    assert.equal(results.length, 4);
    assert.ok(results.every((result) => result.gaps.length === 0));
    assert.ok(entered.indexOf("other") < entered.indexOf("second"));
  },
);

test(
  "copying overlaps native work without exceeding the native execution ceiling",
  { timeout: 5000 },
  async () => {
    const controller = new AbortController();
    const nativeStarted = deferred(),
      copied = deferred();
    const results = [];
    let activeNative = 0,
      maximumNative = 0,
      copiedDuringNative = false;
    controller.signal.addEventListener(
      "abort",
      () => {
        nativeStarted.resolve();
        copied.resolve();
      },
      { once: true },
    );
    const timer = setTimeout(() => controller.abort(), 2000);
    const planned = Array.from({ length: 4 }, (_, index) => ({
      id: String(index),
      index,
      owner: String(index),
      resources: {
        keys: [`owner:${index}`],
        cpu: 1,
        memoryGiB: 1,
        priority: 0,
      },
    }));
    try {
      await schedule(
        planned,
        { jobs: 4, nativeJobs: 2, cloning: 4, cpu: 4, memoryGiB: 4 },
        async (job, phases) => {
          if (job.index === 2) {
            await nativeStarted.promise;
            copiedDuringNative = activeNative === 2;
          }
          phases.cloned();
          if (job.index === 2) copied.resolve();
          if (!(await phases.acquire()))
            return {
              ...job,
              gaps: ["Resources unavailable"],
              collection: { valid: false },
            };
          activeNative++;
          maximumNative = Math.max(maximumNative, activeNative);
          if (activeNative === 2) nativeStarted.resolve();
          if (job.index < 2) await copied.promise;
          activeNative--;
          phases.release({ valid: true });
          return { ...job, gaps: [], cleanup: { valid: true } };
        },
        (result) => results.push(result),
        controller.signal,
      );
    } finally {
      clearTimeout(timer);
    }
    assert.equal(controller.signal.aborted, false);
    assert.equal(copiedDuringNative, true);
    assert.equal(maximumNative, 2);
    assert.equal(results.length, 4);
    assert.ok(results.every((result) => result.gaps.length === 0));
  },
);

test(
  "failed cleanup, worker failure and cancellation deny waiting leases without blocking independent work",
  { timeout: 5000 },
  async () => {
    for (const fault of ["cleanup", "crash", "cancel"]) {
      const controller = new AbortController(),
        ready = deferred(),
        results = [],
        entered = [];
      await schedule(
        jobs,
        limits,
        async (job, phases) => {
          phases.cloned();
          if (job.id === "independent") ready.resolve();
          const granted = await phases.acquire();
          if (!granted)
            return {
              ...job,
              gaps: ["Resources unavailable"],
              collection: { valid: false },
            };
          entered.push(job.id);
          if (job.id === "first") {
            await ready.promise;
            if (fault === "crash")
              throw new Error("Worker exited before cleanup");
            if (fault === "cancel") controller.abort();
          }
          const cleanup = { valid: job.id !== "first" || fault !== "cleanup" };
          phases.release(cleanup);
          return { ...job, cleanup, gaps: [] };
        },
        (result) => results.push(result),
        controller.signal,
      );
      assert.equal(results.length, 3, fault);
      assert.ok(!entered.includes("second"), fault);
      if (fault !== "cancel") assert.ok(entered.includes("independent"), fault);
      const first = results.find((result) => result.id === "first");
      assert.equal(first.lease.cleanupValid, fault === "cancel", fault);
    }
  },
);

const headroom = { jobs: 4, nativeJobs: 2, cloning: 2, cpu: 8, memoryGiB: 8 };
const shared = ["first", "second", "third", "independent"].map((id, index) => ({
  id,
  index,
  owner: id,
  resources: {
    keys: [`owner:${id}`, index < 3 ? "postgres:shared" : "tcp:separate"],
    cpu: 1,
    memoryGiB: 1,
    priority: 0,
  },
}));

test(
  "spare residents let one shared successor copy during native work",
  { timeout: 5000 },
  async () => {
    const controller = new AbortController(),
      secondCopied = deferred(),
      independentSettled = deferred(),
      results = [];
    controller.signal.addEventListener(
      "abort",
      () => {
        secondCopied.resolve();
        independentSettled.resolve();
      },
      { once: true },
    );
    const timer = setTimeout(() => controller.abort(), 2000);
    let sharedNative = 0,
      native = 0,
      peakNative = 0,
      sharedOverlap = false,
      copiedDuringNative = false,
      thirdQueuedBehindWaiter = false,
      thirdStarted = false;
    try {
      await schedule(
        shared,
        headroom,
        async (job, phases) => {
          if (job.id === "third") thirdStarted = true;
          phases.cloned();
          if (job.id === "second") {
            copiedDuringNative = sharedNative === 1;
            secondCopied.resolve();
          }
          if (!(await phases.acquire()))
            return {
              ...job,
              gaps: ["Resources unavailable"],
              collection: { valid: false },
            };
          native++;
          peakNative = Math.max(peakNative, native);
          if (job.id === "independent") await secondCopied.promise;
          else if (sharedNative++) sharedOverlap = true;
          if (job.id === "first") {
            await secondCopied.promise;
            await independentSettled.promise;
            await new Promise((done) => setImmediate(done));
            thirdQueuedBehindWaiter = !thirdStarted;
          }
          if (job.id !== "independent") sharedNative--;
          native--;
          phases.release({ valid: true });
          return { ...job, gaps: [], cleanup: { valid: true } };
        },
        (result) => {
          results.push(result);
          if (result.id === "independent") independentSettled.resolve();
        },
        controller.signal,
      );
    } finally {
      clearTimeout(timer);
    }
    assert.equal(controller.signal.aborted, false);
    assert.equal(copiedDuringNative, true, "Successor did not copy ahead");
    assert.equal(thirdQueuedBehindWaiter, true, "Shared copies accumulated");
    assert.equal(sharedOverlap, false, "Shared native work overlapped");
    assert.ok(peakNative <= headroom.nativeJobs);
    assert.equal(results.length, 4);
    assert.ok(results.every((result) => result.gaps.length === 0));
  },
);

test(
  "a pre-copied successor is denied after failed cleanup, worker failure or cancellation",
  { timeout: 5000 },
  async () => {
    for (const fault of ["cleanup", "crash", "cancel"]) {
      const controller = new AbortController(),
        secondCopied = deferred(),
        results = [],
        entered = [];
      let copiedDuringNative = false,
        firstNative = false;
      controller.signal.addEventListener("abort", secondCopied.resolve, {
        once: true,
      });
      const timer = setTimeout(() => controller.abort(), 2000);
      try {
        await schedule(
          shared.filter((job) => job.id !== "third"),
          headroom,
          async (job, phases) => {
            phases.cloned();
            if (job.id === "second") {
              copiedDuringNative = firstNative;
              secondCopied.resolve();
            }
            if (!(await phases.acquire()))
              return {
                ...job,
                gaps: ["Resources unavailable"],
                collection: { valid: false },
              };
            entered.push(job.id);
            if (job.id === "first") {
              firstNative = true;
              await secondCopied.promise;
              if (fault === "crash")
                throw new Error("Worker exited before cleanup");
              if (fault === "cancel") controller.abort();
            }
            const cleanup = {
              valid: job.id !== "first" || fault !== "cleanup",
            };
            phases.release(cleanup);
            return { ...job, cleanup, gaps: [] };
          },
          (result) => results.push(result),
          controller.signal,
        );
      } finally {
        clearTimeout(timer);
      }
      assert.equal(controller.signal.aborted, fault === "cancel", fault);
      assert.equal(copiedDuringNative, true, fault);
      assert.equal(results.length, 3, fault);
      assert.ok(!entered.includes("second"), fault);
      assert.ok(entered.includes("independent"), fault);
      const second = results.find((result) => result.id === "second");
      assert.equal(second.collection.valid, false, fault);
      const first = results.find((result) => result.id === "first");
      assert.equal(first.lease.cleanupValid, fault === "cancel", fault);
    }
  },
);

test(
  "Vitest owners run in the reference checkout without copies, even under disk pressure; consumers still copy",
  { timeout: 5000 },
  async () => {
    const assignments = new Map(),
      results = [];
    const owners = [
      { id: "unit", runner: "vitest", labels: [] },
      { id: "consumer", runner: "vitest", labels: ["consumer"] },
      { id: "browser", runner: "playwright", labels: [] },
    ].map((job, index) => ({
      ...job,
      index,
      owner: job.id,
      resources: {
        keys: [`owner:${job.id}`],
        cpu: 1,
        memoryGiB: 1,
        priority: 0,
      },
    }));
    const issue = "Insufficient scratch space before execution";
    const workspaces = await scheduleJobs(owners, limits, {
      execute: async (job, phases, assignment) => {
        assignments.set(job.id, assignment);
        phases.cloned();
        assert.equal(await phases.acquire(), true);
        phases.release({ valid: true });
        return {
          ...job,
          cleanup: { valid: true },
          scenario: { deleted: !assignment.inPlace },
          gaps: [],
        };
      },
      settled: (value) => results.push(value),
      signal: new AbortController().signal,
      admissionIssue: () => issue,
      createWorkspace: (id) => ({ id, root: `copy-${id}` }),
      disposeWorkspace: async () => ({ deleted: true }),
      referenceRoot: "reference",
    });
    assert.deepEqual(assignments.get("unit"), {
      id: 0,
      root: "reference",
      reuse: true,
      inPlace: true,
    });
    assert.deepEqual([...assignments.keys()], ["unit"]);
    assert.equal(workspaces.length, 0);
    const refused = results.filter((value) => value.gaps.length);
    assert.deepEqual(refused.map((value) => value.id).sort(), [
      "browser",
      "consumer",
    ]);
    for (const value of refused) assert.deepEqual(value.gaps, [issue]);
  },
);

test(
  "a PostgreSQL pool runs one job per free cluster and queues the rest",
  { timeout: 5000 },
  async () => {
    const pool = ["a", "b"].map((name) => ({
      key: `postgres:127.0.0.1:${name}`,
      url: `postgresql://postgres@127.0.0.1/${name}`,
    }));
    const pooled = ["first", "second", "third"].map((id, index) => ({
      id,
      index,
      owner: id,
      runner: "vitest",
      resources: {
        keys: [`owner:${id}`],
        pool,
        cpu: 1,
        memoryGiB: 1,
        priority: 0,
      },
    }));
    const holding = new Map(),
      gate = deferred();
    let maximum = 0;
    await scheduleJobs(
      pooled,
      { ...limits, nativeJobs: 3 },
      {
        execute: async (job, phases) => {
          phases.cloned();
          assert.equal(await phases.acquire(), true);
          holding.set(job.id, job.lease.pool);
          maximum = Math.max(maximum, holding.size);
          assert.equal(
            new Set(holding.values()).size,
            holding.size,
            "Two jobs leased the same cluster",
          );
          if (job.id === "first") await gate.promise;
          else if (holding.size === 2) gate.resolve();
          holding.delete(job.id);
          phases.release({ valid: true });
          return { ...job, cleanup: { valid: true }, gaps: [] };
        },
        settled: () => {},
        signal: new AbortController().signal,
        createWorkspace: (id) => ({ id, root: String(id) }),
        disposeWorkspace: async () => ({ deleted: true }),
        referenceRoot: "reference",
      },
    );
    assert.equal(maximum, 2);
    assert.deepEqual(
      pooled.map((job) => typeof job.lease.pool),
      ["string", "string", "string"],
    );
  },
);

test("only reactor and hub database users draw from the PostgreSQL pool", () => {
  const urls = [
    "postgresql://postgres:postgres@127.0.0.1:61111/reactor",
    "postgresql://postgres:postgres@127.0.0.1:61114/reactor",
  ];
  const job = (owner, extra = {}) => ({
    owner,
    runner: "vitest",
    files: ["a.test.ts"],
    env: {
      REACTOR_TEST_PG_URL: urls[0],
      PG_CONNECTION_STRING: "postgresql://p@127.0.0.1:61113/analytics",
    },
    postgresPool: urls,
    ...extra,
  });
  const reactor = demand(job("packages/reactor"), {});
  assert.deepEqual(
    reactor.pool.map((member) => member.key),
    ["postgres:127.0.0.1:61111", "postgres:127.0.0.1:61114"],
  );
  assert.ok(!reactor.keys.some((key) => key.startsWith("postgres:")));
  const analytics = demand(job("packages/analytics-engine/pg"), {});
  assert.equal(analytics.pool, undefined);
  assert.ok(analytics.keys.includes("postgres:127.0.0.1:61113"));
  const single = demand(
    job("packages/reactor", { postgresPool: undefined }),
    {},
  );
  assert.equal(single.pool, undefined);
  assert.ok(single.keys.includes("postgres:127.0.0.1:61111"));
});
