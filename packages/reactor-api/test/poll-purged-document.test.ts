import {
  DriveCollectionId,
  EventBus,
  GqlResponseChannelFactory,
  JobStatus,
  ReactorBuilder,
  ReactorEventTypes,
  SyncBuilder,
  type InProcessReactorModule,
  type ISyncManager,
} from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  isPurgeMarker,
  purgeDocumentAction,
  purgeMarkerOperation,
  type DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import { ConsoleLogger } from "document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pollSyncEnvelopes } from "../src/graphql/reactor/resolvers.js";
import { createTestSigner, signFor } from "./utils/test-signer.js";

type Envelope = {
  operations?: Array<{
    operation: { id: string; action: { type: string } };
    context: { documentId: string };
  }> | null;
};

const polled = (envelopes: Envelope[], documentId: string) =>
  envelopes
    .flatMap((envelope) => envelope.operations ?? [])
    .filter((op) => op.context.documentId === documentId);

describe("polling a document purged after its rows were served", () => {
  let module: InProcessReactorModule | undefined;

  afterEach(async () => {
    await module?.reactor.kill().completed;
    await module?.syncModule?.syncManager.shutdown().completed;
    module = undefined;
  });

  it("does not serve the rows again after a lost response", async () => {
    const logger = new ConsoleLogger(["test"]);
    const eventBus = new EventBus();
    module = await new ReactorBuilder()
      .withEventBus(eventBus)
      .withDocumentModelSources([
        driveDocumentModelModule as unknown as DocumentModelModule,
      ])
      .withSync(
        new SyncBuilder().withChannelFactory(
          new GqlResponseChannelFactory(logger),
        ),
      )
      .buildModule();
    const reactor = module.reactor;
    const sync: ISyncManager = module.syncModule!.syncManager;
    const signer = await createTestSigner();

    const drive = driveDocumentModelModule.utils.createDocument();
    const driveId = drive.header.id;
    const collection = DriveCollectionId.forDrive(driveId);
    const settled = async (jobId: string) =>
      vi.waitUntil(async () => {
        const { status } = await reactor.getJobStatus(jobId);
        return status === JobStatus.READ_READY;
      });
    await settled((await reactor.create(drive, signer)).id);
    const renamed = await reactor.execute(driveId, "main", [
      await signFor(
        signer,
        driveDocumentModelModule.actions.setDriveName({ name: "renamed" }),
        driveId,
      ),
    ]);
    await settled(renamed.id);

    const remote = await sync.add(
      "client",
      collection,
      { type: "polling", parameters: {} },
      { documentId: [], scope: [], branch: "main" },
    );
    const args = { channelId: remote.meta.id, outboxAck: 0, outboxLatest: 0 };
    await vi.waitFor(() =>
      expect(
        polled(pollSyncEnvelopes(sync, args).envelopes, driveId).length,
      ).toBeGreaterThan(0),
    );

    const marker = purgeMarkerOperation(
      purgeDocumentAction({
        documentId: driveId,
        documentType: drive.header.documentType,
        requestId: "request-1",
      }),
    );
    await eventBus.emit(ReactorEventTypes.JOB_WRITE_READY, {
      jobId: "purge-job",
      operations: [
        {
          operation: marker,
          context: {
            documentId: driveId,
            documentType: drive.header.documentType,
            scope: "document",
            branch: "main",
            ordinal: 1_000_000,
          },
        },
      ],
      jobMeta: { batchId: "purge-batch", batchJobIds: ["purge-job"] },
      collectionMemberships: { [driveId]: [collection.key] },
    });

    // The client never acknowledged the first poll: its cursors are unchanged.
    await vi.waitFor(() =>
      expect(
        polled(pollSyncEnvelopes(sync, args).envelopes, driveId).filter(
          (op) => !isPurgeMarker(op.operation as never),
        ),
      ).toEqual([]),
    );
  });
});
