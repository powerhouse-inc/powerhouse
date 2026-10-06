import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  withSignaturePolicy,
  type DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import { Kysely } from "kysely";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { Database, InProcessReactorModule } from "../../src/core/types.js";
import { createReactorInspector } from "../../src/inspector/from-module.js";
import { ReactorInspector } from "../../src/inspector/reactor-inspector.js";
import { HardenedPGliteDialect } from "../../src/storage/kysely/pglite-dialect.js";
import { GqlRequestChannelFactory } from "../../src/sync/channels/gql-request-channel-factory.js";
import { channelFactoryTypes } from "../../src/sync/channels/channel-factory-types.js";
import { ChannelScheme } from "../../src/sync/types.js";

describe("ReactorInspector", () => {
  let module: InProcessReactorModule | undefined;

  afterEach(() => {
    module?.reactor.kill();
    module = undefined;
  });

  it("reports an in-memory PGlite store when the builder opened the default", async () => {
    module = await new ReactorBuilder().buildModule();
    const info = await createReactorInspector(module).info();
    expect(info.storage).toEqual({
      engine: "pglite",
      persistence: "memory",
      durable: false,
      selfHeal: false,
    });
    expect(info.access).toEqual({ admin: false, sql: false });
    expect(info.workflows).toBe(false);
    expect(info.syncChannels).toEqual([]);
  });

  it("reports a caller-supplied store as unknown unless the host declares it", async () => {
    const kysely = new Kysely<Database>({
      dialect: new HardenedPGliteDialect(new PGlite()),
    });
    module = await new ReactorBuilder().withKysely(kysely).buildModule();
    expect(module.storageFacts).toEqual({
      engine: "unknown",
      persistence: "unknown",
      durable: false,
      selfHeal: false,
    });
  });

  it("reports declared storage facts", async () => {
    const facts = {
      engine: "pglite",
      persistence: "idb",
      durable: true,
      selfHeal: false,
    } as const;
    module = await new ReactorBuilder().withStorageFacts(facts).buildModule();
    expect((await createReactorInspector(module).info()).storage).toEqual(
      facts,
    );
  });

  it("reads sync channel types off the built factory", async () => {
    module = await new ReactorBuilder()
      .withChannelScheme(ChannelScheme.SWITCHBOARD)
      .buildModule();
    expect((await createReactorInspector(module).info()).syncChannels).toEqual([
      "polling",
    ]);
  });

  it("asks a factory for its types instead of guessing", () => {
    const declared = new GqlRequestChannelFactory(
      undefined as never,
      undefined,
      undefined as never,
    );
    expect(channelFactoryTypes(declared)).toEqual(["gql"]);
    expect(channelFactoryTypes({ instance: () => undefined as never })).toEqual(
      [],
    );
  });

  it("late-binds workflows through the facts sink", async () => {
    module = await new ReactorBuilder().buildModule();
    const inspector = createReactorInspector(module);
    inspector.setWorkflows(true);
    expect((await inspector.info()).workflows).toBe(true);
    inspector.setWorkflows(false);
    expect((await inspector.info()).workflows).toBe(false);
  });

  it("reports untracked storage health as not tracked and not healthy", async () => {
    const health = await new ReactorInspector({}).getStorageHealth();
    expect(health).toEqual({
      tracked: false,
      healthy: false,
      everRecreated: false,
      recreateCount: 0,
    });
  });

  it("reads a wired health provider", async () => {
    const tracked = {
      tracked: true,
      healthy: true,
      everRecreated: true,
      recreateCount: 2,
    };
    const inspector = new ReactorInspector({
      storageHealth: { getStorageHealth: () => tracked },
    });
    await expect(inspector.getStorageHealth()).resolves.toEqual(tracked);
  });

  it("refuses levers on missing components rather than acknowledging them", async () => {
    const inspector = new ReactorInspector({});
    await expect(inspector.pauseQueue()).rejects.toThrow(/unsupported/);
    await expect(inspector.resumeQueue()).rejects.toThrow(/unsupported/);
    await expect(inspector.retryProcessor("p")).rejects.toThrow(/unsupported/);
    await expect(inspector.sweepCatchUp()).rejects.toThrow(/unsupported/);
    await expect(inspector.rebuildKeyframes("d")).rejects.toThrow(
      /unsupported/,
    );
    await expect(inspector.getQueueState()).resolves.toMatchObject({
      totalPending: 0,
    });
  });

  it("lists drives and checks their integrity on the drive's branch", async () => {
    module = await new ReactorBuilder()
      .withDocumentModelSources([
        driveDocumentModelModule as unknown as DocumentModelModule,
      ])
      .buildModule();
    const inspector = createReactorInspector(module);
    const drive = withSignaturePolicy(
      driveDocumentModelModule.utils.createDocument(),
      "legacy",
    );
    drive.header.name = "inspected";
    const job = await module.reactor.create(drive);
    await waitFor(() => module!.reactor.getJobStatus(job.id));

    const page = await inspector.listDrives();
    expect(page.results.map((d) => d.driveId)).toContain(drive.header.id);

    const integrity = await inspector.checkDriveIntegrity(
      drive.header.id,
      "main",
    );
    expect(integrity).toMatchObject({
      driveId: drive.header.id,
      checkedNodeCount: 0,
      missingDocuments: [],
    });
  });
});

async function waitFor(
  status: () => Promise<{ status: string }>,
): Promise<void> {
  for (let i = 0; i < 200; i++) {
    const { status: s } = await status();
    if (s === "READ_READY") return;
    if (s === "FAILED") throw new Error("job failed");
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("job did not settle");
}
