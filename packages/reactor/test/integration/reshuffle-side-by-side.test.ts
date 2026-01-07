import {
  MemoryStorage,
  driveDocumentModelModule,
} from "document-drive";
import type { DocumentModelDocument, DocumentModelModule, Operation } from "document-model";
import {
  documentModelDocumentModelModule,
  setModelName,
} from "document-model";
import {
  reshuffleByTimestamp as baseServerReshuffle,
} from "document-model/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReactorBuilder, type IReactor } from "../../src/index.js";
import { JobStatus, type ConsistencyToken } from "../../src/shared/types.js";
import {
  reshuffleByTimestampAndIndex as reactorReshuffle,
} from "../../src/utils/reshuffle.js";
import { createDocModelDocument } from "../factories.js";

/**
 * Side-by-side comparison of reshuffle behavior between:
 * 1. Base-server function (reshuffleByTimestamp from document-model/core)
 * 2. New Reactor function (reshuffleByTimestampAndIndex from reactor/utils)
 *
 * Test Scenario:
 * 1. A executes setModelName("A1") at T1
 * 2. B executes setModelName("B1") at T2 (T2 > T1, so later)
 * 3. B loads A's operation (triggers reshuffle)
 *
 * Expected behavior (both should match):
 * - 2 operations after reshuffle: A@1(skip=1), B@2
 * - Final order by timestamp: A1, B1
 */
describe("Reshuffle Side-by-Side Comparison", () => {
  const T1 = "2026-01-01T00:00:01.000Z"; // A's timestamp (earlier)
  const T2 = "2026-01-01T00:00:02.000Z"; // B's timestamp (later)

  // Create mock operations
  const opA1: Operation = {
    index: 0,
    skip: 0,
    hash: "hash-a1",
    timestampUtcMs: T1,
    id: "op-a1",
    action: {
      id: "action-a1",
      type: "SET_MODEL_NAME",
      input: { name: "A1" },
      scope: "global",
      timestampUtcMs: T1,
    },
  };

  const opB1: Operation = {
    index: 0,
    skip: 0,
    hash: "hash-b1",
    timestampUtcMs: T2,
    id: "op-b1",
    action: {
      id: "action-b1",
      type: "SET_MODEL_NAME",
      input: { name: "B1" },
      scope: "global",
      timestampUtcMs: T2,
    },
  };

  it("compares reshuffle functions directly", () => {
    // Scenario: B has opB1 at index 0, then receives opA1 from A
    // Since A1 has earlier timestamp (T1 < T2), we need to reshuffle

    // B's existing operations (just B1 at index 0)
    const existingOps = [opB1];

    // Incoming operations from A (A1 at index 0)
    const incomingOps = [opA1];

    // Start index for reshuffle: we need to insert at index 1 and skip 1 operation
    const startIndex = { index: 1, skip: 1 };

    console.log("\n=== INPUT ===");
    console.log("Existing ops (B's):", existingOps.map(op => `${(op.action.input as any).name}@${op.index} (${op.timestampUtcMs})`));
    console.log("Incoming ops (A's):", incomingOps.map(op => `${(op.action.input as any).name}@${op.index} (${op.timestampUtcMs})`));
    console.log("Start index:", startIndex);

    // Run base-server reshuffle (sorts by timestamp only)
    const baseServerResult = baseServerReshuffle(startIndex, existingOps, incomingOps);

    console.log("\n=== BASE-SERVER RESHUFFLE (reshuffleByTimestamp) ===");
    for (const op of baseServerResult) {
      console.log(`  index=${op.index}, skip=${op.skip}, input="${(op.action.input as any).name}", timestamp=${op.timestampUtcMs}`);
    }

    // Run reactor reshuffle (sorts by timestamp, then by index)
    const reactorResult = reactorReshuffle(startIndex, existingOps, incomingOps);

    console.log("\n=== REACTOR RESHUFFLE (reshuffleByTimestampAndIndex) ===");
    for (const op of reactorResult) {
      console.log(`  index=${op.index}, skip=${op.skip}, input="${(op.action.input as any).name}", timestamp=${op.timestampUtcMs}`);
    }

    console.log("\n=== COMPARISON ===");
    console.log(`Base-server result count: ${baseServerResult.length}`);
    console.log(`Reactor result count: ${reactorResult.length}`);

    // Both should produce 2 operations
    expect(baseServerResult.length).toBe(2);
    expect(reactorResult.length).toBe(2);

    // First operation should be A1 (earlier timestamp)
    expect((baseServerResult[0].action.input as any).name).toBe("A1");
    expect((reactorResult[0].action.input as any).name).toBe("A1");
    expect(baseServerResult[0].index).toBe(1);
    expect(reactorResult[0].index).toBe(1);
    expect(baseServerResult[0].skip).toBe(1);
    expect(reactorResult[0].skip).toBe(1);

    // Second operation should be B1 (later timestamp)
    expect((baseServerResult[1].action.input as any).name).toBe("B1");
    expect((reactorResult[1].action.input as any).name).toBe("B1");
    expect(baseServerResult[1].index).toBe(2);
    expect(reactorResult[1].index).toBe(2);
    expect(baseServerResult[1].skip).toBe(0);
    expect(reactorResult[1].skip).toBe(0);

    // Results should be identical
    expect(reactorResult).toEqual(baseServerResult);
  });

  it("shows difference when timestamps are equal but indices differ", () => {
    // This is where the two functions should differ:
    // reshuffleByTimestamp: sorts ONLY by timestamp
    // reshuffleByTimestampAndIndex: sorts by timestamp THEN by index

    const sameTimestamp = "2026-01-01T00:00:01.000Z";

    const opA: Operation = {
      index: 2, // Higher index
      skip: 0,
      hash: "hash-a",
      timestampUtcMs: sameTimestamp,
      id: "op-a",
      action: {
        id: "action-a",
        type: "SET_MODEL_NAME",
        input: { name: "A" },
        scope: "global",
        timestampUtcMs: sameTimestamp,
      },
    };

    const opB: Operation = {
      index: 3, // Lower index
      skip: 0,
      hash: "hash-b",
      timestampUtcMs: sameTimestamp,
      id: "op-b",
      action: {
        id: "action-b",
        type: "SET_MODEL_NAME",
        input: { name: "B" },
        scope: "global",
        timestampUtcMs: sameTimestamp,
      },
    };

    const startIndex = { index: 4, skip: 2 };

    console.log("\n=== EQUAL TIMESTAMP TEST ===");
    console.log("Both ops have timestamp:", sameTimestamp);
    console.log("Op A original index:", opA.index);
    console.log("Op B original index:", opB.index);

    const baseServerResult = baseServerReshuffle(startIndex, [opA], [opB]);
    const reactorResult = reactorReshuffle(startIndex, [opA], [opB]);

    console.log("\n=== BASE-SERVER RESHUFFLE ===");
    for (const op of baseServerResult) {
      console.log(`  index=${op.index}, skip=${op.skip}, input="${(op.action.input as any).name}", originalIndex=${op.action.input === opA.action.input ? opA.index : opB.index}`);
    }

    console.log("\n=== REACTOR RESHUFFLE ===");
    for (const op of reactorResult) {
      console.log(`  index=${op.index}, skip=${op.skip}, input="${(op.action.input as any).name}", originalIndex=${op.action.input === opA.action.input ? opA.index : opB.index}`);
    }

    // Both produce 2 operations
    expect(baseServerResult.length).toBe(2);
    expect(reactorResult.length).toBe(2);

    // With equal timestamps:
    // - reshuffleByTimestamp: order is non-deterministic (depends on input order)
    // - reshuffleByTimestampAndIndex: orders by original index (A first since index 2 < 3)

    // The reactor version should sort by index when timestamps are equal
    // So A (index 2) should come before B (index 3)
    expect((reactorResult[0].action.input as any).name).toBe("A");
    expect((reactorResult[1].action.input as any).name).toBe("B");
  });
});

describe("Reshuffle End-to-End via Reactor", () => {
  const documentModels = [
    documentModelDocumentModelModule,
    driveDocumentModelModule,
  ] as DocumentModelModule<any>[];

  let reactor: IReactor;

  const T1 = "2026-01-01T00:00:01.000Z"; // A's timestamp (earlier)
  const T2 = "2026-01-01T00:00:02.000Z"; // B's timestamp (later)

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    reactor = await new ReactorBuilder()
      .withDocumentModels(documentModels as any)
      .withFeatures({ legacyStorageEnabled: false })
      .withLegacyStorage(new MemoryStorage())
      .build();
  });

  afterEach(() => {
    reactor.kill();
    vi.useRealTimers();
  });

  it("should produce 3 operations after loading concurrent operation", async () => {
    const document = createDocModelDocument({
      id: "reshuffle-test-doc",
      slug: "reshuffle-test-doc",
    });

    // Create document
    const createInfo = await reactor.create(document);
    await waitForJobCompletion(reactor, createInfo.id);

    // Execute B1 at T2 (later timestamp)
    vi.setSystemTime(new Date(T2));
    const mutateJobB = await reactor.execute(document.header.id, "main", [
      { ...setModelName({ name: "B1" }), timestampUtcMs: T2 },
    ]);
    await waitForJobCompletion(reactor, mutateJobB.id);

    const opsBefore = await reactor.getOperations(document.header.id, {
      branch: "main",
      scopes: ["global"],
    });

    console.log("\n=== Operations BEFORE loading A1 ===");
    for (const op of opsBefore.global.results) {
      console.log(`  index=${op.index}, skip=${op.skip}, action=${op.action.type}, input="${(op.action.input as any)?.name}"`);
    }

    expect(opsBefore.global.results.length).toBe(1);

    // Load A1 at T1 (earlier timestamp) - should trigger reshuffle
    const opA1: Operation = {
      index: 0,
      skip: 0,
      hash: "hash-a1",
      timestampUtcMs: T1,
      id: "op-a1-load",
      action: {
        id: "action-a1-load",
        type: "SET_MODEL_NAME",
        input: { name: "A1" },
        scope: "global",
        timestampUtcMs: T1,
      },
    };

    const loadJob = await reactor.load(document.header.id, "main", [opA1]);
    await waitForJobCompletion(reactor, loadJob.id);

    const opsAfter = await reactor.getOperations(document.header.id, {
      branch: "main",
      scopes: ["global"],
    });

    console.log("\n=== Operations AFTER loading A1 ===");
    for (const op of opsAfter.global.results) {
      console.log(`  index=${op.index}, skip=${op.skip}, action=${op.action.type}, input="${(op.action.input as any)?.name}", timestamp=${op.timestampUtcMs}`);
    }

    const finalDoc = await reactor.get<DocumentModelDocument>(document.header.id, { branch: "main" });
    console.log(`Final state name: "${finalDoc.document.state.global.name}"`);

    // EXPECTED BASE-SERVER BEHAVIOR:
    // - 3 operations: B1@0, A1@1(skip=1), B1@2
    // - Final state: "B1"
    expect(opsAfter.global.results.length).toBe(3);

    // Op 0: Original B1 (unchanged)
    expect(opsAfter.global.results[0].index).toBe(0);
    expect(opsAfter.global.results[0].skip).toBe(0);
    expect((opsAfter.global.results[0].action.input as any).name).toBe("B1");

    // Op 1: A1 with skip=1
    expect(opsAfter.global.results[1].index).toBe(1);
    expect(opsAfter.global.results[1].skip).toBe(1);
    expect((opsAfter.global.results[1].action.input as any).name).toBe("A1");

    // Op 2: B1 re-applied
    expect(opsAfter.global.results[2].index).toBe(2);
    expect(opsAfter.global.results[2].skip).toBe(0);
    expect((opsAfter.global.results[2].action.input as any).name).toBe("B1");

    // Final state should be B1
    expect(finalDoc.document.state.global.name).toBe("B1");
  });
});

async function waitForJobCompletion(
  reactor: IReactor,
  jobId: string,
): Promise<ConsistencyToken> {
  await vi.waitUntil(
    async () => {
      await vi.advanceTimersToNextTimerAsync();
      const status = await reactor.getJobStatus(jobId);
      if (status.status === JobStatus.FAILED) {
        throw new Error(status.error?.message || "Job failed");
      }
      return status.status === JobStatus.READ_MODELS_READY;
    },
    { timeout: 10000 },
  );

  const status = await reactor.getJobStatus(jobId);
  return status.consistencyToken;
}
