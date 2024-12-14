import { describe, it, expect, beforeEach, vi } from "vitest";
import { ListenerManager } from "../../src/sync/listener";
import {
  IListenerManagerStorage,
  Listener,
  ListenerInput,
  StatefulListener,
} from "../../src/sync/types";
import { DuplicatedListenerIdError } from "../../src/sync/errors";

describe("ListenerManager", () => {
  let manager: ListenerManager;

  beforeEach(() => {
    manager = new ListenerManager();
  });

  it("should add a listener and return it", async () => {
    const input: ListenerInput = {
      driveId: "drive1",
      filter: {
        branch: ["main"],
        documentId: ["doc1"],
        documentType: ["type1"],
        scope: ["*"],
      },
      label: "Test Listener",
    };

    const listener = await manager.addListener(input);

    expect(listener).toMatchObject({
      driveId: input.driveId,
      filter: input.filter,
      label: input.label,
    });
    expect(listener).not.toBeInstanceOf(DuplicatedListenerIdError);
    expect((listener as Listener).id).toBeDefined();
  });

  it("should throw an error if adding a listener with a duplicate ID", async () => {
    const input: ListenerInput = {
      id: "listener1",
      driveId: "drive1",
      filter: {
        branch: ["main"],
        documentId: ["doc1"],
        documentType: ["type1"],
        scope: ["*"],
      },
    };

    await manager.addListener(input);

    await expect(manager.addListener(input)).rejects.toThrow(
      DuplicatedListenerIdError,
    );
  });

  it("should return all listeners", async () => {
    const input: ListenerInput = {
      driveId: "drive1",
      filter: {
        branch: ["main"],
        documentId: ["doc1"],
        documentType: ["type1"],
        scope: ["*"],
      },
      label: "Test Listener",
    };

    const listener1 = await manager.addListener(input);
    const listener2 = await manager.addListener(input);
    const listener3 = await manager.addListener(input);

    const listeners = await manager.getListeners();
    expect(listeners).toMatchObject([listener1, listener2, listener3]);
  });

  it("should remove a listener by ID", async () => {
    const input: ListenerInput = {
      driveId: "drive1",
      filter: {
        branch: ["main"],
        documentId: ["doc1"],
        documentType: ["type1"],
        scope: ["*"],
      },
    };

    const listener = await manager.addListener(input);

    const removed = await manager.removeListener(listener.id);

    expect(removed).toBe(true);

    const result = await manager.getListener(listener.id);
    expect(result).toBeUndefined();
  });

  it("should return false when trying to remove a non-existent listener", async () => {
    const removed = await manager.removeListener("non-existent-id");

    expect(removed).toBe(false);
  });

  it("should retrieve an existing listener by ID", async () => {
    const input: ListenerInput = {
      driveId: "drive1",
      filter: {
        branch: ["main"],
        documentId: ["doc1"],
        documentType: ["type1"],
        scope: ["*"],
      },
    };

    const addedListener = await manager.addListener(input);
    const retrievedListener = await manager.getListener(addedListener.id);

    expect(retrievedListener).toEqual(addedListener);
  });

  it("should return an error if trying to retrieve a non-existent listener", async () => {
    const result = await manager.getListener("non-existent-id");
    expect(result).toBeUndefined();
  });
});

describe("ListenerManager with Storage", () => {
  let storageMock: IListenerManagerStorage;
  let manager: ListenerManager;

  beforeEach(() => {
    storageMock = {
      addListener: vi.fn().mockResolvedValue(undefined),
      updateListener: vi.fn().mockResolvedValue(undefined),
      removeListener: vi.fn().mockResolvedValue(undefined),
      getAllListeners: vi.fn().mockResolvedValue({}),
    };

    manager = new ListenerManager(storageMock);
  });

  it("should call storage `addListener` when a listener is added", async () => {
    const input: ListenerInput = {
      driveId: "drive1",
      filter: {
        branch: ["main"],
        documentId: ["doc1"],
        documentType: ["type1"],
        scope: ["*"],
      },
      label: "Test Listener",
    };

    const listener = await manager.addListener(input);

    expect(storageMock.addListener).toHaveBeenCalledWith(listener, {
      [listener.id]: listener,
    });
  });

  it("should call storage `updateListener` when a listener is updated", async () => {
    const input: ListenerInput = {
      driveId: "drive1",
      filter: {
        branch: ["main"],
        documentId: ["doc1"],
        documentType: ["type1"],
        scope: ["*"],
      },
      label: "Test Listener",
    };

    const listener = await manager.addListener(input);

    // Simulate an update
    const updatedListener = { ...listener, label: "Updated Label" };
    manager["listeners"].set(listener.id, updatedListener as StatefulListener);

    expect(storageMock.updateListener).toHaveBeenCalledWith(updatedListener, {
      [listener.id]: updatedListener,
    });
  });

  it("should call storage `removeListener` when a listener is removed", async () => {
    const input: ListenerInput = {
      driveId: "drive1",
      filter: {
        branch: ["main"],
        documentId: ["doc1"],
        documentType: ["type1"],
        scope: ["*"],
      },
    };

    const listener = await manager.addListener(input);
    await manager.removeListener(listener.id);

    expect(storageMock.removeListener).toHaveBeenCalledWith(listener, {});
  });

  it("should load listeners from storage", async () => {
    const listener: StatefulListener = {
      id: "listener1",
      driveId: "drive1",
      filter: {
        branch: ["main"],
        documentId: ["doc1"],
        documentType: ["type1"],
        scope: ["*"],
      },
      label: "Test Listener",
      state: {
        syncUnits: {
          syncUnit1: {
            lastUpdated: new Date().toISOString(),
            listenerRev: 10,
          },
        },
      },
    };

    await manager.setStorage({
      ...storageMock,
      getAllListeners: vi.fn().mockResolvedValue({ listener1: listener }),
    });

    const result = await manager.getListener("listener1");

    expect(result).toStrictEqual(listener);
  });

  it("should not override current state when loading from storage", async () => {
    const listener: StatefulListener = {
      id: "listener1",
      driveId: "drive1",
      filter: {
        branch: ["main"],
        documentId: ["doc1"],
        documentType: ["type1"],
        scope: ["*"],
      },
      label: "Test Listener",
      state: {
        syncUnits: {
          syncUnit1: {
            lastUpdated: new Date().toISOString(),
            listenerRev: 10,
          },
        },
      },
    };
    const currentListener = {
      ...listener,
      state: {
        syncUnits: {
          syncUnit1: {
            lastUpdated: new Date().toISOString(),
            listenerRev: 20,
          },
        },
      },
    };
    manager["listeners"].set("listener1", currentListener);

    await manager.setStorage({
      ...storageMock,
      getAllListeners: vi.fn().mockResolvedValue({ listener1: listener }),
    });

    const result = await manager.getListener("listener1");
    expect(result).toStrictEqual(currentListener);
  });
});
