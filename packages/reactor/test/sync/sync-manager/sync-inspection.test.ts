import { afterEach, describe, expect, it } from "vitest";
import { DriveCollectionId } from "../../../src/cache/operation-index-types.js";
import { ReactorBuilder } from "../../../src/core/reactor-builder.js";
import type { InProcessReactorModule } from "../../../src/core/types.js";
import type { ISyncCursorStorage } from "../../../src/storage/interfaces.js";
import type { IChannelFactory } from "../../../src/sync/interfaces.js";
import { SyncBuilder } from "../../../src/sync/sync-builder.js";
import {
  ChannelErrorSource,
  type ChannelConfig,
} from "../../../src/sync/types.js";
import { TestChannel } from "../channels/test-channel.js";

describe("sync inspection", () => {
  let module: InProcessReactorModule | undefined;

  afterEach(() => {
    module?.reactor.kill();
    module = undefined;
  });

  async function build(): Promise<InProcessReactorModule> {
    const channelFactory: IChannelFactory = {
      instance: (
        remoteId: string,
        remoteName: string,
        _config: ChannelConfig,
        cursorStorage: ISyncCursorStorage,
      ) => new TestChannel(remoteId, remoteName, cursorStorage, () => {}),
    };
    module = await new ReactorBuilder()
      .withSync(new SyncBuilder().withChannelFactory(channelFactory))
      .buildModule();
    return module;
  }

  it("exposes the in-process sync manager as the module's sync inspector", async () => {
    const built = await build();
    expect(built.syncModule?.syncInspector).toBe(built.syncModule?.syncManager);
  });

  it("inspects a remote's cursors, depths and connection health", async () => {
    const built = await build();
    const sync = built.syncModule!;
    await sync.syncManager.add("peer", DriveCollectionId.forDrive("drive-1"), {
      type: "test",
      parameters: {},
    });
    await sync.cursorStorage.upsert({
      remoteName: "peer",
      cursorType: "inbox",
      cursorOrdinal: 7,
      lastSyncedAtUtcMs: 1000,
    });

    const inspection = await sync.syncInspector!.inspectRemote("peer");
    expect(inspection).toMatchObject({
      remoteName: "peer",
      inboxCursor: {
        cursorType: "inbox",
        cursorOrdinal: 7,
        lastSyncedAtUtcMs: 1000,
      },
      outboxCursor: { cursorType: "outbox", cursorOrdinal: 0 },
      mailboxDepths: { inbox: 0, outbox: 0, deadLetter: 0 },
      connection: { neverSucceeded: true, stalenessMs: undefined },
    });
    expect(await sync.syncInspector!.inspectRemotes()).toHaveLength(1);
    await expect(sync.syncInspector!.inspectRemote("nope")).rejects.toThrow();
  });

  it("pages a remote's dead letters", async () => {
    const built = await build();
    const sync = built.syncModule!;
    await sync.syncManager.add("peer", DriveCollectionId.forDrive("drive-1"), {
      type: "test",
      parameters: {},
    });
    for (const id of ["a", "b", "c"]) {
      await sync.deadLetterStorage.add({
        id,
        jobId: `job-${id}`,
        jobDependencies: [],
        remoteName: "peer",
        documentId: "doc",
        scopes: ["global"],
        branch: "main",
        operations: [],
        errorSource: ChannelErrorSource.Inbox,
        errorMessage: "failed",
        errorType: "LIBRARY_ERROR",
      });
    }

    const first = await sync.syncInspector!.listDeadLetters(
      "peer",
      undefined,
      2,
    );
    expect(first.results).toHaveLength(2);
    expect(first.nextCursor).toBeDefined();
    const rest = await sync.syncInspector!.listDeadLetters(
      "peer",
      first.nextCursor,
      2,
    );
    expect(rest.results).toHaveLength(1);
    expect(rest.nextCursor).toBeUndefined();
  });
});
