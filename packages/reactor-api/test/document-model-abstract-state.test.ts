import { createRequire } from "node:module";
import type {
  IReactorReadClient,
  IReactorWriteClient,
  ISyncManager,
} from "@powerhousedao/reactor";
import type {
  DocumentModelGlobalState,
  DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import type * as GraphQL from "graphql";
import { describe, expect, it } from "vitest";
import type { BaseSubgraph } from "../src/graphql/base-subgraph.js";
import { DocumentModelSubgraph } from "../src/graphql/document-model-subgraph.js";
import { RequestClientBinder } from "../src/graphql/request-clients.js";
import type { Context, SubgraphArgs } from "../src/graphql/types.js";
import {
  AuthorizationPolicy,
  createAuthorizationService,
} from "../src/services/authorization.service.js";
import { createSchema } from "../src/utils/create-schema.js";

// The CommonJS build @apollo/subgraph uses; vite would hand this file the ESM one.
const { graphql } = createRequire(import.meta.url)("graphql") as typeof GraphQL;

const DOCUMENT_TYPE = "powerhouse/scrapbook";

const STATE_SCHEMA = `
interface Entry { label: String! }
type Note implements Entry { label: String! body: String! }
type Link { label: String! }
extend type Link implements Entry { href: String! }
union Pinned = Note
extend union Pinned = Link
type ScrapbookState { entries: [Entry!]! pinned: [Pinned!]! }
`;

const MODULE = {
  documentModel: {
    global: {
      id: DOCUMENT_TYPE,
      name: "Scrapbook",
      specifications: [
        {
          version: 1,
          state: {
            global: { schema: STATE_SCHEMA, initialValue: "" },
            local: { schema: "", initialValue: "" },
          },
          modules: [],
        },
      ],
    },
  },
  actions: {},
} as unknown as DocumentModelModule;

const ENTRIES = [
  { label: "a note", body: "text" },
  { label: "a link", href: "https://example.com" },
  {
    __typename: "Link",
    label: "typed a Link despite a Note's body",
    body: "stray",
    href: "https://example.org",
  },
];

const DOCUMENT = {
  header: {
    id: "doc-1",
    name: "My scrapbook",
    documentType: DOCUMENT_TYPE,
    slug: "doc-1",
    createdAtUtcIso: "2026-01-01T00:00:00.000Z",
    lastModifiedAtUtcIso: "2026-01-01T00:00:00.000Z",
    revision: { global: 1 },
  },
  state: { global: { entries: ENTRIES, pinned: ENTRIES } },
};

function readClient(): IReactorReadClient {
  return {
    get: () => Promise.resolve(DOCUMENT),
    getOutgoingRelationships: () => Promise.resolve({ results: [] }),
  } as unknown as IReactorReadClient;
}

async function query(source: string) {
  const subgraph: BaseSubgraph = new DocumentModelSubgraph(MODULE, {
    readClient: readClient(),
    syncManager: {} as ISyncManager,
    authorizationService: createAuthorizationService({
      admins: [],
      defaultProtection: false,
      policy: AuthorizationPolicy.OPEN,
    }),
    graphqlManager: {},
  } as unknown as SubgraphArgs);
  const binder = new RequestClientBinder(
    readClient(),
    {} as IReactorWriteClient,
  );
  const schema = createSchema(
    [MODULE],
    binder.bindResolvers(subgraph.resolvers),
    subgraph.typeDefs,
  );
  return graphql({
    schema,
    source,
    contextValue: { headers: {}, db: null } as unknown as Context,
  });
}

const members = `
  __typename
  ... on Scrapbook_Note { label body }
  ... on Scrapbook_Link { label href }
`;

describe("a document model's abstract state types", () => {
  it("resolves interface and union members by __typename or a field unique to one", async () => {
    const result = await query(`{
      Scrapbook {
        document(identifier: "doc-1") {
          document {
            state { global { entries { ${members} } pinned { ${members} } } }
          }
        }
      }
    }`);
    expect(result.errors).toBeUndefined();
    const expected = [
      { __typename: "Scrapbook_Note", label: "a note", body: "text" },
      {
        __typename: "Scrapbook_Link",
        label: "a link",
        href: "https://example.com",
      },
      {
        __typename: "Scrapbook_Link",
        label: "typed a Link despite a Note's body",
        href: "https://example.org",
      },
    ];
    expect(result.data).toEqual({
      Scrapbook: {
        document: {
          document: {
            state: { global: { entries: expected, pinned: expected } },
          },
        },
      },
    });
  });
});
