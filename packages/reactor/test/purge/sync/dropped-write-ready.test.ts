import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  generateId,
  isPurgeMarker,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { addRelationshipAction } from "../../../src/actions/index.js";
import { DriveCollectionId } from "../../../src/cache/operation-index-types.js";
import { ReactorBuilder } from "../../../src/core/reactor-builder.js";
import type { InProcessReactorModule } from "../../../src/core/types.js";
import { SyncBuilder } from "../../../src/sync/sync-builder.js";
import type { SyncEnvelope } from "../../../src/sync/types.js";
import type { TestChannel } from "../../sync/channels/test-channel.js";
import { DroppingEventBus } from "../../catch-up/helpers.js";
import {
  createDocModelDocument,
  createTestChannelFactory,
} from "../../factories.js";
import {
  createTestDatabase,
  legacyDrive,
  succeeded,
  type TestDatabase,
} from "../executor/harness.js";
import { FILTER, FULL_MANIFEST } from "./harness.js";

describe("a purge whose JOB_WRITE_READY is dropped [Postgres]", () => {
  let database: TestDatabase;
  let module: InProcessReactorModule;
  let eventBus: DroppingEventBus;
  const sent: SyncEnvelope[] = [];
  const channels = new Map<string, TestChannel>();

  beforeAll(async () => {
    database = await createTestDatabase("reactor_purge_dropped_write_ready");
    eventBus = new DroppingEventBus();
    module = await new ReactorBuilder()
      .withKysely(database.base)
      .withEventBus(eventBus)
      .withCatchUp({ intervalMs: 100 })
      .withDocumentModelSources([
        documentModelDocumentModelModule as never,
        driveDocumentModelModule as never,
      ])
      .withSync(
        new SyncBuilder().withChannelFactory(
          createTestChannelFactory(channels, sent),
        ),
      )
      .buildModule();
  });

  afterAll(async () => {
    try {
      await module?.syncModule?.syncManager.shutdown();
      await module?.reactor.kill().completed;
    } finally {
      await database?.drop();
    }
  });

  function sentFor(documentId: string) {
    return sent.flatMap((envelope) =>
      (envelope.operations ?? []).filter(
        (op) => op.context.documentId === documentId,
      ),
    );
  }

  it("serves the marker to the drive's remote from the settled index", async () => {
    const { reactor } = module;
    const drive = legacyDrive();
    const driveId = drive.header.id;
    await succeeded(reactor, (await reactor.create(drive)).id);
    const child = createDocModelDocument({ id: generateId() });
    const childId = child.header.id;
    await succeeded(reactor, (await reactor.create(child)).id);
    await succeeded(
      reactor,
      (
        await reactor.execute(driveId, "main", [
          addRelationshipAction(driveId, childId, "child"),
        ])
      ).id,
    );
    await module.syncModule!.syncManager.add(
      "remote",
      DriveCollectionId.forDrive(driveId),
      { type: "internal", parameters: {} },
      FILTER,
      {},
      "remote",
      FULL_MANIFEST,
    );
    // No peer behind the channel: what it sends is only recorded.
    channels.delete("remote");
    await succeeded(reactor, (await reactor.deleteDocument(childId)).id);
    // The settled watermark is cluster-wide, so another file's long transaction delays the send.
    await vi.waitFor(
      () =>
        expect(
          sentFor(childId).map((op) => op.operation.action.type),
        ).toContain("DELETE_DOCUMENT"),
      { timeout: 5_000 },
    );

    const dropped = eventBus.dropWriteReadyFor(childId);
    // The tracker learns the purge's outcome only from the dropped event.
    await module.documentPurgeService.enqueuePurge([childId], "request-1");
    const event = await dropped;
    expect(event.operations.map((op) => op.operation.action.type)).toEqual([
      "PURGE_DOCUMENT",
    ]);

    await vi.waitFor(
      () => expect(sentFor(childId).some((op) => isPurgeMarker(op))).toBe(true),
      { timeout: 5_000 },
    );
  });
});
