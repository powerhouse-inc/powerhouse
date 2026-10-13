import { gql } from "graphql-tag";
import { describe, expect, it } from "vitest";
import { DocumentModelSubgraph } from "../src/graphql/document-model-subgraph.js";
import { inspectionTypeDefs } from "../src/graphql/inspection/schema.js";
import { ReactorSubgraph } from "../src/graphql/reactor/subgraph.js";
import {
  collectSubgraphClaims,
  resolveClaimOwnership,
  type SubgraphClaims,
} from "../src/graphql/subgraph-type-ownership.js";
import type { SubgraphArgs } from "../src/graphql/types.js";
import { getGeneratedDocumentModelTypes } from "../src/utils/create-schema.js";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import type { IReactorClient } from "@powerhousedao/reactor";
import type { DocumentNode } from "graphql";

const generated = getGeneratedDocumentModelTypes([]);

function claims(typeDefs: DocumentNode): SubgraphClaims {
  return collectSubgraphClaims(typeDefs, generated.names);
}

/** The losers among `subgraphs`, in priority order, by name. */
function losers(subgraphs: Record<string, DocumentNode>) {
  const excluded = resolveClaimOwnership(
    Object.entries(subgraphs).map(([name, typeDefs]) => ({
      candidate: name,
      name,
      claims: claims(typeDefs),
    })),
  );
  return Object.fromEntries(excluded);
}

function makeModel(name: string): DocumentModelModule {
  return {
    documentModel: {
      global: {
        name,
        id: `test/${name}`,
        specifications: [
          {
            version: 1,
            modules: [],
            state: {
              global: { schema: `type ${name}State { name: String }` },
              local: { schema: "" },
            },
          },
        ],
      },
    },
  } as unknown as DocumentModelModule;
}

function modelTypeDefs(name: string): DocumentNode {
  return new DocumentModelSubgraph(makeModel(name), {
    reactorClient: {} as IReactorClient,
  } as SubgraphArgs).typeDefs;
}

const reactorTypeDefs = new ReactorSubgraph({
  reactorClient: {} as IReactorClient,
} as SubgraphArgs).typeDefs;

describe("collectSubgraphClaims", () => {
  it("claims non-root types, non-root extensions and root fields", () => {
    const collected = claims(gql`
      scalar Amount
      type Widget {
        id: ID!
      }
      extend type Gadget {
        size: Int
      }
      type Query {
        widget: Widget
      }
      extend type Mutation {
        addWidget: Widget
      }
    `);
    expect([...collected.keys()].sort()).toEqual([
      "Gadget",
      "Mutation.addWidget",
      "Query.widget",
      "Widget",
    ]);
  });

  it("leaves out definitions of generated types", () => {
    const collected = claims(gql`
      type Operation {
        id: String!
      }
      extend type Operation {
        extra: String
      }
    `);
    expect([...collected.keys()]).toEqual(["Operation"]);
    expect(collected.get("Operation")).toContain("extend type Operation");
  });

  it("ignores how a string default is quoted", () => {
    expect(
      claims(gql`
        input Filter {
          kind: String = "x"
        }
      `),
    ).toEqual(
      claims(gql`
        input Filter {
          kind: String = """
          x
          """
        }
      `),
    );
  });

  it("reads a type split across a definition and an extension as one", () => {
    expect(
      claims(gql`
        type Widget {
          id: ID!
        }
        extend type Widget {
          name: String
        }
      `),
    ).toEqual(
      claims(gql`
        type Widget {
          id: ID!
          name: String
        }
      `),
    );
  });

  it("ignores descriptions and the order of fields and arguments", () => {
    const a = claims(gql`
      """
      A widget
      """
      type Widget {
        "the id"
        id: ID!
        name(locale: String, short: Boolean): String
      }
      type Query {
        widgets(limit: Int, offset: Int): [Widget!]!
      }
    `);
    const b = claims(gql`
      type Widget {
        name(short: Boolean, locale: String): String
        id: ID!
      }
      type Query {
        "All widgets"
        widgets(offset: Int, limit: Int): [Widget!]!
      }
    `);
    expect(a).toEqual(b);
  });
});

describe("resolveClaimOwnership", () => {
  it("allows every model subgraph's Revision beside the reactor subgraph's", () => {
    expect(
      losers({
        r: reactorTypeDefs,
        "todo-list": modelTypeDefs("TodoList"),
        invoice: modelTypeDefs("Invoice"),
      }),
    ).toEqual({});
  });

  it("finds no conflict between the reactor and inspection subgraphs", () => {
    expect(
      losers({ r: reactorTypeDefs, inspection: inspectionTypeDefs }),
    ).toEqual({});
  });

  it("refuses a compatible subset of an owned type", () => {
    expect(
      losers({
        a: gql`
          type Widget {
            id: ID!
            name: String
          }
        `,
        b: gql`
          type Widget {
            id: ID!
          }
        `,
      }),
    ).toEqual({ b: [{ claim: "Widget", owner: "a" }] });
  });

  it("gives a root field to its first claimant", () => {
    expect(
      losers({
        a: gql`
          type Query {
            documents(limit: Int): [String!]!
          }
        `,
        b: gql`
          type Query {
            documents: [String!]!
            other: String
          }
        `,
      }),
    ).toEqual({ b: [{ claim: "Query.documents", owner: "a" }] });
  });

  it("gives an identical root field to its first claimant only", () => {
    const typeDefs = gql`
      type Query {
        hello: String
      }
    `;
    expect(losers({ a: typeDefs, b: typeDefs })).toEqual({
      b: [{ claim: "Query.hello", owner: "a" }],
    });
  });

  it("refuses an extension of a type another subgraph defines", () => {
    expect(
      losers({
        a: gql`
          type Widget {
            id: ID!
          }
        `,
        b: gql`
          extend type Widget {
            extra: String
          }
        `,
      }),
    ).toEqual({ b: [{ claim: "Widget", owner: "a" }] });
  });

  it("refuses a package's PagingInput that differs from the reactor subgraph's", () => {
    expect(
      losers({
        r: reactorTypeDefs,
        pkg: gql`
          input PagingInput {
            limit: Int
            offset: Int
          }
          type Query {
            things(paging: PagingInput): [String!]!
          }
        `,
      }),
    ).toEqual({ pkg: [{ claim: "PagingInput", owner: "r" }] });
  });

  it("lets a loser's claims go to the next claimant", () => {
    expect(
      losers({
        a: gql`
          type Widget {
            id: ID!
          }
        `,
        b: gql`
          type Widget {
            name: String
          }
          type Gadget {
            id: ID!
          }
        `,
        c: gql`
          type Gadget {
            size: Int
          }
        `,
      }),
    ).toEqual({ b: [{ claim: "Widget", owner: "a" }] });
  });
});
