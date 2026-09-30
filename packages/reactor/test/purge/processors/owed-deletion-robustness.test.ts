import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import type {
  IProcessor,
  ProcessorFilter,
  ProcessorRecord,
} from "@powerhousedao/shared/processors";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProcessorManager } from "../../../src/processors/processor-manager.js";
import type { DocumentViewDatabase } from "../../../src/read-models/types.js";
import {
  createTestDatabase,
  legacyDrive,
  startReactor,
  succeeded,
  type PurgeReactor,
  type TestDatabase,
} from "../executor/harness.js";

const DOC_TYPE = "powerhouse/document-model";

type Recorder = IProcessor & { events: string[] };

function recorder(): Recorder {
  const processor: Recorder = {
    events: [],
    onOperations(ops: OperationWithContext[]) {
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

const deletions = (...ps: Recorder[]) =>
  ps
    .flatMap((p) => p.events)
    .filter(
      (e) => e.startsWith("DELETE_DOCUMENT") || e.startsWith("PURGE_DOCUMENT"),
    );

describe("owed drive deletions [Postgres]", () => {
  let database: TestDatabase;
  let host: PurgeReactor;

  beforeEach(async () => {
    database = await createTestDatabase("reactor_owed_deletion_robustness");
    host = await startReactor(database);
  });

  afterEach(async () => {
    try {
      await host?.kill();
    } finally {
      await database?.drop();
    }
  });

  const manager = () => host.module.processorManager as ProcessorManager;

  async function createDrive(slug?: string): Promise<string> {
    const drive = legacyDrive();
    if (slug) drive.header.slug = slug;
    await succeeded(host.reactor, (await host.reactor.create(drive)).id);
    return drive.header.id;
  }

  async function deleteDrive(driveId: string) {
    await succeeded(
      host.reactor,
      (await host.reactor.deleteDocument(driveId)).id,
    );
  }

  async function cursorRows(driveId: string) {
    const db = host.db as unknown as Kysely<DocumentViewDatabase>;
    return db
      .selectFrom("ProcessorCursor")
      .select(["processorId", "status"])
      .where("driveId", "=", driveId)
      .execute();
  }

  // reactor-api server.ts wraps each package's factories so a throw reads as [].
  function wrapped(
    inner: (header: { id: string }) => Promise<ProcessorRecord[]>,
  ) {
    return async (header: { id: string }) => {
      try {
        return await inner(header);
      } catch {
        return [];
      }
    };
  }

  it("keeps the rows a factory run made no processor for, so a later run pays them", async () => {
    const driveId = await createDrive();
    const filter: ProcessorFilter = { documentType: [DOC_TYPE] };
    const first = recorder();
    await manager().registerFactory(
      "pkg",
      wrapped((h) =>
        Promise.resolve(h.id === driveId ? [{ processor: first, filter }] : []),
      ),
    );
    expect((await cursorRows(driveId)).length).toBe(1);
    await manager().unregisterFactory("pkg");
    await deleteDrive(driveId);

    // A reload whose factory hits a transient error (createNamespace, say).
    await manager().registerFactory(
      "pkg",
      wrapped(() => Promise.reject(new Error("db hiccup"))),
    );
    const rowsAfterHiccup = await cursorRows(driveId);
    // The next reload works again.
    await manager().unregisterFactory("pkg");
    const third = recorder();
    await manager().registerFactory(
      "pkg",
      wrapped((h) =>
        Promise.resolve(h.id === driveId ? [{ processor: third, filter }] : []),
      ),
    );

    expect({ rowsAfterHiccup, got: deletions(first, third) }).toEqual({
      rowsAfterHiccup: [expect.anything()],
      got: [`DELETE_DOCUMENT ${driveId}`],
    });
  });
});
