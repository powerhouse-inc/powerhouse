import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type {
  DocumentModelModule,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import { ReactorClientBuilder } from "../../src/core/reactor-client-builder.js";
import type { InProcessReactorClientModule } from "../../src/core/types.js";

/**
 * An import that reuses a taken document id must fail without leaving anything
 * behind, and the caller must be able to tell that failure apart from a
 * transient one so it can retry under a fresh id.
 *
 * The pollution half is the part worth pinning. drives.addFile used to submit
 * the create and the drive's ADD_FILE as one batch with a dependsOn edge, and
 * a batch edge is ordering only -- IQueue.failJob releases dependents of a
 * failed job -- so the node landed on top of a create that never happened,
 * pointing the drive at a document belonging to whoever already held the id.
 */
describe("drives.addFile with a taken document id", () => {
  let module: InProcessReactorClientModule;
  let driveId: string;

  /** Every operation row for a document, across scopes and branches. */
  async function operationRows(documentId: string) {
    return await database()
      .selectFrom("Operation")
      .selectAll()
      .where("documentId", "=", documentId)
      .execute();
  }

  async function relationshipRows(targetId: string) {
    return await database()
      .selectFrom("DocumentRelationship")
      .selectAll()
      .where("targetId", "=", targetId)
      .execute();
  }

  function database() {
    const reactorModule = module.reactorModule;
    if (!reactorModule) {
      throw new Error("expected an in-process reactor module");
    }
    return reactorModule.database;
  }

  function newDocument(): PHDocument {
    return documentModelDocumentModelModule.utils.createDocument();
  }

  beforeEach(async () => {
    const reactorBuilder = new ReactorBuilder().withDocumentModelSources([
      driveDocumentModelModule as unknown as DocumentModelModule,
      documentModelDocumentModelModule,
    ]);
    module = await new ReactorClientBuilder()
      .withReactorBuilder(reactorBuilder)
      .buildModule();

    const drive = await module.client.drives.create({
      global: { name: "Drive", icon: null, nodes: [] },
    });
    driveId = drive.header.id;
  });

  afterEach(async () => {
    await module.reactor.kill().completed;
  });

  it("fails as DocumentAlreadyExistsError, which a caller can tell from a transient failure", async () => {
    const existing = newDocument();
    await module.client.create(existing);

    const collidingImport = newDocument();
    collidingImport.header.id = existing.header.id;

    const thrown = await module.client.drives
      .addFile(driveId, collidingImport)
      .catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).name).toBe("DocumentAlreadyExistsError");
    expect((thrown as Error).message).toContain(existing.header.id);
  });

  it("leaves the drive, the stream and the relationships untouched", async () => {
    const existing = newDocument();
    await module.client.create(existing);

    const operationsBefore = await operationRows(existing.header.id);
    const relationshipsBefore = await relationshipRows(existing.header.id);
    expect(operationsBefore.length).toBeGreaterThan(0);

    const collidingImport = newDocument();
    collidingImport.header.id = existing.header.id;
    await expect(
      module.client.drives.addFile(driveId, collidingImport),
    ).rejects.toThrow();

    // The drive never learned about the attempt: no file node, and no child
    // relationship pointing at a document it does not own.
    const drive = await module.client.get(driveId);
    expect(
      (drive.state as { global: { nodes: unknown[] } }).global.nodes,
    ).toEqual([]);
    expect(await relationshipRows(existing.header.id)).toHaveLength(
      relationshipsBefore.length,
    );

    // The document that already held the id is untouched: no operation was
    // appended to its stream by the attempt.
    const operationsAfter = await operationRows(existing.header.id);
    expect(operationsAfter).toHaveLength(operationsBefore.length);
    await expect(module.client.get(existing.header.id)).resolves.toMatchObject({
      header: { id: existing.header.id },
    });
  });

  it("accepts the same import under a fresh id, leaving exactly one node", async () => {
    const existing = newDocument();
    await module.client.create(existing);

    const collidingImport = newDocument();
    collidingImport.header.id = existing.header.id;
    await expect(
      module.client.drives.addFile(driveId, collidingImport),
    ).rejects.toThrow();

    // What the import path does on that failure: mint a new id, import again.
    const retried = newDocument();
    retried.header.name = "imported copy";
    const imported = await module.client.drives.addFile(driveId, retried);
    expect(imported.header.id).toBe(retried.header.id);
    expect(imported.header.id).not.toBe(existing.header.id);

    const drive = await module.client.get(driveId);
    const nodes = (drive.state as { global: { nodes: { id: string }[] } })
      .global.nodes;
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe(retried.header.id);
  });
});
