import {
  addFolder,
  driveDocumentModelModule,
} from "@powerhousedao/shared/document-drive";
import type {
  PeerCapability,
  PHDocumentHeader,
} from "@powerhousedao/shared/document-model";
import type * as DocumentModel from "@powerhousedao/shared/document-model";
import type { ProcessorFactory } from "@powerhousedao/shared/processors";
import {
  generateId,
  withSignaturePolicy,
} from "@powerhousedao/shared/document-model";
import type { Kysely } from "kysely";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentIntegrityService } from "../../src/admin/document-integrity-service.js";
import { createDefaultDatabase } from "../../src/core/create-default-database.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { InProcessReactorModule, IReactor } from "../../src/core/types.js";
import { createReactorInspector } from "../../src/inspector/from-module.js";
import { SnapshotPosition } from "../../src/cache/write-cache-types.js";
import { UnsupportedProtocolVersionError } from "../../src/shared/errors.js";
import { SKIPPED_DOCUMENT_MARKER } from "../../src/read-models/types.js";
import { REACTOR_SCHEMA } from "../../src/storage/migrations/migrator.js";
import { JobStatus, type JobInfo } from "../../src/shared/types.js";

const lenient = vi.hoisted(() => ({ on: false, knowsSeven: false }));

// While on, stands in for a reactor that runs base-reducer 3 and 7.
vi.mock("@powerhousedao/shared/document-model", async (importOriginal) => {
  const actual = await importOriginal<typeof DocumentModel>();
  const pretends = (header: PHDocumentHeader) =>
    lenient.on &&
    [3, 7].includes(header.protocolVersions?.["base-reducer"] ?? 0);
  return {
    ...actual,
    // The reactor refuses a base-reducer number shared does not know;
    // `knowsSeven` admits 7 without a reducer that can build it.
    isBaseReducerVersion: (version: unknown) =>
      ((lenient.on || lenient.knowsSeven) && version === 7) ||
      actual.isBaseReducerVersion(version),
    baseReducerVersion: (header: PHDocumentHeader) =>
      pretends(header) ? 2 : actual.baseReducerVersion(header),
    baseReducerCapabilities: (header: PHDocumentHeader) =>
      pretends(header)
        ? actual.capabilitiesOf(2)
        : actual.baseReducerCapabilities(header),
    optionalBaseReducerCapabilities: (header: PHDocumentHeader) =>
      pretends(header)
        ? actual.capabilitiesOf(2)
        : actual.optionalBaseReducerCapabilities(header),
    // Reads the version inside shared, past the stubs above.
    documentDerivesByRule: (header: PHDocumentHeader, scope: string) =>
      pretends(header)
        ? actual.derivesByRule(actual.capabilitiesOf(2), scope)
        : actual.documentDerivesByRule(header, scope),
  };
});

const BASE_REDUCER_7: PeerCapability = {
  kind: "protocol",
  name: "base-reducer",
  baseline: [1, 2],
  supported: () => [1, 2, 7],
  preferred: () => 2,
  optional: false,
};

const UNSUPPORTED = "br7-stored";
const AFTER = "v2-after";

function driveAt(id: string, version: number) {
  return withSignaturePolicy(
    driveDocumentModelModule.utils.createDocument(),
    "legacy",
    { id, protocolVersions: { "base-reducer": version } },
  );
}

async function settled(reactor: IReactor, info: JobInfo): Promise<JobInfo> {
  await vi.waitUntil(
    async () => {
      const { status } = await reactor.getJobStatus(info.id);
      return status === JobStatus.READ_READY || status === JobStatus.FAILED;
    },
    { timeout: 10_000, interval: 5 },
  );
  return reactor.getJobStatus(info.id);
}

async function succeeded(reactor: IReactor, info: JobInfo): Promise<JobInfo> {
  const job = await settled(reactor, info);
  expect(job.error?.message ?? job.status).toBe(JobStatus.READ_READY);
  return job;
}

function skipped(db: Kysely<any>) {
  return db
    .withSchema(REACTOR_SCHEMA)
    .selectFrom("ViewState")
    .select(["readModelId", "lastOrdinal"])
    .where("readModelId", "like", `%${SKIPPED_DOCUMENT_MARKER}%`)
    .execute();
}

function appliedThrough(model: unknown): number {
  return (model as { appliedThrough: number }).appliedThrough;
}

describe("read-only over documents at an unsupported base-reducer version", () => {
  const reactors: IReactor[] = [];

  afterEach(() => {
    lenient.on = false;
    lenient.knowsSeven = false;
    for (const reactor of reactors.splice(0)) {
      reactor.kill();
    }
  });

  async function build(
    configure: (builder: ReactorBuilder) => ReactorBuilder,
    drive: typeof driveDocumentModelModule = driveDocumentModelModule,
  ): Promise<InProcessReactorModule> {
    const module = await configure(
      new ReactorBuilder().withDocumentModelSources([drive as never]),
    ).buildModule();
    reactors.push(module.reactor);
    return module;
  }

  /** Read model cursors reset, so the next boot rebuilds the whole store. */
  async function storeWithUnsupported({
    version = 7,
    folders = 12,
    clearSnapshots = false,
  }: {
    version?: 3 | 7;
    folders?: number;
    clearSnapshots?: boolean;
  } = {}): Promise<{
    db: Kysely<any>;
    ordinals: { created: number; unsupported: number[]; last: number };
    head: DocumentModel.PHDocument;
  }> {
    const db = await createDefaultDatabase();
    lenient.on = true;
    const wide = await build((b) =>
      version === 7
        ? b.withKysely(db).withPeerCapabilities([BASE_REDUCER_7])
        : b
            .withKysely(db)
            .withExecutorConfig({ featureFlags: { undoV3: true } }),
    );
    const { reactor } = wide;
    await succeeded(
      reactor,
      await reactor.create(driveAt(UNSUPPORTED, version)),
    );
    for (let i = 0; i < folders; i++) {
      await succeeded(
        reactor,
        await reactor.execute(UNSUPPORTED, "main", [
          addFolder({ id: generateId(), name: `f${i}`, parentFolder: null }),
        ]),
      );
    }
    await succeeded(reactor, await reactor.create(driveAt(AFTER, 2)));
    await succeeded(
      reactor,
      await reactor.execute(AFTER, "main", [
        addFolder({ id: generateId(), name: "after", parentFolder: null }),
      ]),
    );
    expect(
      (await wide.keyframeStore.listKeyframes(UNSUPPORTED)).length,
    ).toBeGreaterThan(0);
    const head = await wide.writeCache.getState(UNSUPPORTED, "global", "main");
    expect(
      (await reactor.get(UNSUPPORTED)).header.protocolVersions?.[
        "base-reducer"
      ],
    ).toBe(version);
    await reactor.kill().completed;
    reactors.splice(reactors.indexOf(reactor), 1);
    lenient.on = false;

    const schema = db.withSchema(REACTOR_SCHEMA);
    const rows = await schema
      .selectFrom("operation_index_operations")
      .select(["ordinal", "documentId", "scope"])
      .orderBy("ordinal")
      .execute();
    await schema.updateTable("ViewState").set({ lastOrdinal: 0 }).execute();
    if (clearSnapshots) {
      await schema.deleteFrom("DocumentSnapshot").execute();
    }

    return {
      db,
      head,
      ordinals: {
        created: Number(
          rows.find(
            (r) => r.documentId === UNSUPPORTED && r.scope === "document",
          )!.ordinal,
        ),
        unsupported: rows
          .filter((r) => r.documentId === UNSUPPORTED && r.scope === "global")
          .map((r) => Number(r.ordinal)),
        last: Number(rows.at(-1)!.ordinal),
      },
    };
  }

  it("skips the document per document and keeps every other read", async () => {
    const { db, ordinals } = await storeWithUnsupported();
    expect(ordinals.unsupported.length).toBe(12);

    const narrow = await build((b) =>
      b.withKysely(db).withUnsupportedStoredDocuments("read-only"),
    );
    const { reactor } = narrow;
    const sweeps = await narrow.catchUp.sweepNow();

    expect(appliedThrough(narrow.documentView)).toBe(ordinals.last);
    expect(appliedThrough(narrow.processorManager)).toBe(ordinals.last);
    expect(sweeps.filter((sweep) => sweep.blockedAt)).toEqual([]);

    const stored = await reactor.get(UNSUPPORTED);
    expect(stored.header.protocolVersions?.["base-reducer"]).toBe(7);
    expect(await reactor.get(AFTER)).toBeDefined();

    const later = generateId();
    await succeeded(reactor, await reactor.create(driveAt(later, 2)));
    const write = await succeeded(
      reactor,
      await reactor.execute(later, "main", [
        addFolder({ id: generateId(), name: "later", parentFolder: null }),
      ]),
    );
    const document = await reactor.get<
      ReturnType<typeof driveDocumentModelModule.utils.createDocument>
    >(later, undefined, write.consistencyToken);
    expect(document.state.global.nodes.map((node) => node.name)).toEqual([
      "later",
    ]);

    for (const protocolSupport of [undefined, { "base-reducer": [1, 2] }]) {
      const integrity = new DocumentIntegrityService(
        narrow.keyframeStore,
        narrow.operationStore,
        narrow.writeCache,
        narrow.documentView,
        narrow.documentModelRegistry,
        protocolSupport,
      );
      const result = await integrity.validateDocument(UNSUPPORTED);
      expect(result.unsupported).toEqual({
        protocol: "base-reducer",
        version: 7,
      });
      expect(result.keyframeIssues).toEqual([]);
    }
  });

  async function expectRefusedWithoutSnapshot(version: 3 | 7): Promise<void> {
    const { db, ordinals } = await storeWithUnsupported({
      version,
      clearSnapshots: true,
    });

    const narrow = await build((b) =>
      b
        .withKysely(db)
        .withUnsupportedStoredDocuments("read-only")
        .withExecutorConfig({ featureFlags: { undoV3: false } }),
    );
    const { reactor } = narrow;
    const sweeps = await narrow.catchUp.sweepNow();

    expect(appliedThrough(narrow.documentView)).toBe(ordinals.last);
    expect(appliedThrough(narrow.processorManager)).toBe(ordinals.last);
    expect(sweeps.filter((sweep) => sweep.blockedAt)).toEqual([]);

    await expect(reactor.get(UNSUPPORTED)).rejects.toThrow(/not found/i);
    const after =
      await reactor.get<
        ReturnType<typeof driveDocumentModelModule.utils.createDocument>
      >(AFTER);
    expect(after.state.global.nodes.map((node) => node.name)).toEqual([
      "after",
    ]);

    const integrity = new DocumentIntegrityService(
      narrow.keyframeStore,
      narrow.operationStore,
      narrow.writeCache,
      narrow.documentView,
      narrow.documentModelRegistry,
      { "base-reducer": [1, 2] },
    );
    const result = await integrity.validateDocument(UNSUPPORTED);
    expect(result.unsupported).toEqual({ protocol: "base-reducer", version });

    const inspected =
      await createReactorInspector(narrow).validateDocument(UNSUPPORTED);
    expect(inspected.unsupported).toEqual({
      protocol: "base-reducer",
      version,
    });
  }

  it("serves no state for the document when no snapshot was stored", async () => {
    await expectRefusedWithoutSnapshot(7);
  });

  it("skips a base-reducer 3 document with undoV3 off like any unsupported version", async () => {
    await expectRefusedWithoutSnapshot(3);
  });

  it("refuses the document from a warm cache", async () => {
    const { db, head } = await storeWithUnsupported();
    const narrow = await build((b) =>
      b.withKysely(db).withUnsupportedStoredDocuments("read-only"),
    );
    const revision = head.header.revision.global - 1;
    narrow.writeCache.putState(
      UNSUPPORTED,
      "global",
      "main",
      revision,
      head,
      SnapshotPosition.Head,
    );

    for (const target of [undefined, revision]) {
      await expect(
        narrow.writeCache.getState(UNSUPPORTED, "global", "main", target),
      ).rejects.toSatisfy(UnsupportedProtocolVersionError.isError);
    }
  });

  it("reports the document unsupported when its head is the latest keyframe", async () => {
    const { db } = await storeWithUnsupported({ folders: 11 });
    const narrow = await build((b) =>
      b.withKysely(db).withUnsupportedStoredDocuments("read-only"),
    );
    const keyframes = await narrow.keyframeStore.listKeyframes(UNSUPPORTED);
    const { revision } = await narrow.operationStore.getRevisions(
      UNSUPPORTED,
      "main",
    );
    expect(Math.max(...keyframes.map((k) => k.revision))).toBe(
      revision.global - 1,
    );

    // A reducer that accepts the version must not hide that support refuses it.
    lenient.on = true;
    const integrity = new DocumentIntegrityService(
      narrow.keyframeStore,
      narrow.operationStore,
      narrow.writeCache,
      narrow.documentView,
      narrow.documentModelRegistry,
      { "base-reducer": [1, 2] },
    );
    const result = await integrity.validateDocument(UNSUPPORTED);
    expect(result.unsupported).toEqual({
      protocol: "base-reducer",
      version: 7,
    });
  });

  it("serves the document once support covers it, delivering each operation once", async () => {
    const { db, ordinals } = await storeWithUnsupported({
      clearSnapshots: true,
    });
    const deliveries: { drive: string; documentId: string; ordinal: number }[] =
      [];
    const factory: ProcessorFactory = (header) => [
      {
        filter: { documentId: ["*"] },
        processor: {
          onOperations: (operations) => {
            for (const { context } of operations) {
              deliveries.push({
                drive: header.id,
                documentId: context.documentId,
                ordinal: context.ordinal,
              });
            }
            return Promise.resolve();
          },
          onDisconnect: () => Promise.resolve(),
        },
      },
    ];
    async function caughtUp(module: InProcessReactorModule, drives: string[]) {
      await module.processorManager.registerFactory("probe", factory);
      await vi.waitUntil(
        () => {
          const tracked = module.processorManager.getAll();
          return drives.every((drive) =>
            tracked.some(
              (p) => p.driveId === drive && p.lastOrdinal >= ordinals.last,
            ),
          );
        },
        { timeout: 10_000, interval: 5 },
      );
    }

    const narrow = await build((b) =>
      b.withKysely(db).withUnsupportedStoredDocuments("read-only"),
    );
    await narrow.catchUp.sweepNow();
    await expect(narrow.reactor.get(UNSUPPORTED)).rejects.toThrow(/not found/i);
    await caughtUp(narrow, [AFTER]);
    expect(await skipped(db)).toEqual([
      {
        readModelId: `document-view${SKIPPED_DOCUMENT_MARKER}${UNSUPPORTED}`,
        lastOrdinal: ordinals.created,
      },
    ]);
    await narrow.reactor.kill().completed;
    reactors.splice(reactors.indexOf(narrow.reactor), 1);

    lenient.on = true;
    const wide = await build((b) =>
      b.withKysely(db).withPeerCapabilities([BASE_REDUCER_7]),
    );
    const document =
      await wide.reactor.get<
        ReturnType<typeof driveDocumentModelModule.utils.createDocument>
      >(UNSUPPORTED);
    expect(document.state.global.nodes).toHaveLength(12);
    expect(document.header.revision.global).toBe(12);
    await caughtUp(wide, [AFTER, UNSUPPORTED]);
    expect(await skipped(db)).toEqual([]);

    for (const drive of [AFTER, UNSUPPORTED]) {
      const received = deliveries
        .filter((d) => d.drive === drive && d.documentId === UNSUPPORTED)
        .map((d) => d.ordinal)
        .filter((ordinal) => ordinals.unsupported.includes(ordinal))
        .sort((a, b) => a - b);
      expect(received, drive).toEqual(ordinals.unsupported);
    }
  });

  it("keeps a skip its retry re-records until the model can build the document", async () => {
    const db = await createDefaultDatabase();
    const writer = await build((b) =>
      b.withKysely(db).withExecutorConfig({ featureFlags: { undoV3: true } }),
    );
    await succeeded(
      writer.reactor,
      await writer.reactor.create(driveAt(UNSUPPORTED, 3)),
    );
    for (let i = 0; i < 12; i++) {
      await succeeded(
        writer.reactor,
        await writer.reactor.execute(UNSUPPORTED, "main", [
          addFolder({ id: generateId(), name: `f${i}`, parentFolder: null }),
        ]),
      );
    }
    await writer.reactor.kill().completed;
    reactors.splice(reactors.indexOf(writer.reactor), 1);
    const schema = db.withSchema(REACTOR_SCHEMA);
    await schema.updateTable("ViewState").set({ lastOrdinal: 0 }).execute();
    await schema.deleteFrom("DocumentSnapshot").execute();
    const firstGlobal = Number(
      (await schema
        .selectFrom("operation_index_operations")
        .select("ordinal")
        .where("documentId", "=", UNSUPPORTED)
        .where("scope", "=", "global")
        .orderBy("ordinal")
        .executeTakeFirstOrThrow())!.ordinal,
    );
    const record = [
      {
        readModelId: `document-view${SKIPPED_DOCUMENT_MARKER}${UNSUPPORTED}`,
        lastOrdinal: firstGlobal,
      },
    ];

    const untagged = {
      ...driveDocumentModelModule,
      reducer: ((
        ...args: Parameters<typeof driveDocumentModelModule.reducer>
      ) =>
        driveDocumentModelModule.reducer(
          ...args,
        )) as typeof driveDocumentModelModule.reducer,
    };
    for (let boot = 0; boot < 2; boot++) {
      const narrow = await build(
        (b) =>
          b
            .withKysely(db)
            .withUnsupportedStoredDocuments("read-only")
            .withExecutorConfig({ featureFlags: { undoV3: true } }),
        untagged,
      );
      await narrow.catchUp.sweepNow();
      expect(await skipped(db), `boot ${boot}`).toEqual(record);
      await narrow.reactor.kill().completed;
      reactors.splice(reactors.indexOf(narrow.reactor), 1);
    }

    const tagged = await build((b) =>
      b.withKysely(db).withExecutorConfig({ featureFlags: { undoV3: true } }),
    );
    const document =
      await tagged.reactor.get<
        ReturnType<typeof driveDocumentModelModule.utils.createDocument>
      >(UNSUPPORTED);
    expect(document.state.global.nodes).toHaveLength(12);
    expect(document.header.protocolVersions?.["base-reducer"]).toBe(3);
    expect(await skipped(db)).toEqual([]);
  });

  it("still blocks on a document it registers but cannot build", async () => {
    const { db, ordinals } = await storeWithUnsupported();
    lenient.knowsSeven = true;

    const registered = await build((b) =>
      b.withKysely(db).withPeerCapabilities([BASE_REDUCER_7]),
    );

    const sweeps = [
      ...(await registered.catchUp.sweepNow()),
      ...(await registered.catchUp.sweepNow()),
    ];

    expect(appliedThrough(registered.documentView)).toBe(
      ordinals.unsupported[0] - 1,
    );
    expect(
      sweeps
        .filter((sweep) => sweep.consumerId === "document-view")
        .map((sweep) => sweep.blockedAt?.documentId),
    ).toEqual([UNSUPPORTED, UNSUPPORTED]);
  });

  it("skips a registered base-reducer number this build does not know", async () => {
    const { db, ordinals } = await storeWithUnsupported();

    const registered = await build((b) =>
      b.withKysely(db).withPeerCapabilities([BASE_REDUCER_7]),
    );
    const sweeps = await registered.catchUp.sweepNow();

    expect(appliedThrough(registered.documentView)).toBe(ordinals.last);
    expect(
      sweeps
        .filter((sweep) => sweep.consumerId === "document-view")
        .map((sweep) => sweep.blockedAt),
    ).toEqual([undefined]);
  });
});
