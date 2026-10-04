import { MessageChannel } from "node:worker_threads";
import { describe, expect, it } from "vitest";
import { runLocalSyncLoad } from "../src/index.js";
import type { MessagePortLike } from "@powerhousedao/reactor";

/**
 * A `node:worker_threads` MessageChannel in place of the browser global,
 * matching `test/local-sync.test.ts`'s pattern -- the in-process path has no
 * browser dependency, and `unref()` lets the test process exit without
 * waiting on the ports.
 */
function nodeChannel(): { port1: MessagePortLike; port2: MessagePortLike } {
  const { port1, port2 } = new MessageChannel();
  port1.unref();
  port2.unref();
  return {
    port1: port1 as unknown as MessagePortLike,
    port2: port2 as unknown as MessagePortLike,
  };
}

describe("runLocalSyncLoad", () => {
  // Small enough to run in every suite: 100 ops, in-process/memory storage,
  // well under the 60s suite timeout (packages/reactor-monitor/vitest.config.ts).
  it("generates load on A and measures its propagation to B", async () => {
    const report = await runLocalSyncLoad({
      documentCount: 20,
      opsPerDocument: 5,
      createChannel: nodeChannel,
    });

    expect(report.totalOps).toBe(100);
    expect(report.documentCount).toBe(20);
    expect(report.opsPerDocument).toBe(5);
    expect(report.payloadSize).toBe(0);
    expect(report.driveId).toBeTruthy();
    expect(report.reactorNames.a).not.toBe(report.reactorNames.b);

    // Propagation actually completed: B's operation count on the load drive
    // matches A's, and both are non-trivial (CREATE_FOLDER plus the drive's
    // own CREATE_DOCUMENT / UPGRADE_DOCUMENT bookkeeping operations).
    expect(report.operationCounts.b).toBe(report.operationCounts.a);
    expect(report.operationCounts.a).toBeGreaterThanOrEqual(report.totalOps);

    // Every phase measured something; propagation is not instantaneous zero,
    // generation did not somehow outrun the clock.
    expect(report.durationsMs.setupMs).toBeGreaterThan(0);
    expect(report.durationsMs.generateMs).toBeGreaterThan(0);
    expect(report.durationsMs.propagateMs).toBeGreaterThanOrEqual(0);
    expect(report.durationsMs.totalMs).toBeCloseTo(
      report.durationsMs.setupMs +
        report.durationsMs.generateMs +
        report.durationsMs.propagateMs,
      5,
    );

    expect(report.throughput.createOpsPerSec).toBeGreaterThan(0);
    expect(Number.isFinite(report.throughput.createOpsPerSec)).toBe(true);
    expect(Number.isFinite(report.throughput.propagateOpsPerSec)).toBe(true);

    // The report is the Stage-P baseline record: JSON-serializable, stable
    // field names, no live handles leaked into it.
    expect(() => JSON.stringify(report)).not.toThrow();
    for (const sample of Object.values(report.memory)) {
      expect(typeof sample.rss).toBe("number");
      expect(typeof sample.heapUsed).toBe("number");
    }
  }, 60_000);

  // Manual Stage-P profile: 500 ops (documentCount x opsPerDocument), the
  // order of magnitude the plan's Stage-P chapter sizes its memory/DB-size/
  // speed axes against. Left `describe.skip`'d because it is sized for a
  // deliberate profiling run (watch memory/dbQuery results by hand, maybe
  // against `storage: { kind: "path" }` reactors passed via `options.reactors`
  // for realistic durability costs), not for every `pnpm test`. Un-skip and
  // run directly (`pnpm vitest run test/load-harness.test.ts -t "Stage-P"`)
  // to record a baseline.
  describe.skip("Stage-P manual profile", () => {
    it("500-op in-process profile", async () => {
      const report = await runLocalSyncLoad({
        documentCount: 50,
        opsPerDocument: 10,
        payloadSize: 256,
        createChannel: nodeChannel,
      });
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(report, null, 2));
      expect(report.totalOps).toBe(500);
    }, 120_000);
  });
});
