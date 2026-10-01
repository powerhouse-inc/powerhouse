import {
  ReactorBuilder,
  ReactorClientBuilder,
  type InProcessReactorClientModule,
  type ISyncManager,
} from "@powerhousedao/reactor";
import {
  ReactorDriveClient,
  reactorDriveCreateDocument,
  reactorDriveDocumentModelModule,
  type IDriveReadModel,
} from "@powerhousedao/reactor-drive";
import {
  driveCreateDocument,
  driveDocumentModelModule,
  type DocumentDriveDocument,
} from "@powerhousedao/shared/document-drive";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDocumentWithInitialState } from "../src/graphql/reactor/resolvers.js";
import { ReactorSubgraph } from "../src/graphql/reactor/subgraph.js";
import type { Context, SubgraphArgs } from "../src/graphql/types.js";
import {
  AuthorizationPolicy,
  createAuthorizationService,
} from "../src/services/authorization.service.js";
import { createTestSigner } from "./utils/test-signer.js";

type Resolver = (p: unknown, a: unknown, c: Context) => Promise<unknown>;

describe("reactor subgraph writes resolve slugs under OPEN", () => {
  let module: InProcessReactorClientModule;
  let mutation: (name: string) => Resolver;
  let reactorDriveClient: ReactorDriveClient;
  const ctx = { headers: {}, db: null } as unknown as Context;

  beforeEach(async () => {
    module = await new ReactorClientBuilder()
      .withSigner(await createTestSigner())
      .withReactorBuilder(
        new ReactorBuilder().withDocumentModelSources([
          driveDocumentModelModule as unknown as DocumentModelModule,
          documentModelDocumentModelModule as unknown as DocumentModelModule,
          reactorDriveDocumentModelModule as unknown as DocumentModelModule,
        ]),
      )
      .buildModule();
    reactorDriveClient = new ReactorDriveClient({
      reactor: module.client,
      readModel: {} as IDriveReadModel,
    });
    const subgraph = new ReactorSubgraph({
      reactorClient: module.client,
      syncManager: {} as ISyncManager,
      authorizationService: createAuthorizationService({
        admins: [],
        defaultProtection: false,
        policy: AuthorizationPolicy.OPEN,
      }),
      graphqlManager: {
        driveOwnershipCache: { add: () => undefined, remove: () => undefined },
        reactorDriveClient,
      },
    } as unknown as SubgraphArgs);
    mutation = (name) =>
      (subgraph.resolvers.Mutation as Record<string, Resolver>)[name];
  });

  afterEach(() => {
    module.reactor.kill();
  });

  async function createWithSlug(slug: string): Promise<string> {
    const document = documentModelDocumentModelModule.utils.createDocument();
    document.header.slug = slug;
    await module.client.create(document);
    return document.header.id;
  }

  async function createDriveWithSlug(slug: string): Promise<string> {
    const drive = driveCreateDocument({
      global: { name: "Drive", icon: null, nodes: [] },
    });
    drive.header.slug = slug;
    await module.client.create(drive);
    return drive.header.id;
  }

  async function createReactorDriveWithSlug(slug: string): Promise<string> {
    const drive = reactorDriveCreateDocument();
    drive.header.slug = slug;
    await module.client.create(drive);
    return drive.header.id;
  }

  async function targetIds(sourceId: string, type: string): Promise<string[]> {
    const edges = await module.client.getOutgoingRelationshipEdges(
      sourceId,
      type,
    );
    return edges.results.map((edge) => edge.targetId);
  }

  async function nodeIds(driveId: string): Promise<string[]> {
    const drive = await module.client.get<DocumentDriveDocument>(driveId);
    return drive.state.global.nodes.map((node) => node.id);
  }

  it("createDocument under a slug parent", async () => {
    const parentId = await createWithSlug("parent-slug");
    const document = documentModelDocumentModelModule.utils.createDocument();

    await mutation("createDocument")(
      undefined,
      { document, parentIdentifier: "parent-slug" },
      ctx,
    );

    expect(await targetIds(parentId, "child")).toEqual([document.header.id]);
  });

  it("createDocument under a slug drive", async () => {
    const driveId = await createDriveWithSlug("drive-slug");
    const document = documentModelDocumentModelModule.utils.createDocument();

    await mutation("createDocument")(
      undefined,
      { document, parentIdentifier: "drive-slug" },
      ctx,
    );

    expect(await nodeIds(driveId)).toEqual([document.header.id]);
    expect(await targetIds(driveId, "child")).toEqual([document.header.id]);
  });

  it("every create path under a slug reactor-drive", async () => {
    const driveId = await createReactorDriveWithSlug("reactor-drive-slug");
    const document = documentModelDocumentModelModule.utils.createDocument();
    const documentType =
      documentModelDocumentModelModule.documentModel.global.id;

    await mutation("createDocument")(
      undefined,
      { document, parentIdentifier: "reactor-drive-slug" },
      ctx,
    );
    const empty = (await mutation("createEmptyDocument")(
      undefined,
      { documentType, parentIdentifier: "reactor-drive-slug" },
      ctx,
    )) as { id: string };
    const initial = await createDocumentWithInitialState(
      module.client,
      {
        documentType,
        parentIdOrSlug: "reactor-drive-slug",
        initialState: {},
      },
      reactorDriveClient,
    );

    expect((await targetIds(driveId, "drive/child")).sort()).toEqual(
      [document.header.id, empty.id, initial.id].sort(),
    );
  });

  it("createEmptyDocument under a slug parent and a slug drive", async () => {
    const parentId = await createWithSlug("parent-slug");
    const driveId = await createDriveWithSlug("drive-slug");
    const documentType =
      documentModelDocumentModelModule.documentModel.global.id;

    const underParent = (await mutation("createEmptyDocument")(
      undefined,
      { documentType, parentIdentifier: "parent-slug" },
      ctx,
    )) as { id: string };
    const underDrive = (await mutation("createEmptyDocument")(
      undefined,
      { documentType, parentIdentifier: "drive-slug" },
      ctx,
    )) as { id: string };

    expect(await targetIds(parentId, "child")).toEqual([underParent.id]);
    expect(await nodeIds(driveId)).toEqual([underDrive.id]);
  });

  it("addRelationship, updateRelationship and removeRelationship on slugs", async () => {
    const sourceId = await createWithSlug("source-slug");
    const targetId = await createWithSlug("target-slug");
    const edge = { sourceIdentifier: "source-slug", relationshipType: "rel" };

    await mutation("addRelationship")(
      undefined,
      { ...edge, targetIdentifier: "target-slug" },
      ctx,
    );
    expect(await targetIds(sourceId, "rel")).toEqual([targetId]);

    await mutation("updateRelationship")(
      undefined,
      { ...edge, targetIdentifier: "target-slug", metadata: { order: 1 } },
      ctx,
    );
    const updated = await module.client.getOutgoingRelationshipEdges(
      sourceId,
      "rel",
    );
    expect(updated.results[0]?.metadata).toEqual({ order: 1 });

    await mutation("removeRelationship")(
      undefined,
      { ...edge, targetIdentifier: "target-slug" },
      ctx,
    );
    expect(await targetIds(sourceId, "rel")).toEqual([]);
  });

  it("moveRelationship on slugs", async () => {
    const fromId = await createWithSlug("from-slug");
    const toId = await createWithSlug("to-slug");
    const childId = await createWithSlug("child-slug");
    await module.client.addRelationship(fromId, childId, "child");

    await mutation("moveRelationship")(
      undefined,
      {
        sourceParentIdentifier: "from-slug",
        targetParentIdentifier: "to-slug",
        targetIdentifier: "child-slug",
        relationshipType: "child",
      },
      ctx,
    );

    expect(await targetIds(fromId, "child")).toEqual([]);
    expect(await targetIds(toId, "child")).toEqual([childId]);
  });

  it("deleteDocument on a slug", async () => {
    const id = await createWithSlug("doomed-slug");

    await mutation("deleteDocument")(
      undefined,
      { identifier: "doomed-slug" },
      ctx,
    );

    await expect(module.client.get(id)).rejects.toThrow("Document not found");
  });

  it("deleteDocument on a slug inside a drive removes the node by id", async () => {
    const driveId = await createDriveWithSlug("drive-slug");
    const file = documentModelDocumentModelModule.utils.createDocument();
    file.header.slug = "file-slug";
    await module.client.drives.addFile(driveId, file);
    const removeNode = vi.spyOn(module.client.drives, "removeNode");

    await mutation("deleteDocument")(
      undefined,
      { identifier: "file-slug" },
      ctx,
    );

    expect(removeNode).toHaveBeenCalledWith(driveId, file.header.id);
    expect(await nodeIds(driveId)).toEqual([]);
    await expect(module.client.get(file.header.id)).rejects.toThrow(
      "Document not found",
    );
  });
});
