import { buildSubgraphSchema } from "@apollo/subgraph";
import { ph } from "document-model";
import { createRequire } from "node:module";
import type * as GraphQL from "graphql";
import { describe, expect, it } from "vitest";
import { defineSubgraph } from "../src/graphql/define-subgraph.js";
import type { SubgraphArgs } from "../src/graphql/types.js";
import { printCompatibilityDocument } from "../src/graphql/structured-projection.js";
import { buildSubgraphSchemaModule } from "../src/utils/create-schema.js";

const Widget = ph.object("Widget", {
  fields: { id: ph.String({ required: true }) },
});
const Entry = ph.union("Entry", { members: [Widget] });
// Apollo's CommonJS schema must be executed by the same GraphQL module copy.
const { graphql, parse, GraphQLScalarType, Kind } = createRequire(
  import.meta.url,
)("graphql") as typeof GraphQL;

function run(
  resolve: () => { name: string } | string | Promise<{ name: string } | string>,
) {
  const Subgraph = defineSubgraph({
    name: "entries",
    schemaKind: "typed",
    entries: (build) => [
      build.query("entry", {
        returns: ph.ref(Entry, { required: true }),
        resolve: () => ({ id: "one" }),
      }),
      build.resolveType(Entry, resolve),
    ],
  });
  const instance = new Subgraph({} as SubgraphArgs);
  const schema = buildSubgraphSchema([
    buildSubgraphSchemaModule(
      [],
      instance.resolvers as never,
      instance.typeDefs,
    ),
  ]);
  return graphql({
    schema,
    source: "{ entry { __typename ... on Widget { id } } }",
  });
}

describe("typed abstract type execution", () => {
  it.each([
    ["synchronous descriptor", () => Widget],
    ["synchronous string", () => "Widget"],
    ["asynchronous descriptor", () => Promise.resolve(Widget)],
    ["asynchronous string", () => Promise.resolve("Widget")],
    [
      "thenable descriptor",
      () => ({
        name: "PendingWidget",
        then(resolve: (value: typeof Widget) => void) {
          resolve(Widget);
        },
      }),
    ],
  ])("resolves a %s through Apollo", async (_label, resolve) => {
    const result = await run(resolve);
    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({ entry: { __typename: "Widget", id: "one" } });
  });

  it("propagates an asynchronous rejection as a GraphQL error", async () => {
    const result = await run(() => Promise.reject(new Error("resolve failed")));
    expect(result.errors?.[0].message).toContain("resolve failed");
    expect(result.data).toBeNull();
  });
});

describe("compatibility projection execution", () => {
  it("executes a compatibility projection with built-in, catalog, and package scalars", async () => {
    const projected = printCompatibilityDocument(
      parse(
        `
    scalar HexColor
    type CompatState { label: String!, id: OID!, color: HexColor! }
  `,
        { noLocation: true },
      ) as never,
      "Compat",
      new Set(["HexColor"]),
    );
    const schema = buildSubgraphSchema([
      {
        typeDefs: parse(
          `scalar OID\n${projected}\ntype Query { item: Compat_CompatState! }`,
        ),
        resolvers: {
          Query: { item: () => ({ label: "One", id: "oid-1", color: "#fff" }) },
          Compat_HexColor: new GraphQLScalarType({
            name: "Compat_HexColor",
            serialize: (value) => value,
            parseValue: (value) => value,
            parseLiteral: (value) =>
              value.kind === Kind.STRING ? value.value : null,
          }),
        },
      },
    ]);
    const result = await graphql({
      schema,
      source: "{ item { label id color } }",
    });
    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      item: { label: "One", id: "oid-1", color: "#fff" },
    });
  });

  it.each([
    {
      name: "OID",
      declaration: "type OID { value: String! }",
      value: { value: "one" },
      selection: "value { value }",
    },
    {
      name: "Currency",
      declaration: "enum Currency { USD EUR }",
      value: "USD",
      selection: "value",
    },
  ])(
    "namespaces a declared non-scalar named $name",
    async ({ name, declaration, value, selection }) => {
      const projected = printCompatibilityDocument(
        parse(
          `
    ${declaration}
    type CompatState { value: ${name}! }
  `,
          { noLocation: true },
        ) as never,
        "Compat",
        new Set(),
      );
      const schema = buildSubgraphSchema([
        buildSubgraphSchemaModule(
          [],
          {
            Query: { item: () => ({ value }) },
          } as never,
          parse(`${projected}\ntype Query { item: Compat_CompatState! }`),
        ),
      ]);
      const result = await graphql({
        schema,
        source: `{ item { ${selection} } }`,
      });
      expect(result.errors).toBeUndefined();
      expect(result.data).toEqual({ item: { value } });
      expect(schema.getType(`Compat_${name}`)?.name).toBe(`Compat_${name}`);
    },
  );
});
