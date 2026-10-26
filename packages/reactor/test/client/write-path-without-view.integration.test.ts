import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { sql, type Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { InProcessReactorClientModule } from "../../src/core/types.js";
import { ReactorClientBuilder } from "../../src/core/reactor-client-builder.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { ReactorWriteClient } from "../../src/client/write-client.js";
import { REACTOR_SCHEMA } from "../../src/storage/migrations/migrator.js";
import { createDocModelDocument } from "../factories.js";
import { TestP256Signer } from "../utils/p256-signer.js";

/**
 * The plan's acceptance check for the write side: with the document view's
 * tables gone, a write on an existing slug still resolves and commits, and a
 * read fails. Proof that target resolution and `describe` no longer read the
 * view.
 */
describe("the write path without the document view", () => {
  let module: InProcessReactorClientModule;
  let db: Kysely<unknown>;

  beforeEach(async () => {
    module = await new ReactorClientBuilder()
      .withReactorBuilder(
        new ReactorBuilder().withDocumentModelSources([
          documentModelDocumentModelModule as unknown as DocumentModelModule,
        ]),
      )
      .withSigner((await TestP256Signer.create()).asISigner())
      .buildModule();
    db = module.reactorModule!.database as unknown as Kysely<unknown>;
  });

  afterEach(() => {
    module.reactor.kill();
  });

  async function renameViewTables(): Promise<void> {
    for (const table of ["DocumentSnapshot", "SlugMapping"]) {
      await sql`ALTER TABLE ${sql.table(`${REACTOR_SCHEMA}.${table}`)} RENAME TO ${sql.id(`${table}_hidden`)}`.execute(
        db,
      );
    }
  }

  it("resolves a slug, commits and describes, while a read fails", async () => {
    const document = createDocModelDocument({ slug: "kept-slug" });
    await (
      await module.write.create(document)
    ).readable;
    const id = document.header.id;
    const before = await module.write.describe("kept-slug");

    await renameViewTables();

    const handle = await module.write.execute("kept-slug", "main", [
      documentModelDocumentModelModule.actions.setModelName({
        name: "written without the view",
      }),
    ]);
    const receipt = await handle.written;

    expect(receipt.documentId).toBe(id);
    expect(receipt.job.result?.allApplied).toBe(true);
    const after = await module.write.describe("kept-slug");
    expect(after.documentId).toBe(id);
    expect(after.revision.global).toBe((before.revision.global ?? 0) + 1);
    expect((module.write as ReactorWriteClient).viewFallbackCount).toBe(0);

    await expect(module.read.get(id)).rejects.toThrow();
  });
});
