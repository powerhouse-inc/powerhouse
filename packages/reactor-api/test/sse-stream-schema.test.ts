import { gql } from "graphql-tag";
import type { DocumentNode, GraphQLSchema } from "graphql";
import { describe, expect, it, vi } from "vitest";
import { filterBuildableSubgraphs } from "../src/graphql/gateway/adapter-gateway-stitching.js";
import type { SubgraphDefinition } from "../src/graphql/gateway/types.js";
import {
  createGraphQLSSEHandler,
  mergeStreamSubgraphs,
  withoutFederationDirectives,
} from "../src/graphql/sse.js";
import type { Context } from "../src/graphql/types.js";

function subgraph(
  name: string,
  typeDefs: DocumentNode,
  resolvers: SubgraphDefinition["resolvers"] = {},
): SubgraphDefinition {
  return { name, typeDefs, resolvers, url: `/graphql/${name}` };
}

/** Builds the stream schema the way the supergraph SSE setup does. */
function streamSchema(subgraphs: SubgraphDefinition[]) {
  const error = vi.fn();
  const buildable = filterBuildableSubgraphs(
    withoutFederationDirectives(subgraphs),
    { error },
    "Supergraph SSE",
  );
  return {
    schema: mergeStreamSubgraphs(buildable),
    excluded: error.mock.calls.map((call) => String(call[0])),
  };
}

function ticker(field: string, value: unknown) {
  return {
    Subscription: {
      [field]: {
        subscribe: async function* () {
          await Promise.resolve();
          yield { [field]: value };
        },
      },
    },
  };
}

/** Runs `query` over the SSE handler and returns the raw event stream. */
async function streamOver(schema: GraphQLSchema, query: string) {
  const handler = createGraphQLSSEHandler({
    schema,
    contextFactory: () => ({}) as Context,
  });
  const res = await handler(
    new Request("http://localhost/graphql/stream", {
      method: "POST",
      headers: {
        accept: "text/event-stream",
        "content-type": "application/json",
      },
      body: JSON.stringify({ query }),
    }),
  );
  return res.text();
}

const DIRECTIVES = "{ __schema { directives { name } } }";

const LINK = "https://specs.apollo.dev/federation/v2.3";

describe("supergraph stream schema", () => {
  describe("federation directives imported under other names", () => {
    it("strips directives imported under an alias", async () => {
      const { schema, excluded } = streamSchema([
        subgraph(
          "aliased",
          gql`
            extend schema
              @link(
                url: "${LINK}"
                import: [{ name: "@shareable", as: "@share" }, "@key"]
              )
            type Thing @key(fields: "id") {
              id: ID!
            }
            type Query {
              thing: Thing @share
            }
            type Subscription {
              thingAdded: Thing
            }
          `,
          {
            Query: { thing: () => ({ id: "t-1" }) },
            ...ticker("thingAdded", { id: "t-2" }),
          },
        ),
      ]);

      expect(excluded).toEqual([]);
      expect(schema).toBeDefined();
      expect(await streamOver(schema!, DIRECTIVES)).not.toMatch(
        /"(share|shareable|key|link)"/,
      );
      expect(
        await streamOver(schema!, "subscription { thingAdded { id } }"),
      ).toContain('{"data":{"thingAdded":{"id":"t-2"}}}');
    });

    it("strips directives namespaced under the link's `as` prefix", async () => {
      const { schema, excluded } = streamSchema([
        subgraph(
          "namespaced",
          gql`
            extend schema @link(url: "${LINK}", as: "fed", import: ["@key"])
            type Thing @key(fields: "id") @fed__shareable {
              id: ID! @fed__external
            }
            type Query {
              thing: Thing @fed__shareable
            }
            type Subscription {
              thingAdded: Thing
            }
          `,
          ticker("thingAdded", { id: "t-2" }),
        ),
      ]);

      expect(excluded).toEqual([]);
      expect(schema).toBeDefined();
      expect(await streamOver(schema!, DIRECTIVES)).not.toMatch(
        /"(fed__\w+|key|link)"/,
      );
      expect(
        await streamOver(schema!, "subscription { thingAdded { id } }"),
      ).toContain('{"data":{"thingAdded":{"id":"t-2"}}}');
    });

    it("strips default-namespace references without an import", async () => {
      const { schema, excluded } = streamSchema([
        subgraph(
          "default-namespace",
          gql`
            extend schema @link(url: "${LINK}", import: ["@key"])
            type Query {
              info: String @federation__shareable
            }
            type Subscription {
              tick: String
            }
          `,
          ticker("tick", "tick"),
        ),
      ]);

      expect(excluded).toEqual([]);
      expect(await streamOver(schema!, "subscription { tick }")).toContain(
        '{"data":{"tick":"tick"}}',
      );
    });

    it("keeps a directive the subgraph declares itself", async () => {
      const { schema, excluded } = streamSchema([
        subgraph(
          "declared",
          gql`
            directive @share on FIELD_DEFINITION
            type Query {
              info: String @share
            }
            type Subscription {
              tick: String
            }
          `,
        ),
      ]);

      expect(excluded).toEqual([]);
      expect(await streamOver(schema!, DIRECTIVES)).toContain(
        '{"name":"share"}',
      );
    });
  });

  describe("entity extensions", () => {
    const extension = gql`
      extend type Thing @key(fields: "id") {
        id: ID! @external
        extra: String
      }
      type Subscription {
        thingAdded: Thing
      }
    `;

    it("streams an entity extension whose base type no subgraph defines", async () => {
      const { schema, excluded } = streamSchema([
        subgraph(
          "base",
          gql`
            type Query {
              info: String
            }
          `,
        ),
        subgraph(
          "extender",
          extension,
          ticker("thingAdded", { id: "t-1", extra: "x" }),
        ),
      ]);

      expect(excluded).toEqual([]);
      expect(
        await streamOver(schema!, "subscription { thingAdded { id extra } }"),
      ).toContain('{"data":{"thingAdded":{"id":"t-1","extra":"x"}}}');
    });

    it("merges an entity extension into the base type another subgraph defines", async () => {
      const { schema, excluded } = streamSchema([
        subgraph(
          "base",
          gql`
            type Thing @key(fields: "id") {
              id: ID!
              name: String
            }
            type Query {
              info: String
            }
          `,
        ),
        subgraph(
          "extender",
          extension,
          ticker("thingAdded", { id: "t-1", name: "n", extra: "x" }),
        ),
      ]);

      expect(excluded).toEqual([]);
      expect(
        await streamOver(
          schema!,
          "subscription { thingAdded { id name extra } }",
        ),
      ).toContain(
        '{"data":{"thingAdded":{"id":"t-1","name":"n","extra":"x"}}}',
      );
    });
  });
});
