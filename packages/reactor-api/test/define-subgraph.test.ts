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

  it("still declares a subgraph whose name, hooks, and factory are well formed", () => {
    expect(refusal(typed({ onSetup: () => undefined }))).toBeUndefined();
    expect(refusal(compat({}))).toBeUndefined();
    expect(typed({})().definition.name).toBe("widgets");
    expect(compat({})().definition.name).toBe("compat");
  });
});
