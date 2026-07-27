import { PGlite } from "@electric-sql/pglite";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import { generateId } from "@powerhousedao/shared/document-model";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Database, ReactorClientModule } from "../../index.js";
import { ReactorBuilder, ReactorClientBuilder } from "../../index.js";

/**
 * Regression tests for the delete → re-import flow.
 *
 * Deleting a document appends a DELETE_DOCUMENT tombstone; its operation
 * history is retained, so the id stays owned by the reactor. No read path
 * exposes that ownership: `get`, `resolveIdOrSlug` and `getOperations` all
 * hide soft-deleted documents, so a tombstoned id is indistinguishable from an
 * unused one. Importers therefore cannot probe first — reusing the id fails
 * with a revision mismatch on CREATE_DOCUMENT@0, and the recovery is to import
 * under a fresh id ("create a copy").
 */
describe("import after delete (document id conflict)", () => {
  let pg: PGlite;
  let db: Kysely<unknown>;
  let module: ReactorClientModule;

  beforeEach(async () => {
    pg = new PGlite();
    db = new Kysely<unknown>({ dialect: new PGliteDialect(pg) });
    const reactorBuilder = new ReactorBuilder()
      .withDocumentModels([driveDocumentModelModule as never])
      .withKysely(db as Kysely<Database>);
    module = await new ReactorClientBuilder()
      .withReactorBuilder(reactorBuilder)
      .buildModule();
  });

  afterEach(async () => {
    module.reactor.kill();
    await db.destroy();
  });

  function newDoc() {
    return driveDocumentModelModule.utils.createDocument();
  }

  async function driveNodes(driveId: string) {
    const drive = await module.client.get(driveId);
    const state = drive.state as unknown as {
      global: { nodes: { id: string; name: string }[] };
    };
    return state.global.nodes.map((node) => ({ id: node.id, name: node.name }));
  }

  it("commits the drive node even when the document create fails", async () => {
    const drive = newDoc();
    await module.client.create(drive);

    const file = newDoc();
    file.header.name = "new one";
    await module.client.drives.addFile(drive.header.id, file);
    await module.client.drives.removeNode(drive.header.id, file.header.id);
    expect(await driveNodes(drive.header.id)).toEqual([]);

    // addFile submits the create and the drive's ADD_FILE as two jobs whose
    // dependsOn link only orders them, so the node lands despite the rejection.
    await expect(
      module.client.drives.addFile(drive.header.id, file),
    ).rejects.toThrow(/revision mismatch/i);

    expect(await driveNodes(drive.header.id)).toEqual([
      { id: file.header.id, name: "new one" },
    ]);
  });

  it("leaves a single node once the dangling one is cleared before the retry", async () => {
    const drive = newDoc();
    await module.client.create(drive);

    const file = newDoc();
    file.header.name = "new one";
    await module.client.drives.addFile(drive.header.id, file);
    await module.client.drives.removeNode(drive.header.id, file.header.id);

    await expect(
      module.client.drives.addFile(drive.header.id, file),
    ).rejects.toThrow(/revision mismatch/i);

    // removeNode reports failure because it also tombstones the child document,
    // which was never created — the node removal itself still commits.
    await expect(
      module.client.drives.removeNode(drive.header.id, file.header.id),
    ).rejects.toThrow();
    expect(await driveNodes(drive.header.id)).toEqual([]);

    const copy = structuredClone(file);
    copy.header.id = generateId();
    copy.header.slug = "";
    await module.client.drives.addFile(drive.header.id, copy);

    // One entry, keeping the original name rather than gaining a "(copy)" suffix.
    expect(await driveNodes(drive.header.id)).toEqual([
      { id: copy.header.id, name: "new one" },
    ]);
  });

  it("hides a deleted document from every read path", async () => {
    const doc = newDoc();
    await module.client.create(doc);

    const ops = await module.client.getOperations(doc.header.id);
    expect(ops.results.length).toBeGreaterThan(0);

    await module.client.deleteDocument(doc.header.id);

    await expect(module.client.get(doc.header.id)).rejects.toThrow(
      "Document not found",
    );
    await expect(module.client.resolveIdOrSlug(doc.header.id)).rejects.toThrow(
      "Document not found",
    );
    // Retained history is not reachable either, so it cannot serve as a probe.
    await expect(module.client.getOperations(doc.header.id)).rejects.toThrow(
      "Document not found",
    );
  });

  it("reports a deleted id exactly as it reports an unused one", async () => {
    const doc = newDoc();
    await module.client.create(doc);
    await module.client.deleteDocument(doc.header.id);

    const unused = generateId();
    const probe = async (id: string) => {
      try {
        await module.client.resolveIdOrSlug(id);
        return "resolved";
      } catch (e) {
        return (e as Error).message.replace(id, "<id>");
      }
    };

    expect(await probe(doc.header.id)).toBe(await probe(unused));
  });

  it("rejects re-creating a deleted document under its original id", async () => {
    const doc = newDoc();
    await module.client.create(doc);
    await module.client.deleteDocument(doc.header.id);

    await expect(module.client.create(doc)).rejects.toThrow(
      /revision mismatch/i,
    );
  });

  it("imports a copy of a deleted document under a fresh id", async () => {
    const doc = newDoc();
    await module.client.create(doc);
    await module.client.deleteDocument(doc.header.id);

    // "Create Copy": same content, fresh identity — mirrors the import flow.
    const copy = structuredClone(doc);
    copy.header.id = generateId();
    copy.header.slug = copy.header.id;

    const created = await module.client.create(copy);
    expect(created.header.id).toBe(copy.header.id);

    const fetched = await module.client.get(copy.header.id);
    expect(fetched.header.id).toBe(copy.header.id);

    // The original stays deleted and untouched.
    await expect(module.client.get(doc.header.id)).rejects.toThrow(
      "Document not found",
    );
  });
});
