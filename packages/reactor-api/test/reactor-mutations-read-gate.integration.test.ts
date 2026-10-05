import type {
  IReactorClient,
  InProcessReactorClientModule,
  ISyncManager,
} from "@powerhousedao/reactor";
import type {
  AuthSubject,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as resolvers from "../src/graphql/reactor/resolvers.js";
import { ReactorSubgraph } from "../src/graphql/reactor/subgraph.js";
import type { Context, SubgraphArgs } from "../src/graphql/types.js";
import {
  buildReadGateReactor,
  contextFor,
  createFixture,
  holdsGlobal,
  openAuthorization,
  OUTSIDER,
  police,
  READER,
} from "./utils/read-gate-fixture.js";

type Served = { id: string; state: unknown };
type Mutation = (p: unknown, a: unknown, c: Context) => Promise<unknown>;

function keylessAction(type: string, input: unknown, scope: string) {
  return {
    id: crypto.randomUUID(),
    type,
    timestampUtcMs: new Date().toISOString(),
    input,
    scope,
  };
}

describe("reactor subgraph mutations return documents read as the caller", () => {
  let module: InProcessReactorClientModule | undefined;

  afterEach(() => {
    module?.reactor.kill();
    module = undefined;
  });

  async function fixture() {
    module = await buildReadGateReactor();
    const client = module.client;
    const secret = await createFixture(client, "mut-secret");
    await police(client, secret);
    const open = await createFixture(client, "mut-open");
    const subgraph = new ReactorSubgraph({
      reactorClient: client,
      syncManager: {} as ISyncManager,
      authorizationService: openAuthorization,
      graphqlManager: { driveOwnershipCache: { add: () => undefined } },
    } as unknown as SubgraphArgs);
    const mutation = (name: string) =>
      (subgraph.resolvers.Mutation as Record<string, Mutation>)[name];
    return { client, secret, open, mutation };
  }

  const as = async (
    run: (ctx: Context) => Promise<unknown>,
    address?: string,
  ) => holdsGlobal((await run(contextFor(address))) as Served);

  it("execute and mutateDocument", async () => {
    const { secret, mutation } = await fixture();
    for (const name of ["execute", "mutateDocument"]) {
      const run = (ctx: Context) =>
        mutation(name)(
          undefined,
          {
            documentIdentifier: secret,
            actions: [
              keylessAction("SET_MODEL_NAME", { name: "touched" }, "global"),
            ],
          },
          ctx,
        );
      expect(await as(run), name).toBe(false);
      expect(await as(run, OUTSIDER), name).toBe(false);
      expect(await as(run, READER), name).toBe(true);
    }
  });

  it("renameDocument and setPreferredEditor", async () => {
    const { secret, mutation } = await fixture();
    const rename = (ctx: Context) =>
      mutation("renameDocument")(
        undefined,
        { documentIdentifier: secret, name: "renamed" },
        ctx,
      );
    const editor = (ctx: Context) =>
      mutation("setPreferredEditor")(
        undefined,
        { documentIdentifier: secret, preferredEditor: "an-editor" },
        ctx,
      );
    for (const run of [rename, editor]) {
      expect(await as(run)).toBe(false);
      expect(await as(run, OUTSIDER)).toBe(false);
      expect(await as(run, READER)).toBe(true);
    }
  });

  it("addRelationship, updateRelationship and removeRelationship", async () => {
    const { secret, open, mutation } = await fixture();
    const edge = (ctx: Context, name: string, extra = {}) =>
      mutation(name)(
        undefined,
        {
          sourceIdentifier: secret,
          targetIdentifier: open,
          relationshipType: "related",
          ...extra,
        },
        ctx,
      );
    for (const address of [undefined, OUTSIDER, READER]) {
      const served = [
        await as((ctx) => edge(ctx, "addRelationship"), address),
        await as(
          (ctx) => edge(ctx, "updateRelationship", { metadata: { n: 1 } }),
          address,
        ),
        await as((ctx) => edge(ctx, "removeRelationship"), address),
      ];
      expect(served, String(address)).toEqual(
        Array(3).fill(address === READER),
      );
    }
  });

  it("moveRelationship", async () => {
    const { client, secret, open, mutation } = await fixture();
    const target = await createFixture(client, "mut-moved");
    await client.addRelationship(open, target, "child");
    let from = open;
    for (const address of [undefined, OUTSIDER, READER]) {
      const to = from === open ? secret : open;
      const result = (await mutation("moveRelationship")(
        undefined,
        {
          sourceParentIdentifier: from,
          targetParentIdentifier: to,
          targetIdentifier: target,
          relationshipType: "child",
        },
        contextFor(address),
      )) as { source: Served; target: Served };
      const policed = to === secret ? result.target : result.source;
      expect(holdsGlobal(policed), String(address)).toBe(address === READER);
      from = to;
    }
  });
});

describe("create resolvers return the document read as the caller", () => {
  const created = {
    header: {
      id: "created",
      name: "",
      documentType: documentModelDocumentModelModule.documentModel.global.id,
      slug: "",
      revision: {},
      createdAtUtcIso: "",
      lastModifiedAtUtcIso: "",
      sig: { publicKey: {}, nonce: "" },
    },
    state: { global: { secret: true } },
  } as unknown as PHDocument;
  const stripped = { ...created, state: {} } as PHDocument;
  const subject: AuthSubject = { address: OUTSIDER };

  function client() {
    const get = vi.fn().mockResolvedValue(stripped);
    return {
      get,
      client: {
        get,
        create: vi.fn().mockResolvedValue(created),
        createEmpty: vi.fn().mockResolvedValue(created),
        getDocumentModelModule: vi
          .fn()
          .mockResolvedValue(documentModelDocumentModelModule),
        getCreateSignaturePolicy: vi.fn().mockResolvedValue("legacy"),
      } as unknown as IReactorClient,
    };
  }

  it.each([
    [
      "createDocument",
      (c: IReactorClient) =>
        resolvers.createDocument(c, { document: created }, undefined, subject),
    ],
    [
      "createEmptyDocument",
      (c: IReactorClient) =>
        resolvers.createEmptyDocument(
          c,
          { documentType: created.header.documentType },
          undefined,
          subject,
        ),
    ],
    [
      "createDocumentWithInitialState",
      (c: IReactorClient) =>
        resolvers.createDocumentWithInitialState(
          c,
          { documentType: created.header.documentType, initialState: {} },
          undefined,
          subject,
        ),
    ],
  ])("%s", async (_name, run) => {
    const { client: c, get } = client();
    const result = await run(c);
    expect(get).toHaveBeenCalledWith("created", { subject, branch: undefined });
    expect(result.state).toEqual({});
  });
});
