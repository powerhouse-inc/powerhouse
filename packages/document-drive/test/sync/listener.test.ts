import { describe, it, expect, beforeEach, vi, Mock } from "vitest";
import {
  ListenerRegistry,
  DuplicatedListenerIdError,
  ListenerInput,
  Listener,
  IListenerStorage,
  StatefulListener,
} from "../../src/sync/listener";

describe("Listener registry", () => {
  let registry: ListenerRegistry;

  beforeEach(() => {
    registry = new ListenerRegistry();
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

    const listener = await registry.addListener(input);

    expect(listener).toMatchObject({
      driveId: input.driveId,
      filter: input.filter,
      label: input.label,
    });
    expect(listener).not.toBeInstanceOf(DuplicatedListenerIdError);
    expect(listener.id).toBeDefined();
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

    await registry.addListener(input);

    await expect(registry.addListener(input)).rejects.toThrow(
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

    const listener1 = await registry.addListener(input);
    const listener2 = await registry.addListener(input);
    const listener3 = await registry.addListener(input);

    const listeners = await registry.getAllListeners();
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

    const listener = await registry.addListener(input);

    const removed = await registry.removeListener(listener.id);

    expect(removed).toBe(true);

    const result = await registry.getListener(listener.id);
    expect(result).toBeUndefined();
  });

  it("should return false when trying to remove a non-existent listener", async () => {
    const removed = await registry.removeListener("non-existent-id");

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

    const addedListener = await registry.addListener(input);
    const retrievedListener = await registry.getListener(addedListener.id);

    expect(retrievedListener).toEqual(addedListener);
  });

  it("should return an error if trying to retrieve a non-existent listener", async () => {
    const result = await registry.getListener("non-existent-id");
    expect(result).toBeUndefined();
  });
});

describe("Listener registry with Storage", () => {
  let storageMock: IListenerStorage;
  let registry: ListenerRegistry;

  beforeEach(() => {
    storageMock = {
      addListener: vi.fn().mockResolvedValue(undefined),
      updateListener: vi.fn().mockResolvedValue(undefined),
      removeListener: vi.fn().mockResolvedValue(undefined),
      getAllListeners: vi.fn().mockResolvedValue({}),
    };

    registry = new ListenerRegistry(storageMock);
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

    const listener = await registry.addListener(input);
    expect(storageMock.addListener).toHaveBeenCalledWith(listener);
  });

  it.skip("should call storage `updateListener` when a listener is updated", async () => {
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

    const listener = await registry.addListener(input);

    // Simulate an update
    const updatedListener = { ...listener, label: "Updated Label" };

    // TODO update listener state

    expect(storageMock.updateListener).toHaveBeenCalledWith([
      updatedListener.id,
      updatedListener,
    ]);
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

    const listener = await registry.addListener(input);
    await registry.removeListener(listener.id);

    expect(storageMock.removeListener).toHaveBeenCalledWith(listener.id);
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

    registry = new ListenerRegistry({
      ...storageMock,
      getAllListeners: vi.fn().mockResolvedValue({ listener1: listener }),
    });
    await registry.init();

    const result = await registry.getListener("listener1");

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

    registry = new ListenerRegistry({
      ...storageMock,
      getAllListeners: vi.fn().mockResolvedValue({ listener1: listener }),
    });
    registry["listeners"].set("listener1", currentListener);
    await registry.init();

    expect(storageMock.updateListener).toHaveBeenCalledWith(listener.id, {
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
            listenerRev: 20,
          },
        },
      },
    });

    const result = await registry.getListener("listener1");
    expect(result).toStrictEqual(currentListener);
  });
});
