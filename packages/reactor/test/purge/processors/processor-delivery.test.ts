import {
  generateId,
  isPurgeMarker,
  type OperationWithContext,
} from "@powerhousedao/shared/document-model";
import type {
  IProcessor,
  ProcessorFilter,
} from "@powerhousedao/shared/processors";
import { setModelName } from "document-model";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { IOperationIndex } from "../../../src/cache/operation-index-types.js";
import type { ProcessorManager } from "../../../src/processors/processor-manager.js";
import type { PagedResults } from "../../../src/shared/types.js";
import { createDocModelDocument, deferred } from "../../factories.js";
import {
  createTestDatabase,
  legacyDrive,
  startReactor,
  succeeded,
  type PurgeReactor,
  type TestDatabase,
} from "../executor/harness.js";

const DRIVE_TYPE = "powerhouse/document-drive";
const DOC_TYPE = "powerhouse/document-model";

type Recorder = IProcessor & {
  events: string[];
  received: OperationWithContext[];
};

function recorder(): Recorder {
  const processor: Recorder = {
    events: [],
    received: [],
    onOperations(ops) {
      processor.received.push(...ops);
      for (const op of ops) {
        processor.events.push(
          `${op.operation.action.type} ${op.context.documentId}`,
        );
      }
      return Promise.resolve();
    },
    onDisconnect() {
      processor.events.push("disconnect");
      return Promise.resolve();
    },
  };
  return processor;
}

describe("processor delivery around erasure [Postgres]", () => {
  let database: TestDatabase;
  let host: PurgeReactor;

  beforeAll(async () => {
    database = await createTestDatabase("reactor_purge_processor_delivery");
    host = await startReactor(database);
  });

  afterAll(async () => {
    try {
      await host?.kill();
    } finally {
      await database?.drop();
    }
  });

  const manager = () => host.module.processorManager as ProcessorManager;

  async function createDrive(): Promise<string> {
    const drive = legacyDrive();
    await succeeded(host.reactor, (await host.reactor.create(drive)).id);
    return drive.header.id;
  }

  async function createDeletedDocument(): Promise<string> {
    const document = createDocModelDocument({ id: generateId() });
    const documentId = document.header.id;
    await succeeded(host.reactor, (await host.reactor.create(document)).id);
    await succeeded(
      host.reactor,
      (
        await host.reactor.execute(documentId, "main", [
          setModelName({ name: "personal" }),
        ])
      ).id,
    );
    await succeeded(
      host.reactor,
      (await host.reactor.deleteDocument(documentId)).id,
    );
    return documentId;
  }

  async function purge(documentId: string): Promise<void> {
    const [info] = await host.service.enqueuePurge([documentId], "request-1");
    await succeeded(host.reactor, info!.id);
  }

  /** One processor, for `driveId` only. */
  async function register(
    factoryId: string,
    driveId: string,
    processor: IProcessor,
    filter: ProcessorFilter,
  ): Promise<void> {
    await manager().registerFactory(factoryId, (header) =>
      header.id === driveId ? [{ processor, filter }] : [],
    );
  }

  async function markerOf(
    documentId: string,
    read: IOperationIndex["getSinceOrdinal"] = (ordinal) =>
      host.module.operationIndex.getSinceOrdinal(ordinal),
  ): Promise<OperationWithContext> {
    let page: PagedResults<OperationWithContext> | undefined = await read(0);
    while (page) {
      const marker = page.results.find(
        (op) =>
          isPurgeMarker(op.operation) && op.context.documentId === documentId,
      );
      if (marker) return marker;
      page = page.next ? await page.next() : undefined;
    }
    throw new Error(`no marker for ${documentId}`);
  }

  function nonMarkerOpsOf(processor: Recorder, documentId: string) {
    return processor.received.filter(
      (op) =>
        op.context.documentId === documentId && !isPurgeMarker(op.operation),
    );
  }

  it("delivers a deleted drive's DELETE_DOCUMENT to its processors before they close", async () => {
    const driveId = await createDrive();
    const processor = recorder();
    // The filter excludes the drive: its deletion still reaches its processors.
    await register("drive-deletion", driveId, processor, {
      documentType: [DOC_TYPE],
    });
    const processorId = manager()
      .getAll()
      .find(
        (tracked) =>
          tracked.factoryId === "drive-deletion" && tracked.driveId === driveId,
      )!.processorId;

    await succeeded(
      host.reactor,
      (await host.reactor.deleteDocument(driveId)).id,
    );

    await vi.waitFor(() => expect(processor.events).toContain("disconnect"));
    const own = processor.events.filter(
      (event) => event.endsWith(driveId) || event === "disconnect",
    );
    expect(own).toEqual([`DELETE_DOCUMENT ${driveId}`, "disconnect"]);
    expect(manager().get(processorId)).toBeUndefined();
    await manager().unregisterFactory("drive-deletion");
  });

  it("routes a purged document's marker but not its operations read before the purge", async () => {
    const driveId = await createDrive();
    const processor = recorder();
    await register("routed", driveId, processor, { documentId: ["*"] });
    const documentId = await createDeletedDocument();
    await vi.waitFor(() =>
      expect(nonMarkerOpsOf(processor, documentId).length).toBeGreaterThan(0),
    );
    const read = nonMarkerOpsOf(processor, documentId);

    await purge(documentId);
    const marker = await markerOf(documentId);
    await vi.waitFor(() =>
      expect(processor.received.map((op) => op.operation.id)).toContain(
        marker.operation.id,
      ),
    );

    // A pass that fetched before the purge committed and commits after it.
    processor.received.length = 0;
    const commit = (
      manager() as unknown as {
        commitOperations(items: OperationWithContext[]): Promise<void>;
      }
    ).commitOperations.bind(manager());
    await commit([...read, marker]);

    expect(nonMarkerOpsOf(processor, documentId)).toEqual([]);
    expect(processor.received.map((op) => op.operation.id)).toEqual([
      marker.operation.id,
    ]);
    await manager().unregisterFactory("routed");
  });

  it("backfills past a purged document's operations from a page read before the purge", async () => {
    const driveId = await createDrive();
    const documentId = await createDeletedDocument();
    const index = host.module.operationIndex;
    const original = index.getSinceOrdinal.bind(index);
    let purgedDuringRead = false;
    const purgeDone = deferred();
    // The registration's backfill starts at ordinal 0; no other reader does.
    const spy = vi
      .spyOn(index, "getSinceOrdinal")
      .mockImplementation(async (ordinal, ...rest) => {
        const page = await original(ordinal, ...rest);
        if (ordinal === 0 && !purgedDuringRead) {
          purgedDuringRead = true;
          expect(
            page.results.some((op) => op.context.documentId === documentId),
          ).toBe(true);
          await purge(documentId);
          purgeDone.resolve();
        }
        return page;
      });

    const processor = recorder();
    try {
      await register("backfill", driveId, processor, { documentId: ["*"] });
      await purgeDone.promise;
      const marker = await markerOf(documentId, original);
      await vi.waitFor(
        () =>
          expect(processor.received.map((op) => op.operation.id)).toContain(
            marker.operation.id,
          ),
        { timeout: 10_000 },
      );
    } finally {
      spy.mockRestore();
    }

    expect(purgedDuringRead).toBe(true);
    expect(nonMarkerOpsOf(processor, documentId)).toEqual([]);
    expect(
      processor.received.some((op) => op.context.documentType === DRIVE_TYPE),
    ).toBe(true);
    await manager().unregisterFactory("backfill");
  });
});
