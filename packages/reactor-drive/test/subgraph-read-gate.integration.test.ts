import { MemoryFS, PGlite } from "@electric-sql/pglite";
import {
  ReactorBuilder,
  ReactorClientBuilder,
  type InProcessReactorClientModule,
} from "@powerhousedao/reactor";
import {
  initializeAuth,
  withSignaturePolicy,
  type DocumentModelModule,
  type PHDocument,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { afterEach, describe, expect, it } from "vitest";
import { reactorDriveDocumentModelModule } from "../src/module.js";
import { DriveNodeView } from "../src/read-model/drive-node-view.js";
import { runReactorDriveMigrations } from "../src/schema/migrations/migrator.js";
import type { ReactorDriveDatabase } from "../src/schema/tables.js";
import {
  createReactorDriveResolvers,
  type ReactorDriveResolverContext,
} from "../src/subgraph/index.js";

const READER = "0xreader";
const OUTSIDER = "0xoutsider";

type Client = InProcessReactorClientModule["client"];

describe("reactor-drive subgraph reads as the caller", () => {
  let module: InProcessReactorClientModule | undefined;
  let pg: PGlite | undefined;
  let db: Kysely<ReactorDriveDatabase> | undefined;

  afterEach(async () => {
    module?.reactor.kill();
    module = undefined;
    await db?.destroy();
    db = undefined;
    await pg?.close();
    pg = undefined;
  });

  async function create(
    client: Client,
    source: { utils: { createDocument: () => PHDocument } },
    id: string,
  ) {
    // A fixed id cannot be content-addressed, so the document is legacy.
    const document = withSignaturePolicy(
      source.utils.createDocument(),
      "legacy",
      { id },
    );
    await client.create(document);
    return id;
  }

  async function police(client: Client, id: string) {
    await client.execute(id, "main", [
      initializeAuth({
        version: 1,
        grants: [
          {
            id: "g-read",
            description: "the reader reads the domain",
            effect: "allow",
            principal: { address: READER },
            capability: { can: "read", scope: "global" },
          },
          {
            id: "g-admin",
            description: "administration stays reachable",
            effect: "allow",
            principal: { anyone: true },
            capability: { can: "execute", scope: "auth" },
          },
        ],
      }),
    ]);
  }

  async function fixture() {
    module = await new ReactorClientBuilder()
      .withReactorBuilder(
        new ReactorBuilder()
          .withDocumentModelSources([
            reactorDriveDocumentModelModule as unknown as DocumentModelModule,
            documentModelDocumentModelModule as unknown as DocumentModelModule,
          ])
          .withExecutorConfig({
            featureFlags: { documentDecisions: true, authEnforcement: true },
          }),
      )
      .buildModule();
    const client = module.client;
    const drive = await create(
      client,
      reactorDriveDocumentModelModule,
      "rd-drive",
    );
    const policedDrive = await create(
      client,
      reactorDriveDocumentModelModule,
      "rd-policed-drive",
    );
    await police(client, policedDrive);
    const secret = await create(
      client,
      documentModelDocumentModelModule,
      "rd-secret",
    );
    await police(client, secret);
    const open = await create(
      client,
      documentModelDocumentModelModule,
      "rd-open",
    );

    pg = new PGlite({ fs: new MemoryFS() });
    db = new Kysely<ReactorDriveDatabase>({ dialect: new PGliteDialect(pg) });
    await runReactorDriveMigrations(db as unknown as Kysely<unknown>, "public");
    const file = (
      driveId: string,
      id: string,
      parentFolder: string | null,
    ) => ({
      driveId,
      id,
      kind: "file" as const,
      name: `${id}.md`,
      requestedName: `${id}.md`,
      parentFolder,
      documentType: documentModelDocumentModelModule.documentModel.global.id,
    });
    const folder = (driveId: string, id: string) => ({
      driveId,
      id,
      kind: "folder" as const,
      name: id,
      requestedName: id,
      parentFolder: null,
      documentType: null,
    });
    await db
      .insertInto("DriveNode")
      .values([
        folder(drive, "f"),
        file(drive, secret, null),
        file(drive, open, null),
        folder(policedDrive, "pf"),
      ])
      .execute();

    const resolvers = createReactorDriveResolvers({
      reactorClient: client,
      readModel: new DriveNodeView(db),
    });
    const as = (address?: string) =>
      ({
        user: address ? { address } : undefined,
      }) as ReactorDriveResolverContext;
    const refusedByHost = createReactorDriveResolvers({
      reactorClient: client,
      readModel: new DriveNodeView(db),
      hostCanRead: () => Promise.resolve(false),
    });
    return { resolvers, refusedByHost, as, drive, policedDrive, secret, open };
  }

  it("serves a policed drive and its nodes only to a caller who may read it", async () => {
    const { resolvers, as, policedDrive } = await fixture();
    const read = async (address?: string) => ({
      drive: await resolvers.Query.reactorDrive(
        undefined,
        { id: policedDrive },
        as(address),
      ),
      node: await resolvers.Query.reactorDriveNode(
        undefined,
        { driveId: policedDrive, id: "pf" },
        as(address),
      ),
      descendants: await resolvers.Query.reactorDriveDescendants(
        undefined,
        { driveId: policedDrive, root: "pf" },
        as(address),
      ),
    });

    for (const address of [undefined, OUTSIDER]) {
      const served = await read(address);
      expect(served.drive, String(address)).toBeNull();
      expect(served.node, String(address)).toBeUndefined();
      expect(served.descendants, String(address)).toEqual([]);
    }
    const reader = await read(READER);
    expect(reader.drive?.id).toBe(policedDrive);
    expect(reader.drive?.sharingType).toBeNull();
    expect(reader.node?.id).toBe("pf");
    expect(reader.descendants.map((n) => n.id)).toEqual(["pf"]);
  });

  it("withholds a file node whose document the caller may not read", async () => {
    const { resolvers, as, drive, secret, open } = await fixture();
    const roots = async (address?: string) =>
      (
        await resolvers.ReactorDrive.rootNodes(
          { id: drive },
          { paging: { cursor: "", limit: 10 } },
          as(address),
        )
      ).results
        .map((n) => n.id)
        .sort();
    const node = (address?: string) =>
      resolvers.Query.reactorDriveNode(
        undefined,
        { driveId: drive, id: secret },
        as(address),
      );

    expect(await roots()).toEqual(["f", open].sort());
    expect(await roots(OUTSIDER)).toEqual(["f", open].sort());
    expect(await roots(READER)).toEqual(["f", open, secret].sort());
    expect(await node(OUTSIDER)).toBeUndefined();
    expect((await node(READER))?.id).toBe(secret);
  });

  it("applies the host's own read check on top of the read gate", async () => {
    const { refusedByHost, as, drive } = await fixture();

    expect(
      await refusedByHost.Query.reactorDrive(
        undefined,
        { id: drive },
        as(READER),
      ),
    ).toBeNull();
  });
});
