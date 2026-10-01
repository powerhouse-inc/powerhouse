import {
  driveCreateDocument,
  driveDocumentModelModule,
  type DocumentDriveDocument,
} from "@powerhousedao/shared/document-drive";
import type {
  ActionSigningTarget,
  DocumentModelModule,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IReactorClient } from "../../src/client/types.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import { ReactorClientBuilder } from "../../src/core/reactor-client-builder.js";
import type { IReactor } from "../../src/core/types.js";
import { PropagationMode } from "../../src/shared/types.js";
import { createDocModelDocument } from "../factories.js";
import { TestP256Signer } from "../utils/p256-signer.js";

describe("ReactorClient resolves slugs on every write target", () => {
  let client: IReactorClient;
  let reactor: IReactor;
  let targets: ActionSigningTarget[];

  beforeEach(async () => {
    targets = [];
    const signer = (await TestP256Signer.create()).asISigner(targets);
    client = await new ReactorClientBuilder()
      .withReactorBuilder(
        new ReactorBuilder()
          .withDocumentModelSources([
            driveDocumentModelModule as unknown as DocumentModelModule,
            documentModelDocumentModelModule,
          ])
          .withExecutorConfig({ signatureVerification: "enforce" }),
      )
      .withSigner(signer)
      .build();
    reactor = (client as unknown as { reactor: IReactor }).reactor;
  });

  afterEach(() => {
    reactor.kill();
  });

  async function createWithSlug(slug: string): Promise<string> {
    const document = createDocModelDocument({ slug });
    await client.create(document);
    return document.header.id;
  }

  async function createDriveWithSlug(slug: string): Promise<string> {
    const drive = driveCreateDocument({
      global: { name: "Drive", icon: null, nodes: [] },
    });
    drive.header.slug = slug;
    await client.create(drive);
    return drive.header.id;
  }

  async function childIds(sourceId: string): Promise<string[]> {
    const edges = await client.getOutgoingRelationshipEdges(sourceId, "child");
    return edges.results.map((edge) => edge.targetId);
  }

  it("links a created document to a slug parent", async () => {
    const parentId = await createWithSlug("parent-slug");
    const child = createDocModelDocument();
    targets.length = 0;

    await client.create(child, "parent-slug");

    expect(await childIds(parentId)).toEqual([child.header.id]);
    expect(targets.at(-1)).toEqual({ documentId: parentId, branch: "main" });
  });

  it("links an empty document to a slug parent", async () => {
    const parentId = await createWithSlug("parent-slug");

    const child = await client.createEmpty<PHDocument>(
      "powerhouse/document-model",
      { parentIdentifier: "parent-slug" },
    );

    expect(await childIds(parentId)).toEqual([child.header.id]);
  });

  it("adds a file to a slug drive", async () => {
    const driveId = await createDriveWithSlug("drive-slug");
    const file = createDocModelDocument();

    await client.drives.addFile("drive-slug", file);

    const drive = await client.get<DocumentDriveDocument>(driveId);
    expect(drive.state.global.nodes.map((node) => node.id)).toEqual([
      file.header.id,
    ]);
    expect(await childIds(driveId)).toEqual([file.header.id]);
  });

  it("removes a node from a slug drive by the node's slug", async () => {
    const driveId = await createDriveWithSlug("drive-slug");
    const file = createDocModelDocument({ slug: "file-slug" });
    await client.drives.addFile(driveId, file);

    await client.drives.removeNode("drive-slug", "file-slug");

    const drive = await client.get<DocumentDriveDocument>(driveId);
    expect(drive.state.global.nodes).toEqual([]);
    expect(await childIds(driveId)).toEqual([]);
    await expect(client.get(file.header.id)).rejects.toThrow();
  });

  it("stores an edge between canonical ids for slug source and target", async () => {
    const sourceId = await createWithSlug("source-slug");
    const targetId = await createWithSlug("target-slug");

    const source = await client.addRelationship(
      "source-slug",
      "target-slug",
      "related",
    );

    expect(source.header.id).toBe(sourceId);
    const edges = await client.getOutgoingRelationshipEdges(
      sourceId,
      "related",
    );
    expect(edges.results.map((edge) => [edge.sourceId, edge.targetId])).toEqual(
      [[sourceId, targetId]],
    );
  });

  it("stores the canonical target when the source is an id", async () => {
    const sourceId = await createWithSlug("source-slug");
    const targetId = await createWithSlug("target-slug");

    await client.addRelationship(sourceId, "target-slug", "related");

    const edges = await client.getOutgoingRelationshipEdges(
      sourceId,
      "related",
    );
    expect(edges.results.map((edge) => edge.targetId)).toEqual([targetId]);
  });

  it("updates and removes an edge named by slugs", async () => {
    const sourceId = await createWithSlug("source-slug");
    const targetId = await createWithSlug("target-slug");
    await client.addRelationship(sourceId, targetId, "related");

    await client.updateRelationship("source-slug", "target-slug", "related", {
      order: 1,
    });
    const updated = await client.getOutgoingRelationshipEdges(
      sourceId,
      "related",
    );
    expect(updated.results[0]?.metadata).toEqual({ order: 1 });

    await client.removeRelationship("source-slug", "target-slug", "related");
    const removed = await client.getOutgoingRelationshipEdges(
      sourceId,
      "related",
    );
    expect(removed.results).toEqual([]);
  });

  it("moves an edge named by slugs", async () => {
    const fromId = await createWithSlug("from-slug");
    const toId = await createWithSlug("to-slug");
    const childId = await createWithSlug("child-slug");
    await client.addRelationship(fromId, childId, "child");

    const moved = await client.moveRelationship(
      "from-slug",
      "to-slug",
      "child-slug",
      "child",
    );

    expect(moved.source.header.id).toBe(fromId);
    expect(moved.target.header.id).toBe(toId);
    expect(await childIds(fromId)).toEqual([]);
    expect(await childIds(toId)).toEqual([childId]);
  });

  it("deletes a document named by its slug", async () => {
    const id = await createWithSlug("doomed-slug");

    await client.deleteDocument("doomed-slug");

    await expect(client.get(id)).rejects.toThrow("Document not found");
  });

  it("cascades a delete from a slug root", async () => {
    const rootId = await createWithSlug("root-slug");
    const child = createDocModelDocument();
    await client.create(child, rootId);

    await client.deleteDocument("root-slug", PropagationMode.Cascade);

    await expect(client.get(rootId)).rejects.toThrow("Document not found");
    await expect(client.get(child.header.id)).rejects.toThrow(
      "Document not found",
    );
  });
});
