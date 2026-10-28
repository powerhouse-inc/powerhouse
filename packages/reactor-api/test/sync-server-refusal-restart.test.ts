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
    undoV3 = true,
  ): Promise<InProcessReactorModule> {
    const module = await new ReactorBuilder()
      .withKysely(db)
      .withChannelScheme(ChannelScheme.SWITCHBOARD)
      .withExecutorConfig({ featureFlags: { undoV3 } })
      .withDocumentModelSources([
        driveDocumentModelModule as never,
        model as never,
      ])
      .buildModule();
    reactors.push(module.reactor);
    return module;
  }

  /**
   * Connect holds a v3 child from a server that cannot run it, and the server
   * restarts on a build of the same store that can. `refused`: the server
   * announces 3 but its model is untagged, so the hold follows its refusal;
   * otherwise it does not announce 3 and Connect holds before pushing.
   */
  async function heldThenRestarted(refused: boolean) {
    const registry = new Map<string, ISyncManager>();
    const bridge = createResolverBridge(registry, {
      log: false,
      deadLetters: true,
    });
    const db = new Kysely<Database>({
      dialect: new HardenedPGliteDialect(new PGlite()),
    });

    const before = refused
      ? await server(db, untagged(documentModelDocumentModelModule))
      : await server(db, documentModelDocumentModelModule, false);
    registry.set("switchboard", before.syncModule!.syncManager);

    const built = await new ReactorClientBuilder()
      .withReactorBuilder(
        new ReactorBuilder()
          .withChannelScheme(ChannelScheme.CONNECT)
          .withExecutorConfig({ featureFlags: { undoV3: true } })
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
    expect(
      (await connect.reactor.get("m3")).header.protocolVersions?.[
        "base-reducer"
      ],
    ).toBe(3);
    await built.client.addRelationship("shared", "m3", "child");

    await vi.waitFor(
      async () =>
        expect(await connectSync.listHolds({ documentId: "m3" })).toHaveLength(
          1,
        ),
      { timeout: 10_000 },
    );
    const remoteName = before.syncModule!.syncManager.list()[0].meta.name;
    // The server applied the drive past m3's ordinals, so its ack is past them.
    const pushedThrough =
      connectSync.getByName("switchboard-shared").channel.outbox.latestOrdinal;
    await vi.waitFor(
      async () => {
        const cursors = await before.syncModule!.cursorStorage.list(remoteName);
        const inbox = cursors.find((cursor) => cursor.cursorType === "inbox");
        expect(inbox?.cursorOrdinal ?? 0).toBeGreaterThanOrEqual(pushedThrough);
      },
      { timeout: 10_000 },
    );
    if (refused) {
      await vi.waitFor(
        async () => {
          const page = await before.syncModule!.deadLetterStorage.list(
            remoteName,
            { cursor: "0", limit: 10 },
          );
          expect(page.results.map((record) => record.documentId)).toContain(
            "m3",
          );
        },
        { timeout: 10_000 },
      );
    }
    await expect(before.reactor.get("m3")).rejects.toThrow();

    await before.reactor.kill().completed;
    reactors.splice(reactors.indexOf(before.reactor), 1);
    const after = await server(db, documentModelDocumentModelModule);
    registry.set("switchboard", after.syncModule!.syncManager);

    return { after, client: built.client, connectSync, events };
  }

  it("does not re-hold the document after the server restarts", async () => {
    const { connectSync, events } = await heldThenRestarted(true);

    // The new revision releases the hold.
    await vi.waitFor(() => expect(events).toEqual(["held", "released"]), {
      timeout: 10_000,
    });
    // Several polls, each of which could report the old refusal again.
    await new Promise((resolve) => setTimeout(resolve, 1_000));

    expect(events).toEqual(["held", "released"]);
    expect(await connectSync.listHolds({ documentId: "m3" })).toEqual([]);
  });

  it.each([
    ["after its refusal", true],
    ["held before the push from a server not announcing 3", false],
  ])(
    "sends the released document to the server %s",
    async (_label, refused) => {
      const { after, client, events } = await heldThenRestarted(refused);

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
      expect(events).toEqual(["held", "released"]);
    },
  );
});
