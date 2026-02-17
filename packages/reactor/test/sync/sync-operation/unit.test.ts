import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import { describe, expect, it, vi } from "vitest";
import { ChannelError } from "../../../src/sync/errors.js";
import {
  SyncOperation,
  SyncOperationAggregateError,
} from "../../../src/sync/sync-operation.js";
import {
  ChannelErrorSource,
  SyncOperationStatus,
} from "../../../src/sync/types.js";

describe("SyncOperation", () => {
  const createTestOperations = (): OperationWithContext[] => {
    return [
      {
        operation: {
          index: 0,
          skip: 0,
          hash: "hash1",
          timestampUtcMs: new Date().toISOString(),
          action: {
            id: "action1",
            type: "SET_NAME",
            scope: "global",
            timestampUtcMs: new Date().toISOString(),
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
        },
      },
    ];
  };

  describe("constructor", () => {
    it("should initialize with correct properties", () => {
      const operations = createTestOperations();
      const handle = new SyncOperation(
        "syncop1",
        "job1",
        [],
        "remote1",
        "doc1",
        ["global"],
        "main",
        operations,
      );

      expect(handle.id).toBe("syncop1");
      expect(handle.jobId).toBe("job1");
      expect(handle.remoteName).toBe("remote1");
      expect(handle.documentId).toBe("doc1");
      expect(handle.scopes).toEqual(["global"]);
      expect(handle.branch).toBe("main");
      expect(handle.operations).toBe(operations);
      expect(handle.status).toBe(SyncOperationStatus.Unknown);
      expect(handle.error).toBeUndefined();
    });
  });

  describe("state transitions", () => {
    it("should transition from Unknown to TransportPending", () => {
      const handle = new SyncOperation(
        "syncop1",
        "job1",
        [],
        "remote1",
        "doc1",
        ["global"],
        "main",
        createTestOperations(),
      );

      const callback = vi.fn();
      handle.on(callback);

      handle.started();

      expect(handle.status).toBe(SyncOperationStatus.TransportPending);
      expect(callback).toHaveBeenCalledWith(
        handle,
        SyncOperationStatus.Unknown,
        SyncOperationStatus.TransportPending,
      );
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("should transition from TransportPending to ExecutionPending", () => {
      const handle = new SyncOperation(
        "syncop1",
        "job1",
        [],
        "remote1",
        "doc1",
        ["global"],
        "main",
        createTestOperations(),
      );

      handle.started();

      const callback = vi.fn();
      handle.on(callback);

      handle.transported();

      expect(handle.status).toBe(SyncOperationStatus.ExecutionPending);
      expect(callback).toHaveBeenCalledWith(
        handle,
        SyncOperationStatus.TransportPending,
        SyncOperationStatus.ExecutionPending,
      );
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("should transition from ExecutionPending to Applied", () => {
      const handle = new SyncOperation(
        "syncop1",
        "job1",
        [],
        "remote1",
        "doc1",
        ["global"],
        "main",
        createTestOperations(),
      );

      handle.started();
      handle.transported();

      const callback = vi.fn();
      handle.on(callback);

      handle.executed();

      expect(handle.status).toBe(SyncOperationStatus.Applied);
      expect(callback).toHaveBeenCalledWith(
        handle,
        SyncOperationStatus.ExecutionPending,
        SyncOperationStatus.Applied,
      );
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("should transition to Error from any state", () => {
      const handle = new SyncOperation(
        "syncop1",
        "job1",
        [],
        "remote1",
        "doc1",
        ["global"],
        "main",
        createTestOperations(),
      );

      handle.started();

      const callback = vi.fn();
      handle.on(callback);

      const error = new ChannelError(
        ChannelErrorSource.Inbox,
        new Error("Test error"),
      );
      handle.failed(error);

      expect(handle.status).toBe(SyncOperationStatus.Error);
      expect(handle.error).toBe(error);
      expect(callback).toHaveBeenCalledWith(
        handle,
        SyncOperationStatus.TransportPending,
        SyncOperationStatus.Error,
      );
      expect(callback).toHaveBeenCalledTimes(1);
    });

    describe("forward-only guard", () => {
      it("should block backward transitions", () => {
        const handle = new SyncOperation(
          "syncop1",
          "job1",
          [],
          "remote1",
          "doc1",
          ["global"],
          "main",
          createTestOperations(),
        );

        handle.started();
        handle.executed();

        const callback = vi.fn();
        handle.on(callback);

        handle.started();

        expect(handle.status).toBe(SyncOperationStatus.Applied);
        expect(callback).not.toHaveBeenCalled();
      });

      it("should block same-status transitions", () => {
        const handle = new SyncOperation(
          "syncop1",
          "job1",
          [],
          "remote1",
          "doc1",
          ["global"],
          "main",
          createTestOperations(),
        );

        handle.started();

        const callback = vi.fn();
        handle.on(callback);

        handle.started();

        expect(handle.status).toBe(SyncOperationStatus.TransportPending);
        expect(callback).not.toHaveBeenCalled();
      });

      it("should allow forward skip transitions", () => {
        const handle = new SyncOperation(
          "syncop1",
          "job1",
          [],
          "remote1",
          "doc1",
          ["global"],
          "main",
          createTestOperations(),
        );

        const callback = vi.fn();
        handle.on(callback);

        handle.executed();

        expect(handle.status).toBe(SyncOperationStatus.Applied);
        expect(callback).toHaveBeenCalledWith(
          handle,
          SyncOperationStatus.Unknown,
          SyncOperationStatus.Applied,
        );
      });

      it("should make terminal Error sticky", () => {
        const handle = new SyncOperation(
          "syncop1",
          "job1",
          [],
          "remote1",
          "doc1",
          ["global"],
          "main",
          createTestOperations(),
        );

        const error = new ChannelError(
          ChannelErrorSource.Channel,
          new Error("Fatal"),
        );
        handle.failed(error);

        const callback = vi.fn();
        handle.on(callback);

        handle.executed();

        expect(handle.status).toBe(SyncOperationStatus.Error);
        expect(callback).not.toHaveBeenCalled();
      });
    });

    it("should complete full lifecycle: Unknown -> TransportPending -> ExecutionPending -> Applied", () => {
      const handle = new SyncOperation(
        "syncop1",
        "job1",
        [],
        "remote1",
        "doc1",
        ["global"],
        "main",
        createTestOperations(),
      );

      const states: SyncOperationStatus[] = [];
      handle.on((job, prev, next) => {
        states.push(next);
      });

      handle.started();
      handle.transported();
      handle.executed();

      expect(states).toEqual([
        SyncOperationStatus.TransportPending,
        SyncOperationStatus.ExecutionPending,
        SyncOperationStatus.Applied,
      ]);
      expect(handle.status).toBe(SyncOperationStatus.Applied);
    });
  });

  describe("event subscription", () => {
    it("should notify all registered callbacks on state change", () => {
      const handle = new SyncOperation(
        "syncop1",
        "job1",
        [],
        "remote1",
        "doc1",
        ["global"],
        "main",
        createTestOperations(),
      );

      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const callback3 = vi.fn();

      handle.on(callback1);
      handle.on(callback2);
      handle.on(callback3);

      handle.started();

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
      expect(callback3).toHaveBeenCalledTimes(1);

      expect(callback1).toHaveBeenCalledWith(
        handle,
        SyncOperationStatus.Unknown,
        SyncOperationStatus.TransportPending,
      );
    });

    it("should call callbacks in registration order", () => {
      const handle = new SyncOperation(
        "syncop1",
        "job1",
        [],
        "remote1",
        "doc1",
        ["global"],
        "main",
        createTestOperations(),
      );

      const callOrder: number[] = [];

      handle.on(() => callOrder.push(1));
      handle.on(() => callOrder.push(2));
      handle.on(() => callOrder.push(3));

      handle.started();

      expect(callOrder).toEqual([1, 2, 3]);
    });

    it("should include previous and next status in callback", () => {
      const handle = new SyncOperation(
        "syncop1",
        "job1",
        [],
        "remote1",
        "doc1",
        ["global"],
        "main",
        createTestOperations(),
      );

      const transitions: Array<{
        prev: SyncOperationStatus;
        next: SyncOperationStatus;
      }> = [];

      handle.on((job, prev, next) => {
        transitions.push({ prev, next });
      });

      handle.started();
      handle.transported();
      handle.executed();

      expect(transitions).toEqual([
        {
          prev: SyncOperationStatus.Unknown,
          next: SyncOperationStatus.TransportPending,
        },
        {
          prev: SyncOperationStatus.TransportPending,
          next: SyncOperationStatus.ExecutionPending,
        },
        {
          prev: SyncOperationStatus.ExecutionPending,
          next: SyncOperationStatus.Applied,
        },
      ]);
    });

    it("should handle callbacks registered after state changes", () => {
      const handle = new SyncOperation(
        "syncop1",
        "job1",
        [],
        "remote1",
        "doc1",
        ["global"],
        "main",
        createTestOperations(),
      );

      handle.started();
      handle.transported();

      const callback = vi.fn();
      handle.on(callback);

      expect(callback).not.toHaveBeenCalled();

      handle.executed();

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        handle,
        SyncOperationStatus.ExecutionPending,
        SyncOperationStatus.Applied,
      );
    });

    it("should guarantee delivery even if callbacks throw errors", () => {
      const handle = new SyncOperation(
        "syncop1",
        "job1",
        [],
        "remote1",
        "doc1",
        ["global"],
        "main",
        createTestOperations(),
      );

      const callback1 = vi.fn(() => {
        throw new Error("Callback 1 error");
      });
      const callback2 = vi.fn();
      const callback3 = vi.fn(() => {
        throw new Error("Callback 3 error");
      });
      const callback4 = vi.fn();

      handle.on(callback1);
      handle.on(callback2);
      handle.on(callback3);
      handle.on(callback4);

      expect(() => handle.started()).toThrow(SyncOperationAggregateError);

      expect(callback1).toHaveBeenCalledWith(
        handle,
        SyncOperationStatus.Unknown,
        SyncOperationStatus.TransportPending,
      );
      expect(callback2).toHaveBeenCalledWith(
        handle,
        SyncOperationStatus.Unknown,
        SyncOperationStatus.TransportPending,
      );
      expect(callback3).toHaveBeenCalledWith(
        handle,
        SyncOperationStatus.Unknown,
        SyncOperationStatus.TransportPending,
      );
      expect(callback4).toHaveBeenCalledWith(
        handle,
        SyncOperationStatus.Unknown,
        SyncOperationStatus.TransportPending,
      );

      try {
        handle.transported();
      } catch (error) {
        expect(error).toBeInstanceOf(SyncOperationAggregateError);
        expect((error as SyncOperationAggregateError).errors).toHaveLength(2);
        expect((error as SyncOperationAggregateError).errors[0].message).toBe(
          "Callback 1 error",
        );
        expect((error as SyncOperationAggregateError).errors[1].message).toBe(
          "Callback 3 error",
        );
      }
    });
  });

  describe("error handling", () => {
    it("should store error when failed", () => {
      const handle = new SyncOperation(
        "syncop1",
        "job1",
        [],
        "remote1",
        "doc1",
        ["global"],
        "main",
        createTestOperations(),
      );

      const error = new ChannelError(
        ChannelErrorSource.Channel,
        new Error("Connection failed"),
      );

      handle.failed(error);

      expect(handle.error).toBe(error);
      expect(handle.status).toBe(SyncOperationStatus.Error);
    });

    it("should notify callbacks when error occurs", () => {
      const handle = new SyncOperation(
        "syncop1",
        "job1",
        [],
        "remote1",
        "doc1",
        ["global"],
        "main",
        createTestOperations(),
      );

      const callback = vi.fn();
      handle.on(callback);

      const error = new ChannelError(
        ChannelErrorSource.Outbox,
        new Error("Send failed"),
      );

      handle.failed(error);

      expect(callback).toHaveBeenCalledWith(
        handle,
        SyncOperationStatus.Unknown,
        SyncOperationStatus.Error,
      );
    });

    it("should transition to error from TransportPending", () => {
      const handle = new SyncOperation(
        "syncop1",
        "job1",
        [],
        "remote1",
        "doc1",
        ["global"],
        "main",
        createTestOperations(),
      );

      handle.started();

      const error = new ChannelError(
        ChannelErrorSource.Channel,
        new Error("Transport error"),
      );

      handle.failed(error);

      expect(handle.status).toBe(SyncOperationStatus.Error);
      expect(handle.error).toBe(error);
    });

    it("should transition to error from ExecutionPending", () => {
      const handle = new SyncOperation(
        "syncop1",
        "job1",
        [],
        "remote1",
        "doc1",
        ["global"],
        "main",
        createTestOperations(),
      );

      handle.started();
      handle.transported();

      const error = new ChannelError(
        ChannelErrorSource.Inbox,
        new Error("Execution error"),
      );

      handle.failed(error);

      expect(handle.status).toBe(SyncOperationStatus.Error);
      expect(handle.error).toBe(error);
    });
  });

  describe("immutability", () => {
    it("should have readonly properties", () => {
      const operations = createTestOperations();
      const handle = new SyncOperation(
        "syncop1",
        "job1",
        [],
        "remote1",
        "doc1",
        ["global"],
        "main",
        operations,
      );

      expect(handle.id).toBe("syncop1");
      expect(handle.jobId).toBe("job1");
      expect(handle.remoteName).toBe("remote1");
      expect(handle.documentId).toBe("doc1");
      expect(handle.operations).toBe(operations);
    });
  });

  describe("multiple scopes", () => {
    it("should handle multiple scopes", () => {
      const handle = new SyncOperation(
        "syncop1",
        "job1",
        [],
        "remote1",
        "doc1",
        ["global", "protected"],
        "main",
        createTestOperations(),
      );

      expect(handle.scopes).toEqual(["global", "protected"]);
    });

    it("should handle empty scopes array", () => {
      const handle = new SyncOperation(
        "syncop1",
        "job1",
        [],
        "remote1",
        "doc1",
        [],
        "main",
        createTestOperations(),
      );

      expect(handle.scopes).toEqual([]);
    });
  });
});
