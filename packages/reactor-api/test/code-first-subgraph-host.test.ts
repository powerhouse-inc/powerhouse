import { buildSubgraphSchema } from "@apollo/subgraph";
import type { ILogger } from "document-model";
import { ph } from "document-model";
import type * as GraphQL from "graphql";
import { gql } from "graphql-tag";
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BaseSubgraph } from "../src/graphql/base-subgraph.js";
import { defineSubgraph } from "../src/graphql/define-subgraph.js";
import type { GraphQLManager } from "../src/graphql/graphql-manager.js";
import type { SubgraphClass } from "../src/graphql/types.js";
import { buildSubgraphSchemaModule } from "../src/utils/create-schema.js";
import { initAndFlush, makeHarness } from "./utils/graphql-manager-harness.js";

/**
 * Runs `defineSubgraph` classes through the real GraphQL manager and asserts
 * the host treats them as it treats hand-written classes. Routes,
 * registration, replacement, core-name reservation, and composition must
 * match.
 */

// The schema comes from @apollo/subgraph, which loads graphql's CommonJS
// entry. Printing it needs the same copy, because graphql checks type
// identity with instanceof.
const { lexicographicSortSchema, printSchema } = createRequire(import.meta.url)(
  "graphql",
) as typeof GraphQL;

const Widget = ph.object("Widget", {
  fields: {
    id: ph.OID({ required: true }),
    label: ph.String({ required: true }),
  },
});

function codeFirst(name: string, label = "One"): SubgraphClass {
  return defineSubgraph({
    name,
    schemaKind: "typed",
    entries: (build) => [
      build.query("widget", {
        args: { id: ph.OID({ required: true }) },
        returns: ph.ref(Widget, { required: true }),
        resolve: ({ args }) => ({ id: String(args.id), label }),
      }),
    ],
  });
}

/** The same subgraph written by hand, which is the comparison throughout. */
function schemaFirst(name: string, label = "One"): SubgraphClass {
  return class extends BaseSubgraph {
    name = name;
    typeDefs = gql`
      type Widget {
        id: OID!
        label: String!
      }

      type Query {
        widget(id: OID!): Widget!
      }
    `;
    resolvers = {
      Query: {
        widget: (_parent: unknown, args: { id: string }) => ({
          id: args.id,
          label,
        }),
      },
    };
  } as unknown as SubgraphClass;
}

const captured: string[] = [];
const capturingLogger: ILogger = {
  level: "error" as const,
  verbose: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn((...args: unknown[]) => captured.push(`warn ${args.join(" ")}`)),
  error: vi.fn((...args: unknown[]) =>
    captured.push(`error ${args.map((a) => String(a)).join(" ")}`),
  ),
  errorHandler: vi.fn(),
  child: () => capturingLogger,
};

function harness() {
  return makeHarness({ logger: capturingLogger });
}

/** Registers a package subgraph, which is the path a loaded class takes. */
async function registerPackage(
  manager: GraphQLManager,
  subgraph: SubgraphClass,
): Promise<void> {
  const registration = manager.registerSubgraph(subgraph);
  await vi.runAllTimersAsync();
  await registration;
  // `registerSubgraph` inserts the instance; the caller refreshes the router,
  // which is what mounts the individual route. `server.ts` does this after a
  // package's classes are registered.
  const refresh = manager.updateRouter();
  await vi.runAllTimersAsync();
  await refresh;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("registration", () => {
  it("mounts the same route as a hand-written class", async () => {
    const fromCode = harness();
    await initAndFlush(fromCode.manager);
    await registerPackage(fromCode.manager, codeFirst("widgets"));

    const fromSdl = harness();
    await initAndFlush(fromSdl.manager);
    await registerPackage(fromSdl.manager, schemaFirst("widgets"));

    expect([...fromCode.mounts.keys()].sort()).toEqual(
      [...fromSdl.mounts.keys()].sort(),
    );
    expect(captured.join("\n")).toBe("");
    // A package subgraph registers under the default supergraph, so the host
    // mounts it at `/widgets`.
    expect([...fromCode.mounts.keys()]).toContain("/widgets");
  });

  it("awaits onSetup before the instance is registered", async () => {
    const order: string[] = [];
    let resolveSetup: () => void = () => undefined;
    const Subgraph = defineSubgraph({
      name: "slow",
      schemaKind: "typed",
      onSetup: () =>
        new Promise<void>((resolve) => {
          order.push("setup-started");
          resolveSetup = () => {
            order.push("setup-finished");
            resolve();
          };
        }),
      entries: (build) => [
        build.query("widget", {
          returns: ph.ref(Widget, { required: true }),
          resolve: () => ({ id: "w", label: "l" }),
        }),
      ],
    });

    const { manager } = harness();
    await initAndFlush(manager);
    const registration = manager.registerSubgraph(Subgraph);
    await vi.advanceTimersByTimeAsync(0);
    // The host inserts the instance only after onSetup resolves.
    expect(manager.getSubgraphByName("slow")).toBeUndefined();
    resolveSetup();
    await vi.runAllTimersAsync();
    await registration;
    expect(order).toEqual(["setup-started", "setup-finished"]);
    expect(manager.getSubgraphByName("slow")).toBeDefined();
  });

  it("replaces the instance when a second class registers under the same name", async () => {
    const { manager } = harness();
    await initAndFlush(manager);
    await registerPackage(manager, codeFirst("widgets", "first"));
    const first = manager.getSubgraphByName("widgets");
    expect(first).toBeDefined();

    await registerPackage(manager, codeFirst("widgets", "second"));
    const second = manager.getSubgraphByName("widgets");
    expect(second).not.toBe(first);
    const query = (
      second?.resolvers as Record<
        string,
        Record<string, (...args: unknown[]) => unknown>
      >
    ).Query;
    expect(query.widget(undefined, { id: "w" }, {}, {})).toEqual({
      id: "w",
      label: "second",
    });
  });

  it("calls onDisconnect on the replaced instance", async () => {
    const disconnected: unknown[] = [];
    const build = (label: string) =>
      defineSubgraph({
        name: "widgets",
        schemaKind: "typed",
        onDisconnect: ({ subgraph }) => {
          disconnected.push(subgraph);
        },
        entries: (builders) => [
          builders.query("widget", {
            returns: ph.ref(Widget, { required: true }),
            resolve: () => ({ id: "w", label }),
          }),
        ],
      });

    const { manager } = harness();
    await initAndFlush(manager);
    await registerPackage(manager, build("first"));
    const first = manager.getSubgraphByName("widgets");
    await registerPackage(manager, build("second"));
    expect(disconnected).toEqual([first]);
  });

  it("refuses a core name the same way for either approach", async () => {
    for (const make of [codeFirst, schemaFirst]) {
      const { manager } = harness();
      // init registers these as core subgraphs, which reserves the name.
      await initAndFlush(manager, [make("system")]);
      const core = manager.getSubgraphByName("system");
      expect(core).toBeDefined();
      await registerPackage(manager, make("system"));
      expect(manager.getSubgraphByName("system")).toBe(core);
    }
  });
});

describe("the augmented schema", () => {
  it("is the one the host builds for a hand-written class", async () => {
    const fromCode = harness();
    await initAndFlush(fromCode.manager);
    await registerPackage(fromCode.manager, codeFirst("widgets"));
    const fromSdl = harness();
    await initAndFlush(fromSdl.manager);
    await registerPackage(fromSdl.manager, schemaFirst("widgets"));

    const augmented = (manager: GraphQLManager) => {
      const instance = manager.getSubgraphByName("widgets")!;
      // buildSubgraphSchemaModule adds the platform types and scalar
      // declarations the author did not write.
      const schema = buildSubgraphSchema([
        buildSubgraphSchemaModule(
          [],
          instance.resolvers as never,
          instance.typeDefs,
        ),
      ]);
      // Compare the introspected schema, because the builder may not attach
      // AST nodes to every type.
      return printSchema(lexicographicSortSchema(schema));
    };
    expect(augmented(fromCode.manager)).toBe(augmented(fromSdl.manager));
    expect(augmented(fromCode.manager)).toContain(
      "type Widget {\n  id: OID!\n  label: String!\n}",
    );
  });

  it("resolves a query identically through either declaration", async () => {
    const results: unknown[] = [];
    for (const make of [codeFirst, schemaFirst]) {
      const { manager } = harness();
      await initAndFlush(manager);
      await registerPackage(manager, make("widgets"));
      const query = (
        manager.getSubgraphByName("widgets")?.resolvers as Record<
          string,
          Record<string, (...args: unknown[]) => unknown>
        >
      ).Query;
      results.push(await query.widget(undefined, { id: "w1" }, {}, {}));
    }
    expect(results[0]).toEqual(results[1]);
    expect(results[0]).toEqual({ id: "w1", label: "One" });
  });
});

describe("mixed registration", () => {
  it("composes a code-first and a schema-first subgraph together", async () => {
    const { manager, mounts } = harness();
    await initAndFlush(manager);
    await registerPackage(manager, codeFirst("alpha"));
    await registerPackage(manager, schemaFirst("beta"));
    expect([...mounts.keys()]).toEqual(
      expect.arrayContaining(["/alpha", "/beta"]),
    );
    expect(manager.getSubgraphByName("alpha")).toBeDefined();
    expect(manager.getSubgraphByName("beta")).toBeDefined();
  });
});
