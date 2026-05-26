import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import { describe, expect, it, vi } from "vitest";
import { EventBus } from "../../src/events/event-bus.js";
import {
  ReactorEventTypes,
  type JobReadReadyEvent,
} from "../../src/events/types.js";
import { ReadModelCoordinator } from "../../src/read-models/coordinator.js";
import type { IReadModel } from "../../src/read-models/interfaces.js";

describe("ReadModelCoordinator", () => {
  const createMockOperations = (
    overrides: Partial<OperationWithContext["context"]> = {},
  ): OperationWithContext[] => {
    return [
      {
        operation: {
          index: 0,
          skip: 0,
          hash: "hash1",
          timestampUtcMs: "2024-01-01T00:00:00.000Z",
          action: {
            id: "action1",
            type: "SET_NAME",
            scope: "global",
            timestampUtcMs: "2024-01-01T00:00:00.000Z",
            input: { name: "test" },
          },
          id: "op1",
          resultingState: JSON.stringify({ state: "test" }),
        },
        context: {
          documentId: "doc1",
          documentType: "test",
          scope: "global",
          branch: "main",
          ordinal: 1,
          ...overrides,
        },
      },
    ];
  };

  const createMockReadModel = (name = "mock-read-model"): IReadModel => {
    return {
      name,
      indexOperations: vi.fn().mockResolvedValue(undefined),
    };
  };

  describe("OPERATIONS_READY event", () => {
    it("should emit OPERATIONS_READY after all read models complete indexing", async () => {
      const eventBus = new EventBus();
      const readModel1 = createMockReadModel();
      const readModel2 = createMockReadModel();
      const coordinator = new ReadModelCoordinator(
        eventBus,
        [readModel1, readModel2],
        [],
      );

      const readyEvents: JobReadReadyEvent[] = [];
      eventBus.subscribe(
        ReactorEventTypes.JOB_READ_READY,
        (type, event: JobReadReadyEvent) => {
          readyEvents.push(event);
        },
      );

      coordinator.start();

      const operations = createMockOperations();
      await eventBus.emit(ReactorEventTypes.JOB_WRITE_READY, {
        operations,
      });
      await coordinator.drain();

      expect(readyEvents).toHaveLength(1);
      expect(readyEvents[0].operations).toEqual(operations);
      expect(readModel1.indexOperations).toHaveBeenCalledWith(operations);
      expect(readModel2.indexOperations).toHaveBeenCalledWith(operations);
    });

    it("should emit OPERATIONS_READY with correct payload", async () => {
      const eventBus = new EventBus();
      const readModel = createMockReadModel();
      const coordinator = new ReadModelCoordinator(eventBus, [readModel], []);

      let readyEvent: JobReadReadyEvent | null = null;
      eventBus.subscribe(
        ReactorEventTypes.JOB_READ_READY,
        (type, event: JobReadReadyEvent) => {
          readyEvent = event;
        },
      );

      coordinator.start();

      const operations = createMockOperations();
      await eventBus.emit(ReactorEventTypes.JOB_WRITE_READY, {
        operations,
      });
      await coordinator.drain();

      expect(readyEvent).not.toBeNull();
      expect(readyEvent!.operations).toHaveLength(1);
      expect(readyEvent!.operations[0].context.documentId).toBe("doc1");
      expect(readyEvent!.operations[0].context.scope).toBe("global");
      expect(readyEvent!.operations[0].context.branch).toBe("main");
    });

    it("should emit OPERATIONS_READY after read models finish, not before", async () => {
      const eventBus = new EventBus();
      const readModel = createMockReadModel();

      let indexingComplete = false;
      readModel.indexOperations = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        indexingComplete = true;
      });

      const coordinator = new ReadModelCoordinator(eventBus, [readModel], []);

      let readyFired = false;
      eventBus.subscribe(ReactorEventTypes.JOB_READ_READY, () => {
        readyFired = true;
        expect(indexingComplete).toBe(true);
      });

      coordinator.start();

      const operations = createMockOperations();
      await eventBus.emit(ReactorEventTypes.JOB_WRITE_READY, {
        operations,
      });
      await coordinator.drain();

      expect(readyFired).toBe(true);
      expect(indexingComplete).toBe(true);
    });

    it("should handle multiple read models completing in parallel", async () => {
      const eventBus = new EventBus();
      const readModel1 = createMockReadModel();
      const readModel2 = createMockReadModel();
      const readModel3 = createMockReadModel();

      const completionOrder: number[] = [];
      readModel1.indexOperations = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        completionOrder.push(1);
      });
      readModel2.indexOperations = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        completionOrder.push(2);
      });
      readModel3.indexOperations = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        completionOrder.push(3);
      });

      const coordinator = new ReadModelCoordinator(
        eventBus,
        [readModel1, readModel2, readModel3],
        [],
      );

      let allComplete = false;
      eventBus.subscribe(ReactorEventTypes.JOB_READ_READY, () => {
        expect(completionOrder).toHaveLength(3);
        allComplete = true;
      });

      coordinator.start();

      const operations = createMockOperations();
      await eventBus.emit(ReactorEventTypes.JOB_WRITE_READY, {
        operations,
      });
      await coordinator.drain();

      expect(allComplete).toBe(true);
    });

    it("should handle multiple operation batches", async () => {
      const eventBus = new EventBus();
      const readModel = createMockReadModel();
      const coordinator = new ReadModelCoordinator(eventBus, [readModel], []);

      const readyEvents: JobReadReadyEvent[] = [];
      eventBus.subscribe(
        ReactorEventTypes.JOB_READ_READY,
        (type, event: JobReadReadyEvent) => {
          readyEvents.push(event);
        },
      );

      coordinator.start();

      const ops1 = createMockOperations();
      const ops2 = createMockOperations();

      await eventBus.emit(ReactorEventTypes.JOB_WRITE_READY, {
        operations: ops1,
      });
      await eventBus.emit(ReactorEventTypes.JOB_WRITE_READY, {
        operations: ops2,
      });
      await coordinator.drain();

      expect(readyEvents).toHaveLength(2);
      expect(readyEvents[0].operations).toEqual(ops1);
      expect(readyEvents[1].operations).toEqual(ops2);
    });

    it("should not emit OPERATIONS_READY if coordinator is stopped", async () => {
      const eventBus = new EventBus();
      const readModel = createMockReadModel();
      const coordinator = new ReadModelCoordinator(eventBus, [readModel], []);

      const readyEvents: JobReadReadyEvent[] = [];
      eventBus.subscribe(
        ReactorEventTypes.JOB_READ_READY,
        (type, event: JobReadReadyEvent) => {
          readyEvents.push(event);
        },
      );

      coordinator.start();
      coordinator.stop();

      const operations = createMockOperations();
      await eventBus.emit(ReactorEventTypes.JOB_WRITE_READY, {
        operations,
      });
      await coordinator.drain();

      expect(readyEvents).toHaveLength(0);
      expect(readModel.indexOperations).not.toHaveBeenCalled();
    });
  });

  describe("per-queueKey serialization", () => {
    it("should serialize batches for the same documentId:scope:branch", async () => {
      const eventBus = new EventBus();
      const readModel = createMockReadModel();

      const events: string[] = [];
      readModel.indexOperations = vi.fn().mockImplementation(async (ops) => {
        const opId = ops[0].operation.id;
        events.push(`start:${opId}`);
        await new Promise((resolve) => setTimeout(resolve, 30));
        events.push(`end:${opId}`);
      });

      const coordinator = new ReadModelCoordinator(eventBus, [readModel], []);
      coordinator.start();

      const ops1 = createMockOperations();
      ops1[0].operation.id = "op-a";
      const ops2 = createMockOperations();
      ops2[0].operation.id = "op-b";

      await eventBus.emit(ReactorEventTypes.JOB_WRITE_READY, {
        operations: ops1,
      });
      await eventBus.emit(ReactorEventTypes.JOB_WRITE_READY, {
        operations: ops2,
      });
      await coordinator.drain();

      expect(events).toEqual([
        "start:op-a",
        "end:op-a",
        "start:op-b",
        "end:op-b",
      ]);
    });

    it("should run different queueKey chains in parallel", async () => {
      const eventBus = new EventBus();
      const readModel = createMockReadModel();

      const events: string[] = [];
      readModel.indexOperations = vi.fn().mockImplementation(async (ops) => {
        const docId = ops[0].context.documentId;
        events.push(`start:${docId}`);
        await new Promise((resolve) => setTimeout(resolve, 30));
        events.push(`end:${docId}`);
      });

      const coordinator = new ReadModelCoordinator(eventBus, [readModel], []);
      coordinator.start();

      const opsA = createMockOperations({ documentId: "docA" });
      const opsB = createMockOperations({ documentId: "docB" });

      await eventBus.emit(ReactorEventTypes.JOB_WRITE_READY, {
        operations: opsA,
      });
      await eventBus.emit(ReactorEventTypes.JOB_WRITE_READY, {
        operations: opsB,
      });
      await coordinator.drain();

      // Both starts happen before either end -> interleaved -> parallel
      expect(events.indexOf("start:docA")).toBeLessThan(
        events.indexOf("end:docA"),
      );
      expect(events.indexOf("start:docB")).toBeLessThan(
        events.indexOf("end:docB"),
      );
      expect(events.indexOf("start:docB")).toBeLessThan(
        events.indexOf("end:docA"),
      );
    });

    it("should continue chain after a batch fails", async () => {
      const eventBus = new EventBus();
      const readModel = createMockReadModel();

      const indexed: string[] = [];
      readModel.indexOperations = vi.fn().mockImplementation((ops) => {
        const opId = ops[0].operation.id;
        if (opId === "op-fail") {
          return Promise.reject(new Error("boom"));
        }
        indexed.push(opId);
        return Promise.resolve();
      });

      const coordinator = new ReadModelCoordinator(eventBus, [readModel], []);
      coordinator.start();

      const ops1 = createMockOperations();
      ops1[0].operation.id = "op-fail";
      const ops2 = createMockOperations();
      ops2[0].operation.id = "op-ok";

      await eventBus.emit(ReactorEventTypes.JOB_WRITE_READY, {
        operations: ops1,
      });
      await eventBus.emit(ReactorEventTypes.JOB_WRITE_READY, {
        operations: ops2,
      });
      await coordinator.drain();

      expect(indexed).toEqual(["op-ok"]);
    });
  });

  describe("drain", () => {
    it("resolves immediately when no chains are pending", async () => {
      const eventBus = new EventBus();
      const coordinator = new ReadModelCoordinator(eventBus, [], []);
      await coordinator.drain();
    });

    it("waits for all in-flight chains", async () => {
      const eventBus = new EventBus();
      const readModel = createMockReadModel();

      let finished = 0;
      readModel.indexOperations = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 25));
        finished++;
      });

      const coordinator = new ReadModelCoordinator(eventBus, [readModel], []);
      coordinator.start();

      await eventBus.emit(ReactorEventTypes.JOB_WRITE_READY, {
        operations: createMockOperations({ documentId: "docA" }),
      });
      await eventBus.emit(ReactorEventTypes.JOB_WRITE_READY, {
        operations: createMockOperations({ documentId: "docB" }),
      });

      expect(finished).toBeLessThan(2);
      await coordinator.drain();
      expect(finished).toBe(2);
    });
  });
});
