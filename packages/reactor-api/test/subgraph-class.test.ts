import { buildSubgraphSchema } from "@apollo/subgraph";
import type { SubgraphArgs } from "@powerhousedao/reactor-api";
import { defineScalar, DocumentModelDefinitionError, ph } from "document-model";
import type * as GraphQL from "graphql";
import * as hostGraphQL from "graphql";
import {
  graphql as executeOnHost,
  GraphQLError,
  GraphQLObjectType,
  GraphQLScalarType,
  GraphQLSchema,
  Kind,
  parse,
  print,
  type ValueNode,
} from "graphql";
import { gql } from "graphql-tag";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { z } from "zod";
import { BaseSubgraph } from "../src/graphql/base-subgraph.js";
import {
  resolverMapScalarCoercions,
  scalarTypeFromCoercion,
} from "../src/graphql/scalar-bindings.js";
import {
  SUBGRAPH_PROTOCOL,
  SUBGRAPH_PROTOCOL_VERSION,
  type SubgraphScalarCoercion,
} from "../src/graphql/subgraph-protocol.js";
import type { SchemaBuilder } from "../src/graphql/subgraph-schema.js";
import type { Context } from "../src/graphql/types.js";
import { servedSubgraph } from "./utils/served-subgraph.js";

const { graphql } = createRequire(import.meta.url)("graphql") as typeof GraphQL;

function args(): SubgraphArgs {
  return {
    reactorClient: {},
    relationalDb: {},
    analyticsStore: {},
    graphqlManager: {},
    syncManager: {},
    authorizationService: {},
  } as unknown as SubgraphArgs;
}

function protocolOf(subgraphClass: object) {
  return (subgraphClass as typeof BaseSubgraph)[SUBGRAPH_PROTOCOL]();
}

function describeClass(subgraphClass: object) {
  return protocolOf(subgraphClass).describe();
}

function refusal(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof DocumentModelDefinitionError) {
      return error.diagnostics[0].message;
    }
    return error instanceof Error ? error.message : String(error);
  }
  return "accepted";
}

const Invoice = ph.object("Invoice", {
  fields: {
    id: ph.OID({ required: true }),
    total: ph.Int({ required: true }),
  },
});

type ShopContext = Context & { readonly shopId: string };

async function execute(subgraph: BaseSubgraph, source: string) {
  const protocol = protocolOf(subgraph.constructor);
  const { typeDefs } = protocol.describe();
  const { resolvers } = protocol.bind(subgraph);
  const schema = buildSubgraphSchema([
    {
      typeDefs: typeDefs as GraphQL.DocumentNode,
      resolvers: resolvers as never,
    },
  ]);
  return graphql({
    schema,
    source,
    contextValue: { headers: {}, db: {}, shopId: "shop-1" },
  });
}

let warnings: string[];

beforeEach(() => {
  warnings = [];
  vi.spyOn(console, "warn").mockImplementation((message: unknown) => {
    warnings.push(String(message));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a typed subgraph class", () => {
  class InvoicesSubgraph extends BaseSubgraph<ShopContext> {
    static override readonly subgraphName = "invoices";

    static override getSchema(schema: SchemaBuilder<InvoicesSubgraph>) {
      return [
        schema.query("invoice", {
          args: { id: ph.OID({ required: true }) },
          returns: ph.ref(Invoice),
          resolve: ({ args, subgraph, request }) => ({
            id: `${request.shopId}/${args.id}`,
            total: subgraph.totalFor(args.id),
          }),
        }),
      ];
    }

    readonly totals = new Map([["i1", 40]]);
    #surcharge = 0;

    override async onSetup(): Promise<void> {
      await super.onSetup();
      this.#surcharge = 2;
    }

    totalFor(id: string): number {
      return (this.totals.get(id) ?? 0) + this.#surcharge;
    }
  }

  it("describes its name, definition, and authored document as plain data", () => {
    const description = describeClass(InvoicesSubgraph);

    expect(description.subgraphName).toBe("invoices");
    expect(description.definition.schemaKind).toBe("typed");
    expect(description.hasSubscriptions).toBe(false);
    expect(description.diagnostics).toEqual([]);
    expect(description.scalarDefinitions).toEqual([]);
    expect(print(description.typeDefs as GraphQL.DocumentNode)).toBe(
      [
        "scalar OID",
        "",
        "type Invoice {",
        "  id: OID!",
        "  total: Int!",
        "}",
        "",
        "type Query {",
        "  invoice(id: OID!): Invoice",
        "}",
      ].join("\n"),
    );
    expect(JSON.parse(JSON.stringify(description))).toEqual(description);
  });

  it("serves resolvers bound after onSetup, reading public fields and #private members", async () => {
    const subgraph = new InvoicesSubgraph(args());
    await subgraph.onSetup();

    const result = await execute(
      subgraph,
      '{ invoice(id: "i1") { id total } }',
    );

    expect(result).toEqual({
      data: { invoice: { id: "shop-1/i1", total: 42 } },
    });
  });

  it("mirrors its static name on the instance", () => {
    expect(new InvoicesSubgraph(args()).subgraphName).toBe("invoices");
  });

  it("is read through Symbol.for, so a host with another copy of the package finds it", () => {
    const protocol = protocolOf(InvoicesSubgraph);

    expect(SUBGRAPH_PROTOCOL).toBe(Symbol.for("powerhouse.subgraph"));
    expect(protocol.version).toBe(1);
    expect(SUBGRAPH_PROTOCOL_VERSION).toBe(1);
  });

  it("refuses to bind something that is not its instance", () => {
    expect(refusal(() => protocolOf(InvoicesSubgraph).bind({}))).toBe(
      "bind() takes an instance of InvoicesSubgraph.",
    );
  });
});

describe("describe()", () => {
  it("never constructs the class, calls a hook, or calls an SDL resolver factory", () => {
    const calls: string[] = [];
    class Guarded extends BaseSubgraph {
      static override readonly subgraphName = "guarded";

      static override getSchema(schema: SchemaBuilder<Guarded>) {
        return schema.graphql({
          typeDefs: gql`
            type Query {
              ping: String
            }
          `,
          resolverCoordinates: [
            { typeName: "Query", fieldName: "ping", resolverKind: "field" },
          ],
          resolvers: () => {
            calls.push("resolvers");
            return { Query: { ping: () => "pong" } };
          },
        });
      }

      constructor(subgraphArgs: SubgraphArgs) {
        calls.push("constructor");
        super(subgraphArgs);
      }

      override async onSetup(): Promise<void> {
        calls.push("onSetup");
        await super.onSetup();
      }

      override async onDisconnect(): Promise<void> {
        calls.push("onDisconnect");
        await super.onDisconnect();
      }
    }

    const description = describeClass(Guarded);

    expect(description.subgraphName).toBe("guarded");
    expect(calls).toEqual([]);
  });

  it("is frozen throughout, so no reader changes the schema a later reader or the host sees", async () => {
    const coordinate = {
      typeName: "Query",
      fieldName: "ping",
      resolverKind: "field",
    } as const;
    class Immutable extends BaseSubgraph {
      static override readonly subgraphName = "immutable";

      static override getSchema(schema: SchemaBuilder<Immutable>) {
        return schema.graphql({
          typeDefs: parse("type Query { ping: String }"),
          resolverCoordinates: [coordinate],
          resolvers: () => ({ Query: { ping: () => "pong" } }),
        });
      }
    }
    const Sku = defineScalar({
      name: "Sku",
      description: "A stock-keeping unit.",
      representation: "string",
      validator: z.string().regex(/^SKU-\d+$/),
      zodSource: "z.string().regex(/^SKU-\\d+$/)",
    });
    class TypedImmutable extends BaseSubgraph {
      static override readonly subgraphName = "typed-immutable";

      static override getSchema(schema: SchemaBuilder<TypedImmutable>) {
        return [
          schema.query("sku", { returns: Sku(), resolve: () => "SKU-1" }),
          schema.query("a", { returns: ph.String(), resolve: () => "1" }),
          schema.query("b", {
            fieldName: "a",
            returns: ph.String(),
            resolve: () => "2",
          }),
        ];
      }
    }
    const sdl = describeClass(Immutable);
    const typed = describeClass(TypedImmutable);
    const field = (
      sdl.typeDefs.definitions[0] as GraphQL.ObjectTypeDefinitionNode
    ).fields![0];
    if (
      sdl.definition.schemaKind !== "graphql-ast-compat" ||
      typed.definition.schemaKind !== "typed"
    ) {
      throw new Error("expected an SDL and a typed definition");
    }
    const { resolverCoordinates } = sdl.definition;
    const { types } = typed.definition;

    const attempts = [
      () => Object.assign(field.name, { value: "changed" }),
      () => (sdl.typeDefs.definitions as unknown[]).push(field),
      () =>
        (resolverCoordinates as unknown[]).push({
          ...coordinate,
          fieldName: "fake",
        }),
      () => (types as unknown[]).pop(),
      () => (typed.diagnostics as unknown[]).pop(),
      () => Object.assign(typed.diagnostics[0], { message: "changed" }),
      () => (typed.scalarDefinitions as unknown[]).pop(),
      () => Object.assign(typed.scalarDefinitions[0], { name: "Changed" }),
    ];
    for (const attempt of attempts) expect(attempt).toThrow(TypeError);

    expect(
      print(describeClass(Immutable).typeDefs as GraphQL.DocumentNode),
    ).toBe("type Query {\n  ping: String\n}");
    expect(describeClass(Immutable).definition).toEqual(sdl.definition);
    expect(resolverCoordinates).toEqual([coordinate]);
    expect(describeClass(TypedImmutable)).toEqual(typed);
    expect(typed.diagnostics.map(({ message }) => message)).toEqual([
      expect.stringContaining("Query.a is declared twice"),
    ]);
    expect(typed.scalarDefinitions.map(({ name }) => name)).toEqual(["Sku"]);
    expect(await execute(new Immutable(args()), "{ ping }")).toEqual({
      data: { ping: "pong" },
    });
  });
});

describe("an SDL subgraph class", () => {
  class LegacySchemaSubgraph extends BaseSubgraph {
    static override readonly subgraphName = "legacy-schema";

    static override getSchema(schema: SchemaBuilder<LegacySchemaSubgraph>) {
      return schema.graphql({
        typeDefs: gql`
          """
          The root.
          """
          type Query {
            greeting(name: String!): String!
          }
        `,
        resolverCoordinates: [
          { typeName: "Query", fieldName: "greeting", resolverKind: "field" },
        ],
        resolvers: (subgraph) => ({
          Query: {
            greeting: (_parent: unknown, { name }: { name: string }) =>
              `${subgraph.salutation}, ${name}`,
          },
        }),
      });
    }

    readonly salutation = "Hello";
  }

  it("serves its document as written, with the declared coordinates", () => {
    const { definition, typeDefs } = describeClass(LegacySchemaSubgraph);

    expect(print(typeDefs as GraphQL.DocumentNode)).toBe(
      '"""The root."""\ntype Query {\n  greeting(name: String!): String!\n}',
    );
    expect(definition.schemaKind).toBe("graphql-ast-compat");
    expect(
      definition.schemaKind === "graphql-ast-compat" &&
        definition.resolverCoordinates,
    ).toEqual([
      { typeName: "Query", fieldName: "greeting", resolverKind: "field" },
    ]);
  });

  it("calls the resolver factory with the instance when it binds", async () => {
    const result = await execute(
      new LegacySchemaSubgraph(args()),
      '{ greeting(name: "Ada") }',
    );

    expect(result).toEqual({ data: { greeting: "Hello, Ada" } });
  });

  it("warns once when the resolver map drifts from the declared coordinates", () => {
    class Drifted extends BaseSubgraph {
      static override readonly subgraphName = "drifted";

      static override getSchema(schema: SchemaBuilder<Drifted>) {
        return schema.graphql({
          typeDefs: parse("type Query { a: Int b: Int }"),
          resolverCoordinates: [
            { typeName: "Query", fieldName: "a", resolverKind: "field" },
          ],
          resolvers: () => ({ Query: { a: () => 1, b: () => 2 } }),
        });
      }
    }
    const protocol = protocolOf(Drifted);

    protocol.bind(new Drifted(args()));
    protocol.bind(new Drifted(args()));

    expect(
      warnings.filter((warning) =>
        warning.includes(
          "The resolver map binds Query.b:field, which the declaration does not list.",
        ),
      ),
    ).toHaveLength(1);
  });

  it.each([
    {
      shape: "a type named Subscription without a schema definition",
      sdl: "type Query { a: Int } type Subscription { changed: Int }",
      expected: true,
    },
    {
      shape: "a schema definition that maps subscription to another type",
      sdl: "schema { query: Query subscription: Events } type Query { a: Int } type Events { changed: Int }",
      expected: true,
    },
    {
      shape:
        "a schema definition without subscription and a type named Subscription",
      sdl: "schema { query: Query } type Query { a: Int } type Subscription { changed: Int }",
      expected: false,
    },
    {
      shape: "an extended Subscription type",
      sdl: "type Query { a: Int } extend type Subscription { changed: Int }",
      expected: true,
    },
    {
      shape: "no subscription root",
      sdl: "type Query { a: Int }",
      expected: false,
    },
  ])(
    "derives hasSubscriptions from the operation roots: $shape",
    ({ sdl, expected }) => {
      class Probe extends BaseSubgraph {
        static override readonly subgraphName = "probe";

        static override getSchema(schema: SchemaBuilder<Probe>) {
          return schema.graphql({
            typeDefs: parse(sdl),
            resolverCoordinates: [],
            resolvers: () => ({}),
          });
        }
      }

      expect(describeClass(Probe).hasSubscriptions).toBe(expected);
    },
  );

  it("hands the host each scalar type in its resolver map as a coercion", () => {
    const Upper = new GraphQLScalarType({
      name: "Upper",
      description: "Upper-cased text.",
      serialize: (value) => String(value).toUpperCase(),
      parseValue: (value) => String(value).toLowerCase(),
      parseLiteral: (node) =>
        node.kind === Kind.STRING ? node.value.toLowerCase() : null,
    });
    class Scalars extends BaseSubgraph {
      static override readonly subgraphName = "scalars";

      static override getSchema(schema: SchemaBuilder<Scalars>) {
        return schema.graphql({
          typeDefs: parse("scalar Upper type Query { a: Upper }"),
          resolverCoordinates: [
            { typeName: "Upper", fieldName: null, resolverKind: "scalar" },
            { typeName: "Query", fieldName: "a", resolverKind: "field" },
          ],
          resolvers: () => ({ Upper, Query: { a: () => "x" } }),
        });
      }
    }

    const [coercion] = protocolOf(Scalars).bind(
      new Scalars(args()),
    ).scalarCoercions;
    const rebuilt = scalarTypeFromCoercion(coercion);

    expect(rebuilt).not.toBe(Upper);
    expect([
      rebuilt.name,
      rebuilt.description,
      rebuilt.serialize("abc"),
      rebuilt.parseValue("ABC"),
      rebuilt.parseLiteral({ kind: Kind.STRING, value: "ABC" }),
    ]).toEqual(["Upper", "Upper-cased text.", "ABC", "abc", "abc"]);
  });

  it("serves an extended enum with the internal values its resolver map gives", async () => {
    class EnumExtension extends BaseSubgraph {
      static override readonly subgraphName = "enum-extension";

      static override getSchema(schema: SchemaBuilder<EnumExtension>) {
        return schema.graphql({
          typeDefs: parse(`
            enum Status { A B }
            extend enum Status { C }
            type Query { status: Status! }
          `),
          resolverCoordinates: [
            { typeName: "Query", fieldName: "status", resolverKind: "field" },
            { typeName: "Status", fieldName: null, resolverKind: "enum" },
          ],
          resolvers: () => ({
            Query: { status: () => 3 },
            Status: { A: 1, B: 2, C: 3 },
          }),
        });
      }
    }
    const served = servedSubgraph(new EnumExtension(args()));
    const schema = buildSubgraphSchema([
      { typeDefs: served.typeDefs, resolvers: served.resolvers as never },
    ]);

    expect(await graphql({ schema, source: "{ status }" })).toEqual({
      data: { status: "C" },
    });
    expect(warnings).toEqual([]);
  });

  it("serves the specifiedByURL and extensions of a scalar type in its resolver map", async () => {
    const Upper = new GraphQLScalarType({
      name: "Upper",
      specifiedByURL: "https://example.com/upper",
      extensions: { format: "upper-case" },
      serialize: (value) => String(value).toUpperCase(),
    });
    class Scalars extends BaseSubgraph {
      static override readonly subgraphName = "scalars";

      static override getSchema(schema: SchemaBuilder<Scalars>) {
        return schema.graphql({
          typeDefs: parse("scalar Upper type Query { word: Upper! }"),
          resolverCoordinates: [
            { typeName: "Upper", fieldName: null, resolverKind: "scalar" },
            { typeName: "Query", fieldName: "word", resolverKind: "field" },
          ],
          resolvers: () => ({ Upper, Query: { word: () => "hi" } }),
        });
      }
    }
    const served = servedSubgraph(new Scalars(args()));
    const schema = buildSubgraphSchema([
      { typeDefs: served.typeDefs, resolvers: served.resolvers as never },
    ]);

    expect(
      await graphql({
        schema,
        source: '{ word __type(name: "Upper") { specifiedByURL } }',
      }),
    ).toEqual({
      data: {
        word: "HI",
        __type: { specifiedByURL: "https://example.com/upper" },
      },
    });
    expect(schema.getType("Upper")?.extensions).toEqual({
      format: "upper-case",
    });
  });
});

describe("a typed package scalar", () => {
  it("is described as data and bound as a coercion the host rebuilds", () => {
    const Sku = defineScalar({
      name: "Sku",
      description: "A stock-keeping unit.",
      representation: "string",
      validator: z.string().regex(/^SKU-\d+$/),
      zodSource: "z.string().regex(/^SKU-\\d+$/)",
    });
    class Catalog extends BaseSubgraph {
      static override readonly subgraphName = "catalog";

      static override getSchema(schema: SchemaBuilder<Catalog>) {
        return [
          schema.query("sku", {
            args: { value: Sku({ required: true }) },
            returns: Sku(),
            resolve: ({ args }) => args.value,
          }),
        ];
      }
    }
    const protocol = protocolOf(Catalog);

    const [definition] = protocol.describe().scalarDefinitions;
    const [coercion] = protocol.bind(new Catalog(args())).scalarCoercions;
    const rebuilt = scalarTypeFromCoercion(coercion);

    expect([definition.name, definition.description]).toEqual([
      "Sku",
      "A stock-keeping unit.",
    ]);
    expect(rebuilt.parseValue("SKU-1")).toBe("SKU-1");
    expect(() => rebuilt.parseValue("nope")).toThrow(
      "Sku cannot represent this value",
    );
  });
});

describe("a scalar coercion error", () => {
  const copyRoot = mkdtempSync(join(tmpdir(), "ph-graphql-copy-"));
  const otherCopy = (() => {
    const require = createRequire(import.meta.url);
    cpSync(dirname(require.resolve("graphql/package.json")), copyRoot, {
      recursive: true,
    });
    return require(join(copyRoot, "index.js")) as typeof GraphQL;
  })();
  afterAll(() => rmSync(copyRoot, { recursive: true, force: true }));

  const Sku = defineScalar({
    name: "Sku",
    description: "A stock-keeping unit.",
    representation: "string",
    validator: z.string().regex(/^SKU-\d+$/),
    zodSource: "z.string().regex(/^SKU-\\d+$/)",
  });
  class Catalog extends BaseSubgraph {
    static override readonly subgraphName = "catalog";

    static override getSchema(schema: SchemaBuilder<Catalog>) {
      return [
        schema.query("sku", {
          args: { value: Sku({ required: true }) },
          returns: Sku(),
          resolve: ({ args }) => args.value,
        }),
      ];
    }
  }

  function throwingFrom(
    copy: typeof GraphQL,
    coercion: SubgraphScalarCoercion,
  ): SubgraphScalarCoercion {
    const rethrow =
      <A extends unknown[]>(coerce: (...input: A) => unknown) =>
      (...input: A) => {
        try {
          return coerce(...input);
        } catch (error) {
          throw new copy.GraphQLError((error as Error).message, {
            extensions: { code: "BAD_SKU" },
          });
        }
      };
    return {
      ...coercion,
      serialize: rethrow(coercion.serialize),
      parseValue: rethrow(coercion.parseValue),
      parseLiteral: rethrow(coercion.parseLiteral),
    };
  }

  async function responses(coercion: SubgraphScalarCoercion) {
    const scalar = scalarTypeFromCoercion(coercion);
    const schema = new GraphQLSchema({
      query: new GraphQLObjectType({
        name: "Query",
        fields: {
          sku: {
            type: scalar,
            args: { value: { type: scalar } },
            resolve: (_parent, { value }: { value: unknown }) => value,
          },
          stored: { type: scalar, resolve: () => "bad" },
        },
      }),
    });
    const operations: [string, Record<string, unknown>?][] = [
      ['{ sku(value: "SKU-1") }'],
      ["query ($v: Sku) { sku(value: $v) }", { v: "SKU-2" }],
      ['{ sku(value: "bad") }'],
      ["query ($v: Sku) { sku(value: $v) }", { v: "bad" }],
      ["{ stored }"],
    ];
    const results = [];
    for (const [source, variableValues] of operations) {
      results.push(
        JSON.parse(
          JSON.stringify(
            await executeOnHost({ schema, source, variableValues }),
          ),
        ) as unknown,
      );
    }
    return results;
  }

  const message =
    "Sku cannot represent this value: Invalid string: must match pattern /^SKU-\\d+$/";
  const expected = [
    { data: { sku: "SKU-1" } },
    { data: { sku: "SKU-2" } },
    { errors: [{ message, extensions: { code: "BAD_SKU" } }] },
    {
      errors: [
        {
          message: `Variable "$v" got invalid value "bad"; ${message}`,
          locations: [{ line: 1, column: 8 }],
          extensions: { code: "BAD_SKU" },
        },
      ],
    },
    {
      data: { stored: null },
      errors: [
        {
          message,
          locations: [{ line: 1, column: 3 }],
          path: ["stored"],
          extensions: { code: "BAD_SKU" },
        },
      ],
    },
  ];

  it("reaches the client the same whichever copy of graphql a package scalar throws from", async () => {
    expect(otherCopy.GraphQLError).not.toBe(GraphQLError);
    const [coercion] = protocolOf(Catalog).bind(
      new Catalog(args()),
    ).scalarCoercions;

    expect(await responses(throwingFrom(hostGraphQL, coercion))).toEqual(
      expected,
    );
    expect(await responses(throwingFrom(otherCopy, coercion))).toEqual(
      expected,
    );
  });

  it("keeps the original error of an input coercion error thrown from another copy of graphql", async () => {
    const cause = new Error("not a SKU");
    const refuse = () => {
      throw new otherCopy.GraphQLError("Sku refuses this value", {
        originalError: cause,
      });
    };
    const scalar = scalarTypeFromCoercion({
      name: "Sku",
      serialize: (value) => value,
      parseValue: refuse,
      parseLiteral: refuse,
    });
    const schema = new GraphQLSchema({
      query: new GraphQLObjectType({
        name: "Query",
        fields: {
          sku: {
            type: scalar,
            args: { value: { type: scalar } },
            resolve: (_parent, { value }: { value: unknown }) => value,
          },
        },
      }),
    });

    const literal = await executeOnHost({
      schema,
      source: '{ sku(value: "bad") }',
    });
    const variable = await executeOnHost({
      schema,
      source: "query ($v: Sku) { sku(value: $v) }",
      variableValues: { v: "bad" },
    });

    expect(
      literal.errors?.map((error) => [error.message, error.originalError]),
    ).toEqual([["Sku refuses this value", cause]]);
    expect(
      variable.errors?.map((error) => [
        error.message,
        (error.originalError as GraphQLError).originalError,
      ]),
    ).toEqual([
      ['Variable "$v" got invalid value "bad"; Sku refuses this value', cause],
    ]);
  });

  it("reaches the client the same whichever copy of graphql an SDL scalar is built with", async () => {
    const [packageCoercion] = protocolOf(Catalog).bind(
      new Catalog(args()),
    ).scalarCoercions;
    const sdlCoercion = (copy: typeof GraphQL) => {
      const thrown = throwingFrom(copy, packageCoercion);
      const Scalar = new copy.GraphQLScalarType({
        name: "Sku",
        serialize: thrown.serialize,
        parseValue: thrown.parseValue,
        parseLiteral: (node) => thrown.parseLiteral(node as ValueNode),
      });
      return resolverMapScalarCoercions({ Sku: Scalar })[0];
    };

    expect(await responses(sdlCoercion(hostGraphQL))).toEqual(expected);
    expect(await responses(sdlCoercion(otherCopy))).toEqual(expected);
  });
});

describe("the subgraph name", () => {
  function named(subgraphName: string) {
    return class Named extends BaseSubgraph {
      static override readonly subgraphName: string = subgraphName;

      static override getSchema(schema: SchemaBuilder<Named>) {
        return [
          schema.query("ping", { returns: ph.String(), resolve: () => "pong" }),
        ];
      }
    };
  }

  it.each(["invoices", "contacts-search", "r", "v2", "a1-b2-c3"])(
    "accepts %s",
    (name) => {
      expect(describeClass(named(name)).subgraphName).toBe(name);
    },
  );

  it.each(["Invoices", "foo--bar", "foo-", "-foo", "foo_bar", "café", ""])(
    "refuses %j without normalizing it",
    (name) => {
      expect(refusal(() => describeClass(named(name)))).toBe(
        "Named.subgraphName is not lowercase kebab-case. The name is the subgraph's route segment and is never normalized.",
      );
    },
  );

  it("refuses a class with no name of its own, naming the class", () => {
    class SharedBase extends BaseSubgraph {
      static override getSchema(schema: SchemaBuilder<SharedBase>) {
        return [
          schema.query("ping", { returns: ph.String(), resolve: () => "pong" }),
        ];
      }
    }
    const Parent = named("parent");
    class InheritsName extends Parent {}

    expect([
      refusal(() => describeClass(SharedBase)),
      refusal(() => describeClass(InheritsName)),
    ]).toEqual([
      "SharedBase has no static subgraphName. Shared bases belong outside subgraphs/ or must be extended by an exported subgraph. Old-style subgraphs (`name`/`typeDefs`/`resolvers`): run `ph migrate`.",
      "InheritsName has no static subgraphName. Shared bases belong outside subgraphs/ or must be extended by an exported subgraph. Old-style subgraphs (`name`/`typeDefs`/`resolvers`): run `ph migrate`.",
    ]);
  });

  it("is read before getSchema runs, so getSchema cannot rename the class", () => {
    class Renaming extends BaseSubgraph {
      static override subgraphName: string = "before";

      static override getSchema(schema: SchemaBuilder<Renaming>) {
        Renaming.subgraphName = "after";
        return [
          schema.query("ping", { returns: ph.String(), resolve: () => "pong" }),
        ];
      }
    }

    expect(describeClass(Renaming).subgraphName).toBe("before");
  });
});

describe("a schema", () => {
  it("is refused when it mixes typed entries and an SDL schema", () => {
    class SdlParent extends BaseSubgraph {
      static override getSchema(schema: SchemaBuilder<SdlParent>) {
        return schema.graphql({
          typeDefs: parse("type Query { a: Int }"),
          resolverCoordinates: [],
          resolvers: () => ({}),
        });
      }
    }
    // @ts-expect-error -- TS2417: typed entries cannot extend an SDL parent.
    class TypedChild extends SdlParent {
      static override readonly subgraphName = "typed-child";

      static override getSchema(schema: SchemaBuilder<TypedChild>) {
        return [
          // @ts-expect-error -- an SDL schema cannot be spread into entries.
          ...super.getSchema(schema),
          schema.query("b", { returns: ph.Int(), resolve: () => 1 }),
        ];
      }
    }

    expect(refusal(() => describeClass(TypedChild))).toBe(
      "TypedChild.getSchema returned typed entries and a schema.graphql(...) schema. A schema is one or the other.",
    );
  });

  it("is refused when it has no entries, as when getSchema is misspelled", () => {
    class Misspelled extends BaseSubgraph {
      static override readonly subgraphName = "misspelled";

      static getSchma(schema: SchemaBuilder<Misspelled>) {
        return [
          schema.query("ping", { returns: ph.String(), resolve: () => "pong" }),
        ];
      }
    }

    expect(refusal(() => describeClass(Misspelled))).toBe(
      "Misspelled.getSchema returned no entries.",
    );
  });

  it("is built with the concrete class as getSchema's receiver", () => {
    abstract class Namespaced extends BaseSubgraph {
      static override getSchema(schema: SchemaBuilder<Namespaced>) {
        const prefix = String(this.subgraphName).replaceAll("-", "_");
        return [
          schema.query(`${prefix}_status`, {
            returns: ph.String(),
            resolve: () => "ok",
          }),
        ];
      }
    }
    class Billing extends Namespaced {
      static override readonly subgraphName = "billing-api";
    }

    expect(print(describeClass(Billing).typeDefs as GraphQL.DocumentNode)).toBe(
      "type Query {\n  billing_api_status: String\n}",
    );
  });
});

describe("compilation", () => {
  it("runs getSchema once per evaluation and keeps the result for the class", () => {
    let evaluations = 0;
    class Counted extends BaseSubgraph {
      static override readonly subgraphName = "counted";

      static override getSchema(schema: SchemaBuilder<Counted>) {
        evaluations += 1;
        return [
          schema.query("ping", { returns: ph.String(), resolve: () => "pong" }),
        ];
      }
    }

    const first = describeClass(Counted);
    const evaluationsAfterFirst = evaluations;
    const second = describeClass(Counted);

    expect(second).toBe(first);
    expect([evaluationsAfterFirst, evaluations]).toEqual([2, 2]);
  });

  it("keeps a failure, so it is neither retried nor reported twice", () => {
    let evaluations = 0;
    class Broken extends BaseSubgraph {
      static override readonly subgraphName = "broken";

      static override getSchema(): never {
        evaluations += 1;
        throw new Error("schema unavailable");
      }
    }

    const errors = [0, 1].map(() => {
      try {
        describeClass(Broken);
      } catch (error) {
        return error;
      }
      return undefined;
    });

    expect(errors[0]).toBeInstanceOf(Error);
    expect(errors[1]).toBe(errors[0]);
    expect(evaluations).toBe(1);
  });

  it("refuses a getSchema that reads its own class's protocol", () => {
    class Reentrant extends BaseSubgraph {
      static override readonly subgraphName = "reentrant";

      static override getSchema(schema: SchemaBuilder<Reentrant>) {
        this[SUBGRAPH_PROTOCOL]().describe();
        return [
          schema.query("ping", { returns: ph.String(), resolve: () => "pong" }),
        ];
      }
    }

    expect(refusal(() => describeClass(Reentrant))).toBe(
      "Reentrant.getSchema re-entered its own compilation. getSchema must not read the subgraph protocol, describe() or bind().",
    );
  });

  it("refuses a getSchema whose result changes between calls", () => {
    let calls = 0;
    class Drifting extends BaseSubgraph {
      static override readonly subgraphName = "drifting";

      static override getSchema(schema: SchemaBuilder<Drifting>) {
        calls += 1;
        return [
          schema.query(`field${calls}`, {
            returns: ph.String(),
            resolve: () => "x",
          }),
        ];
      }
    }

    expect(refusal(() => describeClass(Drifting))).toBe(
      "Drifting.getSchema is not deterministic: two calls returned different schemas.",
    );
  });

  it("logs each diagnostic once, after the result is published", () => {
    class Orphan extends BaseSubgraph {
      static override readonly subgraphName = "orphan";

      static override getSchema(schema: SchemaBuilder<Orphan>) {
        return [
          schema.query("a", { returns: ph.String(), resolve: () => "1" }),
          schema.query("b", {
            fieldName: "a",
            returns: ph.String(),
            resolve: () => "2",
          }),
        ];
      }
    }

    const readsWhileLogging: unknown[] = [];
    vi.mocked(console.warn).mockImplementation((message: unknown) => {
      warnings.push(String(message));
      if (!String(message).includes("Query.a is declared twice")) return;
      try {
        readsWhileLogging.push(describeClass(Orphan));
      } catch (error) {
        readsWhileLogging.push(error);
      }
    });

    const description = describeClass(Orphan);
    describeClass(Orphan);

    expect(
      warnings.filter((warning) =>
        warning.includes("Query.a is declared twice"),
      ),
    ).toHaveLength(1);
    expect(readsWhileLogging).toHaveLength(1);
    expect(readsWhileLogging[0]).toBe(description);
  });
});

describe("a child that drops its parent's root fields", () => {
  abstract class Reports extends BaseSubgraph {
    static override getSchema(schema: SchemaBuilder<Reports>) {
      return [
        schema.query("report", { returns: ph.String(), resolve: () => "r" }),
      ];
    }
  }
  const extra = (schema: SchemaBuilder<Reports>) =>
    schema.query("extra", { returns: ph.String(), resolve: () => "e" });

  it("is warned about, naming the fields and the opt-out", () => {
    class Forgetful extends Reports {
      static override readonly subgraphName = "forgetful";

      static override getSchema(schema: SchemaBuilder<Forgetful>) {
        return [extra(schema)];
      }
    }

    describeClass(Forgetful);
    describeClass(Forgetful);

    expect(
      warnings.filter((warning) => warning.includes("Forgetful.getSchema")),
    ).toEqual([
      expect.stringContaining(
        "PH-SG-PARENT-FIELDS-DROPPED [warning/definition] <config> subgraph forgetful /getSchema: Forgetful.getSchema drops Query.report, which Reports.getSchema declares. Received: Query.report Repair: Spread super.getSchema(schema) into the result, or call schema.replaceParentSchema() if Forgetful replaces them on purpose.",
      ),
    ]);
  });

  it("is not warned about when it spreads super.getSchema or opts out", () => {
    class Extending extends Reports {
      static override readonly subgraphName = "extending";

      static override getSchema(schema: SchemaBuilder<Extending>) {
        return [...super.getSchema(schema), extra(schema)];
      }
    }
    class Replacing extends Reports {
      static override readonly subgraphName = "replacing";

      static override getSchema(schema: SchemaBuilder<Replacing>) {
        schema.replaceParentSchema();
        return [extra(schema)];
      }
    }
    class Inheriting extends Reports {
      static override readonly subgraphName = "inheriting";
    }

    const described = [Extending, Replacing, Inheriting].map(
      (subgraphClass) => {
        const { subgraphName, typeDefs } = describeClass(subgraphClass);
        return [subgraphName, print(typeDefs as GraphQL.DocumentNode)];
      },
    );

    expect(described).toEqual([
      ["extending", "type Query {\n  report: String\n  extra: String\n}"],
      ["replacing", "type Query {\n  extra: String\n}"],
      ["inheriting", "type Query {\n  report: String\n}"],
    ]);
    expect(warnings.filter((warning) => warning.includes(" drops "))).toEqual(
      [],
    );
  });
});

describe("a new-style class", () => {
  it("has none of the legacy authoring fields as own properties", () => {
    class Modern extends BaseSubgraph {
      static override readonly subgraphName = "modern";
    }
    const hostArgs: SubgraphArgs & { path: string } = {
      ...args(),
      path: "/base",
    };
    const instance = new Modern(hostArgs);

    expect(
      ["name", "typeDefs", "resolvers", "hasSubscriptions", "path"].filter(
        (field) => field in instance,
      ),
    ).toEqual([]);
  });
});
