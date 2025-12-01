import { afterEach, describe, expect, it } from "vitest";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { IReactor, ReactorModule } from "../../src/core/types.js";
import type { ISyncCursorStorage } from "../../src/storage/interfaces.js";
import { InternalChannel } from "../../src/sync/channels/internal-channel.js";
import type { IChannelFactory } from "../../src/sync/interfaces.js";
import { SyncBuilder } from "../../src/sync/sync-builder.js";
import type { ChannelConfig } from "../../src/sync/types.js";

describe("Reactor with SyncBuilder Integration", () => {
  let reactor: IReactor;
  let module: ReactorModule;

  afterEach(() => {
    reactor.kill();
  });

  describe("ReactorBuilder with SyncBuilder", () => {
    it("should build a reactor with sync enabled using SyncBuilder", async () => {
      const channelRegistry = new Map<string, InternalChannel>();

      const channelFactory: IChannelFactory = {
        instance: (
          remoteId: string,
          remoteName: string,
          config: ChannelConfig,
          cursorStorage: ISyncCursorStorage,
        ) => {
          const channel = new InternalChannel(
            remoteId,
            remoteName,
            cursorStorage,
            () => {},
          );
          channelRegistry.set(remoteId, channel);
          return channel;
        },
      };

      module = await new ReactorBuilder()
        .withSync(new SyncBuilder().withChannelFactory(channelFactory))
        .buildModule();
      reactor = module.reactor;

      expect(reactor).toBeDefined();
      expect(module.syncModule).toBeDefined();
    });

    it("should allow adding remotes after reactor is built", async () => {
      const channelRegistry = new Map<string, InternalChannel>();

      const channelFactory: IChannelFactory = {
        instance: (
          remoteId: string,
          remoteName: string,
          config: ChannelConfig,
          cursorStorage: ISyncCursorStorage,
        ) => {
          const channel = new InternalChannel(
            remoteId,
            remoteName,
            cursorStorage,
            () => {},
          );
          channelRegistry.set(remoteId, channel);
          return channel;
        },
      };

      module = await new ReactorBuilder()
        .withSync(new SyncBuilder().withChannelFactory(channelFactory))
        .buildModule();
      reactor = module.reactor;

      expect(module.syncModule).toBeDefined();

      const remote = await module.syncModule!.syncManager.add(
        "test-remote",
        "test-collection",
        {
          type: "internal",

          parameters: {},
        },
        {
          documentId: [],
          scope: [],
          branch: "main",
        },
      );

      expect(remote.name).toBe("test-remote");
      expect(remote.collectionId).toBe("test-collection");

      const remotes = module.syncModule!.syncManager.list();
      expect(remotes).toHaveLength(1);
      expect(remotes[0].name).toBe("test-remote");
    });

    it("should shutdown sync manager independently from reactor", async () => {
      const channelRegistry = new Map<string, InternalChannel>();

      const channelFactory: IChannelFactory = {
        instance: (
          remoteId: string,
          remoteName: string,
          config: ChannelConfig,
          cursorStorage: ISyncCursorStorage,
        ) => {
          const channel = new InternalChannel(
            remoteId,
            remoteName,
            cursorStorage,
            () => {},
          );
          channelRegistry.set(remoteId, channel);
          return channel;
        },
      };

      module = await new ReactorBuilder()
        .withSync(new SyncBuilder().withChannelFactory(channelFactory))
        .buildModule();
      reactor = module.reactor;

      await module.syncModule!.syncManager.add(
        "test-remote",
        "test-collection",
        {
          type: "internal",

          parameters: {},
        },
      );

      const remotesBefore = module.syncModule!.syncManager.list();
      expect(remotesBefore).toHaveLength(1);

      const syncStatus = module.syncModule!.syncManager.shutdown();
      expect(syncStatus.isShutdown).toBe(true);

      const remotesAfter = module.syncModule!.syncManager.list();
      expect(remotesAfter).toHaveLength(0);

      const reactorStatus = reactor.kill();
      expect(reactorStatus.isShutdown).toBe(true);
    });

    it("should reload remotes on startup from storage", async () => {
      const channelRegistry = new Map<string, InternalChannel>();

      const channelFactory: IChannelFactory = {
        instance: (
          remoteId: string,
          remoteName: string,
          config: ChannelConfig,
          cursorStorage: ISyncCursorStorage,
        ) => {
          const channel = new InternalChannel(
            remoteId,
            remoteName,
            cursorStorage,
            () => {},
          );
          channelRegistry.set(remoteId, channel);
          return channel;
        },
      };

      module = await new ReactorBuilder()
        .withSync(new SyncBuilder().withChannelFactory(channelFactory))
        .buildModule();
      reactor = module.reactor;

      await module.syncModule!.syncManager.add(
        "persistent-remote",
        "persistent-collection",
        {
          type: "internal",

          parameters: {},
        },
      );

      const remotesBefore = module.syncModule!.syncManager.list();
      expect(remotesBefore).toHaveLength(1);
      expect(remotesBefore[0].name).toBe("persistent-remote");
    });
  });

  describe("ReactorBuilder without SyncBuilder", () => {
    it("should build a reactor without sync when SyncBuilder is not provided", async () => {
      module = await new ReactorBuilder().buildModule();
      reactor = module.reactor;

      expect(reactor).toBeDefined();
      expect(module.syncModule).toBeUndefined();
    });
  });

  describe("SyncBuilder configuration options", () => {
    it("should use default storage implementations when not provided", async () => {
      const channelRegistry = new Map<string, InternalChannel>();

      const channelFactory: IChannelFactory = {
        instance: (
          remoteId: string,
          remoteName: string,
          config: ChannelConfig,
          cursorStorage: ISyncCursorStorage,
        ) => {
          const channel = new InternalChannel(
            remoteId,
            remoteName,
            cursorStorage,
            () => {},
          );
          channelRegistry.set(remoteId, channel);
          return channel;
        },
      };

      module = await new ReactorBuilder()
        .withSync(new SyncBuilder().withChannelFactory(channelFactory))
        .buildModule();
      reactor = module.reactor;

      expect(module.syncModule).toBeDefined();

      await module.syncModule!.syncManager.add(
        "test-remote",
        "test-collection",
        {
          type: "internal",

          parameters: {},
        },
      );

      const remotes = module.syncModule!.syncManager.list();
      expect(remotes).toHaveLength(1);
    });

    it("should throw error when building without channel factory", async () => {
      const syncBuilder = new SyncBuilder();

      await expect(
        new ReactorBuilder().withSync(syncBuilder).build(),
      ).rejects.toThrow("Channel factory is required");
    });
  });
});
