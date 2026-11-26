import {
  ReactorBuilder,
  ReactorClientBuilder,
  type InProcessReactorClientModule,
  type ISyncManager,
} from "@powerhousedao/reactor";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { testSigner } from "@powerhousedao/shared/testing";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, describe, expect, it } from "vitest";
import { ReactorSubgraph } from "../../src/graphql/reactor/subgraph.js";
import type { Context, SubgraphArgs } from "../../src/graphql/types.js";
import {
  buildReadGateReactor,
  createFixture,
  mutationContextFor,
  openAuthorization,
  OUTSIDER,
  police,
  READER,
} from "../utils/read-gate-fixture.js";

type Resolver = (parent: unknown, args: unknown, ctx: Context) => unknown;
type OperationsPage = { items: { action: { type: string } }[] };

const renamed = () => {
  const action = documentModelDocumentModelModule.actions.setModelName({
    name: "kept",
  });
  return {
    id: action.id,
    type: action.type,
    timestampUtcMs: action.timestampUtcMs,
    input: action.input,
    scope: action.scope,
  };
};

function subgraphOf(module: InProcessReactorClientModule): ReactorSubgraph {
  return new ReactorSubgraph({
    readClient: module.read,
    syncManager: {} as ISyncManager,
    authorizationService: openAuthorization,
    graphqlManager: {},
  } as unknown as SubgraphArgs);
}

describe("the operations of a document a write returns", () => {
  let module: InProcessReactorClientModule | undefined;

  afterEach(() => {
    module?.reactor.kill();
    module = undefined;
  });

  // The renown-package's credential processor deletes a credential document
  // as soon as a REVOKE reaches it, so the host's delete can land between the
  // write's read-back and its `operations` field.
  it("are answered for the write after a later write deleted the document", async () => {
    module = await new ReactorClientBuilder()
      .withSigner(await testSigner())
      .withReactorBuilder(
        new ReactorBuilder().withDocumentModelSources([
          documentModelDocumentModelModule as unknown as DocumentModelModule,
        ]),
      )
      .buildModule();
    const created = await (
      await module.write.createEmpty("powerhouse/document-model")
    ).readable;
    const subgraph = subgraphOf(module);
    const ctx = mutationContextFor(module);

    const returned = await (
      subgraph.resolvers.Mutation as Record<string, Resolver>
    ).execute(
      undefined,
      {
        documentIdOrSlug: created.documentId,
        actions: [renamed()],
        branch: "main",
      },
      ctx,
    );
    await (
      await module.write.deleteDocument(created.documentId)
    ).readable;

    const page = (await (
      subgraph.resolvers.PHDocument as Record<string, Resolver>
    ).operations(
      returned,
      { filter: { sinceRevision: 0, scopes: ["global"], branch: "main" } },
      ctx,
    )) as OperationsPage;

    expect(page.items.map((operation) => operation.action.type)).toEqual([
      "SET_MODEL_NAME",
    ]);
  });

  it("stay gated when the read is pinned to the write", async () => {
    module = await buildReadGateReactor();
    const id = await createFixture(module.client, "pinned-gated");
    await police(module.client, id);
    const receipt = await (
      await module.write.execute(id, "main", [
        documentModelDocumentModelModule.actions.setModelName({ name: "kept" }),
      ])
    ).readable;
    await (
      await module.write.deleteDocument(id)
    ).readable;

    const readAs = (address: string) =>
      module!.read.getOperations(
        id,
        { subject: { address }, scopes: ["global"] },
        undefined,
        undefined,
        undefined,
        receipt.token,
      );

    expect(
      (await readAs(READER)).results.map((operation) => operation.action.type),
    ).toContain("SET_MODEL_NAME");
    expect((await readAs(OUTSIDER)).results).toEqual([]);
  });
});
