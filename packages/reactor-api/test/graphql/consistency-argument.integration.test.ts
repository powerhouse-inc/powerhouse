import {
  ReactorBuilder,
  ReactorClientBuilder,
  type InProcessReactorClientModule,
  type ISyncManager,
} from "@powerhousedao/reactor";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, describe, expect, it } from "vitest";
import { ReactorSubgraph } from "../../src/graphql/reactor/subgraph.js";
import { createRequestClients } from "../../src/graphql/request-clients.js";
import type { Context, SubgraphArgs } from "../../src/graphql/types.js";
import { openAuthorization } from "../utils/read-gate-fixture.js";
import { createTestSigner } from "../utils/test-signer.js";

type Resolver = (p: unknown, a: unknown, c: Context) => Promise<unknown>;
type Served = { document: { name: string } };

const settledWithin = (promise: Promise<unknown>, ms: number) =>
  Promise.race([
    promise.then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ms)),
  ]);

describe("the consistency argument", () => {
  let module: InProcessReactorClientModule | undefined;

  afterEach(() => {
    module?.reactor.kill();
    module = undefined;
  });

  it("makes a document query wait for the write its token names", async () => {
    module = await new ReactorClientBuilder()
      .withSigner(await createTestSigner())
      .withReactorBuilder(
        new ReactorBuilder().withDocumentModelSources([
          documentModelDocumentModelModule as unknown as DocumentModelModule,
        ]),
      )
      .buildModule();
    const created = await (
      await module.write.createEmpty("powerhouse/document-model")
    ).readable;
    const before = await module.read.get(created.documentId);
    const subgraph = new ReactorSubgraph({
      readClient: module.read,
      syncManager: {} as ISyncManager,
      authorizationService: openAuthorization,
      graphqlManager: {},
    } as unknown as SubgraphArgs);
    const document = (subgraph.resolvers.Query as Record<string, Resolver>)
      .document;
    const ctx = {
      headers: {},
      db: null,
      clients: createRequestClients(module.read, module.write, "query"),
    } as Context;

    // The coordinate the next global operation will take.
    const revision: Partial<Record<string, number>> = before.header.revision;
    const next = revision.global ?? 0;
    const reading = document(
      undefined,
      {
        idOrSlug: created.documentId,
        consistency: {
          version: 1,
          createdAtUtcIso: new Date().toISOString(),
          coordinates: [
            {
              documentId: created.documentId,
              scope: "global",
              branch: "main",
              operationIndex: next,
            },
          ],
        },
      },
      ctx,
    ) as Promise<Served>;

    expect(await settledWithin(reading, 200)).toBe(false);

    const renamed = await module.write.execute(created.documentId, "main", [
      documentModelDocumentModelModule.actions.setModelName({
        name: "after the write",
      }),
    ]);
    const receipt = await renamed.readable;
    expect(receipt.token.coordinates).toContainEqual(
      expect.objectContaining({ scope: "global", operationIndex: next }),
    );

    const served = await reading;
    expect(
      (served.document as unknown as { state: { global: { name: string } } })
        .state.global.name,
    ).toBe("after the write");
  });

  it("answers at once without a token", async () => {
    module = await new ReactorClientBuilder()
      .withSigner(await createTestSigner())
      .withReactorBuilder(
        new ReactorBuilder().withDocumentModelSources([
          documentModelDocumentModelModule as unknown as DocumentModelModule,
        ]),
      )
      .buildModule();
    const created = await (
      await module.write.createEmpty("powerhouse/document-model")
    ).readable;
    const subgraph = new ReactorSubgraph({
      readClient: module.read,
      syncManager: {} as ISyncManager,
      authorizationService: openAuthorization,
      graphqlManager: {},
    } as unknown as SubgraphArgs);
    const document = (subgraph.resolvers.Query as Record<string, Resolver>)
      .document;

    const reading = document(undefined, { idOrSlug: created.documentId }, {
      headers: {},
      db: null,
      clients: createRequestClients(module.read, module.write, "query"),
    } as Context);

    expect(await settledWithin(reading, 2000)).toBe(true);
  });
});
