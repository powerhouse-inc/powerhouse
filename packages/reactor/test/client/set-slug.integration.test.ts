import {
  driveCreateDocument,
  driveDocumentModelModule,
  setDriveName,
} from "@powerhousedao/shared/document-drive";
import {
  setSlug,
  withSignaturePolicy,
  type DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { sql, type Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deleteDocumentAction } from "../../src/actions/index.js";
import type { IReactorClient } from "../../src/client/types.js";
import type { ReactorWriteClient } from "../../src/client/write-client.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import { ReactorClientBuilder } from "../../src/core/reactor-client-builder.js";
import type { InProcessReactorModule, IReactor } from "../../src/core/types.js";
import {
  DeletedDocumentRead,
  KyselyDocumentView,
} from "../../src/read-models/document-view.js";
import { ConsistencyTracker } from "../../src/shared/consistency-tracker.js";
import { REACTOR_SCHEMA } from "../../src/storage/migrations/migrator.js";
import { TestP256Signer } from "../utils/p256-signer.js";

describe.each([
  ["without document decisions", false],
  ["with document decisions", true],
])("SET_SLUG %s", (_name, documentDecisions) => {
  let client: IReactorClient;
  let reactor: IReactor;
  let write: ReactorWriteClient;
  let db: Kysely<unknown>;
  let reactorModule: InProcessReactorModule;

  beforeEach(async () => {
    const signer = (await TestP256Signer.create()).asISigner([]);
    const module = await new ReactorClientBuilder()
      .withReactorBuilder(
        new ReactorBuilder()
          .withDocumentModelSources([
            driveDocumentModelModule as unknown as DocumentModelModule,
            documentModelDocumentModelModule,
          ])
          .withExecutorConfig({
            signatureVerification: "enforce",
            featureFlags: { documentDecisions },
          }),
      )
      .withSigner(signer)
      .buildModule();
    client = module.client;
    write = module.write as ReactorWriteClient;
    db = module.reactorModule!.database as unknown as Kysely<unknown>;
    reactorModule = module.reactorModule!;
    reactor = (client as unknown as { reactor: IReactor }).reactor;
  });

  afterEach(() => {
    reactor.kill();
  });

  async function createDrive(): Promise<string> {
    const drive = driveCreateDocument({
      global: { name: "Drive", icon: null, nodes: [] },
    });
    await client.create(drive);
    return drive.header.id;
  }

  async function name(identifier: string, slug: string): Promise<void> {
    await (
      await write.execute(identifier, "main", [setSlug(slug)])
    ).readable;
  }

  it("names the document by the slug, in its header too", async () => {
    const id = await createDrive();

    await name(id, "mail");

    await expect(client.resolveIdOrSlug("mail")).resolves.toBe(id);
    expect((await client.get("mail")).header).toMatchObject({
      id,
      slug: "mail",
    });
  });

  it("keeps the slug through operations in other scopes", async () => {
    const id = await createDrive();
    const child = await createDrive();
    await name(id, "mail");

    await (
      await write.execute(id, "main", [setDriveName({ name: "Renamed" })])
    ).readable;
    await (
      await write.addRelationship(id, child, "child")
    ).readable;

    expect((await client.get(id)).header.slug).toBe("mail");
    await expect(client.resolveIdOrSlug("mail")).resolves.toBe(id);
  });

  it("frees the old slug when a document takes a new one", async () => {
    const id = await createDrive();
    await name(id, "first");

    await name(id, "second");

    await expect(client.resolveIdOrSlug("second")).resolves.toBe(id);
    await expect(client.resolveIdOrSlug("first")).rejects.toThrow();
  });

  it("gives an identifier to the live slug over a deleted document's id", async () => {
    const old = withSignaturePolicy(
      driveCreateDocument({
        global: { name: "Old", icon: null, nodes: [] },
      }),
      "legacy",
      { id: "mail" },
    );
    old.header.slug = "mail";
    await client.create(old);
    await (
      await write.deleteDocument("mail")
    ).readable;
    const id = await createDrive();

    await name(id, "mail");

    await expect(client.resolveIdOrSlug("mail")).resolves.toBe(id);
    expect((await client.get("mail")).header.id).toBe(id);
    const receipt = await (
      await write.execute("mail", "main", [setDriveName({ name: "Renamed" })])
    ).readable;
    expect(receipt.documentId).toBe(id);
    expect(write.viewFallbackCount).toBe(0);
  });

  it("frees a deleted document's slug by default", async () => {
    const id = await createDrive();
    await name(id, "mail");

    await (
      await write.deleteDocument("mail")
    ).readable;

    await expect(client.resolveIdOrSlug("mail")).rejects.toThrow();
  });

  it("leaves the slug on a document deleted with keepSlug", async () => {
    const id = await createDrive();
    await name(id, "mail");

    await (
      await write.execute(id, "main", [
        deleteDocumentAction(id, { keepSlug: true }),
      ])
    ).readable;

    await expect(client.resolveIdOrSlug("mail")).resolves.toBe(id);
  });

  it("still refuses an identifier that is a live id and another's slug", async () => {
    const taken = await createDrive();
    const id = await createDrive();

    await name(id, taken);

    await expect(client.resolveIdOrSlug(taken)).rejects.toThrow(/Ambiguous/);
  });

  it("is rebuilt from the operations, so the slug outlives the read model", async () => {
    const id = await createDrive();
    await name(id, "mail");
    await (
      await write.execute(id, "main", [setDriveName({ name: "Renamed" })])
    ).readable;

    const table = (name: string) => sql.table(`${REACTOR_SCHEMA}.${name}`);
    await sql`DELETE FROM ${table("SlugMapping")}`.execute(db);
    await sql`DELETE FROM ${table("DocumentSnapshot")}`.execute(db);
    await sql`DELETE FROM ${table("ViewState")}`.execute(db);

    const parts = reactorModule;
    const rebuilt = new KyselyDocumentView(
      db as never,
      parts.operationStore,
      parts.operationIndex,
      parts.writeCache,
      new ConsistencyTracker(),
      documentDecisions
        ? DeletedDocumentRead.StateAtDeletion
        : DeletedDocumentRead.NotFound,
    );
    await rebuilt.init();

    await expect(rebuilt.resolveIdOrSlug("mail")).resolves.toBe(id);
    const { header } = await rebuilt.get(id);
    expect(header.slug).toBe("mail");
  });
});
