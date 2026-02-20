import {
  baseCreateDocument,
  garbageCollectDocumentOperations,
  mapSkippedOperations,
  replayOperations,
} from "document-model/core";
import type { CountPHState, TestPHState } from "document-model/test";
import {
  baseCountReducer,
  countReducer,
  createCountDocumentState,
  defaultPHDocumentCreateState,
  error,
  fakeOperation,
  increment,
  mapOperations,
  testCreateBaseState,
  wrappedEmptyReducer,
} from "document-model/test";
import { describe } from "vitest";
import { setName } from "document-model";

describe("skip operations", () => {
  describe("skip operation param", () => {
    it("should include skip param in base operations with default value to 0 if not provided", () => {
      let document = baseCreateDocument<TestPHState>(
        defaultPHDocumentCreateState,
      );
      document = wrappedEmptyReducer(document, setName("TEST_1"));
      document = wrappedEmptyReducer(document, setName("TEST_2"));
      document = wrappedEmptyReducer(document, setName("TEST_3"));

      expect(document.header.revision.global).toBe(3);

      const ops = mapOperations(document.operations.global!);

      expect(ops.length).toBe(3);

      ops.forEach((op) => {
        expect(op).toHaveProperty("skip", 0);
      });
    });

    it("should include skip param in base operations with provided value", () => {
      let document = baseCreateDocument<TestPHState>(
        defaultPHDocumentCreateState,
      );
      document = wrappedEmptyReducer(document, setName("TEST_1"), undefined, {
        skip: 1,
        ignoreSkipOperations: true,
      });
      document = wrappedEmptyReducer(document, setName("TEST_2"), undefined, {
        skip: 2,
        ignoreSkipOperations: true,
      });
      document = wrappedEmptyReducer(document, setName("TEST_3"), undefined, {
        skip: 3,
        ignoreSkipOperations: true,
      });

      expect(document.header.revision.global).toBe(3);

      const ops = mapOperations(document.operations.global!);

      expect(ops.length).toBe(3);

      ops.forEach((op, index) => {
        expect(op).toHaveProperty("skip", index + 1);
      });
    });
  });

  describe("mapSkippedOperations", () => {
    it('should tag as "ignored" operation 2 when operation 3 -> (skip=1)', () => {
      const operations = [
        fakeOperation(1),
        fakeOperation(2),
        fakeOperation(3, 1),
      ];

      const ignoredIndexes = [2];

      const mappedOps = mapSkippedOperations(operations);
      expect(mappedOps.length).toBe(3);
      mappedOps.forEach((mapOp) => {
        let ignore = false;
        if (ignoredIndexes.includes(mapOp.operation.index)) {
          ignore = true;
        }

        expect(mapOp).toHaveProperty("ignore", ignore);
      });
    });

    it('should tag as "ignored" operation 2, 3 and 4 when operation 5 -> (skip=3)', () => {
      const operations = [
        fakeOperation(1),
        fakeOperation(2),
        fakeOperation(3),
        fakeOperation(4),
        fakeOperation(5, 3),
      ];

      const ignoredIndexes = [2, 3, 4];

      const mappedOps = mapSkippedOperations(operations);
      expect(mappedOps.length).toBe(5);
      mappedOps.forEach((mapOp) => {
        let ignore = false;
        if (ignoredIndexes.includes(mapOp.operation.index)) {
          ignore = true;
        }

        expect(mapOp).toHaveProperty("ignore", ignore);
      });
    });

    it('should tag as "ignored" operation 2 and 5 when opration 3 -> (skip=1) and operation 6 -> (skip=1)', () => {
      const operations = [
        fakeOperation(1),
        fakeOperation(2),
        fakeOperation(3, 1),
        fakeOperation(4),
        fakeOperation(5),
        fakeOperation(6, 1),
      ];

      const ignoredIndexes = [2, 5];

      const mappedOps = mapSkippedOperations(operations);
      expect(mappedOps.length).toBe(6);
      mappedOps.forEach((mapOp) => {
        let ignore = false;
        if (ignoredIndexes.includes(mapOp.operation.index)) {
          ignore = true;
        }

        expect(mapOp).toHaveProperty("ignore", ignore);
      });
    });

    it('should tag as "ignored" operation 1, 2, 3, 4, 5 and 6 when opration 7 -> (skip=6)', () => {
      const operations = [
        fakeOperation(1),
        fakeOperation(2),
        fakeOperation(3),
        fakeOperation(4),
        fakeOperation(5),
        fakeOperation(6),
        fakeOperation(7, 6),
      ];

      const ignoredIndexes = [1, 2, 3, 4, 5, 6];

      const mappedOps = mapSkippedOperations(operations);
      expect(mappedOps.length).toBe(7);
      mappedOps.forEach((mapOp) => {
        let ignore = false;
        if (ignoredIndexes.includes(mapOp.operation.index)) {
          ignore = true;
        }

        expect(mapOp).toHaveProperty("ignore", ignore);
      });
    });

    it('should tag as "ignored" operation 2, 3, and 4 when operation 5 -> (skip=2) and operation 3 -> (skip=1)', () => {
      const operations = [
        fakeOperation(1),
        fakeOperation(2),
        fakeOperation(3, 1),
        fakeOperation(4),
        fakeOperation(5, 2),
      ];

      const ignoredIndexes = [2, 3, 4];

      const mappedOps = mapSkippedOperations(operations);
      expect(mappedOps.length).toBe(5);
      mappedOps.forEach((mapOp) => {
        let ignore = false;
        if (ignoredIndexes.includes(mapOp.operation.index)) {
          ignore = true;
        }

        expect(mapOp).toHaveProperty("ignore", ignore);
      });
    });

    it('should tag as "ignored" operations 3, 4, 5, 6, and 7 when operation 6 -> (skip=1) and operation 8 -> (skip=5)', () => {
      const operations = [
        fakeOperation(1),
        fakeOperation(2),
        fakeOperation(3),
        fakeOperation(4),
        fakeOperation(5),
        fakeOperation(6, 1),
        fakeOperation(7),
        fakeOperation(8, 5),
      ];

      const ignoredIndexes = [3, 4, 5, 6, 7];

      const mappedOps = mapSkippedOperations(operations);
      expect(mappedOps.length).toBe(8);
      mappedOps.forEach((mapOp) => {
        let ignore = false;
        if (ignoredIndexes.includes(mapOp.operation.index)) {
          ignore = true;
        }

        expect(mapOp).toHaveProperty("ignore", ignore);
      });
    });

    it('should tag all the previous operations as "ignored" when operation 5 -> (skip=4)', () => {
      const operations = [
        fakeOperation(1),
        fakeOperation(2),
        fakeOperation(3),
        fakeOperation(4),
        fakeOperation(5, 4),
      ];

      const ignoredIndexes = [1, 2, 3, 4];

      const mappedOps = mapSkippedOperations(operations);
      expect(mappedOps.length).toBe(5);
      mappedOps.forEach((mapOp) => {
        let ignore = false;
        if (ignoredIndexes.includes(mapOp.operation.index)) {
          ignore = true;
        }

        expect(mapOp).toHaveProperty("ignore", ignore);
      });
    });

    it("should not skip operations if there's not skipped operations and skippedHeadOperations is not provided", () => {
      const operations = [fakeOperation(1), fakeOperation(2), fakeOperation(3)];

      const mappedOps = mapSkippedOperations(operations);
      expect(mappedOps.length).toBe(3);
      mappedOps.forEach((mapOp) => {
        expect(mapOp).toHaveProperty("ignore", false);
      });
    });

    it("should skip the latest operation when skippedHeadOperations = 1", () => {
      const operations = [fakeOperation(1), fakeOperation(2), fakeOperation(3)];

      const ignoredIndexes = [3];

      const mappedOps = mapSkippedOperations(operations, 1);
      expect(mappedOps.length).toBe(3);
      mappedOps.forEach((mapOp) => {
        let ignore = false;
        if (ignoredIndexes.includes(mapOp.operation.index)) {
          ignore = true;
        }

        expect(mapOp).toHaveProperty("ignore", ignore);
      });
    });

    it("should skip the latest 2 operations when skippedHeadOperations = 2", () => {
      const operations = [
        fakeOperation(1),
        fakeOperation(2),
        fakeOperation(3),
        fakeOperation(4),
        fakeOperation(5),
      ];

      const ignoredIndexes = [4, 5];

      const mappedOps = mapSkippedOperations(operations, 2);
      expect(mappedOps.length).toBe(5);
      mappedOps.forEach((mapOp) => {
        let ignore = false;
        if (ignoredIndexes.includes(mapOp.operation.index)) {
          ignore = true;
        }

        expect(mapOp).toHaveProperty("ignore", ignore);
      });
    });

    it("should be able to detect cleared operations", () => {
      const operations = [
        fakeOperation(0),
        fakeOperation(1),
        fakeOperation(3, 1),
      ];

      const mappedOps = mapSkippedOperations(operations);
      expect(mappedOps.length).toBe(3);
      mappedOps.forEach((mapOp) => {
        expect(mapOp).toHaveProperty("ignore", false);
      });
    });
  });

  describe("replayOperations", () => {
    it("should ignore operation 2, when operation 3 -> (skip=1)", () => {
      const initialState = testCreateBaseState({ count: 0 }, { name: "" });

      let document = baseCreateDocument<CountPHState>(
        createCountDocumentState,
        initialState,
      );

      document = countReducer(document, increment()); // valid operation, skip 0
      document = countReducer(document, increment()); // skipped

      document = countReducer(
        // valid operation, skip 1
        document,
        increment(),
        undefined,
        { skip: 1, ignoreSkipOperations: false },
      );

      const clearedOperations = garbageCollectDocumentOperations(
        document.operations,
      );

      const replayedDoc = replayOperations<CountPHState>(
        initialState,
        clearedOperations,
        baseCountReducer,
        document.header,
      );

      expect(replayedDoc.header.revision.global).toBe(3);

      expect(replayedDoc.operations.global!.length).toBe(2);
      expect(replayedDoc.operations.global!).toMatchObject([
        {
          type: "INCREMENT",
          skip: 0,
          index: 0,
        },
        {
          type: "INCREMENT",
          skip: 1,
          index: 2,
        },
      ]);
    });

    it("should ignore operation 2, 3 and 4, when operation 5 -> (skip=3)", () => {
      const initialState = testCreateBaseState({ count: 0 }, { name: "" });

      let document = baseCreateDocument<CountPHState>(
        createCountDocumentState,
        initialState,
      );

      document = countReducer(document, increment()); // valid operation, skip 0
      document = countReducer(document, increment()); // skipped
      document = countReducer(document, increment()); // skipped
      document = countReducer(document, increment()); // skipped
      document = countReducer(
        // valid operation, skip 3
        document,
        increment(),
        undefined,
        { skip: 3, ignoreSkipOperations: true },
      );

      const clearedOperations = garbageCollectDocumentOperations(
        document.operations,
      );

      const replayedDoc = replayOperations<CountPHState>(
        initialState,
        clearedOperations,
        baseCountReducer,
        document.header,
      );

      expect(replayedDoc.header.revision.global).toBe(5);

      expect(replayedDoc.operations.global!.length).toBe(2);
      expect(replayedDoc.operations.global!).toMatchObject([
        {
          type: "INCREMENT",
          skip: 0,
          index: 0,
        },
        {
          type: "INCREMENT",
          skip: 3,
          index: 4,
        },
      ]);
    });

    it("should ignore operation 2 and 5, when operation 3 -> (skip=1) and operation 6 -> (skip=1)", () => {
      const initialState = testCreateBaseState({ count: 0 }, { name: "" });

      let document = baseCreateDocument<CountPHState>(
        createCountDocumentState,
        initialState,
      );

      document = countReducer(document, increment()); // valid operation, skip 0
      document = countReducer(document, increment()); // skipped
      document = countReducer(
        // valid operation, skip 1
        document,
        increment(),
        undefined,
        { skip: 1, ignoreSkipOperations: true },
      );
      document = countReducer(document, increment()); // valid operation, skip 0
      document = countReducer(document, increment()); // skipped
      document = countReducer(
        // valid operation, skip 1
        document,
        increment(),
        undefined,
        { skip: 1, ignoreSkipOperations: true },
      );

      const clearedOperations = garbageCollectDocumentOperations(
        document.operations,
      );

      const replayedDoc = replayOperations<CountPHState>(
        initialState,
        clearedOperations,
        baseCountReducer,
        document.header,
      );

      expect(replayedDoc.header.revision.global).toBe(6);

      expect(replayedDoc.operations.global!.length).toBe(4);

      expect(replayedDoc.operations.global!).toMatchObject([
        {
          type: "INCREMENT",
          skip: 0,
          index: 0,
        },
        {
          type: "INCREMENT",
          skip: 1,
          index: 2,
        },
        {
          type: "INCREMENT",
          skip: 0,
          index: 3,
        },
        {
          type: "INCREMENT",
          skip: 1,
          index: 5,
        },
      ]);
    });

    it("should ignore all the previous operations, when operation 5 -> (skip=4)", () => {
      const initialState = testCreateBaseState({ count: 0 }, { name: "" });

      let document = baseCreateDocument<CountPHState>(
        createCountDocumentState,
        initialState,
      );

      document = countReducer(document, increment()); // skipped
      document = countReducer(document, increment()); // skipped
      document = countReducer(document, increment()); // skipped
      document = countReducer(document, increment()); // skipped
      document = countReducer(
        // valid operation, skip 4
        document,
        increment(),
        undefined,
        { skip: 4, ignoreSkipOperations: true },
      );

      const clearedOperations = garbageCollectDocumentOperations(
        document.operations,
      );

      const replayedDoc = replayOperations<CountPHState>(
        initialState,
        clearedOperations,
        baseCountReducer,
        document.header,
      );

      expect(replayedDoc.header.revision.global).toBe(5);

      expect(replayedDoc.operations.global!.length).toBe(1);

      expect(replayedDoc.operations.global!).toMatchObject([
        {
          type: "INCREMENT",
          skip: 4,
          index: 4,
        },
      ]);
    });

    it("should skip operations when dispatch a new action with an skip value", () => {
      const initialState = testCreateBaseState({ count: 0 }, { name: "" });

      let document = baseCreateDocument<CountPHState>(
        createCountDocumentState,
        initialState,
      );

      document = countReducer(document, increment());
      document = countReducer(document, increment());
      document = countReducer(document, increment(), undefined, {
        skip: 1,
      });
      document = countReducer(document, increment());
      document = countReducer(document, increment(), undefined, {
        skip: 1,
      });

      expect(document.state.global.count).toBe(3);
      expect(document.operations.global!.length).toBe(3);

      expect(document.operations.global!).toMatchObject([
        {
          type: "INCREMENT",
          skip: 0,
          index: 0,
        },
        {
          type: "INCREMENT",
          skip: 1,
          index: 2,
        },
        {
          type: "INCREMENT",
          skip: 1,
          index: 4,
        },
      ]);
    });

    it("should handle compounded GC across multiple skip operations", () => {
      const initialState = testCreateBaseState({ count: 0 }, { name: "" });

      let document = baseCreateDocument<CountPHState>(
        createCountDocumentState,
        initialState,
      );

      // Phase 1: Build 6 operations (indices 0-5)
      document = countReducer(document, increment()); // index 0
      document = countReducer(document, increment()); // index 1
      document = countReducer(document, increment()); // index 2
      document = countReducer(document, increment()); // index 3
      document = countReducer(document, increment()); // index 4
      document = countReducer(document, increment()); // index 5

      expect(document.operations.global!.length).toBe(6);

      // Phase 2: skip=4 → GC removes ops 2-5, doc = [op0, op1, op6(6,4)]
      document = countReducer(document, increment(), undefined, {
        skip: 4,
      });

      expect(document.operations.global!.length).toBe(3);
      expect(document.operations.global!).toMatchObject([
        { index: 0, skip: 0 },
        { index: 1, skip: 0 },
        { index: 6, skip: 4 },
      ]);

      // Phase 3: skip=1 → GC removes op6, doc = [op0, op1, op7(7,1)]
      document = countReducer(document, increment(), undefined, {
        skip: 1,
      });

      expect(document.operations.global!.length).toBe(3);
      expect(document.operations.global!).toMatchObject([
        { index: 0, skip: 0 },
        { index: 1, skip: 0 },
        { index: 7, skip: 1 },
      ]);

      // Phase 4: Two regular ops (skip=0)
      document = countReducer(document, increment()); // index 8
      document = countReducer(document, increment()); // index 9

      expect(document.operations.global!.length).toBe(5);

      // Phase 5: skip=2 → processSkipOperation replays [op0, op1, op7(7,1)]
      // Before the fix, this threw:
      //   "Missing operations: expected 2 with skip 0 or equivalent, got index 7 with skip 1"
      // because op7's skip=1 was set to bridge from op6 (now removed), not from op1.
      document = countReducer(document, increment(), undefined, {
        skip: 2,
      });

      expect(document.operations.global!.length).toBe(4);
      expect(document.operations.global!).toMatchObject([
        { index: 0, skip: 0 },
        { index: 1, skip: 0 },
        { index: 7, skip: 1 },
        { index: 10, skip: 2 },
      ]);
      expect(document.state.global.count).toBe(4);
    });

    it("should not throw when replaying GC'd operations with index gaps from prior GC passes", () => {
      // This test directly exercises the bug: replayOperations on operations
      // that survived multiple GC passes where skip values no longer bridge
      // the index gaps.
      const initialState = testCreateBaseState({ count: 0 }, { name: "" });

      let document = baseCreateDocument<CountPHState>(
        createCountDocumentState,
        initialState,
      );

      // Build operations, applying skip to trigger GC
      document = countReducer(document, increment()); // index 0, skip 0
      document = countReducer(document, increment()); // index 1, skip 0
      document = countReducer(document, increment()); // index 2, skip 0
      document = countReducer(document, increment()); // index 3, skip 0
      document = countReducer(document, increment()); // index 4, skip 0
      document = countReducer(document, increment()); // index 5, skip 0

      // skip=4 → GC to [op0, op1, op6(6,4)]
      document = countReducer(document, increment(), undefined, { skip: 4 });
      // skip=1 → GC to [op0, op1, op7(7,1)]
      document = countReducer(document, increment(), undefined, { skip: 1 });

      // Now doc has [op0(0,0), op1(1,0), op7(7,1)]
      // op7's skip=1 was intended to bridge from op6 (index 5 via skipUntil=5),
      // but op6 was removed by the second GC. So there's a gap from index 1 to
      // index 7 that skip=1 doesn't cover: 7-1=6 > 1+1=2.
      const gcOps = garbageCollectDocumentOperations(document.operations);
      expect(gcOps.global!.length).toBe(3);

      // Without skipIndexValidation, replayOperations throws because op7's
      // skip=1 doesn't bridge the gap from op1 (index 1) to op7 (index 7):
      //   7-1=6 > nextIndex=2
      expect(() =>
        replayOperations<CountPHState>(
          initialState,
          gcOps,
          baseCountReducer,
          document.header,
        ),
      ).toThrow(
        "Missing operations: expected 2 with skip 0 or equivalent, got index 7 with skip 1",
      );

      // With skipIndexValidation: true, it succeeds
      const replayedDoc = replayOperations<CountPHState>(
        initialState,
        gcOps,
        baseCountReducer,
        document.header,
        undefined,
        undefined,
        {},
        { skipIndexValidation: true },
      );

      expect(replayedDoc.state.global.count).toBe(3);
      expect(replayedDoc.operations.global!.length).toBe(3);
    });

    it("should not process and skip operation that throws an error", () => {
      const initialState = testCreateBaseState({ count: 0 }, { name: "" });

      let document = baseCreateDocument<CountPHState>(
        createCountDocumentState,
        initialState,
      );

      document = countReducer(document, increment());
      document = countReducer(document, increment());
      document = countReducer(document, error(), undefined, {
        skip: 1,
      });

      expect(document.state.global.count).toBe(2);
      expect(document.operations.global!.length).toBe(3);

      expect(document.operations.global!).toMatchObject([
        {
          type: "INCREMENT",
          skip: 0,
          index: 0,
          error: undefined,
        },
        {
          type: "INCREMENT",
          skip: 0,
          index: 1,
          error: undefined,
        },
        {
          type: "ERROR",
          skip: 0,
          index: 2,
          error: "Error action",
        },
      ]);
    });
  });
});
