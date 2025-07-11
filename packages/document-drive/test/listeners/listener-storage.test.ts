import { Kysely } from "kysely";
import { KyselyPGlite } from "kysely-pglite";
import { describe, expect, test, vi } from "vitest";
import { ListenerManager } from "../../src/server/listener/listener-manager.js";
import { InMemoryListenerStorage } from "../../src/server/listener/storage/memory.js";
import { RelationalListenerStorage } from "../../src/server/listener/storage/relational/relational.js";
import { IListenerStorage } from "../../src/server/listener/storage/types.js";
import { ISynchronizationManager, Listener } from "../../src/server/types.js";

const storageAdapters = [
  [
    "InMemoryListenerStorage",
    () => Promise.resolve(new InMemoryListenerStorage()),
  ],
  [
    "RelationalListenerStorage",
    async () => {
      const { dialect } = await KyselyPGlite.create();
      const db = new Kysely<any>({ dialect });
      await RelationalListenerStorage.migrateDatabase(db);
      return Promise.resolve(new RelationalListenerStorage(db));
    },
  ],
] as [string, () => Promise<IListenerStorage>][];

describe.each(storageAdapters)("%s", async (_, buildStorage) => {
  test("should store listener", async () => {
    const storage = await buildStorage();
    const listener: Listener = {
      driveId: "parent",
      block: true,
      callInfo: {
        data: "http://localhost:3000",
        name: "switchboard-push",
        transmitterType: "SwitchboardPush",
      },
      filter: {
        branch: ["main"],
        documentId: ["*"],
        documentType: ["*"],
        scope: ["global"],
      },
      label: "Switchboard Sync",
      listenerId: "x",
      system: true,
    };
    await storage.addListener("parent", "x", listener);
    await expect(storage.getListener("parent", "x")).resolves.toStrictEqual(
      listener,
    );
  });

  test("should get listeners for a parentId", async () => {
    const storage = await buildStorage();
    const listenerA: Listener = {
      listenerId: "a",
      driveId: "parent",
      block: false,
      system: false,
      filter: {
        branch: ["main"],
        documentId: ["doc1"],
        documentType: ["type1"],
        scope: ["*"],
      },
    };
    const listenerB: Listener = {
      listenerId: "b",
      driveId: "parent",
      block: false,
      system: false,
      filter: {
        branch: ["dev"],
        documentId: ["doc2"],
        documentType: ["type2"],
        scope: ["*"],
      },
    };
    await storage.addListener("parent", "a", listenerA);
    await storage.addListener("parent", "b", listenerB);
    const listeners = storage.getListeners("parent");
    await expect(listeners.next()).resolves.toStrictEqual({
      value: "a",
      done: false,
    });
    await expect(listeners.next()).resolves.toStrictEqual({
      value: "b",
      done: false,
    });
    await expect(listeners.next()).resolves.toStrictEqual({
      value: undefined,
      done: true,
    });
  });

  test("should check hasListeners and hasListener", async () => {
    const storage = await buildStorage();
    expect(await storage.hasListeners("parent")).toBe(false);
    const listener: Listener = {
      listenerId: "x",
      driveId: "parent",
      block: false,
      system: false,
      filter: {
        branch: ["main"],
        documentId: ["doc"],
        documentType: ["type"],
        scope: ["*"],
      },
    };
    await storage.addListener("parent", "x", listener);
    expect(await storage.hasListeners("parent")).toBe(true);
    expect(await storage.hasListener("parent", "x")).toBe(true);
    expect(await storage.hasListener("parent", "y")).toBe(false);
    expect(await storage.hasListeners("other")).toBe(false);
  });

  test("should update a listener", async () => {
    const storage = await buildStorage();
    const listener: Listener = {
      listenerId: "u",
      driveId: "parent",
      block: false,
      system: false,
      filter: {
        branch: ["main"],
        documentId: ["doc"],
        documentType: ["type"],
        scope: ["*"],
      },
    };
    await storage.addListener("parent", "u", listener);
    const updated: Listener = { ...listener, block: true };
    await storage.updateListener("parent", "u", updated);
    await expect(storage.getListener("parent", "u")).resolves.toStrictEqual(
      updated,
    );
  });

  test("should remove a listener", async () => {
    const storage = await buildStorage();
    const listener: Listener = {
      listenerId: "z",
      driveId: "parent",
      block: false,
      system: false,
      filter: {
        branch: ["main"],
        documentId: ["doc"],
        documentType: ["type"],
        scope: ["*"],
      },
    };
    await storage.addListener("parent", "z", listener);
    await expect(storage.hasListener("parent", "z")).resolves.toBe(true);
    await storage.removeListener("parent", "z");
    await expect(storage.hasListener("parent", "z")).resolves.toBe(false);
  });

  test("should remove all listeners for a parentId", async () => {
    const storage = await buildStorage();
    await storage.addListener("parent", "a", {
      listenerId: "a",
      driveId: "parent",
      block: false,
      system: false,
      filter: {
        branch: ["main"],
        documentId: ["doc1"],
        documentType: ["type1"],
        scope: ["*"],
      },
    });
    await storage.addListener("parent", "b", {
      listenerId: "b",
      driveId: "parent",
      block: false,
      system: false,
      filter: {
        branch: ["dev"],
        documentId: ["doc2"],
        documentType: ["type2"],
        scope: ["*"],
      },
    });
    await expect(storage.hasListeners("parent")).resolves.toBe(true);
    await storage.removeListeners("parent");
    await expect(storage.hasListeners("parent")).resolves.toBe(false);
    await expect(storage.getListeners("parent").next()).resolves.toStrictEqual({
      done: true,
      value: undefined,
    });
  });
});

describe.each(storageAdapters)(
  "Listener Manager with Storage %s",
  async (_, buildStorage) => {
    async function createListenerManager() {
      const mockSyncManager = vi.mockObject<ISynchronizationManager>(
        {} as ISynchronizationManager,
      );
      const storage = await buildStorage();
      return {
        listenerManager: new ListenerManager(mockSyncManager, { storage }),
        mockSyncManager,
        storage,
      };
    }

    test("should initialize storage", async () => {
      const { listenerManager, storage } = await createListenerManager();
      const spy = vi.spyOn(storage, "init");

      await listenerManager.initialize(console.log);

      expect(spy).toHaveBeenCalledOnce();
    });

    test("should add listener to storage", async () => {
      const { listenerManager, storage } = await createListenerManager();
      const listener: Listener = {
        listenerId: "1",
        driveId: "1",
        block: false,
        system: false,
        filter: {
          branch: ["*"],
          documentId: ["*"],
          documentType: ["*"],
          scope: ["*"],
        },
      };

      await listenerManager.setListener("1", listener);

      await expect(storage.getListener("1", "1")).resolves.toStrictEqual(
        listener,
      );
    });

    test("should remove listener from storage", async () => {
      const { listenerManager, storage } = await createListenerManager();
      const listener: Listener = {
        listenerId: "1",
        driveId: "1",
        block: false,
        system: false,
        filter: {
          branch: ["*"],
          documentId: ["*"],
          documentType: ["*"],
          scope: ["*"],
        },
      };
      await listenerManager.setListener("1", listener);
      await listenerManager.removeListener("1", "1");
      await expect(storage.hasListener("1", "1")).resolves.toBe(false);
    });

    test("should load listener from storage on initialize", async () => {
      const { listenerManager, storage } = await createListenerManager();
      const listener: Listener = {
        listenerId: "1",
        driveId: "1",
        block: false,
        system: false,
        filter: {
          branch: ["*"],
          documentId: ["*"],
          documentType: ["*"],
          scope: ["*"],
        },
      };

      await listenerManager.setListener("1", listener);
      expect(listenerManager.getListenerState("1", "1").listener).toStrictEqual(
        listener,
      );

      const mockSyncManager = vi.mockObject<ISynchronizationManager>(
        {} as ISynchronizationManager,
      );
      const newListenerManager = new ListenerManager(mockSyncManager, {
        storage,
      });

      await newListenerManager.initialize(console.log);
      expect(
        newListenerManager.getListenerState("1", "1").listener,
      ).toStrictEqual(listener);
    });
  },
);
