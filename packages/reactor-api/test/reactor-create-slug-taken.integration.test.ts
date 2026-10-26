import {
  ReactorBuilder,
  ReactorClientBuilder,
  type InProcessReactorClientModule,
  type ISyncManager,
} from "@powerhousedao/reactor";
import {
  driveCreateDocument,
  driveDocumentModelModule,
} from "@powerhousedao/shared/document-drive";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DocumentModelSubgraph } from "../src/graphql/document-model-subgraph.js";
import { createDocumentWithInitialState } from "../src/graphql/reactor/resolvers.js";
import { ReactorSubgraph } from "../src/graphql/reactor/subgraph.js";
import type { Context, SubgraphArgs } from "../src/graphql/types.js";
import {
  AuthorizationPolicy,
  createAuthorizationService,
} from "../src/services/authorization.service.js";
import { mutationContextFor } from "./utils/read-gate-fixture.js";
import { createTestSigner } from "./utils/test-signer.js";

type Resolver = (p: unknown, a: unknown, c: Context) => Promise<unknown>;

// The reactor moves a slug to the newest document that names it, silently.
describe("creating a document with a slug another document holds", () => {
  let module: InProcessReactorClientModule;
  let mutation: (name: string) => Resolver;
  let ctx: Context;
  let workflowsId: string;

  beforeEach(async () => {
    module = await new ReactorClientBuilder()
      .withSigner(await createTestSigner())
      .withReactorBuilder(
        new ReactorBuilder().withDocumentModelSources([
          driveDocumentModelModule as unknown as DocumentModelModule,
          documentModelDocumentModelModule as unknown as DocumentModelModule,
        ]),
      )
      .buildModule();
    ctx = mutationContextFor(module);
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
      },
    } as unknown as SubgraphArgs);
    mutation = (name) =>
      (subgraph.resolvers.Mutation as Record<string, Resolver>)[name];

    const drive = driveCreateDocument({
      global: { name: "Workflows", icon: null, nodes: [] },
    });
    drive.header.slug = "workflows";
    await module.client.create(drive);
    workflowsId = drive.header.id;
  });

  afterEach(() => {
    module.reactor.kill();
  });

  it("refuses createDocument, and the slug stays with its document", async () => {
    const document = documentModelDocumentModelModule.utils.createDocument();
    document.header.slug = "workflows";

    await expect(
      mutation("createDocument")(undefined, { document }, ctx),
    ).rejects.toThrow(
      `The slug "workflows" is taken by document ${workflowsId}; choose another.`,
    );
    await expect(module.client.resolveIdOrSlug("workflows")).resolves.toBe(
      workflowsId,
    );
  });

  it("refuses a create with an initial state", async () => {
    await expect(
      createDocumentWithInitialState(module.client, {
        documentType: "powerhouse/document-drive",
        name: "Workflows",
        slug: "workflows",
        initialState: {},
      }),
    ).rejects.toThrow(`The slug "workflows" is taken`);
  });

  it("creates with a free slug", async () => {
    const created = (await createDocumentWithInitialState(module.client, {
      documentType: "powerhouse/document-drive",
      name: "Orders",
      slug: "orders",
      initialState: {},
    })) as { id: string };
    await expect(module.client.resolveIdOrSlug("orders")).resolves.toBe(
      created.id,
    );
  });

  // A slug with no initial state used to take the empty-document path, which drops it.
  it("keeps the slug the model's own createDocument mutation is given", async () => {
    const drives = new DocumentModelSubgraph(
      driveDocumentModelModule as unknown as DocumentModelModule,
      {
        reactorClient: module.client,
        authorizationService: createAuthorizationService({
          admins: [],
          defaultProtection: false,
          policy: AuthorizationPolicy.OPEN,
        }),
        graphqlManager: {},
      } as unknown as SubgraphArgs,
    );
    const created = (await drives.mutationResolvers.createDocument(
      null,
      { name: "Warehouse", slug: "warehouse" },
      ctx,
    )) as { id: string; slug: string };
    expect(created.slug).toBe("warehouse");
    await expect(module.client.resolveIdOrSlug("warehouse")).resolves.toBe(
      created.id,
    );
  });
});
