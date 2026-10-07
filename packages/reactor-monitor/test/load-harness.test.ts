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

    // Every phase measured something; the end-to-end clock (generation start
    // to B holding every op) can never run shorter than generation itself,
    // and the residual tail left over after generation is never negative.
    expect(report.durationsMs.setupMs).toBeGreaterThan(0);
    expect(report.durationsMs.generateMs).toBeGreaterThan(0);
    expect(report.durationsMs.endToEndMs).toBeGreaterThanOrEqual(
      report.durationsMs.generateMs,
    );
    expect(report.durationsMs.residualTailMs).toBeGreaterThanOrEqual(0);
    // At least one op reached B strictly before the last one did -- the
    // first-op arrival is measured, not just the end-to-end total.
    expect(report.durationsMs.firstOpArrivedAtBMs).toBeGreaterThan(0);
    expect(report.durationsMs.firstOpArrivedAtBMs).toBeLessThanOrEqual(
      report.durationsMs.endToEndMs,
    );
    expect(report.durationsMs.totalMs).toBeCloseTo(
      report.durationsMs.setupMs + report.durationsMs.endToEndMs,
      5,
    );

    expect(report.throughput.createOpsPerSec).toBeGreaterThan(0);
    expect(Number.isFinite(report.throughput.createOpsPerSec)).toBe(true);
    expect(report.throughput.e2eOpsPerSec).toBeGreaterThan(0);
    expect(Number.isFinite(report.throughput.e2eOpsPerSec)).toBe(true);

    // The report is the Stage-P baseline record: JSON-serializable, stable
    // field names, no live handles leaked into it.
    expect(() => JSON.stringify(report)).not.toThrow();
    // In-process/node, so every sample is a real process.memoryUsage()
    // snapshot, not the browser-side undefined fallback.
    for (const sample of Object.values(report.memory)) {
      expect(typeof sample?.rss).toBe("number");
      expect(typeof sample?.heapUsed).toBe("number");
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
