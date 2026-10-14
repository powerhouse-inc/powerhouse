import type { SubgraphArgs } from "@powerhousedao/reactor-api";
import {
  canonicalJson,
  DocumentModelDefinitionError,
  ph,
} from "document-model";
import type { TypedSubgraphEntry } from "document-model/tooling";
import { parse, print } from "graphql";
import { describe, expect, it } from "vitest";
import { BaseSubgraph } from "../src/graphql/base-subgraph.js";
import {
  type DefineSubgraphConfig,
  defineSubgraph,
} from "../src/graphql/define-subgraph.js";

/**
 * `defineSubgraph` returns a class that the host treats like a hand-written
 * one. Loaders deal in classes, the manager constructs them with
 * `SubgraphArgs` and awaits `onSetup`, and resolvers see the instance the host
 * built.
 */

function args(): SubgraphArgs {
  return {
    reactorClient: { kind: "reactor-client" },
    relationalDb: {},
    analyticsStore: {},
    graphqlManager: {},
    syncManager: {},
    authorizationService: {},
  } as unknown as SubgraphArgs;
}

const Widget = ph.object("Widget", {
  fields: {
    id: ph.OID({ required: true }),
    label: ph.String({ required: true }),
  },
});

function typedSubgraph(seen: { subgraph?: unknown } = {}) {
  return defineSubgraph({
    name: "widgets",
    schemaKind: "typed",
    entries: (build) => [
      build.query("widget", {
        args: { id: ph.OID({ required: true }) },
        returns: ph.ref(Widget),
        resolve: (call) => {
          seen.subgraph = call.subgraph;
          return { id: "w1", label: "One" };
        },
      }),
      build.subscription("widgetChanged", {
        returns: ph.ref(Widget, { required: true }),
        subscribe: () => (async function* () {})(),
      }),
    ],
  });
}

describe("a generated class", () => {
  it("extends BaseSubgraph and is constructible from SubgraphArgs alone", () => {
    const Subgraph = typedSubgraph();
    const instance = new Subgraph(args());
    expect(instance).toBeInstanceOf(BaseSubgraph);
    expect(instance.name).toBe("widgets");
    expect(
      (instance as unknown as { reactorClient: { kind: string } }).reactorClient
        .kind,
    ).toBe("reactor-client");
  });

  it("serves the author AST as its typeDefs", () => {
    const instance = new (typedSubgraph())(args());
    expect(print(instance.typeDefs)).toContain("type Widget {");
    expect(print(instance.typeDefs)).toContain("widget(id: OID!): Widget");
  });

  it("hands resolvers the instance the host constructed", () => {
    const seen: { subgraph?: unknown } = {};
    const instance = new (typedSubgraph(seen))(args());
    const query = (
      instance.resolvers as Record<
        string,
        Record<string, (...args: unknown[]) => unknown>
      >
    ).Query;
    query.widget(undefined, { id: "w1" }, {}, {});
    expect(seen.subgraph).toBe(instance);
  });

  it("derives hasSubscriptions from a Subscription entry", () => {
    const instance = new (typedSubgraph())(args());
    expect(
      (instance as unknown as { hasSubscriptions?: boolean }).hasSubscriptions,
    ).toBe(true);
  });

  it("leaves hasSubscriptions alone when nothing subscribes", () => {
    const Subgraph = defineSubgraph({
      name: "quiet",
      schemaKind: "typed",
      entries: (build) => [
        build.query("widget", {
          returns: ph.ref(Widget),
          resolve: () => null,
        }),
      ],
    });
    const instance = new Subgraph(args());
    expect(
      (instance as unknown as { hasSubscriptions?: boolean }).hasSubscriptions,
    ).toBe(false);
  });

  it("carries a definition with no closure in it", () => {
    const { definition } = typedSubgraph();
    expect(definition.kind).toBe("powerhouse.subgraph");
    // canonicalJson throws on a function, so success shows the definition
    // holds only data.
    expect(() => canonicalJson(definition)).not.toThrow();
    expect(JSON.parse(JSON.stringify(definition))).toStrictEqual(definition);
  });

  it("reports equals on a subgraph field as an error", () => {
    const Subgraph = defineSubgraph({
      name: "codes",
      schemaKind: "typed",
      entries: (build) => [
        build.query("code", {
          args: { code: ph.String({ equals: "[A-Z]{3}" }) },
          returns: ph.String(),
          resolve: () => null,
        }),
      ],
    });
    expect(
      Subgraph.diagnostics.map(({ severity, code, path }) => ({
        severity,
        code,
        path,
      })),
    ).toStrictEqual([
      {
        severity: "error",
        code: "PH-DEF-FIELD-OPTION-UNSUPPORTED",
        path: ["entries", 0, "args", "code"],
      },
    ]);
  });
});

describe("lifecycle", () => {
  it("awaits onSetup and passes the real instance", async () => {
    const calls: unknown[] = [];
    const Subgraph = defineSubgraph({
      name: "widgets",
      schemaKind: "typed",
      onSetup: async ({ subgraph }) => {
        await Promise.resolve();
        calls.push(subgraph);
      },
      entries: (build) => [
        build.query("widget", {
          returns: ph.ref(Widget),
          resolve: () => null,
        }),
      ],
    });
    const instance = new Subgraph(args());
    await instance.onSetup();
    expect(calls).toEqual([instance]);
  });

  it("calls onDisconnect with the instance, before the base teardown", async () => {
    const order: string[] = [];
    const Subgraph = defineSubgraph({
      name: "widgets",
      schemaKind: "typed",
      onDisconnect: ({ subgraph }) => {
        order.push(subgraph === instance ? "author" : "other");
      },
      entries: (build) => [
        build.query("widget", {
          returns: ph.ref(Widget),
          resolve: () => null,
        }),
      ],
    });
    const instance = new Subgraph(args());
    await instance.onDisconnect();
    expect(order).toEqual(["author"]);
  });
});

describe("the compatibility kind", () => {
  const SOURCE = `type Query {
  node(id: ID!): Node
}

interface Node {
  id: ID!
}
`;

  function compatSubgraph(onResolvers: () => void = () => undefined) {
    return defineSubgraph({
      name: "compat",
      schemaKind: "graphql-ast-compat",
      compatibility: {
        kind: "graphql-ast-v1",
        typeDefs: parse(SOURCE),
        resolverCoordinates: [
          { typeName: "Query", fieldName: "node", resolverKind: "field" },
          { typeName: "Node", fieldName: null, resolverKind: "resolveType" },
        ],
        getResolvers: ({ subgraph }) => {
          // This factory reads a host dependency, so declaration and
          // inspection must never call it.
          void (subgraph as unknown as { reactorClient: unknown })
            .reactorClient;
          onResolvers();
          return {
            Query: { node: () => null },
            Node: { __resolveType: () => "Nothing" },
          };
        },
        hasSubscriptions: undefined,
        preserveDefinitionOrder: true,
      },
    });
  }

  it("calls the resolver factory once per construction, and never at declaration", () => {
    let calls = 0;
    const Subgraph = compatSubgraph(() => (calls += 1));
    expect(calls).toBe(0);
    expect(Subgraph.definition.kind).toBe("powerhouse.subgraph");
    expect(calls).toBe(0);

    new Subgraph(args());
    expect(calls).toBe(1);
    new Subgraph(args());
    expect(calls).toBe(2);
  });

  it("serves the declared schema after the author mutates the AST it passed", () => {
    const typeDefs = parse(SOURCE);
    const Subgraph = defineSubgraph({
      name: "compat",
      schemaKind: "graphql-ast-compat",
      compatibility: {
        kind: "graphql-ast-v1",
        typeDefs,
        resolverCoordinates: [],
        getResolvers: () => ({}),
        hasSubscriptions: undefined,
        preserveDefinitionOrder: true,
      },
    });

    const added = parse("type Extra { id: ID }").definitions[0];
    (typeDefs.definitions as unknown[]).push(added);
    const [query] = typeDefs.definitions as unknown as {
      fields: unknown[];
    }[];
    query.fields.push(
      (
        parse("type Query { injected: String }").definitions[0] as unknown as {
          fields: unknown[];
        }
      ).fields[0],
    );

    const first = new Subgraph(args());
    const second = new Subgraph(args());
    const declared = SOURCE.trimEnd();
    expect(print(first.typeDefs)).toBe(declared);
    expect(print(Subgraph.typeDefs)).toBe(declared);
    expect(second.typeDefs).toBe(first.typeDefs);
    expect(Subgraph.typeDefs).toBe(first.typeDefs);
  });

  it("records hasSubscriptions as null on the wire and leaves the flag unset", () => {
    const instance = new (compatSubgraph())(args());
    const { definition } = compatSubgraph();
    expect(
      definition.schemaKind === "graphql-ast-compat" &&
        definition.hasSubscriptions,
    ).toBeNull();
    expect(
      Object.prototype.hasOwnProperty.call(instance, "hasSubscriptions"),
    ).toBe(false);
  });
});

describe("a declared subgraph", () => {
  type Resolvers = Record<
    string,
    Record<string, (...args: unknown[]) => unknown>
  >;
  type Mutable<T> = { -readonly [K in keyof T]: T[K] };

  const resolversOf = (instance: { resolvers?: unknown }) =>
    instance.resolvers as Resolvers;

  it("keeps its name and resolvers when the author changes the config and clears the returned array", () => {
    const seen: { subgraph: unknown; request: unknown; info: unknown }[] = [];
    const returned: TypedSubgraphEntry[] = [];
    const config: Mutable<DefineSubgraphConfig> = {
      name: "widgets",
      schemaKind: "typed",
      entries: (build) => {
        returned.push(
          build.query("widget", {
            returns: ph.ref(Widget),
            resolve: ({ subgraph, request, info }) => {
              seen.push({ subgraph, request, info });
              return { id: "w1", label: "One" };
            },
          }),
        );
        return returned;
      },
    };
    const Subgraph = defineSubgraph(config);
    const first = new Subgraph(args());
    const firstRequest = { request: 1 };
    const firstInfo = { info: 1 };
    resolversOf(first).Query.widget(undefined, {}, firstRequest, firstInfo);

    returned.length = 0;
    config.name = "renamed";
    const second = new Subgraph(args());
    const secondRequest = { request: 2 };
    const secondInfo = { info: 2 };
    resolversOf(second).Query.widget(undefined, {}, secondRequest, secondInfo);

    expect(second.name).toBe("widgets");
    expect(Subgraph.definition.name).toBe("widgets");
    expect(Object.keys(resolversOf(second).Query)).toEqual(["widget"]);
    expect(print(second.typeDefs)).toContain("widget: Widget");
    expect(seen).toHaveLength(2);
    expect(seen[0].subgraph).toBe(first);
    expect(seen[0].request).toBe(firstRequest);
    expect(seen[0].info).toBe(firstInfo);
    expect(seen[1].subgraph).toBe(second);
    expect(seen[1].request).toBe(secondRequest);
    expect(seen[1].info).toBe(secondInfo);
  });

  it("serves the declared entry after the author swaps the array element", () => {
    const returned: TypedSubgraphEntry[] = [];
    let build!: Parameters<
      Extract<DefineSubgraphConfig, { schemaKind: "typed" }>["entries"]
    >[0];
    const Subgraph = defineSubgraph({
      name: "widgets",
      schemaKind: "typed",
      entries: (builders) => {
        build = builders;
        returned.push(
          builders.query("widget", {
            returns: ph.String(),
            resolve: () => "declared",
          }),
        );
        return returned;
      },
    });

    returned[0] = build.query("gadget", {
      returns: ph.String(),
      resolve: () => "swapped",
    });
    const instance = new Subgraph(args());

    expect(Object.keys(resolversOf(instance).Query)).toEqual(["widget"]);
    expect(resolversOf(instance).Query.widget(undefined, {}, {}, {})).toBe(
      "declared",
    );
  });

  it("keeps the declared resolver and arguments when the author mutates the objects passed to a builder", () => {
    const options: {
      args: Record<string, ReturnType<typeof ph.String>>;
      returns: ReturnType<typeof ph.String>;
      resolve: () => string;
    } = {
      args: { id: ph.String() },
      returns: ph.String(),
      resolve: () => "declared",
    };
    const Subgraph = defineSubgraph({
      name: "widgets",
      schemaKind: "typed",
      entries: (build) => [build.query("widget", options)],
    });

    options.resolve = () => "mutated";
    options.args.extra = ph.String();
    const instance = new Subgraph(args());

    expect(resolversOf(instance).Query.widget(undefined, {}, {}, {})).toBe(
      "declared",
    );
    expect(print(instance.typeDefs)).toContain("widget(id: String): String");
  });

  it("runs the declared lifecycle hooks after the author replaces them", async () => {
    const calls: string[] = [];
    const config: Mutable<DefineSubgraphConfig> = {
      name: "widgets",
      schemaKind: "typed",
      onSetup() {
        calls.push(this === config ? "declared setup" : "detached setup");
      },
      onDisconnect() {
        calls.push(
          this === config ? "declared disconnect" : "detached disconnect",
        );
      },
      entries: (build) => [
        build.query("widget", { returns: ph.String(), resolve: () => null }),
      ],
    };
    const Subgraph = defineSubgraph(config);

    config.onSetup = () => {
      calls.push("replaced setup");
    };
    config.onDisconnect = () => {
      calls.push("replaced disconnect");
    };
    const instance = new Subgraph(args());
    await instance.onSetup();
    await instance.onDisconnect();

    expect(calls).toEqual(["declared setup", "declared disconnect"]);
  });

  it("runs the hooks it was declared with when the entries callback replaces them", async () => {
    const calls: string[] = [];
    const config: Mutable<DefineSubgraphConfig> = {
      name: "widgets",
      schemaKind: "typed",
      onSetup: () => {
        calls.push("declared setup");
      },
      entries: (build) => {
        config.onSetup = () => {
          calls.push("replaced setup");
        };
        return [
          build.query("widget", { returns: ph.String(), resolve: () => null }),
        ];
      },
    };
    const instance = new (defineSubgraph(config))(args());
    await instance.onSetup();

    expect(calls).toEqual(["declared setup"]);
  });

  it("keeps a compatibility subgraph's name and resolver factory when the author changes the config", () => {
    const compatibility: Mutable<
      Extract<
        DefineSubgraphConfig,
        { schemaKind: "graphql-ast-compat" }
      >["compatibility"]
    > = {
      kind: "graphql-ast-v1",
      typeDefs: parse("type Query { ping: String }"),
      resolverCoordinates: [
        { typeName: "Query", fieldName: "ping", resolverKind: "field" },
      ],
      getResolvers() {
        return {
          Query: {
            ping: () => (this === compatibility ? "declared" : "detached"),
          },
        };
      },
      hasSubscriptions: undefined,
      preserveDefinitionOrder: true,
    };
    const config: Mutable<DefineSubgraphConfig> = {
      name: "compat",
      schemaKind: "graphql-ast-compat",
      compatibility,
    };
    const Subgraph = defineSubgraph(config);

    config.name = "renamed";
    compatibility.getResolvers = () => ({
      Query: { ping: () => "replaced" },
    });
    const instance = new Subgraph(args());

    expect(instance.name).toBe("compat");
    expect(resolversOf(instance).Query.ping(undefined, {}, {}, {})).toBe(
      "declared",
    );
  });
});

describe("a declaration the server could not run", () => {
  function refusal(declare: () => unknown) {
    try {
      declare();
    } catch (error) {
      if (!(error instanceof DocumentModelDefinitionError)) throw error;
      const [{ code, path, message }] = error.diagnostics;
      return { code, path, message };
    }
    return undefined;
  }

  function typed(overrides: Record<string, unknown>) {
    return () =>
      defineSubgraph({
        name: "widgets",
        schemaKind: "typed",
        entries: (build) => [
          build.query("widget", { returns: ph.String(), resolve: () => null }),
        ],
        ...overrides,
      } as DefineSubgraphConfig);
  }

  function compat(
    overrides: Record<string, unknown>,
    compatibility: Record<string, unknown> = {},
  ) {
    return () =>
      defineSubgraph({
        name: "compat",
        schemaKind: "graphql-ast-compat",
        compatibility: {
          kind: "graphql-ast-v1",
          typeDefs: parse("type Query { ping: String }"),
          resolverCoordinates: [
            { typeName: "Query", fieldName: "ping", resolverKind: "field" },
          ],
          getResolvers: () => ({ Query: { ping: () => "pong" } }),
          hasSubscriptions: undefined,
          preserveDefinitionOrder: true,
          ...compatibility,
        },
        ...overrides,
      } as DefineSubgraphConfig);
  }

  const noName = {
    code: "PH-SG-DEFINITION-INVALID",
    path: ["name"],
    message: "A subgraph needs a name.",
  };

  it("refuses a typed subgraph without a string name", () => {
    expect(refusal(typed({ name: undefined }))).toEqual(noName);
    expect(refusal(typed({ name: 7 }))).toEqual(noName);
    expect(refusal(typed({ name: "" }))).toEqual(noName);
  });

  it("refuses a compatibility subgraph without a string name", () => {
    expect(refusal(compat({ name: undefined }))).toEqual(noName);
    expect(refusal(compat({ name: 7 }))).toEqual(noName);
    expect(refusal(compat({ name: "" }))).toEqual(noName);
  });

  it("refuses a name that is not a single route segment", () => {
    const notASegment = {
      code: "PH-SG-DEFINITION-INVALID",
      path: ["name"],
      message:
        "A subgraph name is one route segment: letters, digits, hyphens, and underscores, starting with a letter or digit.",
    };
    for (const name of ["../r", "graphql/r", "a/b c", ".", "-widgets"]) {
      expect(refusal(typed({ name }))).toEqual(notASegment);
    }
    expect(refusal(compat({ name: "x/../../escape" }))).toEqual(notASegment);
    for (const name of [
      "contacts-search",
      "my_widgets",
      "1st",
      "café-ünïcode",
    ]) {
      expect(
        new (defineSubgraph({
          name,
          schemaKind: "typed",
          entries: (build) => [
            build.query("widget", {
              returns: ph.String(),
              resolve: () => null,
            }),
          ],
        }))(args()).name,
      ).toBe(name);
    }
  });

  it("refuses lifecycle hooks that are not functions", () => {
    expect(refusal(typed({ onSetup: 5 }))).toEqual({
      code: "PH-DEF-OPTION-INVALID",
      path: ["onSetup"],
      message: "onSetup is not a function.",
    });
    expect(refusal(compat({ onDisconnect: "close" }))).toEqual({
      code: "PH-DEF-OPTION-INVALID",
      path: ["onDisconnect"],
      message: "onDisconnect is not a function.",
    });
  });

  it("refuses a compatibility subgraph whose getResolvers is missing or not a function", () => {
    expect(refusal(compat({}, { getResolvers: undefined }))).toEqual({
      code: "PH-SG-ENTRY-INVALID",
      path: ["compatibility", "getResolvers"],
      message: "The compatibility declaration has no getResolvers.",
    });
    expect(refusal(compat({}, { getResolvers: {} }))).toEqual({
      code: "PH-SG-ENTRY-INVALID",
      path: ["compatibility", "getResolvers"],
      message:
        "The compatibility declaration's getResolvers is not a function.",
    });
  });

  it("refuses a schema kind it does not know", () => {
    const unknownKind = {
      code: "PH-SG-DEFINITION-INVALID",
      path: ["schemaKind"],
      message: 'schemaKind is "typed" or "graphql-ast-compat".',
    };
    expect(refusal(typed({ schemaKind: "type" }))).toEqual(unknownKind);
    expect(refusal(typed({ schemaKind: undefined }))).toEqual(unknownKind);
  });

  it("refuses a compatibility subgraph without a compatibility declaration", () => {
    const noDeclaration = {
      code: "PH-SG-DEFINITION-INVALID",
      path: ["compatibility"],
      message:
        "A graphql-ast-compat subgraph needs a compatibility declaration object.",
    };
    expect(refusal(compat({ compatibility: undefined }))).toEqual(
      noDeclaration,
    );
    expect(refusal(compat({ compatibility: null }))).toEqual(noDeclaration);
    expect(
      refusal(compat({ compatibility: "type Query { ping: String }" })),
    ).toEqual(noDeclaration);
  });

  it("serves a compatibility declaration whose members live on its prototype", () => {
    class Declaration {
      readonly kind = "graphql-ast-v1";
      readonly typeDefs = parse("type Query { ping: String }");
      readonly resolverCoordinates = [
        { typeName: "Query", fieldName: "ping", resolverKind: "field" },
      ];
      readonly hasSubscriptions = undefined;
      readonly preserveDefinitionOrder = true;
      readonly reply = "from the instance";
      getResolvers() {
        return { Query: { ping: () => this.reply } };
      }
    }
    const fromBase = Object.create(new Declaration(), {
      reply: { value: "from the derived object" },
    }) as Declaration;
    const ping = (compatibility: unknown) => {
      const instance = new (defineSubgraph({
        name: "compat",
        schemaKind: "graphql-ast-compat",
        compatibility,
      } as DefineSubgraphConfig))(args());
      const resolvers = instance.resolvers as Record<
        string,
        Record<string, () => unknown>
      >;
      return resolvers.Query.ping();
    };
    expect(ping(new Declaration())).toBe("from the instance");
    expect(ping(fromBase)).toBe("from the derived object");
  });

  it("refuses a compatibility kind it does not know", () => {
    expect(refusal(compat({}, { kind: "nope" }))).toEqual({
      code: "PH-SG-DEFINITION-INVALID",
      path: ["compatibility", "kind"],
      message: 'The compatibility declaration\'s kind is "graphql-ast-v1".',
    });
  });

  it("refuses typeDefs that are missing or not a parsed document", () => {
    const notADocument = {
      code: "PH-SG-DEFINITION-INVALID",
      path: ["compatibility", "typeDefs"],
      message:
        "The compatibility declaration's typeDefs is not a GraphQL document node.",
    };
    expect(refusal(compat({}, { typeDefs: undefined }))).toEqual(notADocument);
    expect(
      refusal(compat({}, { typeDefs: "type Query { ping: String }" })),
    ).toEqual(notADocument);
  });

  it("refuses resolver coordinates that are missing or hold something other than a coordinate", () => {
    expect(refusal(compat({}, { resolverCoordinates: undefined }))).toEqual({
      code: "PH-SG-ENTRY-INVALID",
      path: ["compatibility", "resolverCoordinates"],
      message: "Expected an array.",
    });
    expect(
      refusal(
        compat(
          {},
          {
            resolverCoordinates: [
              { typeName: "Query", fieldName: "ping", resolverKind: "field" },
              null,
            ],
          },
        ),
      ),
    ).toEqual({
      code: "PH-SG-ENTRY-INVALID",
      path: ["compatibility", "resolverCoordinates", 1],
      message:
        "A resolver coordinate is an object with typeName, fieldName, and resolverKind.",
    });
  });

  it("refuses a hasSubscriptions or preserveDefinitionOrder the declaration type does not allow", () => {
    expect(refusal(compat({}, { hasSubscriptions: "yes" }))).toEqual({
      code: "PH-SG-DEFINITION-INVALID",
      path: ["compatibility", "hasSubscriptions"],
      message: "hasSubscriptions is true, false, or undefined.",
    });
    expect(refusal(compat({}, { preserveDefinitionOrder: false }))).toEqual({
      code: "PH-SG-DEFINITION-INVALID",
      path: ["compatibility", "preserveDefinitionOrder"],
      message:
        "A compatibility subgraph serves its document in source order, so preserveDefinitionOrder is true.",
    });
  });

  it("refuses a typed subgraph without an entries callback", () => {
    const noEntries = {
      code: "PH-SG-DEFINITION-INVALID",
      path: ["entries"],
      message: "A typed subgraph declares its entries in an entries callback.",
    };
    expect(refusal(typed({ entries: undefined }))).toEqual(noEntries);
    expect(refusal(typed({ entries: [] }))).toEqual(noEntries);
  });

  it("refuses a declaration that is not an object", () => {
    const notAnObject = {
      code: "PH-SG-DEFINITION-INVALID",
      path: [],
      message: "A subgraph declaration is an object.",
    };
    expect(
      refusal(() => defineSubgraph(null as unknown as DefineSubgraphConfig)),
    ).toEqual(notAnObject);
    expect(
      refusal(() =>
        defineSubgraph("widgets" as unknown as DefineSubgraphConfig),
      ),
    ).toEqual(notAnObject);
  });

  it("refuses a field or argument name GraphQL would reject, before the host builds a schema", () => {
    const notAName = (path: readonly string[]) => ({
      code: "PH-DEF-NAME-INVALID",
      path,
      message:
        "A GraphQL name must match /^[_A-Za-z][_0-9A-Za-z]*$/ and must not start with two underscores.",
    });
    expect(
      refusal(() =>
        defineSubgraph({
          name: "widgets",
          schemaKind: "typed",
          entries: (build) => [
            build.query("my field", {
              returns: ph.String(),
              resolve: () => null,
            }),
          ],
        }),
      ),
    ).toEqual(notAName(["key"]));
    expect(
      refusal(() =>
        defineSubgraph({
          name: "widgets",
          schemaKind: "typed",
          entries: (build) => [
            build.query("widget", {
              args: { "bad name": ph.ID() },
              returns: ph.String(),
              resolve: () => null,
            }),
          ],
        }),
      ),
    ).toEqual(notAName(["options", "args", "bad name"]));
  });

  it("still declares a subgraph whose name, hooks, and factory are well formed", () => {
    expect(refusal(typed({ onSetup: () => undefined }))).toBeUndefined();
    expect(refusal(compat({}))).toBeUndefined();
    expect(typed({})().definition.name).toBe("widgets");
    expect(compat({})().definition.name).toBe("compat");
  });
});
