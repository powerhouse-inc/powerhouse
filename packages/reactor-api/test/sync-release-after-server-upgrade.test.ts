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
  type PeerCapability,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { Kysely } from "kysely";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createResolverBridge } from "./utils/gql-resolver-bridge.js";

/** An extension protocol; a reactor that runs only 1 cannot run a 2 document. */
const testProtocol = (versions: number[]): PeerCapability => ({
  kind: "protocol",
  name: "test-protocol",
  baseline: [1],
  supported: () => versions,
  preferred: () => Math.max(...versions),
  optional: true,
});

const NARROW = [1];
const WIDE = [1, 2];
const AT_1 = { "base-reducer": 2, "test-protocol": 1 };
const AT_2 = { "base-reducer": 2, "test-protocol": 2 };

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

describe("a base-reducer 2 document held from a server that later runs it", () => {
  const reactors: IReactor[] = [];

  afterEach(async () => {
    for (const reactor of reactors.splice(0)) {
      await reactor.kill().completed;
    }
  });

  async function server(
    db: Kysely<Database>,
    versions: number[],
  ): Promise<InProcessReactorModule> {
    const module = await new ReactorBuilder()
      .withKysely(db)
      .withChannelScheme(ChannelScheme.SWITCHBOARD)
      .withPeerCapabilities([testProtocol(versions)])
      .withDocumentModelSources([
        driveDocumentModelModule as never,
        documentModelDocumentModelModule as never,
      ])
      .buildModule();
    reactors.push(module.reactor);
    return module;
  }

  it("reaches the server once the server restarts able to run it", async () => {
    const registry = new Map<string, ISyncManager>();
    const bridge = createResolverBridge(registry, { log: false });
    const db = new Kysely<Database>({
      dialect: new HardenedPGliteDialect(new PGlite()),
    });

    const before = await server(db, NARROW);
    registry.set("switchboard", before.syncModule!.syncManager);

    const built = await new ReactorClientBuilder()
      .withReactorBuilder(
        new ReactorBuilder()
          .withChannelScheme(ChannelScheme.CONNECT)
          .withPeerCapabilities([testProtocol(WIDE)])
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
        if ((event as { documentId: string }).documentId !== "m2") return;
        events.push(type === SyncEventTypes.SYNC_HELD ? "held" : "released");
      });
    }

    await succeeded(
      connect.reactor,
      await connect.reactor.create(driveAt("shared", AT_1)),
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
      await connect.reactor.create(modelAt("m2", AT_2)),
    );
    await built.client.addRelationship("shared", "m2", "child");

    await vi.waitFor(
      async () =>
        expect(await connectSync.listHolds({ documentId: "m2" })).toHaveLength(
          1,
        ),
      { timeout: 10_000 },
    );
    const remoteName = before.syncModule!.syncManager.list()[0].meta.name;
    // The server applied the drive past m2's ordinals, so its ack is past them.
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
    await expect(before.reactor.get("m2")).rejects.toThrow();

    await before.reactor.kill().completed;
    reactors.splice(reactors.indexOf(before.reactor), 1);
    const after = await server(db, WIDE);
    registry.set("switchboard", after.syncModule!.syncManager);

    await vi.waitFor(() => expect(events).toEqual(["held", "released"]), {
      timeout: 10_000,
    });
    await vi.waitFor(
      async () => expect(await after.reactor.get("m2")).toBeDefined(),
      { timeout: 3_000 },
    );
    await built.client.execute("m2", "main", [
      setModelName({ name: "after-restart" }),
    ]);
    await vi.waitFor(
      async () =>
        expect(nameOf(await after.reactor.get("m2"))).toBe("after-restart"),
      { timeout: 3_000 },
    );
  });
});
