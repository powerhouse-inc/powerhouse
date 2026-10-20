import { PGlite } from "@electric-sql/pglite";
import {
  ChannelScheme,
  DriveCollectionId,
  HardenedPGliteDialect,
  JobStatus,
  ReactorBuilder,
  ReactorClientBuilder,
  SyncEventTypes,
  type Database,
  type InProcessReactorModule,
  type IReactor,
  type ISyncManager,
  type JobInfo,
} from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  setModelName,
  withSignaturePolicy,
  type DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { Kysely } from "kysely";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createResolverBridge } from "./utils/gql-resolver-bridge.js";

const V2 = { "base-reducer": 2 };
const V3 = { "base-reducer": 3 };

/** The same model, its reducer not built by createReducer. */
function untagged<T extends DocumentModelModule<any>>(module: T): T {
  const reducer = module.reducer as (...args: unknown[]) => unknown;
  return { ...module, reducer: (...args: unknown[]) => reducer(...args) };
}

function driveAt(id: string, protocolVersions: Record<string, number>) {
  return withSignaturePolicy(
    driveDocumentModelModule.utils.createDocument(),
    "legacy",
    { id, protocolVersions },
  );
}

function modelAt(id: string, protocolVersions: Record<string, number>) {
  return withSignaturePolicy(
    documentModelDocumentModelModule.utils.createDocument(),
    "legacy",
    { id, protocolVersions },
  );
}

async function succeeded(reactor: IReactor, info: JobInfo): Promise<void> {
  await vi.waitUntil(
    async () => {
      const { status } = await reactor.getJobStatus(info.id);
      return status === JobStatus.READ_READY || status === JobStatus.FAILED;
    },
    { timeout: 10_000, interval: 5 },
  );
  const job = await reactor.getJobStatus(info.id);
  expect(job.error?.message ?? job.status).toBe(JobStatus.READ_READY);
}

function nameOf(document: unknown): string {
  return (document as { state: { global: { name: string } } }).state.global
    .name;
}

describe("a refusal by the polled server, after the server can run the document", () => {
  const reactors: IReactor[] = [];

  afterEach(async () => {
    for (const reactor of reactors.splice(0)) {
      await reactor.kill().completed;
    }
  });

  async function server(
    db: Kysely<Database>,
    model: DocumentModelModule<any>,
  ): Promise<InProcessReactorModule> {
    const module = await new ReactorBuilder()
      .withKysely(db)
      .withChannelScheme(ChannelScheme.SWITCHBOARD)
      .withDocumentModelSources([
        driveDocumentModelModule as never,
        model as never,
      ])
      .buildModule();
    reactors.push(module.reactor);
    return module;
  }

  /**
   * Connect pushes a v3 child to a server whose model is untagged, holds it on
   * the refusal, and the server restarts on a tagged build of the same store.
   */
  async function refusedThenRestarted() {
    const registry = new Map<string, ISyncManager>();
    const bridge = createResolverBridge(registry, {
      log: false,
      deadLetters: true,
    });
    const db = new Kysely<Database>({
      dialect: new HardenedPGliteDialect(new PGlite()),
    });

    const before = await server(db, untagged(documentModelDocumentModelModule));
    registry.set("switchboard", before.syncModule!.syncManager);

    const built = await new ReactorClientBuilder()
      .withReactorBuilder(
        new ReactorBuilder()
          .withChannelScheme(ChannelScheme.CONNECT)
          .withDocumentModelSources([
            driveDocumentModelModule as never,
            documentModelDocumentModelModule as never,
          ]),
      )
      .withCreateSignaturePolicy("legacy")
      .buildModule();
    const connect = built.reactorModule!;
    reactors.push(connect.reactor);
    const connectSync = connect.syncModule!.syncManager;
    const events: string[] = [];
    for (const type of [
      SyncEventTypes.SYNC_HELD,
      SyncEventTypes.SYNC_RELEASED,
    ]) {
      connect.eventBus.subscribe(type, (_type: number, event: unknown) => {
        if ((event as { documentId: string }).documentId !== "m3") return;
        events.push(type === SyncEventTypes.SYNC_HELD ? "held" : "released");
      });
    }

    await succeeded(
      connect.reactor,
      await connect.reactor.create(driveAt("shared", V2)),
    );
    await connectSync.add(
      "switchboard-shared",
      DriveCollectionId.forDrive("shared"),
      {
        type: "gql",
        parameters: {
          url: "http://switchboard/graphql",
          pollIntervalMs: 100,
          retryBaseDelayMs: 50,
          fetchFn: bridge,
        },
      },
      { documentId: [], scope: [], branch: "main" },
    );
    await succeeded(
      connect.reactor,
      await connect.reactor.create(modelAt("m3", V3)),
    );
    await built.client.addRelationship("shared", "m3", "child");

    await vi.waitFor(
      async () =>
        expect(await connectSync.listHolds({ documentId: "m3" })).toHaveLength(
          1,
        ),
      { timeout: 10_000 },
    );
    const remoteName = before.syncModule!.syncManager.list()[0].meta.name;
    await vi.waitFor(
      async () => {
        const page = await before.syncModule!.deadLetterStorage.list(
          remoteName,
          { cursor: "0", limit: 10 },
        );
        expect(page.results.map((record) => record.documentId)).toContain("m3");
      },
      { timeout: 10_000 },
    );
    await expect(before.reactor.get("m3")).rejects.toThrow();

    await before.reactor.kill().completed;
    reactors.splice(reactors.indexOf(before.reactor), 1);
    const after = await server(db, documentModelDocumentModelModule);
    registry.set("switchboard", after.syncModule!.syncManager);

    return { after, client: built.client, connectSync, events };
  }

  it("does not re-hold the document after the server restarts", async () => {
    const { connectSync, events } = await refusedThenRestarted();

    // The new revision releases the hold.
    await vi.waitFor(() => expect(events).toEqual(["held", "released"]), {
      timeout: 10_000,
    });
    // Several polls, each of which could report the old refusal again.
    await new Promise((resolve) => setTimeout(resolve, 1_000));

    expect(events).toEqual(["held", "released"]);
    expect(await connectSync.listHolds({ documentId: "m3" })).toEqual([]);
  });

  // BUG: the released document is never sent again. The touch that delivers
  // the server's new manifest releases the hold, which queues m3's history in
  // the outbox, and then trims the outbox by the server's ackOrdinal. That
  // ordinal is past m3's ordinals, since the server applied the drive's
  // operations, so the queued history is dropped unsent (pollOnce trims the
  // same way). Any release toward a polled server takes this path.
  it.fails("sends the released document to the server again", async () => {
    const { after, client } = await refusedThenRestarted();

    await vi.waitFor(
      async () => expect(await after.reactor.get("m3")).toBeDefined(),
      { timeout: 3_000 },
    );
    await client.execute("m3", "main", [
      setModelName({ name: "after-restart" }),
    ]);
    await vi.waitFor(
      async () =>
        expect(nameOf(await after.reactor.get("m3"))).toBe("after-restart"),
      { timeout: 3_000 },
    );
  });
});
