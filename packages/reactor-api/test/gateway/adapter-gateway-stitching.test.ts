import { gql } from "graphql-tag";
import { type DocumentNode, Kind, type NamedTypeNode } from "graphql";
import type { Server } from "node:http";
import { createServer } from "node:http";
import type { ILogger } from "document-model";
import { ApolloServer } from "@apollo/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  filterBuildableSubgraphs,
  mergeSubgraphSchemas,
  mergeSubgraphTypeDefs,
  StitchingGatewayAdapter,
} from "../../src/graphql/gateway/adapter-gateway-stitching.js";
import { createApolloFetchHandler } from "../../src/graphql/gateway/adapter-gateway-apollo.js";
import type { SubgraphDefinition } from "../../src/graphql/gateway/types.js";
import type { Context } from "../../src/graphql/types.js";
// ─── helpers ────────────────────────────────────────────────────────────────

const noopCtx = () => Promise.resolve({ headers: {}, db: null } as Context);

/** A logger that records every line, for asserting conflict logging. */
function makeCapturingLogger() {
  const lines: string[] = [];
  const record = (level: string) => (message: string) => {
    lines.push(`${level}: ${message}`);
  };
  const logger: ILogger = {
    level: "debug",
    verbose: record("verbose"),
    debug: record("debug"),
    info: record("info"),
    warn: record("warn"),
    error: record("error"),
    errorHandler: () => {},
    child: () => logger,
  };
  return { lines, logger };
}

type ServedHttpServer = {
  server: Server;
  close: () => Promise<void>;
};

function makeHttpServer(): ServedHttpServer {
  const server = createServer();
  return {
    server,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

async function post(
  handler: (req: Request) => Promise<Response>,
  query: string,
) {
  const res = await handler(
    new Request("http://localhost/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query }),
    }),
  );
  const body = (await res.json()) as { data?: unknown; errors?: unknown[] };
  return { res, body };
}

/** The `Thing.label` field of a merged schema document, or undefined. */
function getThingLabelType(defs: DocumentNode): NamedTypeNode | undefined {
  const thing = defs.definitions.find(
    (d): d is Extract<typeof d, { kind: Kind.OBJECT_TYPE_DEFINITION }> =>
      d.kind === Kind.OBJECT_TYPE_DEFINITION && d.name.value === "Thing",
  );
  const field = thing?.fields?.find((f) => f.name.value === "label");
  if (field && field.type.kind === Kind.NAMED_TYPE) {
    return field.type;
  }
  return undefined;
}

/**
 * Two subgraphs that declare the SAME root field with incompatible types and
 * different resolvers. Which resolver runs is what the conflict policy has to
 * decide - the merged field type alone does not pin it down.
 */
function clashingResolverPair(): SubgraphDefinition[] {
  return [
    {
      name: "a",
      typeDefs: gql`
        type Query {
          thing: String
        }
      `,
      url: "http://a",
      resolvers: { Query: { thing: () => "FROM-SUBGRAPH-A" } },
    },
    {
      name: "b",
      typeDefs: gql`
        type Query {
          thing: Int
        }
      `,
      url: "http://b",
      resolvers: { Query: { thing: () => 4242 } },
    },
  ];
}

// ─── mergeSubgraphTypeDefs (pure) ───────────────────────────────────────────

describe("mergeSubgraphTypeDefs", () => {
  it("merges two subgraphs without conflicts", () => {
    const subgraphs: SubgraphDefinition[] = [
      {
        name: "a",
        typeDefs: gql`
          type Query {
            a: String
          }
        `,
        url: "http://a",
      },
      {
        name: "b",
        typeDefs: gql`
          type Query {
            b: Int
          }
        `,
        url: "http://b",
      },
    ];
    const { typeDefs, conflicts } = mergeSubgraphTypeDefs(subgraphs, "last");
    expect(conflicts).toEqual([]);
    const names = new Set<string>();
    for (const def of typeDefs.definitions) {
      if (def.kind === Kind.OBJECT_TYPE_DEFINITION) {
        for (const f of def.fields ?? []) names.add(f.name.value);
      }
    }
    expect(names).toContain("a");
    expect(names).toContain("b");
  });

  it("resolves a field type clash per policy without dropping the subgraph", () => {
    const subgraphs: SubgraphDefinition[] = [
      {
        name: "first",
        typeDefs: gql`
          type Query {
            thing: Thing
          }
          type Thing {
            label: String
          }
        `,
        url: "http://first",
      },
      {
        name: "second",
        typeDefs: gql`
          type Query {
            other: String
          }
          type Thing {
            label: Int
          }
        `,
        url: "http://second",
      },
    ];

    const first = mergeSubgraphTypeDefs(subgraphs, "first");
    expect(first.conflicts).toHaveLength(1);
    expect(first.conflicts[0]).toContain("Thing.label");
    expect(first.conflicts[0]).toContain("kept String (first subgraph)");
    expect(first.conflicts[0]).toContain("dropped Int");
    expect(getThingLabelType(first.typeDefs)?.name.value).toBe("String");

    const last = mergeSubgraphTypeDefs(subgraphs, "last");
    expect(last.conflicts).toHaveLength(1);
    expect(last.conflicts[0]).toContain("kept Int (last subgraph)");
    expect(last.conflicts[0]).toContain("dropped String");
    expect(getThingLabelType(last.typeDefs)?.name.value).toBe("Int");
  });

  it("reports a type-kind clash (same name, different AST kind)", () => {
    const subgraphs: SubgraphDefinition[] = [
      {
        name: "objects",
        typeDefs: gql`
          type Query {
            thing: Thing
          }
          type Thing {
            label: String
          }
        `,
        url: "http://objects",
      },
      {
        name: "enums",
        typeDefs: gql`
          type Query {
            other: String
          }
          enum Thing {
            A
            B
          }
        `,
        url: "http://enums",
      },
    ];
    const { conflicts } = mergeSubgraphTypeDefs(subgraphs, "last");
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toContain("type kind clash");
    expect(conflicts[0]).toContain("Thing");
    expect(conflicts[0]).toContain("type");
    expect(conflicts[0]).toContain("enum");
    expect(conflicts[0]).toContain("objects");
    expect(conflicts[0]).toContain("enums");
  });

  it("does not report an extension of a type another subgraph defines", () => {
    const subgraphs: SubgraphDefinition[] = [
      {
        name: "root",
        typeDefs: gql`
          type Query {
            a: String
          }
        `,
        url: "http://root",
      },
      {
        name: "extender",
        typeDefs: gql`
          extend type Query {
            b: String
          }
        `,
        url: "http://extender",
      },
    ];
    // `extend type Query` is OBJECT_TYPE_EXTENSION, `type Query` is
    // OBJECT_TYPE_DEFINITION: same kind for clash purposes.
    expect(mergeSubgraphTypeDefs(subgraphs, "last").conflicts).toEqual([]);
  });
});

// ─── mergeSubgraphSchemas (pure) ────────────────────────────────────────────

describe("mergeSubgraphSchemas", () => {
  it("executes queries that resolve through merged resolvers", async () => {
    const schema = mergeSubgraphSchemas(
      [
        {
          name: "a",
          typeDefs: gql`
            type Query {
              a: String
            }
          `,
          url: "http://a",
          resolvers: { Query: { a: () => "from-a" } },
        },
        {
          name: "b",
          typeDefs: gql`
            type Query {
              b: String
            }
          `,
          url: "http://b",
          resolvers: { Query: { b: () => "from-b" } },
        },
      ],
      "last",
    );
    // Execute through an ApolloServer, the same runtime the adapter uses -
    // this also avoids cross-instance schema validation in the test env.
    const server = new ApolloServer<Context>({
      schema,
      stopOnTerminationSignals: false,
    });
    await server.start();
    const handler = createApolloFetchHandler(server, noopCtx);
    const { res, body } = await post(handler, "{ a b }");
    expect(res.status).toBe(200);
    expect(body.data).toEqual({ a: "from-a", b: "from-b" });
    await server.stop();
  });

  it("runs the winning subgraph's resolver under each conflict policy", async () => {
    const run = async (policy: "first" | "last") => {
      const schema = mergeSubgraphSchemas(clashingResolverPair(), policy);
      const server = new ApolloServer<Context>({
        schema,
        stopOnTerminationSignals: false,
      });
      await server.start();
      const handler = createApolloFetchHandler(server, noopCtx);
      const { body } = await post(handler, "{ thing }");
      await server.stop();
      return body;
    };

    // "first": schema advertises subgraph A's String, so A's resolver must run.
    expect((await run("first")).data).toEqual({ thing: "FROM-SUBGRAPH-A" });
    // "last": schema advertises subgraph B's Int, so B's resolver must run.
    expect((await run("last")).data).toEqual({ thing: 4242 });
  });

  it("throws for zero subgraphs", () => {
    expect(() => mergeSubgraphSchemas([], "last")).toThrow(
      "Cannot merge zero subgraphs",
    );
  });
});

// ─── filterBuildableSubgraphs (pure) ───────────────────────────────────────

describe("filterBuildableSubgraphs", () => {
  it("keeps a lone subgraph that declares every root type itself", () => {
    // Nothing is left to stub for this subgraph - the isolation build must
    // still run (the `reactor` subgraph declares all three root types).
    const subgraphs: SubgraphDefinition[] = [
      {
        name: "everything",
        typeDefs: gql`
          type Query {
            a: String
          }
          type Mutation {
            b: String
          }
          type Subscription {
            c: String
          }
        `,
        url: "http://everything",
      },
    ];
    expect(filterBuildableSubgraphs(subgraphs).map((s) => s.name)).toEqual([
      "everything",
    ]);
  });
});

// ─── StitchingGatewayAdapter ────────────────────────────────────────────────

describe("StitchingGatewayAdapter", () => {
  let adapter: StitchingGatewayAdapter;
  let httpServer: ServedHttpServer;

  beforeEach(async () => {
    const { logger } = makeCapturingLogger();
    adapter = new StitchingGatewayAdapter(logger);
    httpServer = makeHttpServer();
    await adapter.start(httpServer.server);
  });
  afterEach(async () => {
    await httpServer.close();
    await adapter.stop();
  });

  it("start() then stop() with no handlers resolves; stop() is idempotent", async () => {
    await expect(adapter.stop()).resolves.toBeUndefined();
    await expect(adapter.stop()).resolves.toBeUndefined();
  });

  it("createHandler serves a subgraph schema via a callable FetchHandler", async () => {
    const { logger } = makeCapturingLogger();
    const sub = new StitchingGatewayAdapter(logger);
    const schema = mergeSubgraphSchemas(
      [
        {
          name: "solo",
          typeDefs: gql`
            type Query {
              hello: String
            }
          `,
          url: "http://solo",
          resolvers: { Query: { hello: () => "world" } },
        },
      ],
      "last",
    );
    const handler = await sub.createHandler(schema, noopCtx);
    const { res, body } = await post(handler, "{ hello }");
    expect(res.status).toBe(200);
    expect(body.data).toEqual({ hello: "world" });
    await sub.stop();
  });

  it("supergraph merges two in-process subgraphs; fields from both are queryable", async () => {
    const defs: SubgraphDefinition[] = [
      {
        name: "alpha",
        typeDefs: gql`
          type Query {
            alpha: String
          }
        `,
        url: "http://unused",
        resolvers: { Query: { alpha: () => "alpha-value" } },
      },
      {
        name: "beta",
        typeDefs: gql`
          type Query {
            beta: Int
          }
        `,
        url: "http://unused",
        resolvers: { Query: { beta: () => 42 } },
      },
    ];
    const handler = await adapter.createSupergraphHandler(
      () => defs,
      httpServer.server,
      noopCtx,
    );
    const { res, body } = await post(handler, "{ alpha beta }");
    expect(res.status).toBe(200);
    expect(body.data).toEqual({ alpha: "alpha-value", beta: 42 });
  });

  it("supergraph is still built when two subgraphs clash on a field type; default policy keeps the last", async () => {
    const { lines, logger } = makeCapturingLogger();
    const clashing = new StitchingGatewayAdapter(logger);
    const defs: SubgraphDefinition[] = [
      {
        name: "one",
        typeDefs: gql`
          type Query {
            keepMe: String
          }
          type Thing {
            label: String
          }
        `,
        url: "http://unused",
        resolvers: {
          Query: { keepMe: () => "one" },
          Thing: { label: (t: { label: string }) => t.label },
        },
      },
      {
        name: "two",
        typeDefs: gql`
          type Query {
            other: String
          }
          type Thing {
            label: Int
          }
        `,
        url: "http://unused",
        resolvers: {
          Query: { other: () => "two" },
          Thing: { label: (t: { label: number }) => t.label * 100 },
        },
      },
    ];

    const handler = await clashing.createSupergraphHandler(
      () => defs,
      httpServer.server,
      noopCtx,
    );

    // The clash is logged, not fatal.
    expect(lines.some((l) => l.includes("field type clash"))).toBe(true);

    // Both subgraph root fields survived the merge (neither dropped). With
    // federation neither would have: a cross-subgraph type conflict is not
    // caught by filterComposableSubgraphs (each subgraph builds fine on its
    // own) - LocalCompose.initialize() throws on it and the whole supergraph
    // build fails.
    const { res, body } = await post(handler, "{ other }");
    expect(res.status).toBe(200);
    expect(body.data).toEqual({ other: "two" });
    const { body: body2 } = await post(handler, "{ keepMe }");
    expect(body2.data).toEqual({ keepMe: "one" });
    await clashing.stop();
  });

  it("policy first keeps the earlier subgraph's conflicting definition", async () => {
    const { logger } = makeCapturingLogger();
    const firstWins = new StitchingGatewayAdapter(logger, {
      onFieldTypeConflict: "first",
    });
    const defs: SubgraphDefinition[] = [
      {
        name: "one",
        typeDefs: gql`
          type Query {
            q1: String
          }
          type Thing {
            label: String
          }
        `,
        url: "http://unused",
        resolvers: {
          Query: { q1: () => "one" },
          Thing: { label: (t: { label: string }) => `${t.label}!` },
        },
      },
      {
        name: "two",
        typeDefs: gql`
          type Query {
            q2: String
          }
          type Thing {
            label: Int
          }
        `,
        url: "http://unused",
        resolvers: {
          Query: { q2: () => "two" },
          Thing: { label: (t: { label: number }) => t.label * 100 },
        },
      },
    ];
    // The adapter builds the supergraph without throwing under "first".
    await firstWins.createSupergraphHandler(
      () => defs,
      httpServer.server,
      noopCtx,
    );
    // The merged schema keeps the first subgraph's Thing.label (String).
    const { typeDefs, conflicts } = mergeSubgraphTypeDefs(defs, "first");
    expect(conflicts[0]).toContain("kept String (first subgraph)");
    expect(getThingLabelType(typeDefs)?.name.value).toBe("String");
    await firstWins.stop();
  });

  it("calling createSupergraphHandler() twice throws", async () => {
    const defs: SubgraphDefinition[] = [
      {
        name: "a",
        typeDefs: gql`
          type Query {
            a: String
          }
        `,
        url: "http://unused",
        resolvers: { Query: { a: () => "a" } },
      },
    ];
    await adapter.createSupergraphHandler(
      () => defs,
      httpServer.server,
      noopCtx,
    );
    await expect(
      adapter.createSupergraphHandler(() => defs, httpServer.server, noopCtx),
    ).rejects.toThrow();
  });

  it("updateSupergraph() rebuilds the supergraph with a changed subgraph set", async () => {
    let defs: SubgraphDefinition[] = [
      {
        name: "a",
        typeDefs: gql`
          type Query {
            a: String
          }
        `,
        url: "http://unused",
        resolvers: { Query: { a: () => "a-v1" } },
      },
    ];
    const handler = await adapter.createSupergraphHandler(
      () => defs,
      httpServer.server,
      noopCtx,
    );
    const { body: before } = await post(handler, "{ a }");
    expect(before.data).toEqual({ a: "a-v1" });

    // Swap in a new definition for the same field.
    defs = [
      {
        name: "a",
        typeDefs: gql`
          type Query {
            a: String
          }
        `,
        url: "http://unused",
        resolvers: { Query: { a: () => "a-v2" } },
      },
    ];
    await adapter.updateSupergraph();
    const { body: after } = await post(handler, "{ a }");
    expect(after.data).toEqual({ a: "a-v2" });
  });

  it("updateSupergraph() is a no-op before createSupergraphHandler()", async () => {
    await expect(adapter.updateSupergraph()).resolves.toBeUndefined();
  });

  it("the supergraph context factory receives the incoming Request", async () => {
    let capturedToken: string | null = null;
    const ctxFactory = (req: Request) => {
      capturedToken = req.headers.get("x-token") ?? null;
      return Promise.resolve({ headers: {}, db: null } as Context);
    };
    const defs: SubgraphDefinition[] = [
      {
        name: "a",
        typeDefs: gql`
          type Query {
            a: String
          }
        `,
        url: "http://unused",
        resolvers: { Query: { a: () => "a" } },
      },
    ];
    const handler = await adapter.createSupergraphHandler(
      () => defs,
      httpServer.server,
      ctxFactory,
    );
    const res = await handler(
      new Request("http://localhost/graphql", {
        method: "POST",
        headers: { "content-type": "application/json", "x-token": "tok" },
        body: JSON.stringify({ query: "{ a }" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(capturedToken).toBe("tok");
  });

  it("updateSupergraph() after stop() is a no-op and creates no new server", async () => {
    let calls = 0;
    const defs: SubgraphDefinition[] = [
      {
        name: "a",
        typeDefs: gql`
          type Query {
            a: String
          }
        `,
        url: "http://unused",
        resolvers: { Query: { a: () => "a" } },
      },
    ];
    const getSubgraphs = () => {
      calls += 1;
      return defs;
    };
    await adapter.createSupergraphHandler(
      getSubgraphs,
      httpServer.server,
      noopCtx,
    );
    expect(calls).toBe(1);

    await adapter.stop();

    // stop() must leave the adapter inert: no subgraph re-read, no new server.
    await expect(adapter.updateSupergraph()).resolves.toBeUndefined();
    expect(calls).toBe(1);
  });

  it("the supergraph runs the winning subgraph's resolver under policy first", async () => {
    const { logger } = makeCapturingLogger();
    const firstWins = new StitchingGatewayAdapter(logger, {
      onFieldTypeConflict: "first",
    });
    const handler = await firstWins.createSupergraphHandler(
      () => clashingResolverPair(),
      httpServer.server,
      noopCtx,
    );
    const { res, body } = await post(handler, "{ thing }");
    expect(res.status).toBe(200);
    expect(body.errors).toBeUndefined();
    expect(body.data).toEqual({ thing: "FROM-SUBGRAPH-A" });
    await firstWins.stop();
  });

  it("logs a type-kind clash instead of silently dropping a subgraph's type", async () => {
    const { lines, logger } = makeCapturingLogger();
    const clashing = new StitchingGatewayAdapter(logger);
    const defs: SubgraphDefinition[] = [
      {
        name: "objects",
        typeDefs: gql`
          type Query {
            keepMe: String
          }
          type Thing {
            label: String
          }
        `,
        url: "http://unused",
        resolvers: { Query: { keepMe: () => "one" } },
      },
      {
        name: "enums",
        typeDefs: gql`
          type Query {
            other: String
          }
          enum Thing {
            A
            B
          }
        `,
        url: "http://unused",
        resolvers: { Query: { other: () => "two" } },
      },
    ];
    const handler = await clashing.createSupergraphHandler(
      () => defs,
      httpServer.server,
      noopCtx,
    );
    expect(
      lines.some((l) => l.includes("type kind clash") && l.includes("Thing")),
    ).toBe(true);
    const { body } = await post(handler, "{ keepMe other }");
    expect(body.data).toEqual({ keepMe: "one", other: "two" });
    await clashing.stop();
  });

  it("logs resolver entries dropped for not being in the merged schema", async () => {
    const { lines, logger } = makeCapturingLogger();
    const noisy = new StitchingGatewayAdapter(logger);
    const defs: SubgraphDefinition[] = [
      {
        name: "a",
        typeDefs: gql`
          type Query {
            a: String
          }
        `,
        url: "http://unused",
        resolvers: {
          Query: { a: () => "a", ghostField: () => "nope" },
          GhostType: { x: () => "nope" },
        },
      },
    ];
    const handler = await noisy.createSupergraphHandler(
      () => defs,
      httpServer.server,
      noopCtx,
    );
    const { body } = await post(handler, "{ a }");
    expect(body.data).toEqual({ a: "a" });
    expect(lines.some((l) => l.includes("GhostType"))).toBe(true);
    expect(lines.some((l) => l.includes("ghostField"))).toBe(true);
    await noisy.stop();
  });

  it("excludes and logs a subgraph whose typeDefs cannot build; the rest still compose", async () => {
    const { lines, logger } = makeCapturingLogger();
    const mixed = new StitchingGatewayAdapter(logger);
    const defs: SubgraphDefinition[] = [
      {
        name: "good",
        typeDefs: gql`
          type Query {
            good: String
          }
        `,
        url: "http://unused",
        resolvers: { Query: { good: () => "ok" } },
      },
      {
        name: "bad",
        typeDefs: gql`
          type Query {
            bad: Undefined
          }
        `,
        url: "http://unused",
        resolvers: { Query: { bad: () => "never" } },
      },
    ];
    const handler = await mixed.createSupergraphHandler(
      () => defs,
      httpServer.server,
      noopCtx,
    );
    expect(
      lines.some(
        (l) => l.includes('subgraph "bad"') && l.includes("Undefined"),
      ),
    ).toBe(true);
    const { res, body } = await post(handler, "{ good }");
    expect(res.status).toBe(200);
    expect(body.data).toEqual({ good: "ok" });
    await mixed.stop();
  });

  it("keeps an extension-only subgraph, which cannot build in isolation", async () => {
    const { lines, logger } = makeCapturingLogger();
    const extended = new StitchingGatewayAdapter(logger);
    const defs: SubgraphDefinition[] = [
      {
        name: "root",
        typeDefs: gql`
          type Query {
            a: String
          }
        `,
        url: "http://unused",
        resolvers: { Query: { a: () => "a" } },
      },
      {
        // The real `analytics` subgraph is shaped exactly like this: it only
        // extends Query, so a naive isolation build would exclude it.
        name: "extender",
        typeDefs: gql`
          extend type Query {
            b: String
          }
        `,
        url: "http://unused",
        resolvers: { Query: { b: () => "b" } },
      },
    ];
    const handler = await extended.createSupergraphHandler(
      () => defs,
      httpServer.server,
      noopCtx,
    );
    expect(lines.some((l) => l.includes("Excluding subgraph"))).toBe(false);
    const { body } = await post(handler, "{ a b }");
    expect(body.data).toEqual({ a: "a", b: "b" });
    await extended.stop();
  });

  it("keeps a subgraph that references a type another subgraph defines", async () => {
    const { lines, logger } = makeCapturingLogger();
    const shared = new StitchingGatewayAdapter(logger);
    const defs: SubgraphDefinition[] = [
      {
        name: "borrower",
        typeDefs: gql`
          type Query {
            when: DateTime
          }
        `,
        url: "http://unused",
        resolvers: { Query: { when: () => "2020-01-01" } },
      },
      {
        // `analytics` borrows DateTime from auth/reactor/packages the same way.
        name: "owner",
        typeDefs: gql`
          scalar DateTime
          type Query {
            owned: String
          }
        `,
        url: "http://unused",
        resolvers: { Query: { owned: () => "owned" } },
      },
    ];
    const handler = await shared.createSupergraphHandler(
      () => defs,
      httpServer.server,
      noopCtx,
    );
    expect(lines.some((l) => l.includes("Excluding subgraph"))).toBe(false);
    const { body } = await post(handler, "{ when owned }");
    expect(body.data).toEqual({ when: "2020-01-01", owned: "owned" });
    await shared.stop();
  });
});
