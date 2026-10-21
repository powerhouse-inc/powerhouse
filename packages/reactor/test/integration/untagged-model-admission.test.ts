import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  deriveOperationId,
  setModelName,
  withSignaturePolicy,
  type DocumentModelModule,
  type Operation,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DriveCollectionId } from "../../src/cache/operation-index-types.js";
import { createDefaultDatabase } from "../../src/core/create-default-database.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import { ReactorClientBuilder } from "../../src/core/reactor-client-builder.js";
import type { InProcessReactorModule, IReactor } from "../../src/core/types.js";
import { EventBus } from "../../src/events/event-bus.js";
import {
  ReactorEventTypes,
  type StoredModelRefusedEvent,
} from "../../src/events/types.js";
import { UnsupportedStoredProtocolError } from "../../src/shared/errors.js";
import { JobStatus, type JobInfo } from "../../src/shared/types.js";
import type { ISyncCursorStorage } from "../../src/storage/interfaces.js";
import type { IChannelFactory } from "../../src/sync/interfaces.js";
import { SyncBuilder } from "../../src/sync/sync-builder.js";
import type { SyncEnvelope } from "../../src/sync/types.js";
import { syncOperationErrorType } from "../../src/sync/utils.js";
import {
  createCreateDocumentOperation,
  createMockLogger,
} from "../factories.js";
import { TestChannel } from "../sync/channels/test-channel.js";
import type { ReactorClient } from "../../src/client/reactor-client.js";

const MODEL = "powerhouse/document-model";
const V2 = { "base-reducer": 2 };
const V3 = { "base-reducer": 3 };

/** The same model, its reducer not built by createReducer. */
function untagged<T extends DocumentModelModule<any>>(module: T): T {
  const reducer = module.reducer as (...args: unknown[]) => unknown;
  return { ...module, reducer: (...args: unknown[]) => reducer(...args) };
}

function modelAt(id: string, protocolVersions: Record<string, number>) {
  return withSignaturePolicy(
    documentModelDocumentModelModule.utils.createDocument(),
    "legacy",
    { id, protocolVersions },
  );
}

function driveAt(id: string, protocolVersions: Record<string, number>) {
  return withSignaturePolicy(
    driveDocumentModelModule.utils.createDocument(),
    "legacy",
    { id, protocolVersions },
  );
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

function expectRefused(job: JobInfo, documentType: string): void {
  expect(job.status).toBe(JobStatus.FAILED);
  expect(job.error?.name).toBe("UnsupportedProtocolVersionError");
  expect(job.error?.message).toContain(
    `requires base-reducer 3, which this reactor cannot run for ${documentType}`,
  );
  // Refused on the first attempt, never retried.
  expect(job.errorHistory?.length ?? 0).toBeLessThanOrEqual(1);
}

type Node = {
  module: InProcessReactorModule;
  reactor: IReactor;
  client: ReactorClient;
};

describe("base-reducer 3 admission of a model the reactor cannot run as 3", () => {
  const reactors: IReactor[] = [];

  afterEach(() => {
    for (const reactor of reactors.splice(0)) {
      reactor.kill();
    }
  });

  async function build(
    model: DocumentModelModule<any> | undefined,
    configure: (builder: ReactorBuilder) => ReactorBuilder = (b) => b,
  ): Promise<Node> {
    const built = await new ReactorClientBuilder()
      .withReactorBuilder(
        configure(
          new ReactorBuilder()
            .withLogger(createMockLogger())
            .withDocumentModelSources([
              driveDocumentModelModule as never,
              ...(model ? [model as never] : []),
            ]),
        ),
      )
      .withCreateSignaturePolicy("legacy")
      .buildModule();
    const module = built.reactorModule!;
    reactors.push(module.reactor);
    return { module, reactor: module.reactor, client: built.client };
  }

  it("refuses a submitted create at 3 and accepts one at 2", async () => {
    const { reactor } = await build(untagged(documentModelDocumentModelModule));

    const refused = await settled(
      reactor,
      (await reactor.create(modelAt("m3", V3))).id,
    );
    expectRefused(refused, MODEL);
    await expect(reactor.get("m3")).rejects.toThrow();

    const admitted = await settled(
      reactor,
      (await reactor.create(modelAt("m2", V2))).id,
    );
    expect(admitted.error?.message ?? admitted.status).toBe(
      JobStatus.READ_READY,
    );
  });

  it("refuses a loaded creation at 3", async () => {
    const { reactor } = await build(untagged(documentModelDocumentModelModule));

    const create = createCreateDocumentOperation(
      "m3-load",
      MODEL,
      {},
      { protocolVersions: V3 },
    );
    const job = await settled(
      reactor,
      (await reactor.load("m3-load", "main", [create])).id,
    );
    expectRefused(job, MODEL);
  });

  it("accepts a create at 3 when the model's reducer is from createReducer", async () => {
    const { reactor } = await build(documentModelDocumentModelModule);

    const job = await settled(
      reactor,
      (await reactor.create(modelAt("m3", V3))).id,
    );
    expect(job.error?.message ?? job.status).toBe(JobStatus.READ_READY);
  });

  it("accepts a creation at 3 of a tagged model the loader supplies, by submit and by load", async () => {
    const load = vi.fn(() => Promise.resolve(documentModelDocumentModelModule));
    const { reactor } = await build(undefined, (b) =>
      b.withDocumentModelLoader({ load: load as never }),
    );

    const submitted = await settled(
      reactor,
      (await reactor.create(modelAt("lazy-submit", V3))).id,
    );
    expect(submitted.error?.message ?? submitted.status).toBe(
      JobStatus.READ_READY,
    );
    expect(load).toHaveBeenCalledWith(MODEL);

    // A reactor whose first sight of the model is a loaded creation.
    const loadOnly = vi.fn(() =>
      Promise.resolve(documentModelDocumentModelModule),
    );
    const other = (
      await build(undefined, (b) =>
        b.withDocumentModelLoader({ load: loadOnly as never }),
      )
    ).reactor;
    const loaded = await settled(
      other,
      (
        await other.load("lazy-load", "main", [
          createCreateDocumentOperation(
            "lazy-load",
            MODEL,
            {},
            { protocolVersions: V3 },
          ),
        ])
      ).id,
    );
    expect(loaded.error?.message ?? loaded.status).toBe(JobStatus.READ_READY);
    expect(loadOnly).toHaveBeenCalledWith(MODEL);
    expect(
      (await other.get("lazy-load")).header.protocolVersions?.["base-reducer"],
    ).toBe(3);
  });

  it("refuses a creation at 3 of a model that cannot load, after trying the loader", async () => {
    const load = vi.fn(() => Promise.reject(new Error("no such package")));
    const { reactor } = await build(documentModelDocumentModelModule, (b) =>
      b.withDocumentModelLoader({ load }),
    );

    const v3 = await settled(
      reactor,
      (
        await reactor.load("x3", "main", [
          createCreateDocumentOperation(
            "x3",
            "test/missing-3",
            {},
            { protocolVersions: V3 },
          ),
        ])
      ).id,
    );
    expectRefused(v3, "test/missing-3");
    expect(load).toHaveBeenCalledWith("test/missing-3");

    // Below 3 the gate's own failure stands.
    const v2 = await settled(
      reactor,
      (
        await reactor.load("x2", "main", [
          createCreateDocumentOperation(
            "x2",
            "test/missing-2",
            {},
            { protocolVersions: V2 },
          ),
        ])
      ).id,
    );
    expect(v2.status).toBe(JobStatus.FAILED);
    expect(v2.error?.name).toBe("Error");
  });

  it("refuses writes, loads and deletes on a stored v3 document once its model is untagged", async () => {
    const db = await createDefaultDatabase();
    const tagged = await build(documentModelDocumentModelModule, (b) =>
      b.withKysely(db),
    );
    const created = await settled(
      tagged.reactor,
      (await tagged.reactor.create(modelAt("stored-3", V3))).id,
    );
    expect(created.error?.message ?? created.status).toBe(JobStatus.READ_READY);
    await tagged.reactor.kill().completed;
    reactors.splice(reactors.indexOf(tagged.reactor), 1);

    const { reactor } = await build(
      untagged(documentModelDocumentModelModule),
      (b) => b.withKysely(db).withUnsupportedStoredDocuments("read-only"),
    );

    const write = await settled(
      reactor,
      (
        await reactor.execute("stored-3", "main", [
          setModelName({ name: "written" }),
        ])
      ).id,
    );
    expectRefused(write, MODEL);

    const action = setModelName({ name: "loaded" });
    const operation: Operation = {
      id: deriveOperationId("stored-3", action.scope, "main", action.id),
      index: 0,
      skip: 0,
      hash: "",
      timestampUtcMs: action.timestampUtcMs,
      action,
    };
    const load = await settled(
      reactor,
      (await reactor.load("stored-3", "main", [operation])).id,
    );
    expectRefused(load, MODEL);

    const deletion = await settled(
      reactor,
      (await reactor.deleteDocument("stored-3")).id,
    );
    expectRefused(deletion, MODEL);
    expect((await reactor.get("stored-3")).header.id).toBe("stored-3");
  });

  it("refuses to boot over a stored v3 document of an untagged model, naming the type, unless read-only", async () => {
    const db = await createDefaultDatabase();
    const tagged = await build(documentModelDocumentModelModule, (b) =>
      b.withKysely(db),
    );
    await settled(
      tagged.reactor,
      (await tagged.reactor.create(modelAt("boot-3", V3))).id,
    );
    await settled(
      tagged.reactor,
      (await tagged.reactor.create(driveAt("boot-drive-3", V3))).id,
    );
    await tagged.reactor.kill().completed;
    reactors.splice(reactors.indexOf(tagged.reactor), 1);

    const refused = await build(
      untagged(documentModelDocumentModelModule),
      (b) => b.withKysely(db),
    ).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(UnsupportedStoredProtocolError.isError(refused)).toBe(true);
    expect(refused).toMatchObject({
      documents: 1,
      versions: [{ protocol: "base-reducer", version: 3, documentType: MODEL }],
    });
    expect((refused as Error).message).toContain(
      `require base-reducer 3 for ${MODEL}`,
    );

    const readOnly = await build(
      untagged(documentModelDocumentModelModule),
      (b) => b.withKysely(db).withUnsupportedStoredDocuments("read-only"),
    );
    expect((await readOnly.reactor.get("boot-3")).header.id).toBe("boot-3");
    await readOnly.reactor.kill().completed;
    reactors.splice(reactors.indexOf(readOnly.reactor), 1);

    const rebuilt = await build(documentModelDocumentModelModule, (b) =>
      b.withKysely(db),
    );
    const write = await settled(
      rebuilt.reactor,
      (
        await rebuilt.reactor.execute("boot-3", "main", [
          setModelName({ name: "written" }),
        ])
      ).id,
    );
    expect(write.error?.message ?? write.status).toBe(JobStatus.READ_READY);
  });

  it("boots over a stored v3 document of a lazily loaded model and reports an untagged one on load", async () => {
    const db = await createDefaultDatabase();
    const tagged = await build(documentModelDocumentModelModule, (b) =>
      b.withKysely(db),
    );
    await settled(
      tagged.reactor,
      (await tagged.reactor.create(modelAt("lazy-3", V3))).id,
    );
    await tagged.reactor.kill().completed;
    reactors.splice(reactors.indexOf(tagged.reactor), 1);

    const eventBus = new EventBus();
    const reported: StoredModelRefusedEvent[] = [];
    eventBus.subscribe<StoredModelRefusedEvent>(
      ReactorEventTypes.STORED_MODEL_REFUSED,
      (_type, event) => {
        reported.push(event);
      },
    );
    const load = vi.fn(() =>
      Promise.resolve(untagged(documentModelDocumentModelModule)),
    );
    const { reactor } = await build(undefined, (b) =>
      b
        .withKysely(db)
        .withEventBus(eventBus)
        .withDocumentModelLoader({ load: load as never }),
    );

    const write = await settled(
      reactor,
      (
        await reactor.execute("lazy-3", "main", [
          setModelName({ name: "written" }),
        ])
      ).id,
    );
    expect(load).toHaveBeenCalledWith(MODEL);
    expectRefused(write, MODEL);
    await vi.waitUntil(() => reported.length > 0, { timeout: 5_000 });
    expect(reported).toEqual([
      {
        documentType: MODEL,
        refusals: [
          { protocol: "base-reducer", version: 3, documentType: MODEL },
        ],
      },
    ]);
  });

  it("refuses a rebuild of a stored v3 document typed once its model is untagged", async () => {
    const db = await createDefaultDatabase();
    const tagged = await build(documentModelDocumentModelModule, (b) =>
      b.withKysely(db),
    );
    const created = await settled(
      tagged.reactor,
      (await tagged.reactor.create(modelAt("stored-read-3", V3))).id,
    );
    expect(created.error?.message ?? created.status).toBe(JobStatus.READ_READY);
    const written = await settled(
      tagged.reactor,
      (
        await tagged.reactor.execute("stored-read-3", "main", [
          setModelName({ name: "written" }),
        ])
      ).id,
    );
    expect(written.error?.message ?? written.status).toBe(JobStatus.READ_READY);
    await tagged.reactor.kill().completed;
    reactors.splice(reactors.indexOf(tagged.reactor), 1);

    const { module } = await build(
      untagged(documentModelDocumentModelModule),
      (b) => b.withKysely(db).withUnsupportedStoredDocuments("read-only"),
    );
    module.writeCache.invalidate("stored-read-3");
    const read = await module.writeCache
      .getState("stored-read-3", "global", "main")
      .then(
        () => undefined,
        (error: unknown) => error as Error,
      );

    expect(read?.name).toBe("UnsupportedProtocolVersionError");
    expect(read?.message).toContain(`cannot run for ${MODEL}`);
  });

  it("dead-letters a synced creation at 3 as UNSUPPORTED_PROTOCOL without quarantine, and keeps syncing the rest", async () => {
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
          { peer: () => channels.get(peers.get(remoteName)!) },
        );
        channels.set(remoteName, channel);
        return channel;
      },
    } as IChannelFactory;
    const deferredJobTtlMs = 200;
    const withSync = (b: ReactorBuilder) =>
      b
        .withEventBus(new EventBus())
        .withExecutorConfig({ deferredJobTtlMs })
        .withSync(new SyncBuilder().withChannelFactory(channelFactory));

    const a = await build(documentModelDocumentModelModule, withSync);
    const b = await build(untagged(documentModelDocumentModelModule), withSync);

    const filter = { documentId: [], scope: [], branch: "main" };
    for (const [node, name] of [
      [a, "toB"],
      [b, "toA"],
    ] as const) {
      await node.module.syncModule!.syncManager.add(
        name,
        DriveCollectionId.forDrive("shared"),
        { type: "internal", parameters: {} },
        filter,
      );
    }

    const done = async (info: { id: string }) =>
      expect((await settled(a.reactor, info.id)).status).toBe(
        JobStatus.READ_READY,
      );
    await done(await a.reactor.create(driveAt("shared", V2)));
    for (const [id, versions] of [
      ["m3", V3],
      ["m2", V2],
    ] as const) {
      await done(await a.reactor.create(modelAt(id, versions)));
      await a.client.addRelationship("shared", id, "child");
    }

    const has = async (node: Node, id: string) =>
      node.reactor.get(id).then(
        () => true,
        () => false,
      );
    await vi.waitFor(async () => expect(await has(b, "m2")).toBe(true), {
      timeout: 10_000,
    });

    const deadLetters = channels.get("toA")!.deadLetter;
    await vi.waitFor(
      () =>
        expect(deadLetters.items.some((item) => item.documentId === "m3")).toBe(
          true,
        ),
      { timeout: 10_000 },
    );
    const refusal = deadLetters.items.find((item) => item.documentId === "m3")!;
    expect(syncOperationErrorType(refusal.error)).toBe("UNSUPPORTED_PROTOCOL");

    // Later writes to both documents: the refused one fails alone.
    await a.client.execute("m3", "main", [setModelName({ name: "later-3" })]);
    await a.client.execute("m2", "main", [setModelName({ name: "later-2" })]);
    await vi.waitFor(
      async () =>
        expect(
          (
            (await b.reactor.get("m2")).state as unknown as {
              global: { name: string };
            }
          ).global.name,
        ).toBe("later-2"),
      { timeout: 10_000 },
    );

    expect(await has(b, "m3")).toBe(false);
    // The later write waits for a creation that never lands, then expires once.
    const refusals = () =>
      deadLetters.items
        .filter((item) => item.documentId === "m3")
        .map((item) => syncOperationErrorType(item.error));
    await vi.waitFor(() => expect(refusals()).toContain("MISSING_OPERATIONS"), {
      timeout: 10_000,
    });
    const settledRefusals = refusals();
    expect(settledRefusals).toEqual([
      "UNSUPPORTED_PROTOCOL",
      "MISSING_OPERATIONS",
    ]);
    await new Promise((resolve) => setTimeout(resolve, 5 * deferredJobTtlMs));
    expect(refusals()).toEqual(settledRefusals);
    const quarantined =
      await b.module.syncModule!.deadLetterStorage.listQuarantinedDocumentIds();
    expect(quarantined).not.toContain("m3");
    expect(quarantined).not.toContain("shared");
  });
});
