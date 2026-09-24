import {
  type ISyncManager,
  ReactorBuilder,
  ReactorClientBuilder,
  type InProcessReactorClientModule,
} from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  initializeAuth,
  setGrant,
  withSignaturePolicy,
  type DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule, setModelName } from "document-model";
import { buildSchema, parse, print, subscribe } from "graphql";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, it } from "vitest";
import { ReactorSubgraph } from "../src/graphql/reactor/subgraph.js";
import type { Context, SubgraphArgs } from "../src/graphql/types.js";
import {
  AuthorizationPolicy,
  type IAuthorizationService,
} from "../src/services/authorization.service.js";

const READER = "0xreader";
const OUTSIDER = "0xoutsider";
const DOCUMENT_MODEL = documentModelDocumentModelModule.documentModel.global.id;

// The host's legacy layer under OPEN admits everyone, anonymous included.
const openAuthorization: IAuthorizationService = {
  config: {
    admins: [],
    defaultProtection: false,
    policy: AuthorizationPolicy.OPEN,
  },
  isSupremeAdmin: () => true,
  canCreate: () => true,
  canRead: () => Promise.resolve(true),
  canWrite: () => Promise.resolve(true),
  canManage: () => Promise.resolve(true),
  canMutate: () => Promise.resolve(true),
};

function contextFor(address?: string): Context {
  return {
    user: address ? { address } : undefined,
    headers: {},
    db: null,
  } as unknown as Context;
}

// graphql's own schema, so subscribe() runs in this module's graphql realm.
function subscriptionSchema(subgraph: ReactorSubgraph) {
  const schema = buildSchema(print(subgraph.typeDefs));
  const fields = schema.getSubscriptionType()!.getFields();
  const resolvers = subgraph.resolvers.Subscription as Record<
    string,
    { subscribe: () => unknown; resolve: (payload: unknown) => unknown }
  >;
  for (const [name, resolver] of Object.entries(resolvers)) {
    const field = fields[name] as unknown as Record<string, unknown>;
    field.subscribe = resolver.subscribe;
    field.resolve = resolver.resolve;
  }
  return schema;
}

type Received = {
  data?: {
    documentChanges: { documents: Array<{ id: string; name: string }> };
  };
};

describe("documentChanges and findDocuments under OPEN with auth-scope policies", () => {
  let module: InProcessReactorClientModule | undefined;

  afterEach(() => {
    module?.reactor.kill();
    module = undefined;
  });

  async function build() {
    module = await new ReactorClientBuilder()
      .withReactorBuilder(
        new ReactorBuilder()
          .withDocumentModelSources([
            driveDocumentModelModule as unknown as DocumentModelModule,
            documentModelDocumentModelModule as unknown as DocumentModelModule,
          ])
          .withExecutorConfig({
            featureFlags: { documentDecisions: true, authEnforcement: true },
          }),
      )
      .buildModule();
    const subgraph = new ReactorSubgraph({
      reactorClient: module.client,
      syncManager: {} as ISyncManager,
      authorizationService: openAuthorization,
    } as unknown as SubgraphArgs);
    return { client: module.client, subgraph };
  }

  async function createDocument(
    client: InProcessReactorClientModule["client"],
    id: string,
    name: string,
  ) {
    // A fixed id cannot be content-addressed, so the document is legacy.
    const document = withSignaturePolicy(
      documentModelDocumentModelModule.utils.createDocument(),
      "legacy",
      { id },
    );
    document.header.name = name;
    await client.create(document);
    return id;
  }

  async function police(
    client: InProcessReactorClientModule["client"],
    id: string,
  ) {
    await client.execute(id, "main", [
      initializeAuth({
        version: 1,
        grants: [
          {
            id: "g-read",
            description: "the reader reads the domain",
            effect: "allow",
            principal: { address: READER },
            capability: { can: "read", scope: "global" },
          },
          {
            id: "g-admin",
            description: "administration stays reachable",
            effect: "allow",
            principal: { anyone: true },
            capability: { can: "execute", scope: "auth" },
          },
        ],
      }),
    ]);
  }

  async function feed(subgraph: ReactorSubgraph, address?: string) {
    const result = await subscribe({
      schema: subscriptionSchema(subgraph),
      contextValue: contextFor(address),
      document: parse(`
        subscription {
          documentChanges(search: {}) { type documents { id name } }
        }
      `),
    });
    const iterator = (result as AsyncIterableIterator<Received>)[
      Symbol.asyncIterator
    ]();
    const received: string[] = [];
    const pump = (async () => {
      for (;;) {
        const next = await iterator.next();
        if (next.done) return;
        for (const d of next.value.data?.documentChanges.documents ?? []) {
          received.push(d.name);
        }
      }
    })();
    await delay(10);
    return {
      received,
      stop: async () => {
        await iterator.return?.();
        await pump;
      },
    };
  }

  it("sends a subscriber only the documents its policies let it read", async () => {
    const { client, subgraph } = await build();
    const policed = await createDocument(client, "e2e-policed", "secret.pdf");
    await police(client, policed);
    const open = await createDocument(client, "e2e-open", "public.pdf");

    const anonymous = await feed(subgraph);
    const outsider = await feed(subgraph, OUTSIDER);
    const reader = await feed(subgraph, READER);

    await client.execute(policed, "main", [
      setGrant({
        grant: {
          id: "g-touch",
          description: "a change to the policed document",
          effect: "allow",
          principal: { address: "0xnobody" },
          capability: { can: "read", scope: "local" },
        },
      }),
    ]);
    await client.execute(open, "main", [setModelName({ name: "touched" })]);

    const all = [anonymous, outsider, reader];
    for (let i = 0; i < 100; i++) {
      if (all.every((f) => f.received.includes("public.pdf"))) break;
      await delay(20);
    }
    await Promise.all(all.map((f) => f.stop()));

    expect(anonymous.received).toContain("public.pdf");
    expect(anonymous.received).not.toContain("secret.pdf");
    expect(outsider.received).toContain("public.pdf");
    expect(outsider.received).not.toContain("secret.pdf");
    expect(reader.received).toContain("secret.pdf");
  });

  it("lists only readable documents, however the view narrows scopes", async () => {
    const { client, subgraph } = await build();
    const policed = await createDocument(client, "list-policed", "secret.pdf");
    await police(client, policed);
    await createDocument(client, "list-open", "public.pdf");

    const findDocuments = (
      subgraph.resolvers.Query as Record<
        string,
        (
          p: unknown,
          a: unknown,
          c: Context,
        ) => Promise<{ items: Array<{ name: string }> }>
      >
    ).findDocuments;
    const names = async (address: string | undefined, view?: unknown) =>
      (
        await findDocuments(
          undefined,
          { search: { type: DOCUMENT_MODEL }, view },
          contextFor(address),
        )
      ).items.map((item) => item.name);

    expect(await names(undefined)).toEqual(["public.pdf"]);
    expect(await names(undefined, { scopes: ["document"] })).toEqual([
      "public.pdf",
    ]);
    expect((await names(READER)).sort()).toEqual(["public.pdf", "secret.pdf"]);
  });
});
