import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import type {
  IProcessor,
  ProcessorFilter,
} from "@powerhousedao/shared/processors";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

type Recorder = IProcessor & { events: string[]; fail?: boolean };

function recorder(): Recorder {
  const processor: Recorder = {
    events: [],
    onOperations(ops: OperationWithContext[]) {
      if (processor.fail) return Promise.reject(new Error("processor down"));
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

function deletionsOf(...processors: Recorder[]): string[] {
  return processors
    .flatMap((p) => p.events)
    .filter(
      (e) => e.startsWith("DELETE_DOCUMENT") || e.startsWith("PURGE_DOCUMENT"),
    );
}

describe("a drive's deletion owed to processors not live at it [Postgres]", () => {
  let database: TestDatabase;
  let host: PurgeReactor;

  beforeEach(async () => {
    database = await createTestDatabase("reactor_drive_deletion_owed");
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

  async function createDrive(): Promise<string> {
    const drive = legacyDrive();
    await succeeded(host.reactor, (await host.reactor.create(drive)).id);
    return drive.header.id;
  }

  async function register(
    factoryId: string,
    driveId: string,
    processor: IProcessor,
    filter: ProcessorFilter,
  ) {
    await manager().registerFactory(factoryId, (header) =>
      header.id === driveId ? [{ processor, filter }] : [],
    );
  }

  async function deleteDrive(driveId: string) {
    await succeeded(
      host.reactor,
      (await host.reactor.deleteDocument(driveId)).id,
    );
  }

  async function purge(driveId: string) {
    const [info] = await host.service.enqueuePurge([driveId], "request-1");
    await succeeded(host.reactor, info!.id);
  }

  async function cursorRows(driveId: string) {
    const db = host.db as unknown as Kysely<DocumentViewDatabase>;
    return db
      .selectFrom("ProcessorCursor")
      .select("processorId")
      .where("driveId", "=", driveId)
      .execute();
  }

  async function restart() {
    await host.kill();
    host = await startReactor(database);
  }

  it("delivers a deletion made before the factory registers after a restart", async () => {
    const driveId = await createDrive();
    await register("pkg", driveId, recorder(), { documentType: [DOC_TYPE] });
    await restart();

    await deleteDrive(driveId);
    const second = recorder();
    await register("pkg", driveId, second, { documentType: [DOC_TYPE] });
    await purge(driveId);

    expect(second.events).toEqual([`DELETE_DOCUMENT ${driveId}`, "disconnect"]);
    expect(await cursorRows(driveId)).toEqual([]);
  });

  it("delivers the marker as the deletion after a purge and a restart", async () => {
    const driveId = await createDrive();
    await register("pkg", driveId, recorder(), { documentType: [DOC_TYPE] });
    await restart();
    await deleteDrive(driveId);
    await purge(driveId);
    await restart();

    const second = recorder();
    await register("pkg", driveId, second, { documentType: [DOC_TYPE] });

    expect(second.events).toEqual([`PURGE_DOCUMENT ${driveId}`, "disconnect"]);
    expect(await cursorRows(driveId)).toEqual([]);
  });

  it("delivers the deletion to an errored processor before it closes", async () => {
    const driveId = await createDrive();
    const processor = recorder();
    await register("errs", driveId, processor, { documentId: ["*"] });
    processor.fail = true;
    const other = legacyDrive();
    await succeeded(host.reactor, (await host.reactor.create(other)).id);
    const tracked = () =>
      manager()
        .getAll()
        .find((t) => t.factoryId === "errs" && t.driveId === driveId);
    await vi.waitFor(() => expect(tracked()?.status).toBe("errored"));
    processor.fail = false;

    await deleteDrive(driveId);
    await purge(driveId);
    await vi.waitFor(() => expect(processor.events).toContain("disconnect"));

    expect(deletionsOf(processor)).toEqual([`DELETE_DOCUMENT ${driveId}`]);
    expect(await cursorRows(driveId)).toEqual([]);
  });
});
