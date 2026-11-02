import {
  addFolder,
  driveDocumentModelModule,
} from "@powerhousedao/shared/document-drive";
import {
  generateId,
  localPeerManifest,
  withSignaturePolicy,
  type PeerCapability,
} from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DriveCollectionId } from "../../src/cache/operation-index-types.js";
import { createDefaultDatabase } from "../../src/core/create-default-database.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { InProcessReactorModule, IReactor } from "../../src/core/types.js";
import { EventBus } from "../../src/events/event-bus.js";
import { UnsupportedStoredProtocolError } from "../../src/shared/errors.js";
import { JobStatus, type JobInfo } from "../../src/shared/types.js";
import type { ISyncCursorStorage } from "../../src/storage/interfaces.js";
import type { IChannelFactory } from "../../src/sync/interfaces.js";
import { SyncBuilder } from "../../src/sync/sync-builder.js";
import type { SyncEnvelope } from "../../src/sync/types.js";
import { syncOperationErrorType } from "../../src/sync/utils.js";
import {
  createCreateDocumentOperation,
  createTestOperation,
} from "../factories.js";
import { TestChannel } from "../sync/channels/test-channel.js";
import {
  baseReducerVersionsFor,
  undo,
  type Operation,
} from "@powerhousedao/shared/document-model";
import type { Kysely } from "kysely";
import { DocumentIntegrityService } from "../../src/admin/document-integrity-service.js";
import { synthesizedActionId } from "../../src/executor/synthesized-signing.js";
import { SKIPPED_DOCUMENT_MARKER } from "../../src/read-models/types.js";
import { REACTOR_SCHEMA } from "../../src/storage/migrations/migrator.js";
import { authorRetraction, undoV3Flags } from "../factories.js";

const DRIVE = "powerhouse/document-drive";

const BASE_REDUCER_7: PeerCapability = {
  kind: "protocol",
  name: "base-reducer",
  baseline: [1, 2],
  supported: () => [1, 2, 7],
  preferred: () => 2,
  optional: false,
};

function spyLogger(): ILogger & { info: ReturnType<typeof vi.fn> } {
  const logger = {
    level: "error",
    verbose: () => {},
    debug: () => {},
    info: vi.fn(),
    warn: () => {},
    error: () => {},
    errorHandler: () => {},
    child: () => logger,
  };
  return logger as unknown as ILogger & { info: ReturnType<typeof vi.fn> };
}

async function settled(reactor: IReactor, jobId: string): Promise<JobInfo> {
  await vi.waitUntil(
    async () => {
      const { status } = await reactor.getJobStatus(jobId);
      return status === JobStatus.READ_READY || status === JobStatus.FAILED;
    },
    { timeout: 10_000, interval: 5 },
  );
  return reactor.getJobStatus(jobId);
}

function driveAt(protocolVersions: Record<string, number>, id: string) {
  return withSignaturePolicy(
    driveDocumentModelModule.utils.createDocument(),
    "legacy",
    { id, protocolVersions },
  );
}

describe("protocol admission", () => {
  const reactors: IReactor[] = [];

  afterEach(() => {
    for (const reactor of reactors.splice(0)) {
      reactor.kill();
    }
  });

  async function build(
    configure: (builder: ReactorBuilder) => ReactorBuilder = (b) => b,
  ): Promise<InProcessReactorModule> {
    const module = await configure(
      new ReactorBuilder().withDocumentModelSources([
        driveDocumentModelModule as never,
      ]),
    ).buildModule();
    reactors.push(module.reactor);
    return module;
  }

  it("refuses a create at base-reducer 7 and names the refusal", async () => {
    const { reactor } = await build();

    const info = await reactor.create(driveAt({ "base-reducer": 7 }, "br7"));
    const job = await settled(reactor, info.id);

    expect(job.status).toBe(JobStatus.FAILED);
    expect(job.error?.name).toBe("UnsupportedProtocolVersionError");
    await expect(reactor.get("br7")).rejects.toThrow();
  });

  it("refuses a load of a base-reducer 7 creation", async () => {
    const { reactor } = await build();

    const create = createCreateDocumentOperation(
      "br7-load",
      DRIVE,
      {},
      { protocolVersions: { "base-reducer": 7 } },
    );
    const info = await reactor.load("br7-load", "main", [create]);
    const job = await settled(reactor, info.id);

    expect(job.status).toBe(JobStatus.FAILED);
    expect(job.error?.name).toBe("UnsupportedProtocolVersionError");
  });

  it("runs base-reducer 7 once a capability registers it", async () => {
    const { reactor } = await build((b) =>
      b.withPeerCapabilities([BASE_REDUCER_7]),
    );

    const info = await reactor.create(driveAt({ "base-reducer": 7 }, "br7-ok"));

    expect((await settled(reactor, info.id)).status).toBe(JobStatus.READ_READY);
  });

  it.each([false, true])(
    "refuses writes and loads into a stored document above a narrowed registry (documentDecisions %s)",
    async (documentDecisions) => {
      const db = await createDefaultDatabase();
      const flags = (b: ReactorBuilder) =>
        b
          .withKysely(db)
          .withExecutorConfig({ featureFlags: { documentDecisions } });
      const wide = await build((b) =>
        flags(b).withPeerCapabilities([BASE_REDUCER_7]),
      );
      const created = await wide.reactor.create(
        driveAt({ "base-reducer": 7 }, "br7-stored"),
      );
      expect((await settled(wide.reactor, created.id)).status).toBe(
        JobStatus.READ_READY,
      );
      await wide.reactor.kill().completed;

      const narrow = await build((b) =>
        flags(b).withUnsupportedStoredDocuments("read-only"),
      );

      const write = await narrow.reactor.execute("br7-stored", "main", [
        addFolder({ id: generateId(), name: "narrowed", parentFolder: null }),
      ]);
      const writeJob = await settled(narrow.reactor, write.id);
      expect(writeJob.status).toBe(JobStatus.FAILED);
      expect(writeJob.error?.name).toBe("UnsupportedProtocolVersionError");

      const folder = addFolder({ id: generateId(), name: "loaded" });
      const load = await narrow.reactor.load("br7-stored", "main", [
        createTestOperation("br7-stored", {
          index: 0,
          action: { ...folder, scope: "global" },
        }),
      ]);
      const loadJob = await settled(narrow.reactor, load.id);
      expect(loadJob.status).toBe(JobStatus.FAILED);
      expect(loadJob.error?.name).toBe("UnsupportedProtocolVersionError");
    },
  );

  describe("starting over a store above the local set", () => {
    async function storeAt(protocolVersions: Record<string, number>[]) {
      const db = await createDefaultDatabase();
      const wide = await build((b) =>
        b.withKysely(db).withPeerCapabilities([BASE_REDUCER_7]),
      );
      for (const [index, versions] of protocolVersions.entries()) {
        const created = await wide.reactor.create(
          driveAt(versions, `stored-${index}`),
        );
        expect((await settled(wide.reactor, created.id)).status).toBe(
          JobStatus.READ_READY,
        );
      }
      await wide.reactor.kill().completed;
      return db;
    }

    it("refuses to build, naming the versions and document count", async () => {
      const db = await storeAt([
        { "base-reducer": 7 },
        { "base-reducer": 7 },
        { "base-reducer": 2 },
      ]);

      const built = new ReactorBuilder()
        .withDocumentModelSources([driveDocumentModelModule as never])
        .withKysely(db)
        .buildModule();

      await expect(built).rejects.toSatisfy(
        (error) =>
          UnsupportedStoredProtocolError.isError(error) &&
          error.documents === 2 &&
          error.message.includes("base-reducer 7"),
      );
    });

    it("builds when every stored document is within the local set", async () => {
      const db = await storeAt([{ "base-reducer": 2 }, { "base-reducer": 1 }]);

      const narrow = await build((b) => b.withKysely(db));

      expect(await narrow.reactor.get("stored-0")).toBeDefined();
    });

    it("builds read-only when told to, and warns", async () => {
      const db = await storeAt([{ "base-reducer": 7 }]);
      const logger = spyLogger();
      const warn = vi.spyOn(logger, "warn");

      await build((b) =>
        b
          .withKysely(db)
          .withLogger(logger)
          .withUnsupportedStoredDocuments("read-only"),
      );

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("read-only"),
        expect.stringContaining("1 stored document(s) require base-reducer 7"),
      );
    });
  });

  it("admits and logs a key no capability registers", async () => {
    const logger = spyLogger();
    const { reactor } = await build((b) => b.withLogger(logger));

    const info = await reactor.create(
      driveAt({ "base-reducer": 2, "app-custom": 4 }, "custom"),
    );

    expect((await settled(reactor, info.id)).status).toBe(JobStatus.READ_READY);
    expect(
      logger.info.mock.calls.some(
        (call) =>
          String(call[0]).includes("unregistered protocol") &&
          call.includes("app-custom"),
      ),
    ).toBe(true);
  });

  it("dead-letters a document its peer claimed but cannot run as UNSUPPORTED_PROTOCOL, without quarantine", async () => {
    const channels = new Map<string, TestChannel>();
    const peers = new Map([
      ["toB", "toA"],
      ["toA", "toB"],
    ]);
    const channelFactory: IChannelFactory = {
      instance(
        remoteId: string,
        remoteName: string,
        _config: unknown,
        cursorStorage: ISyncCursorStorage,
      ): TestChannel {
        const channel = new TestChannel(
          remoteId,
          remoteName,
          cursorStorage,
          (envelope: SyncEnvelope) =>
            channels.get(peers.get(remoteName)!)!.receive(envelope),
          {
            peer: () => channels.get(peers.get(remoteName)!),
            // B claims base-reducer 7 without running it.
            announce:
              remoteName === "toA"
                ? () => localPeerManifest([BASE_REDUCER_7], {})
                : undefined,
          },
        );
        channels.set(remoteName, channel);
        return channel;
      },
    } as IChannelFactory;

    const withSync = (b: ReactorBuilder) =>
      b
        .withEventBus(new EventBus())
        .withSync(new SyncBuilder().withChannelFactory(channelFactory));
    const a = await build((b) =>
      withSync(b).withPeerCapabilities([BASE_REDUCER_7]),
    );
    const b = await build(withSync);

    const filter = { documentId: [], scope: [], branch: "main" };
    for (const [module, name] of [
      [a, "toB"],
      [b, "toA"],
    ] as const) {
      await module.syncModule!.syncManager.add(
        name,
        DriveCollectionId.forDrive("shared-drive"),
        { type: "internal", parameters: {} },
        filter,
      );
    }

    const info = await a.reactor.create(
      driveAt({ "base-reducer": 7 }, "shared-drive"),
    );
    expect((await settled(a.reactor, info.id)).status).toBe(
      JobStatus.READ_READY,
    );

    const deadLetters = channels.get("toA")!.deadLetter;
    await vi.waitUntil(() => deadLetters.items.length > 0, { timeout: 10_000 });

    expect(syncOperationErrorType(deadLetters.items[0].error)).toBe(
      "UNSUPPORTED_PROTOCOL",
    );
    const stored =
      await b.syncModule!.deadLetterStorage.listQuarantinedDocumentIds();
    expect(stored).not.toContain("shared-drive");
  });
});

describe("a document at a base-reducer number this build does not know", () => {
  const reactors: IReactor[] = [];

  afterEach(() => {
    for (const reactor of reactors.splice(0)) {
      reactor.kill();
    }
  });

  // Lists what the reactor runs, so 7 joins 3 when undoV3 is on.
  const WIDE_7: PeerCapability = {
    kind: "protocol",
    name: "base-reducer",
    baseline: [1, 2],
    supported: (flags) => [...baseReducerVersionsFor(flags), 7],
    preferred: () => 2,
    optional: false,
  };

  async function wide(
    undoV3: boolean,
    db?: Kysely<any>,
  ): Promise<InProcessReactorModule> {
    let builder = new ReactorBuilder()
      .withDocumentModelSources([driveDocumentModelModule as never])
      .withPeerCapabilities([WIDE_7])
      .withExecutorConfig({
        featureFlags: undoV3 ? undoV3Flags() : { undoV3: false },
      });
    if (db) builder = builder.withKysely(db);
    const module = await builder.buildModule();
    reactors.push(module.reactor);
    return module;
  }

  async function ok(reactor: IReactor, info: JobInfo): Promise<void> {
    const job = await settled(reactor, info.id);
    expect(job.error?.message ?? job.status).toBe(JobStatus.READ_READY);
  }

  /** The base-reducer number the stored CREATE_DOCUMENT and the header carry. */
  async function storedVersion(
    module: InProcessReactorModule,
    id: string,
  ): Promise<number | undefined> {
    const creation = await module.operationStore.getSince(
      id,
      "document",
      "main",
      -1,
      undefined,
      { cursor: "0", limit: 1 },
    );
    const input = creation.results[0].action.input as {
      protocolVersions?: Record<string, number>;
    };
    const header = (await module.reactor.get(id)).header;
    expect(header.protocolVersions?.["base-reducer"]).toBe(
      input.protocolVersions?.["base-reducer"],
    );
    return header.protocolVersions?.["base-reducer"];
  }

  async function globalOps(
    reactor: IReactor,
    id: string,
  ): Promise<Operation[]> {
    const result = (await reactor.getOperations(id, {
      branch: "main",
      scopes: ["global"],
    })) as Record<string, { results: Operation[] } | undefined>;
    return result.global?.results ?? [];
  }

  async function nodes(reactor: IReactor, id: string): Promise<string[]> {
    const document =
      await reactor.get<
        ReturnType<typeof driveDocumentModelModule.utils.createDocument>
      >(id);
    return document.state.global.nodes.map((node) => node.name);
  }

  /**
   * Two folders and an UNDO, then on a retraction version the RETRACT a
   * client submits instead. What a version decides, with ids by their form.
   */
  async function undoObservable(reactor: IReactor, id: string) {
    for (const name of ["a", "b"]) {
      await ok(
        reactor,
        await reactor.execute(id, "main", [
          addFolder({ id: `${id}-${name}`, name, parentFolder: null }),
        ]),
      );
    }
    const submitted = undo();
    const undoJob = await settled(
      reactor,
      (await reactor.execute(id, "main", [submitted])).id,
    );
    let retracted: string | undefined;
    if (undoJob.status === JobStatus.FAILED) {
      const retraction = await authorRetraction(reactor, id);
      retracted = retraction.id;
      await ok(reactor, await reactor.execute(id, "main", [retraction]));
    }
    const rows = (await globalOps(reactor, id)).map((operation) => ({
      type: operation.action.type,
      index: operation.index,
      skip: operation.skip,
      id:
        operation.action.id === submitted.id
          ? "submitted undo"
          : operation.action.id === synthesizedActionId(submitted.id)
            ? "synthesized from undo"
            : operation.action.id === retracted
              ? "retraction"
              : "own",
    }));
    return {
      undo: undoJob.error?.name ?? undoJob.status,
      rows,
      nodes: await nodes(reactor, id),
    };
  }

  it.each([
    { undoV3: false, runsAs: 2 },
    { undoV3: true, runsAs: 3 },
  ])(
    "runs as the highest version the reactor runs (undoV3 $undoV3: base-reducer $runsAs)",
    async ({ undoV3, runsAs }) => {
      const module = await wide(undoV3);
      const { reactor } = module;
      await ok(
        reactor,
        await reactor.create(driveAt({ "base-reducer": 7 }, "br7")),
      );
      await ok(
        reactor,
        await reactor.create(driveAt({ "base-reducer": runsAs }, "known")),
      );

      const seven = await undoObservable(reactor, "br7");
      const known = await undoObservable(reactor, "known");

      expect(await storedVersion(module, "br7")).toBe(7);
      expect(await storedVersion(module, "known")).toBe(runsAs);
      expect(seven).toEqual(known);
      expect(seven.nodes).toEqual(["a"]);

      // A cold rebuild derives the same state.
      module.writeCache.clear();
      const rebuilt = await module.writeCache.getState("br7", "global", "main");
      expect(
        (
          rebuilt as ReturnType<
            typeof driveDocumentModelModule.utils.createDocument
          >
        ).state.global.nodes.map((node) => node.name),
      ).toEqual(["a"]);

      // A fresh receiver loads it as the same version.
      const receiver = await wide(undoV3);
      const documentOps = (await reactor.getOperations("br7", {
        branch: "main",
        scopes: ["document"],
      })) as Record<string, { results: Operation[] } | undefined>;
      await ok(
        receiver.reactor,
        await receiver.reactor.load(
          "br7",
          "main",
          documentOps.document?.results ?? [],
        ),
      );
      await ok(
        receiver.reactor,
        await receiver.reactor.load(
          "br7",
          "main",
          await globalOps(reactor, "br7"),
        ),
      );
      expect(await storedVersion(receiver, "br7")).toBe(7);
      expect(await nodes(receiver.reactor, "br7")).toEqual(["a"]);
    },
  );

  it("decides differently at base-reducer 2 and 3, so the comparison above is not vacuous", async () => {
    const off = await wide(false);
    const on = await wide(true);
    await ok(
      off.reactor,
      await off.reactor.create(driveAt({ "base-reducer": 7 }, "d")),
    );
    await ok(
      on.reactor,
      await on.reactor.create(driveAt({ "base-reducer": 7 }, "d")),
    );

    const asTwo = await undoObservable(off.reactor, "d");
    const asThree = await undoObservable(on.reactor, "d");

    expect(asTwo.undo).toBe(JobStatus.READ_READY);
    expect(asTwo.rows.at(-1)).toEqual({
      type: "NOOP",
      index: 2,
      skip: 1,
      id: "synthesized from undo",
    });
    expect(asThree.undo).toBe("SubmittedUndoRefusedError");
    expect(asThree.rows.at(-1)).toMatchObject({
      type: "RETRACT",
      skip: 0,
      id: "retraction",
    });
    expect(asTwo.nodes).toEqual(asThree.nodes);
  });

  it("refuses typed, naming 7, where its model cannot run the version it resolves to", async () => {
    const untagged = {
      ...driveDocumentModelModule,
      reducer: ((
        ...args: Parameters<typeof driveDocumentModelModule.reducer>
      ) =>
        driveDocumentModelModule.reducer(
          ...args,
        )) as typeof driveDocumentModelModule.reducer,
    };
    const module = await new ReactorBuilder()
      .withDocumentModelSources([untagged as never])
      .withPeerCapabilities([WIDE_7])
      .withExecutorConfig({ featureFlags: undoV3Flags() })
      .buildModule();
    reactors.push(module.reactor);

    const job = await settled(
      module.reactor,
      (await module.reactor.create(driveAt({ "base-reducer": 7 }, "br7-plain")))
        .id,
    );

    expect(job.status).toBe(JobStatus.FAILED);
    expect(job.error?.name).toBe("UnsupportedProtocolVersionError");
    expect(job.error?.message).toContain(
      `requires base-reducer 7, which this reactor cannot run for ${DRIVE}`,
    );
  });

  it("is served by a reactor that does not list it, as base-reducer 2, and its writes are refused", async () => {
    const db = await createDefaultDatabase();
    const writer = await wide(false, db);
    await ok(
      writer.reactor,
      await writer.reactor.create(driveAt({ "base-reducer": 7 }, "br7-read")),
    );
    await undoObservable(writer.reactor, "br7-read");
    await writer.reactor.kill().completed;
    const schema = db.withSchema(REACTOR_SCHEMA);
    await schema.updateTable("ViewState").set({ lastOrdinal: 0 }).execute();
    await schema.deleteFrom("DocumentSnapshot").execute();

    const narrow = await new ReactorBuilder()
      .withDocumentModelSources([driveDocumentModelModule as never])
      .withKysely(db)
      .withExecutorConfig({ featureFlags: { undoV3: false } })
      .withUnsupportedStoredDocuments("read-only")
      .buildModule();
    reactors.push(narrow.reactor);
    const sweeps = await narrow.catchUp.sweepNow();

    expect(sweeps.filter((sweep) => sweep.blockedAt)).toEqual([]);
    expect(await storedVersion(narrow, "br7-read")).toBe(7);
    expect(await nodes(narrow.reactor, "br7-read")).toEqual(["a"]);
    expect(
      await schema
        .selectFrom("ViewState")
        .select("readModelId")
        .where("readModelId", "like", `%${SKIPPED_DOCUMENT_MARKER}%`)
        .execute(),
    ).toEqual([]);
    for (const protocolSupport of [undefined, { "base-reducer": [1, 2] }]) {
      const integrity = new DocumentIntegrityService(
        narrow.keyframeStore,
        narrow.operationStore,
        narrow.writeCache,
        narrow.documentView,
        narrow.documentModelRegistry,
        protocolSupport,
      );
      expect(
        (await integrity.validateDocument("br7-read")).unsupported,
      ).toBeUndefined();
    }

    const write = await settled(
      narrow.reactor,
      (
        await narrow.reactor.execute("br7-read", "main", [
          addFolder({ id: generateId(), name: "late", parentFolder: null }),
        ])
      ).id,
    );
    expect(write.status).toBe(JobStatus.FAILED);
    expect(write.error?.name).toBe("UnsupportedProtocolVersionError");
  });
});
