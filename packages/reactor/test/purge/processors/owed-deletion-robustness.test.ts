import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import type {
  IProcessor,
  ProcessorFilter,
  ProcessorRecord,
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

  async function restart() {
    await host.kill();
    host = await startReactor(database);
  }

  async function purge(driveId: string) {
    const [info] = await host.service.enqueuePurge([driveId], "request-1");
    await succeeded(host.reactor, info!.id);
  }

  const filter: ProcessorFilter = { documentType: [DOC_TYPE] };

  // Keyed on the slug, as vetra's codegen factory is.
  function slugFactory(slug: string, made: Recorder[]) {
    return (h: { slug?: string }) => {
      if (h.slug !== slug) return Promise.resolve([]);
      const p = recorder();
      made.push(p);
      return Promise.resolve([{ processor: p, filter }]);
    };
  }

  async function registerBeforeDrive(slug: string, made: Recorder[]) {
    await manager().registerFactory("pkg", slugFactory(slug, made));
    const driveId = await createDrive(slug);
    await vi.waitFor(async () =>
      expect((await cursorRows(driveId)).length).toBe(1),
    );
    expect(made.length).toBe(1);
    return driveId;
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
    await manager().unregisterFactory("pkg");
    // The next reload works again; its erasure waits out the one before.
    const third = recorder();
    await manager().registerFactory(
      "pkg",
      wrapped((h) =>
        Promise.resolve(h.id === driveId ? [{ processor: third, filter }] : []),
      ),
    );

    await vi.waitFor(() =>
      expect(deletions(first, third)).toEqual([`DELETE_DOCUMENT ${driveId}`]),
    );
    await vi.waitFor(async () => expect(await cursorRows(driveId)).toEqual([]));
  });

  it("hands a slug-keyed factory the drive's real header for its owed deletion", async () => {
    const made: Recorder[] = [];
    const driveId = await registerBeforeDrive("tenant-a", made);

    await manager().unregisterFactory("pkg");
    await deleteDrive(driveId);
    await manager().registerFactory("pkg", slugFactory("tenant-a", made));

    await vi.waitFor(() =>
      expect(deletions(...made)).toEqual([`DELETE_DOCUMENT ${driveId}`]),
    );
    await vi.waitFor(async () => expect(await cursorRows(driveId)).toEqual([]));
  });

  it("rebuilds the header from the drive's stream after a restart", async () => {
    const made: Recorder[] = [];
    const driveId = await registerBeforeDrive("tenant-b", made);
    await restart();

    await deleteDrive(driveId);
    await manager().registerFactory("pkg", slugFactory("tenant-b", made));

    await vi.waitFor(() =>
      expect(deletions(...made)).toEqual([`DELETE_DOCUMENT ${driveId}`]),
    );
    await vi.waitFor(async () => expect(await cursorRows(driveId)).toEqual([]));
  });

  it("hands a late registration the header of a drive that already exists", async () => {
    const driveId = await createDrive("tenant-c");
    const made: Recorder[] = [];
    await manager().registerFactory("pkg", slugFactory("tenant-c", made));

    expect(made.length).toBe(1);
    expect(await cursorRows(driveId)).toHaveLength(1);
  });

  it("hands a minimal header once the drive is purged, and the rows stay owed", async () => {
    const made: Recorder[] = [];
    const driveId = await registerBeforeDrive("tenant-d", made);
    await manager().unregisterFactory("pkg");
    await deleteDrive(driveId);
    await purge(driveId);

    const headers: { slug?: string }[] = [];
    const factory = (h: { id: string; slug?: string }) => {
      headers.push(h);
      return slugFactory("tenant-d", made)(h);
    };
    await manager().registerFactory("pkg", factory);
    await vi.waitFor(() => expect(headers).toHaveLength(1));
    // Called again only because the rows still owe the deletion.
    await manager().unregisterFactory("pkg");
    await manager().registerFactory("pkg", factory);
    await vi.waitFor(() => expect(headers).toHaveLength(2));

    expect(headers[0]).toEqual(
      expect.objectContaining({ id: driveId, slug: "" }),
    );
    expect(deletions(...made)).toEqual([]);
    expect(await cursorRows(driveId)).toHaveLength(1);
  });

  it("resolves registerFactory while a processor hangs on its owed deletion", async () => {
    const driveId = await createDrive();
    await manager().registerFactory("pkg", (h) =>
      h.id === driveId ? [{ processor: recorder(), filter }] : [],
    );
    await manager().unregisterFactory("pkg");
    await deleteDrive(driveId);

    let reached = false;
    const hung: IProcessor = {
      onOperations: () => {
        reached = true;
        return new Promise(() => undefined);
      },
      onDisconnect: () => Promise.resolve(),
    };
    const registered = manager()
      .registerFactory("pkg", (h) =>
        h.id === driveId ? [{ processor: hung, filter }] : [],
      )
      .then(() => "resolved");
    const outcome = await Promise.race([
      registered,
      new Promise((resolve) => setTimeout(() => resolve("pending"), 3_000)),
    ]);

    expect(outcome).toBe("resolved");
    await vi.waitFor(() => expect(reached).toBe(true));
    expect(await cursorRows(driveId)).toHaveLength(1);
  }, 30_000);

  type QueueOptions = {
    purged: (ids: string[]) => Promise<ReadonlySet<string>>;
    lookupRetryMs?: number;
    lookupRetries?: number;
  };

  // Every tombstone lookup of the manager and of `driveId`'s processor fails.
  function failLookups(driveId: string) {
    const internals = manager() as unknown as {
      processorsByDrive: Map<string, { queue: { options: QueueOptions } }[]>;
      checkPurged: unknown;
    };
    const options = internals.processorsByDrive.get(driveId)![0]!.queue.options;
    const state = { lookups: 0, failing: true };
    const real = options.purged;
    options.purged = (ids) => {
      state.lookups++;
      return state.failing ? Promise.reject(new Error("db down")) : real(ids);
    };
    internals.checkPurged = () => {
      const purged = Promise.reject(new Error("db down"));
      purged.catch(() => undefined);
      return { purged };
    };
    return { options, state };
  }

  it("parks a processor whose tombstone lookup keeps failing, and resumes it once the lookup answers", async () => {
    const driveId = await createDrive();
    const processor = recorder();
    await manager().registerFactory("pkg", (h) =>
      h.id === driveId ? [{ processor, filter: { documentId: ["*"] } }] : [],
    );
    const { options, state } = failLookups(driveId);
    options.lookupRetryMs = 1;
    options.lookupRetries = 3;

    const other = await createDrive();
    const tracked = () =>
      manager()
        .getAll()
        .find((t) => t.driveId === driveId);
    await vi.waitFor(() => expect(tracked()?.lastError).toBe("db down"), {
      timeout: 10_000,
    });
    expect(tracked()?.status).toBe("active");
    expect(processor.events).not.toContain(`CREATE_DOCUMENT ${other}`);

    state.failing = false;
    await vi.waitFor(() =>
      expect(processor.events).toContain(`CREATE_DOCUMENT ${other}`),
    );
    expect(tracked()).toMatchObject({ status: "active", lastError: undefined });
  }, 30_000);

  it("stops retrying a failing tombstone lookup when the reactor is killed", async () => {
    const driveId = await createDrive();
    const processor = recorder();
    await manager().registerFactory("pkg", (h) =>
      h.id === driveId ? [{ processor, filter: { documentId: ["*"] } }] : [],
    );
    const { state } = failLookups(driveId);

    await createDrive();
    await vi.waitFor(() => expect(state.lookups).toBeGreaterThan(0), {
      timeout: 10_000,
    });
    const started = Date.now();
    await host.kill();
    const killMs = Date.now() - started;
    const atKill = state.lookups;
    await new Promise((resolve) => setTimeout(resolve, 3_000));

    expect(killMs).toBeLessThan(2_000);
    expect(state.lookups).toBe(atKill);
    expect(processor.events).toContain("disconnect");
  }, 30_000);

  it("shows a processor that throws on its owed deletion as errored, with a retry", async () => {
    const driveId = await createDrive();
    await manager().registerFactory("pkg", (h) =>
      h.id === driveId ? [{ processor: recorder(), filter }] : [],
    );
    await manager().unregisterFactory("pkg");
    await deleteDrive(driveId);

    let failing = true;
    const made: Recorder[] = [];
    await manager().registerFactory("pkg", (h) => {
      if (h.id !== driveId) return [];
      const p = recorder();
      const deliver = p.onOperations.bind(p);
      p.onOperations = (ops) =>
        failing ? Promise.reject(new Error("still down")) : deliver(ops);
      made.push(p);
      return [{ processor: p, filter }];
    });
    const tracked = () =>
      manager()
        .getAll()
        .find((t) => t.driveId === driveId);
    await vi.waitFor(() =>
      expect(tracked()).toMatchObject({
        status: "errored",
        lastError: "still down",
      }),
    );

    failing = false;
    await tracked()!.retry();

    expect(deletions(...made)).toEqual([`DELETE_DOCUMENT ${driveId}`]);
    expect(tracked()).toBeUndefined();
    expect(await cursorRows(driveId)).toEqual([]);
  });
});
