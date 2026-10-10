import {
  driveDocumentModelModule,
  type DocumentDriveDocument,
} from "@powerhousedao/shared/document-drive";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DriveCollectionId } from "../../src/cache/operation-index-types.js";
import type { ReactorClient } from "../../src/client/reactor-client.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import { ReactorClientBuilder } from "../../src/core/reactor-client-builder.js";
import type { IReactor, ReactorModule } from "../../src/core/types.js";
import type { BatchLoadResult } from "../../src/core/types.js";
import { JobStatus } from "../../src/shared/types.js";
import type { ISyncCursorStorage } from "../../src/storage/interfaces.js";
import type { IChannelFactory } from "../../src/sync/interfaces.js";
import { SyncBuilder } from "../../src/sync/sync-builder.js";
import type { ChannelConfig, SyncEnvelope } from "../../src/sync/types.js";
import { TestChannel } from "../sync/channels/test-channel.js";
import { TestP256Signer } from "../utils/p256-signer.js";

type Peer = {
  client: ReactorClient;
  reactor: IReactor;
  module: ReactorModule;
};

const BOUND_MS = 10_000;

async function eventually(check: () => Promise<boolean>): Promise<boolean> {
  const deadline = Date.now() + BOUND_MS;
  while (Date.now() < deadline) {
    if (await check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return false;
}

// A flushed load went back in behind the later chunk whose queue hint names it.
describe("an inbox load re-enqueued after a later chunk for its document", () => {
  let a: Peer | undefined;
  let b: Peer | undefined;

  afterEach(() => {
    a?.reactor.kill();
    b?.reactor.kill();
  });

  it("runs before that chunk once its deferral is flushed", async () => {
    const channels = new Map<string, TestChannel>();
    const peerMapping = new Map<string, string>();
    const heldForB: SyncEnvelope[] = [];

    const channelFactory = (): IChannelFactory => ({
      instance(
        remoteId: string,
        remoteName: string,
        _config: ChannelConfig,
        cursorStorage: ISyncCursorStorage,
      ): TestChannel {
        const send = (envelope: SyncEnvelope): void => {
          if (remoteName.startsWith("toB-")) {
            heldForB.push(envelope);
            return;
          }
          channels.get(peerMapping.get(remoteName)!)?.receive(envelope);
        };
        const channel = new TestChannel(
          remoteId,
          remoteName,
          cursorStorage,
          send,
        );
        channels.set(remoteName, channel);
        return channel;
      },
    });
    const build = async (): Promise<Peer> => {
      const signer = (await TestP256Signer.create()).asISigner();
      const built = await new ReactorClientBuilder()
        .withReactorBuilder(
          new ReactorBuilder()
            .withDocumentModelSources([driveDocumentModelModule as never])
            .withSync(new SyncBuilder().withChannelFactory(channelFactory())),
        )
        .withSigner(signer)
        .buildModule();
      return {
        client: built.client,
        reactor: built.reactor,
        module: built.reactorModule!,
      };
    };
    a = await build();
    b = await build();

    const drive = driveDocumentModelModule.utils.createDocument();
    const id = drive.header.id;
    const toB = `toB-${id}`;
    const toA = `toA-${id}`;
    peerMapping.set(toB, toA);
    peerMapping.set(toA, toB);
    const filter = { documentId: [], scope: [], branch: "main" };
    const collectionId = DriveCollectionId.forDrive(id);
    await a.module.syncModule!.syncManager.add(
      toB,
      collectionId,
      { type: "internal", parameters: {} },
      filter,
    );
    await b.module.syncModule!.syncManager.add(
      toA,
      collectionId,
      { type: "internal", parameters: {} },
      filter,
    );

    await a.client.create(drive);
    await a.client.execute(id, "main", [
      driveDocumentModelModule.actions.setDriveName({ name: "first" }),
    ]);
    await a.client.execute(id, "main", [
      driveDocumentModelModule.actions.setDriveName({ name: "second" }),
    ]);
    const scopeOf = (envelope: SyncEnvelope) =>
      envelope.operations?.[0]?.context.scope;
    expect(
      await eventually(() =>
        Promise.resolve(
          heldForB.filter((e) => scopeOf(e) === "global").length === 2,
        ),
      ),
    ).toBe(true);
    const create = heldForB.filter((e) => scopeOf(e) === "document");
    const [first, second] = heldForB.filter((e) => scopeOf(e) === "global");
    expect(create).toHaveLength(1);

    const loadBatch = vi.spyOn(b.reactor, "loadBatch");
    const jobIds: string[] = [];
    const enqueued = async (count: number) =>
      eventually(async () => {
        if (loadBatch.mock.results.length < count) return false;
        const result = (await loadBatch.mock.results[count - 1]
          .value) as BatchLoadResult;
        for (const info of Object.values(result.jobs)) jobIds.push(info.id);
        return true;
      });
    const inbox = channels.get(toA)!.inbox;
    const deliver = (envelope: SyncEnvelope, key: string) =>
      channels.get(toA)!.receive({ ...envelope, key });

    deliver(first, "first");
    expect(await enqueued(1)).toBe(true);
    deliver(second, "second");
    expect(await enqueued(2)).toBe(true);
    const deferred = await b.reactor.getJobStatus(jobIds[0]);
    expect([JobStatus.READ_READY, JobStatus.FAILED]).not.toContain(
      deferred.status,
    );
    deliver(create[0], "create");
    expect(await enqueued(3)).toBe(true);

    const settled = await eventually(async () => {
      const statuses = await Promise.all(
        jobIds.map((jobId) => b!.reactor.getJobStatus(jobId)),
      );
      return statuses.every((s) => s.status === JobStatus.READ_READY);
    });
    expect(settled).toBe(true);

    const onB = await b.client.get<DocumentDriveDocument>(id);
    expect(onB.state.global.name).toBe("second");
    expect(
      await eventually(() => Promise.resolve(inbox.items.length === 0)),
    ).toBe(true);
    expect(inbox.ackOrdinal).toBe(inbox.latestOrdinal);
    expect(inbox.ackOrdinal).toBeGreaterThan(0);
  }, 60_000);
});
