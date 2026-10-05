import type { SubgraphArgs } from "@powerhousedao/reactor-api";
import { canonicalJson, ph } from "document-model";
import { parse, print } from "graphql";
import { describe, expect, it } from "vitest";
import { BaseSubgraph } from "../src/graphql/base-subgraph.js";
import { defineSubgraph } from "../src/graphql/define-subgraph.js";

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

  it("passes the original DocumentNode through, identity included", () => {
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
    expect(new Subgraph(args()).typeDefs).toBe(typeDefs);
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
