import {
  BaseSubgraph as CopyBBaseSubgraph,
  type SubgraphArgs,
} from "@powerhousedao/reactor-api";
import type { ScopedRouteHandle } from "@powerhousedao/shared/processors";
import { defineScalar, DocumentModelDefinitionError, ph } from "document-model";
import { readSubgraphEntries } from "document-model/tooling";
import type * as GraphQL from "graphql";
import { Kind, parse } from "graphql";
import { gql } from "graphql-tag";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
} from "vitest";
import { z } from "zod";
import { BaseSubgraph } from "../src/graphql/base-subgraph.js";
import type {
  FetchHandler,
  IGatewayAdapter,
} from "../src/graphql/gateway/types.js";
import type { GraphQLManager } from "../src/graphql/graphql-manager.js";
import { describeSubgraphClass } from "../src/graphql/hosted-subgraph.js";
import {
  SUBGRAPH_PROTOCOL,
  type SubgraphProtocol,
} from "../src/graphql/subgraph-protocol.js";
import type { SchemaBuilder } from "../src/graphql/subgraph-schema.js";
import type { Context, SubgraphClass } from "../src/graphql/types.js";
import { ImportPackageLoader } from "../src/packages/import-loader.js";
import { extractSubgraphs } from "../src/packages/subgraph-extraction.js";
import {
  initAndFlush,
  makeHarness,
  makeHarnessLogger,
} from "./utils/graphql-manager-harness.js";
import { PublishedBaseSubgraph } from "./utils/published-base-subgraph.js";
import { sdlBase } from "./utils/sdl-base.js";

// The host builds schemas with @apollo/subgraph, which loads graphql's
// CommonJS entry; executing one needs that copy.
const { graphql } = createRequire(import.meta.url)("graphql") as typeof GraphQL;

type Harness = ReturnType<typeof makeHarness>;

function servingHarness(options: { readonly path?: string } = {}) {
  const logger = makeHarnessLogger();
  const harness = makeHarness({ ...options, logger });
  const createHandler: IGatewayAdapter<Context>["createHandler"] = (schema) => {
    const handler: FetchHandler = async (request) => {
      const { query, variables } = (await request.json()) as {
        query: string;
        variables?: Record<string, unknown>;
      };
      return Response.json(
        await graphql({
          schema,
          source: query,
          variableValues: variables,
          contextValue: { headers: {}, db: {} },
        }),
      );
    };
    return Promise.resolve(handler);
  };
  Object.assign(harness.gatewayAdapter, {
    createHandler: vi.fn(createHandler),
  });
  return { ...harness, logger };
}

async function settle<T>(work: Promise<T>): Promise<T> {
  const settled = work.then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );
  await vi.runAllTimersAsync();
  const result = await settled;
  if ("error" in result) throw result.error;
  return result.value;
}

async function register(
  manager: GraphQLManager,
  subgraph: unknown,
  packageName?: string,
  supergraph = "",
) {
  const registered = await settle(
    manager.registerSubgraph(
      subgraph as SubgraphClass,
      supergraph,
      false,
      packageName,
    ),
  );
  await settle(manager.updateRouter());
  return registered;
}

async function query(
  { mounts }: Harness,
  path: string,
  source: string,
  variables?: Record<string, unknown>,
) {
  const handler = mounts.get(path);
  if (!handler) throw new Error(`Nothing is mounted at ${path}`);
  const response = await handler(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: source, variables }),
    }),
  );
  return (await response.json()) as {
    data?: unknown;
    errors?: { message: string }[];
  };
}

function rejection(work: () => Promise<unknown>): Promise<string> {
  return settle(work()).then(
    () => "accepted",
    (error: unknown) => {
      if (error instanceof DocumentModelDefinitionError) {
        return error.diagnostics[0].message;
      }
      return error instanceof Error ? error.message : String(error);
    },
  );
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers();
  warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  warn.mockRestore();
});

function noticesFor(label: string): string[] {
  return warn.mock.calls
    .map((call: unknown[]) => String(call[0]))
    .filter((line: string) =>
      line.startsWith(`${label} is an old-style subgraph`),
    );
}

describe("a class subgraph", () => {
  it("mounts at its subgraphName and serves its schema", async () => {
    class Widgets extends BaseSubgraph {
      static override readonly subgraphName = "widgets";
      static override getSchema(schema: SchemaBuilder<Widgets>) {
        return [
          schema.query("widget", {
            args: { id: ph.OID({ required: true }) },
            returns: ph.String({ required: true }),
            resolve: ({ args }) => `widget ${String(args.id)}`,
          }),
        ];
      }
    }
    const harness = servingHarness();
    await initAndFlush(harness.manager);
    const registered = await register(harness.manager, Widgets);

    expect(registered).toBeInstanceOf(Widgets);
    expect(harness.manager.getSubgraphByName("widgets")).toBe(registered);
    expect(await query(harness, "/widgets", '{ widget(id: "w1") }')).toEqual({
      data: { widget: "widget w1" },
    });
  });

  it("binds after onSetup, so resolvers read what onSetup set and #private members", async () => {
    let factoryCalls = 0;
    class Greeter extends BaseSubgraph {
      static override readonly subgraphName = "greeter";
      static override getSchema(schema: SchemaBuilder<Greeter>) {
        return schema.graphql({
          typeDefs: gql`
            type Query {
              greeting: String!
            }
          `,
          resolverCoordinates: [
            { typeName: "Query", fieldName: "greeting", resolverKind: "field" },
          ],
          resolvers: (subgraph) => {
            factoryCalls += 1;
            const greeting = subgraph.greeting;
            const suffix = subgraph.suffix();
            return { Query: { greeting: () => `${greeting}${suffix}` } };
          },
        });
      }
      greeting = "unset";
      readonly #punctuation = "!";
      suffix() {
        return this.#punctuation;
      }
      override async onSetup() {
        await super.onSetup();
        this.greeting = "hello";
      }
    }
    const harness = servingHarness();
    await initAndFlush(harness.manager);
    await register(harness.manager, Greeter);
    await settle(harness.manager.updateRouter());

    expect(await query(harness, "/greeter", "{ greeting }")).toEqual({
      data: { greeting: "hello!" },
    });
    expect(factoryCalls).toBe(1);
  });

  it("is compiled before it is constructed, so a class the protocol refuses is never built", async () => {
    let constructed = 0;
    class Invalid extends sdlBase("type Query { ping: String }") {
      static override readonly subgraphName = "Invalid";
      constructor(args: SubgraphArgs) {
        super(args);
        constructed += 1;
      }
    }
    const { manager, mounts } = servingHarness();
    await initAndFlush(manager);

    expect(await rejection(() => manager.registerSubgraph(Invalid))).toBe(
      "Invalid.subgraphName is not lowercase kebab-case. The name is the subgraph's route segment and is never normalized.",
    );
    expect(constructed).toBe(0);
    expect([...mounts.keys()]).toEqual(["/d/:drive", "/graphql"]);
  });

  it("is compiled at instance registration before onSetup runs", async () => {
    let setUp = 0;
    class Invalid extends sdlBase("type Query { ping: String }") {
      static override readonly subgraphName = "not/one-segment";
      override async onSetup() {
        setUp += 1;
        await super.onSetup();
      }
    }
    const { manager } = servingHarness();
    await initAndFlush(manager);
    const instance = new Invalid({} as SubgraphArgs);

    expect(
      await rejection(() => manager.registerSubgraphInstance(instance)),
    ).toBe(
      "Invalid.subgraphName is not lowercase kebab-case. The name is the subgraph's route segment and is never normalized.",
    );
    expect(setUp).toBe(0);
  });

  it("refuses a name that is not one route segment, and never mounts it", async () => {
    const { manager, mounts } = servingHarness();
    await initAndFlush(manager);
    const before = [...mounts.keys()];
    for (const name of [
      "..",
      "/",
      ".",
      "../r",
      "graphql/r",
      "x/../../escape",
      "a/b c",
      "Invoices",
      "-widgets",
      "foo--bar",
      "foo-",
      "my_widgets",
      "café",
      "",
    ]) {
      class Named extends sdlBase("type Query { ping: String }") {
        static override readonly subgraphName = name;
      }
      expect(await rejection(() => manager.registerSubgraph(Named))).toMatch(
        /^Named\.subgraphName is not lowercase kebab-case\./,
      );
    }
    await settle(manager.updateRouter());
    expect([...mounts.keys()]).toEqual(before);

    for (const name of ["contacts-search", "1st", "invoice-line-items-2"]) {
      class Named extends sdlBase(`type Query { ping${name.length}: String }`) {
        static override readonly subgraphName = name;
      }
      await register(manager, Named);
      expect(mounts.has(`/${name}`)).toBe(true);
    }
  });

  it("refuses a nameless class that has no old-style fields, with the migration message", async () => {
    class Nameless extends sdlBase("type Query { ping: String }") {}
    const { manager } = servingHarness();
    await initAndFlush(manager);

    expect(await rejection(() => manager.registerSubgraph(Nameless))).toBe(
      "Nameless has no static subgraphName. Shared bases belong outside subgraphs/ or must be extended by an exported subgraph. Old-style subgraphs (`name`/`typeDefs`/`resolvers`): run `ph migrate`.",
    );
  });

  it("refuses a subclass that only inherits its subgraphName before any of its hooks run", async () => {
    const calls: string[] = [];
    class Reports extends sdlBase("type Query { ping: String }") {
      static override readonly subgraphName = "reports";
      override async onSetup() {
        calls.push("setup");
        await super.onSetup();
      }
      override async onDisconnect() {
        calls.push("disconnect");
        await super.onDisconnect();
      }
    }
    class Child extends Reports {}
    const { manager } = servingHarness();
    await initAndFlush(manager);

    expect(await rejection(() => manager.registerSubgraph(Child))).toBe(
      "Child has no static subgraphName. Shared bases belong outside subgraphs/ or must be extended by an exported subgraph. Old-style subgraphs (`name`/`typeDefs`/`resolvers`): run `ph migrate`.",
    );
    expect(calls).toEqual([]);
    await settle(manager.registerSubgraph(Reports));
    expect(calls).toEqual(["setup"]);
  });

  it("refuses a null-prototype instance with the migration message", async () => {
    const { manager } = servingHarness();
    await initAndFlush(manager);

    expect(
      await rejection(() =>
        manager.registerSubgraphInstance(Object.create(null) as never),
      ),
    ).toBe(
      "An anonymous subgraph class has no static subgraphName. Shared bases belong outside subgraphs/ or must be extended by an exported subgraph. Old-style subgraphs (`name`/`typeDefs`/`resolvers`): run `ph migrate`.",
    );
  });

  it("refuses a protocol version the host does not speak, naming both versions", async () => {
    class Future extends sdlBase("type Query { ping: String }") {
      static override readonly subgraphName = "future";
      static override [SUBGRAPH_PROTOCOL](): SubgraphProtocol {
        return {
          ...super[SUBGRAPH_PROTOCOL](),
          version: 2,
        } as unknown as SubgraphProtocol;
      }
    }
    const { manager } = servingHarness();
    await initAndFlush(manager);

    expect(await rejection(() => manager.registerSubgraph(Future))).toBe(
      "Future speaks subgraph protocol version 2, and this host speaks version 1. Serve it with a @powerhousedao/reactor-api release that speaks version 2, or rebuild its package against this one.",
    );
  });

  it("refuses a class with a static subgraphName and no protocol, naming the base to extend", async () => {
    class Unprotocoled {
      static readonly subgraphName = "unprotocoled";
    }
    const { manager } = servingHarness();
    await initAndFlush(manager);

    expect(
      await rejection(() => manager.registerSubgraph(Unprotocoled as never)),
    ).toBe(
      "Unprotocoled declares a static subgraphName but has no subgraph protocol. Extend BaseSubgraph from @powerhousedao/reactor-api.",
    );
  });

  it("refuses a class that also sets old-style fields, after new or in onSetup", async () => {
    class Constructed extends sdlBase("type Query { ping: String }") {
      static override readonly subgraphName = "constructed";
      constructor(args: SubgraphArgs) {
        super(args);
        (this as Record<string, unknown>).typeDefs = parse(
          "type Query { other: String }",
        );
      }
    }
    const disconnected: string[] = [];
    class SetUp extends sdlBase("type Query { ping: String }") {
      static override readonly subgraphName = "set-up";
      override async onSetup() {
        await super.onSetup();
        (this as Record<string, unknown>).resolvers = {};
        (this as Record<string, unknown>).hasSubscriptions = true;
      }
      override async onDisconnect() {
        disconnected.push("set-up");
        await super.onDisconnect();
      }
    }
    const { manager } = servingHarness();
    await initAndFlush(manager);

    expect(await rejection(() => manager.registerSubgraph(Constructed))).toBe(
      'Constructed declares static subgraphName "constructed" and the old-style field typeDefs, which the host ignores. Declare the schema in static getSchema and remove it.',
    );
    expect(await rejection(() => manager.registerSubgraph(SetUp))).toBe(
      'SetUp declares static subgraphName "set-up" and the old-style fields resolvers, hasSubscriptions, which the host ignores. Declare the schema in static getSchema and remove them.',
    );
    expect(disconnected).toEqual(["set-up"]);
    expect(manager.getSubgraphByName("constructed")).toBeUndefined();
    expect(manager.getSubgraphByName("set-up")).toBeUndefined();
  });

  it("refuses a class that declares old-style fields as accessors", async () => {
    class Accessors extends sdlBase("type Query { ping: String }") {
      static override readonly subgraphName = "accessors";
      // @ts-expect-error -- TS2611
      get name() {
        return "accessors";
      }
      // @ts-expect-error -- TS2611
      get typeDefs() {
        return parse("type Query { other: String }");
      }
    }
    const { manager } = servingHarness();
    await initAndFlush(manager);

    expect(
      await rejection(() => manager.registerSubgraph(Accessors as never)),
    ).toBe(
      'Accessors declares static subgraphName "accessors" and the old-style fields name, typeDefs, which the host ignores. Declare the schema in static getSchema and remove them.',
    );
    expect(manager.getSubgraphByName("accessors")).toBeUndefined();
  });

  it("mounts WebSocket and SSE from describe()'s hasSubscriptions", async () => {
    class Ticks extends sdlBase(`
      type Query { now: String }
      type Subscription { tick: String }
    `) {
      static override readonly subgraphName = "ticks";
    }
    class Clock extends sdlBase(`
      type Query { now: String }
      type Clock { tick: String }
    `) {
      static override readonly subgraphName = "clock";
    }
    const harness = servingHarness();
    await initAndFlush(harness.manager);
    await register(harness.manager, Ticks);
    await register(harness.manager, Clock);

    expect(harness.gatewayAdapter.attachWebSocket).toHaveBeenCalledTimes(1);
    const [, schema] = harness.gatewayAdapter.attachWebSocket.mock.calls[0] as [
      unknown,
      GraphQL.GraphQLSchema,
    ];
    expect(
      Object.keys(schema.getSubscriptionType()?.getFields() ?? {}),
    ).toEqual(["tick"]);
    expect(harness.mounts.has("/ticks/stream")).toBe(true);
    expect(harness.mounts.has("/clock/stream")).toBe(false);
  });

  it("awaits onSetup before the instance is registered", async () => {
    let finishSetup: () => void = () => undefined;
    class Slow extends sdlBase("type Query { ping: String }") {
      static override readonly subgraphName = "slow";
      override onSetup() {
        return new Promise<void>((resolve) => {
          finishSetup = resolve;
        });
      }
    }
    const { manager } = servingHarness();
    await initAndFlush(manager);
    const registration = manager.registerSubgraph(Slow);
    await vi.advanceTimersByTimeAsync(0);
    expect(manager.getSubgraphByName("slow")).toBeUndefined();

    finishSetup();
    await settle(registration);
    expect(manager.getSubgraphByName("slow")).toBeInstanceOf(Slow);
  });

  it("calls onDisconnect on the instance a re-registration replaces", async () => {
    const disconnected: unknown[] = [];
    class Widgets extends sdlBase("type Query { ping: String }") {
      static override readonly subgraphName = "widgets";
      override async onDisconnect() {
        disconnected.push(this);
        await super.onDisconnect();
      }
    }
    const { manager } = servingHarness();
    await initAndFlush(manager);
    const first = await register(manager, Widgets, "@acme/widgets");
    const second = await register(manager, Widgets, "@acme/widgets");

    expect(second).not.toBe(first);
    expect(disconnected).toEqual([first]);
  });

  it("binds again when a removed instance is registered again, so resolvers read the new setup", async () => {
    let generation = 0;
    class Pooled extends BaseSubgraph {
      static override readonly subgraphName = "pooled";
      static override getSchema(schema: SchemaBuilder<Pooled>) {
        return schema.graphql({
          typeDefs: gql`
            type Query {
              pool: String
            }
          `,
          resolverCoordinates: [
            { typeName: "Query", fieldName: "pool", resolverKind: "field" },
          ],
          resolvers: (subgraph) => {
            const pool = subgraph.pool;
            return { Query: { pool: () => pool } };
          },
        });
      }
      pool = "none";
      override async onSetup() {
        await super.onSetup();
        generation += 1;
        this.pool = `pool-${generation}`;
      }
      override async onDisconnect() {
        this.pool = "closed";
        await super.onDisconnect();
      }
    }
    const harness = servingHarness();
    await initAndFlush(harness.manager);
    const instance = new Pooled({} as SubgraphArgs);

    await settle(harness.manager.setSupergraph("extra", [instance]));
    const first = await query(harness, "/extra/pooled", "{ pool }");
    await settle(harness.manager.setSupergraph("extra", []));
    await settle(harness.manager.setSupergraph("extra", [instance]));
    const second = await query(harness, "/extra/pooled", "{ pool }");

    expect([first, second]).toEqual([
      { data: { pool: "pool-1" } },
      { data: { pool: "pool-2" } },
    ]);
  });
});

describe("a package class the host cannot create", () => {
  it("is logged once, not again on every later package change", async () => {
    class Throws extends BaseSubgraph {
      static override readonly subgraphName = "throws";
      static override getSchema(): never {
        throw new Error("getSchema boom");
      }
    }
    class Nameless extends sdlBase("type Query { nameless: String }") {}
    class Valid extends sdlBase("type Query { valid: String }") {
      static override readonly subgraphName = "valid";
    }
    class Other extends sdlBase("type Query { other: String }") {
      static override readonly subgraphName = "other";
    }
    const { manager, logger, mounts } = servingHarness();
    await initAndFlush(manager);

    const broken: [string, SubgraphClass[]] = [
      "@acme/broken",
      [Throws, Nameless, Valid],
    ];
    await settle(manager.applyPackageSubgraphs(new Map([broken])));
    await settle(
      manager.applyPackageSubgraphs(
        new Map([broken, ["@acme/other", [Other]]]),
      ),
    );
    await settle(manager.updateRouter());

    expect(
      vi
        .mocked(logger.error)
        .mock.calls.filter(
          ([message]) =>
            message ===
            "Failed to create subgraph @subgraph from @package: @error",
        )
        .map(([, subgraph, packageName, error]) => [
          subgraph,
          packageName,
          (error as Error).message,
        ]),
    ).toEqual([
      ["Throws", "@acme/broken", "getSchema boom"],
      [
        "Nameless",
        "@acme/broken",
        "Nameless has no static subgraphName. Shared bases belong outside subgraphs/ or must be extended by an exported subgraph. Old-style subgraphs (`name`/`typeDefs`/`resolvers`): run `ph migrate`.",
      ],
    ]);
    expect([
      mounts.has("/graphql/valid"),
      mounts.has("/graphql/other"),
    ]).toEqual([true, true]);
  });

  it("logs a thrown undefined once", async () => {
    class ThrowsUndefined extends BaseSubgraph {
      static override readonly subgraphName = "throws-undefined";
      static override getSchema(): never {
        // eslint-disable-next-line only-throw-error -- a thrown undefined is the case under test
        throw undefined;
      }
    }
    const { manager, logger } = servingHarness();
    await initAndFlush(manager);

    const broken = new Map([["@acme/broken", [ThrowsUndefined]]]);
    await settle(manager.applyPackageSubgraphs(broken));
    await settle(manager.applyPackageSubgraphs(broken));

    expect(
      vi
        .mocked(logger.error)
        .mock.calls.filter(
          ([message]) =>
            message ===
            "Failed to create subgraph @subgraph from @package: @error",
        )
        .map(([, subgraph, packageName, error]) => [
          subgraph,
          packageName,
          error,
        ]),
    ).toEqual([["ThrowsUndefined", "@acme/broken", undefined]]);
  });
});

describe("two package classes with one subgraph name", () => {
  it("serves only the one the package lists last", async () => {
    class FirstLedger extends sdlBase("type Query { first: String }", {
      Query: { first: () => "first" },
    }) {
      static override readonly subgraphName = "ledger";
    }
    class SecondLedger extends sdlBase("type Query { second: String }", {
      Query: { second: () => "second" },
    }) {
      static override readonly subgraphName = "ledger";
    }
    const harness = servingHarness();
    await initAndFlush(harness.manager);

    await settle(
      harness.manager.applyPackageSubgraphs(
        new Map([["@acme/ledger", [FirstLedger, SecondLedger]]]),
      ),
    );
    await settle(harness.manager.updateRouter());

    expect(harness.manager.getSubgraphByName("ledger")).toBeInstanceOf(
      SecondLedger,
    );
    expect(await query(harness, "/graphql/ledger", "{ second }")).toEqual({
      data: { second: "second" },
    });
  });
});

describe("a failed setup", () => {
  it("disconnects that candidate only, and surfaces its setup error", async () => {
    const calls: string[] = [];
    const failure = new Error("database unreachable");
    class Holder extends sdlBase("type Query { held: String }") {
      static override readonly subgraphName = "shared";
      override async onDisconnect() {
        calls.push("holder disconnected");
        await super.onDisconnect();
      }
    }
    class Candidate extends sdlBase("type Query { taken: String }") {
      static override readonly subgraphName = "shared";
      override onSetup(): Promise<void> {
        calls.push("candidate setup");
        return Promise.reject(failure);
      }
      override async onDisconnect() {
        calls.push("candidate disconnected");
        await super.onDisconnect();
      }
    }
    const { manager } = servingHarness();
    await initAndFlush(manager);
    const holder = await register(manager, Holder, "@acme/holder");

    await expect(settle(manager.registerSubgraph(Candidate))).rejects.toBe(
      failure,
    );
    expect(calls).toEqual(["candidate setup", "candidate disconnected"]);
    expect(manager.getSubgraphByName("shared")).toBe(holder);
  });

  it("logs a teardown error and still surfaces the setup error", async () => {
    const failure = new Error("setup failed");
    const teardown = new Error("teardown failed too");
    class Fragile extends sdlBase("type Query { ping: String }") {
      static override readonly subgraphName = "fragile";
      override onSetup(): Promise<void> {
        return Promise.reject(failure);
      }
      override onDisconnect(): Promise<void> {
        return Promise.reject(teardown);
      }
    }
    const { manager, logger } = servingHarness();
    await initAndFlush(manager);

    await expect(settle(manager.registerSubgraph(Fragile))).rejects.toBe(
      failure,
    );
    expect(logger.error).toHaveBeenCalledWith(
      "Error disconnecting subgraph @name after its setup failed: @error",
      "fragile",
      teardown,
    );
  });

  it("releases the HTTP routes it registered, so the next attempt can mount them", async () => {
    let failSetup = true;
    class Hooks extends sdlBase("type Query { ping: String }") {
      static override readonly subgraphName = "hooks";
      #route: ScopedRouteHandle | undefined;
      override async onSetup() {
        await super.onSetup();
        this.#route = this.http.get("hook", () => new Response("ok"));
        if (failSetup) throw new Error("webhook secret missing");
      }
      override async onDisconnect() {
        this.#route?.dispose();
        await super.onDisconnect();
      }
    }
    const { manager, httpAdapter, disposed } = servingHarness();
    await initAndFlush(manager);
    const mountNodeRoute = vi.mocked(httpAdapter.mountNodeRoute);

    expect(
      await rejection(() =>
        manager.registerSubgraph(Hooks, "", false, "@acme/hooks"),
      ),
    ).toBe("webhook secret missing");
    const routes = () =>
      mountNodeRoute.mock.calls.map(([method, path], index) => ({
        method,
        path,
        disposed: disposed.includes(mountNodeRoute.mock.results[index].value),
      }));
    const hook = (disposed: boolean) => [
      { method: "GET", path: "/api/@acme/hooks/hook", disposed },
      { method: "GET", path: "/api/%40acme/hooks/hook", disposed },
    ];
    expect(routes()).toEqual(hook(true));

    failSetup = false;
    const registered = await register(manager, Hooks, "@acme/hooks");
    expect(registered).toBeInstanceOf(Hooks);
    expect(routes()).toEqual([...hook(true), ...hook(false)]);
  });
});

describe("shutdown", () => {
  it("disposes the WebSocket handlers and calls no onDisconnect", async () => {
    const disconnected: string[] = [];
    class Ticks extends sdlBase(`
      type Query { now: String }
      type Subscription { tick: String }
    `) {
      static override readonly subgraphName = "ticks";
      override async onDisconnect() {
        disconnected.push("ticks");
        await super.onDisconnect();
      }
    }
    const { manager, gatewayAdapter, wsServer } = servingHarness();
    await initAndFlush(manager);
    await register(manager, Ticks);
    const [disposer] = gatewayAdapter.attachWebSocket.mock.results.map(
      (result) => result.value as { dispose: ReturnType<typeof vi.fn> },
    );

    await manager.shutdown();

    expect(disposer.dispose).toHaveBeenCalledTimes(1);
    expect(gatewayAdapter.stop).toHaveBeenCalledTimes(1);
    expect(vi.mocked(wsServer.close)).toHaveBeenCalledTimes(1);
    expect(disconnected).toEqual([]);
  });
});

describe("a router update", () => {
  it("skips a subgraph its package removed while an earlier one was set up, and logs nothing", async () => {
    class First extends sdlBase("type Query { first: String }", {
      Query: { first: () => "1" },
    }) {
      static override readonly subgraphName = "first";
    }
    class Second extends sdlBase("type Query { second: String }", {
      Query: { second: () => "2" },
    }) {
      static override readonly subgraphName = "second";
    }
    const harness = servingHarness();
    await initAndFlush(harness.manager);
    const serve =
      harness.gatewayAdapter.createHandler.getMockImplementation() as IGatewayAdapter<Context>["createHandler"];
    const entered: string[] = [];
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const gated: IGatewayAdapter<Context>["createHandler"] = async (
      schema,
      context,
    ) => {
      if (schema.getQueryType()?.getFields().first) {
        entered.push("first");
        await held;
      }
      return serve(schema, context);
    };
    vi.mocked(
      harness.gatewayAdapter
        .createHandler as IGatewayAdapter<Context>["createHandler"],
    ).mockImplementation(gated);
    await settle(
      harness.manager.registerSubgraph(First, "", false, "@acme/first"),
    );
    await settle(
      harness.manager.registerSubgraph(Second, "", false, "@acme/second"),
    );

    const update = harness.manager.updateRouter();
    await vi.advanceTimersByTimeAsync(1000);
    expect(entered).toEqual(["first"]);
    const removal = harness.manager.unregisterPackage("@acme/second");
    await vi.advanceTimersByTimeAsync(1000);
    expect(entered).toEqual(["first", "first"]);
    release();
    await settle(Promise.all([update, removal]));

    expect(vi.mocked(harness.logger.error).mock.calls).toEqual([]);
    expect(await query(harness, "/first", "{ first }")).toEqual({
      data: { first: "1" },
    });
    expect(harness.mounts.has("/second")).toBe(false);
  });

  it("mounts a subgraph registered while an earlier one was set up, with the update that follows", async () => {
    const queried = (name: string) =>
      sdlBase(`type Query { ${name}: String }`, {
        Query: { [name]: () => name },
      });
    class First extends queried("first") {
      static override readonly subgraphName = "first";
    }
    class Second extends queried("second") {
      static override readonly subgraphName = "second";
    }
    class Third extends queried("third") {
      static override readonly subgraphName = "third";
    }
    const harness = servingHarness();
    await initAndFlush(harness.manager);
    const serve =
      harness.gatewayAdapter.createHandler.getMockImplementation() as IGatewayAdapter<Context>["createHandler"];
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.mocked(
      harness.gatewayAdapter
        .createHandler as IGatewayAdapter<Context>["createHandler"],
    ).mockImplementation(async (schema, context) => {
      if (schema.getQueryType()?.getFields().first) await held;
      return serve(schema, context);
    });
    await settle(
      harness.manager.registerSubgraph(First, "", false, "@acme/first"),
    );
    await settle(
      harness.manager.registerSubgraph(Second, "", false, "@acme/second"),
    );

    const update = harness.manager.updateRouter();
    await vi.advanceTimersByTimeAsync(1000);
    const changes = Promise.all([
      harness.manager.unregisterPackage("@acme/second"),
      harness.manager.registerSubgraph(Third, "", false, "@acme/third"),
    ]);
    await vi.advanceTimersByTimeAsync(0);
    release();
    await settle(Promise.all([update, changes]));
    await settle(harness.manager.updateRouter());

    expect(vi.mocked(harness.logger.error).mock.calls).toEqual([]);
    expect(
      [...harness.mounts.keys()].filter((path) =>
        ["/first", "/second", "/third"].includes(path),
      ),
    ).toEqual(["/first", "/third"]);
    expect(await query(harness, "/third", "{ third }")).toEqual({
      data: { third: "third" },
    });
  });

  it("mounts a subgraph registered in the bucket it is setting up, in the same update", async () => {
    const queried = (name: string) =>
      sdlBase(`type Query { ${name}: String }`, {
        Query: { [name]: () => name },
      });
    class First extends queried("first") {
      static override readonly subgraphName = "first";
    }
    class Second extends queried("second") {
      static override readonly subgraphName = "second";
    }
    const harness = servingHarness();
    await initAndFlush(harness.manager);
    const serve =
      harness.gatewayAdapter.createHandler.getMockImplementation() as IGatewayAdapter<Context>["createHandler"];
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.mocked(
      harness.gatewayAdapter
        .createHandler as IGatewayAdapter<Context>["createHandler"],
    ).mockImplementation(async (schema, context) => {
      if (schema.getQueryType()?.getFields().first) await held;
      return serve(schema, context);
    });
    await settle(
      harness.manager.registerSubgraph(First, "", false, "@acme/first"),
    );

    const update = harness.manager.updateRouter();
    await vi.advanceTimersByTimeAsync(1000);
    await harness.manager.registerSubgraph(Second, "", false, "@acme/second");
    release();
    await update;

    expect(await query(harness, "/second", "{ second }")).toEqual({
      data: { second: "second" },
    });
  });
});

describe("an old-style subgraph, served through the legacy adapter", () => {
  it("serves an old-style class, reading resolvers and hasSubscriptions after onSetup", async () => {
    class LegacyTicks extends PublishedBaseSubgraph {
      override name = "legacy-ticks";
      override typeDefs = gql`
        type Query {
          now: String
        }
        type Subscription {
          tick: String
        }
      `;
      override async onSetup() {
        await super.onSetup();
        this.resolvers = { Query: { now: () => "noon" } };
        this.hasSubscriptions = true;
      }
    }
    const harness = servingHarness();
    await initAndFlush(harness.manager);
    await register(harness.manager, LegacyTicks);

    expect(await query(harness, "/legacy-ticks", "{ now }")).toEqual({
      data: { now: "noon" },
    });
    expect(harness.gatewayAdapter.attachWebSocket).toHaveBeenCalledTimes(1);
    expect(harness.mounts.has("/legacy-ticks/stream")).toBe(true);
  });

  it("serves an old-style class that declares its fields as accessors", async () => {
    class LegacyAccessors extends PublishedBaseSubgraph {
      // @ts-expect-error -- TS2611
      get name() {
        return "legacy-accessors";
      }
      // @ts-expect-error -- TS2611
      get typeDefs() {
        return gql`
          type Query {
            ping: String
          }
        `;
      }
      // @ts-expect-error -- TS2611
      get resolvers() {
        return { Query: { ping: () => "accessed" } };
      }
    }
    const harness = servingHarness();
    await initAndFlush(harness.manager);
    await register(harness.manager, LegacyAccessors, "@acme/accessors");

    expect(await query(harness, "/legacy-accessors", "{ ping }")).toEqual({
      data: { ping: "accessed" },
    });
  });

  const lateFields = (calls: string[]) =>
    class LateFields extends PublishedBaseSubgraph {
      override async onSetup() {
        calls.push("setup");
        this.name = "late-fields";
        this.typeDefs = gql`
          type Query {
            ping: String
          }
        `;
        this.resolvers = { Query: { ping: () => "late" } };
        await super.onSetup();
      }
      override async onDisconnect() {
        calls.push("disconnect");
        await super.onDisconnect();
      }
    };

  it("serves an old-style class that sets its fields only in onSetup, set up once", async () => {
    const calls: string[] = [];
    const LateFields = lateFields(calls);
    const harness = servingHarness();
    await initAndFlush(harness.manager);
    const registered = await register(
      harness.manager,
      LateFields,
      "@acme/late",
    );

    expect(calls).toEqual(["setup"]);
    expect(harness.manager.getSubgraphByName("late-fields")).toBe(registered);
    expect(await query(harness, "/late-fields", "{ ping }")).toEqual({
      data: { ping: "late" },
    });
  });

  it("refuses a class that sets no old-style field in onSetup either, and disconnects it", async () => {
    const calls: string[] = [];
    class Fieldless extends PublishedBaseSubgraph {
      override async onSetup() {
        calls.push("setup");
        await super.onSetup();
      }
      override async onDisconnect() {
        calls.push("disconnect");
        await super.onDisconnect();
      }
    }
    const { manager } = servingHarness();
    await initAndFlush(manager);

    expect(
      await rejection(() => manager.registerSubgraph(Fieldless as never)),
    ).toBe(
      "Fieldless has no static subgraphName. Shared bases belong outside subgraphs/ or must be extended by an exported subgraph. Old-style subgraphs (`name`/`typeDefs`/`resolvers`): run `ph migrate`.",
    );
    expect(calls).toEqual(["setup", "disconnect"]);
  });

  it("disconnects an old-style class whose onSetup sets a name the host refuses", async () => {
    const calls: string[] = [];
    class LateEscape extends PublishedBaseSubgraph {
      override async onSetup() {
        calls.push("setup");
        this.name = "../escape";
        this.typeDefs = gql`
          type Query {
            ping: String
          }
        `;
        await super.onSetup();
      }
      override async onDisconnect() {
        calls.push("disconnect");
        await super.onDisconnect();
      }
    }
    const { manager, mounts, logger } = servingHarness({ path: "/api" });
    await initAndFlush(manager);
    const before = [...mounts.keys()];

    expect(await register(manager, LateEscape, "@acme/late")).toBeUndefined();
    expect(calls).toEqual(["setup", "disconnect"]);
    expect(logger.error).toHaveBeenCalledWith(
      "Rejecting subgraph @name: it would mount outside the base path @base",
      "../escape",
      "/api",
    );
    expect([...mounts.keys()]).toEqual(before);
  });

  it("disconnects an old-style class set up in onSetup when the package change throws before registering it", async () => {
    const calls: string[] = [];
    const LateFields = lateFields(calls);
    const harness = servingHarness();
    await initAndFlush(harness.manager);
    await settle(
      harness.manager.applyPackageSubgraphs(
        new Map([["@acme/late", [legacyNamed("stale") as never]]]),
      ),
    );
    await settle(harness.manager.updateRouter());
    const failure = new Error("route table locked");
    vi.mocked(
      harness.handles.get("/graphql/stale")!.dispose,
    ).mockImplementation(() => {
      throw failure;
    });

    await expect(
      settle(
        harness.manager.applyPackageSubgraphs(
          new Map([["@acme/late", [LateFields as never]]]),
        ),
      ),
    ).rejects.toBe(failure);
    expect(calls).toEqual(["setup", "disconnect"]);
  });

  it("disconnects an old-style instance once when its name cannot be read after onSetup", async () => {
    const calls: string[] = [];
    const failure = new Error("name unavailable after setup");
    const instance = {
      ready: false,
      get name() {
        if (this.ready) throw failure;
        return "legacy";
      },
      typeDefs: gql`
        type Query {
          ping: String
        }
      `,
      resolvers: { Query: { ping: () => "pong" } },
      onSetup() {
        calls.push("setup");
        this.ready = true;
        return Promise.resolve();
      },
      onDisconnect() {
        calls.push("disconnect");
        return Promise.resolve();
      },
    };
    const { manager } = servingHarness();
    await initAndFlush(manager);

    await expect(
      settle(manager.registerSubgraphInstance(instance as never)),
    ).rejects.toBe(failure);
    expect(calls).toEqual(["setup", "disconnect"]);
  });

  it("reads an old-style instance's resolvers when it builds the schema, not when it registers it", async () => {
    const instance = {
      name: "late-resolvers",
      typeDefs: gql`
        type Query {
          ping: String
        }
      `,
      resolvers: { Query: { ping: () => "at registration" } },
    };
    const harness = servingHarness();
    await initAndFlush(harness.manager);
    await settle(harness.manager.registerSubgraphInstance(instance as never));
    instance.resolvers = { Query: { ping: () => "at schema build" } };
    await settle(harness.manager.updateRouter());

    expect(await query(harness, "/late-resolvers", "{ ping }")).toEqual({
      data: { ping: "at schema build" },
    });
  });

  it("serves an old-style object literal registered as an instance", async () => {
    const harness = servingHarness();
    await initAndFlush(harness.manager);
    const literal = {
      name: "legacy-literal",
      typeDefs: gql`
        type Query {
          ping: String
        }
      `,
      resolvers: { Query: { ping: () => "pong" } },
    };
    await settle(
      harness.manager.registerSubgraphInstance(literal as never, "", false),
    );
    await settle(harness.manager.updateRouter());

    expect(harness.manager.getSubgraphByName("legacy-literal")).toBe(literal);
    expect(await query(harness, "/legacy-literal", "{ ping }")).toEqual({
      data: { ping: "pong" },
    });
  });

  const legacyNamed = (name: string, calls: string[] = []) =>
    class LegacyRoute extends PublishedBaseSubgraph {
      override name = name;
      override typeDefs = gql`
        type Query {
          ping: String
        }
      `;
      override resolvers = { Query: { ping: () => name } };
      override async onSetup() {
        calls.push(`setup ${this.name}`);
        await super.onSetup();
      }
      override async onDisconnect() {
        calls.push(`disconnect ${this.name}`);
        await super.onDisconnect();
      }
    };

  it.each([
    ["simple", "/api/graphql/simple"],
    ["Invoices", "/api/graphql/Invoices"],
    ["café", "/api/graphql/café"],
    ["my_widgets", "/api/graphql/my_widgets"],
    ["nested/child", "/api/graphql/nested/child"],
    ["a//b", "/api/graphql/a/b"],
    ["a/../b", "/api/graphql/b"],
    ["./child", "/api/graphql/child"],
    ["/child", "/api/graphql/child"],
    ["a\\b", "/api/graphql/a\\b"],
    ["\\", "/api/graphql/\\"],
    ["", "/api/graphql"],
    [".", "/api/graphql"],
    ["..", "/api"],
    ["/", "/api/graphql/"],
    ["../escape", "/api/escape"],
  ])(
    "serves the old-style name %j at %s, where earlier hosts served it",
    async (name, route) => {
      const harness = servingHarness({ path: "/api" });
      await initAndFlush(harness.manager);
      await register(
        harness.manager,
        legacyNamed(name),
        "@acme/routes",
        "graphql",
      );

      expect(await query(harness, route, "{ ping }")).toEqual({
        data: { ping: name },
      });
    },
  );

  it.each([
    [
      "development",
      [
        "NestedRoute is an old-style subgraph: it declares name, typeDefs or resolvers instead of a static subgraphName and getSchema. This host serves it through a legacy adapter, which a later major release removes. Run `ph migrate` in its package to convert it.",
      ],
    ],
    ["production", []],
  ] as const)(
    "serves an old-style package named nested/child, loaded from disk, at the URL earlier hosts served, with NODE_ENV %s",
    async (nodeEnv, notices) => {
      vi.stubEnv("NODE_ENV", nodeEnv);
      const directory = mkdtempSync(join(tmpdir(), "ph-legacy-route-"));
      onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
      const root = join(directory, "legacy-route");
      mkdirSync(join(root, "node_modules"), { recursive: true });
      symlinkSync(
        dirname(createRequire(import.meta.url).resolve("graphql/package.json")),
        join(root, "node_modules", "graphql"),
      );
      writeFileSync(
        join(root, "package.json"),
        JSON.stringify({
          name: "@acme/legacy-route",
          type: "module",
          exports: { "./subgraphs": "./subgraphs.mjs" },
        }),
      );
      writeFileSync(
        join(root, "subgraphs.mjs"),
        [
          'import { parse } from "graphql";',
          "class BaseSubgraph { constructor(args) {} async onSetup() {} async onDisconnect() {} }",
          "export class NestedRoute extends BaseSubgraph {",
          '  name = "nested/child";',
          '  typeDefs = parse("type Query { ping: String }");',
          '  resolvers = { Query: { ping: () => "published" } };',
          "}",
        ].join("\n"),
      );
      const [NestedRoute] = await new ImportPackageLoader().loadSubgraphs(root);
      const harness = servingHarness({ path: "/api" });
      await initAndFlush(harness.manager);
      await register(
        harness.manager,
        NestedRoute,
        "@acme/legacy-route",
        "graphql",
      );

      expect(
        await query(harness, "/api/graphql/nested/child", "{ ping }"),
      ).toEqual({ data: { ping: "published" } });
      expect(noticesFor("NestedRoute")).toEqual(notices);
    },
  );

  it.each([
    ["graphql", "../../escape"],
    ["graphql", "../../../escape"],
    ["", "../escape"],
  ])(
    "refuses an old-style name that mounts outside the base path in bucket %j: %j, before setup",
    async (supergraph, name) => {
      const calls: string[] = [];
      const { manager, mounts, logger } = servingHarness({ path: "/api" });
      await initAndFlush(manager);
      const before = [...mounts.keys()];

      expect(
        await register(
          manager,
          legacyNamed(name, calls),
          "@acme/routes",
          supergraph,
        ),
      ).toBeUndefined();
      expect(calls).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith(
        "Rejecting subgraph @name: it would mount outside the base path @base",
        name,
        "/api",
      );
      expect([...mounts.keys()]).toEqual(before);
    },
  );

  it("serves an old-style subgraph at the name its onSetup gives it", async () => {
    const calls: string[] = [];
    const harness = servingHarness({ path: "/api" });
    const { manager, mounts, logger } = harness;
    await initAndFlush(manager);
    class Renaming extends legacyNamed("before", calls) {
      override async onSetup() {
        this.name = "after";
        await super.onSetup();
      }
    }

    const registered = await register(
      manager,
      Renaming,
      "@acme/routes",
      "graphql",
    );

    expect(calls).toEqual(["setup after"]);
    expect(manager.getSubgraphByName("after")).toBe(registered);
    expect(manager.getSubgraphByName("before")).toBeUndefined();
    expect(
      [...mounts.keys()].filter((path) => /before|after/.test(path)),
    ).toEqual(["/api/graphql/after"]);
    expect(vi.mocked(logger.error).mock.calls).toEqual([]);
    expect(await query(harness, "/api/graphql/after", "{ ping }")).toEqual({
      data: { ping: "before" },
    });
  });

  it("refuses an old-style name that onSetup moves outside the base path, disconnects it, and keeps the holder it would evict", async () => {
    const calls: string[] = [];
    const harness = servingHarness({ path: "/api" });
    const { manager, mounts, logger } = harness;
    await initAndFlush(manager);
    await register(
      manager,
      legacyNamed("safe", calls),
      "@acme/holder",
      "graphql",
    );
    const before = [...mounts.keys()];
    class Renaming extends legacyNamed("safe", calls) {
      override async onSetup() {
        this.name = "../../escaped";
        await super.onSetup();
      }
    }

    expect(
      await register(manager, Renaming, undefined, "graphql"),
    ).toBeUndefined();
    expect(calls).toEqual([
      "setup safe",
      "setup ../../escaped",
      "disconnect ../../escaped",
    ]);
    expect(logger.error).toHaveBeenCalledWith(
      "Rejecting subgraph @name: it would mount outside the base path @base",
      "../../escaped",
      "/api",
    );
    expect([...mounts.keys()]).toEqual(before);
    expect(await query(harness, "/api/graphql/safe", "{ ping }")).toEqual({
      data: { ping: "safe" },
    });
  });

  it("keeps an old-style subgraph at the path it was admitted at when it renames itself later", async () => {
    const harness = servingHarness({ path: "/api" });
    await initAndFlush(harness.manager);
    const registered = await register(
      harness.manager,
      legacyNamed("settled"),
      "@acme/routes",
      "graphql",
    );
    const before = [...harness.mounts.keys()];

    Object.assign(registered!, { name: "../../later" });
    await settle(harness.manager.updateRouter());

    expect([...harness.mounts.keys()]).toEqual(before);
    expect(harness.manager.getSubgraphByName("settled")).toBe(registered);
    expect(await query(harness, "/api/graphql/settled", "{ ping }")).toEqual({
      data: { ping: "settled" },
    });
  });

  it("gives an old-style class the base path as this.path from onSetup on, as earlier hosts did", async () => {
    const seen: unknown[] = [];
    class OldStyle extends PublishedBaseSubgraph {
      override name = "old-style";
      override typeDefs = gql`
        type Query {
          path: String
        }
      `;
      override resolvers = { Query: { path: () => this.path } };
      override async onSetup() {
        seen.push(this.path);
        await super.onSetup();
      }
    }
    const harness = servingHarness({ path: "/api" });
    await initAndFlush(harness.manager);
    await register(harness.manager, OldStyle, "@acme/old-style");

    expect(seen).toEqual(["/api"]);
    expect(await query(harness, "/api/old-style", "{ path }")).toEqual({
      data: { path: "/api" },
    });
  });

  it("serves a published old-style package that reads this.path while it is constructed, extending the host's BaseSubgraph", async () => {
    const directory = mkdtempSync(join(tmpdir(), "ph-legacy-path-"));
    onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
    const root = join(directory, "legacy-path");
    const reactorApi = join(
      root,
      "node_modules",
      "@powerhousedao",
      "reactor-api",
    );
    mkdirSync(reactorApi, { recursive: true });
    for (const dependency of ["graphql", "graphql-tag"]) {
      symlinkSync(
        dirname(
          createRequire(import.meta.url).resolve(`${dependency}/package.json`),
        ),
        join(root, "node_modules", dependency),
      );
    }
    const hostKey = Symbol.for("ph-test.host-reactor-api");
    (globalThis as Record<symbol, unknown>)[hostKey] = { BaseSubgraph };
    onTestFinished(() => {
      delete (globalThis as Record<symbol, unknown>)[hostKey];
    });
    writeFileSync(
      join(reactorApi, "package.json"),
      JSON.stringify({
        name: "@powerhousedao/reactor-api",
        type: "module",
        exports: "./index.js",
      }),
    );
    writeFileSync(
      join(reactorApi, "index.js"),
      `export const { BaseSubgraph } = globalThis[Symbol.for("ph-test.host-reactor-api")];\n`,
    );
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        name: "@acme/legacy-path",
        type: "module",
        exports: { "./subgraphs": "./subgraphs/index.js" },
      }),
    );
    mkdirSync(join(root, "subgraphs", "example"), { recursive: true });
    writeFileSync(
      join(root, "subgraphs", "index.js"),
      'export * as ExampleSubgraph from "./example/index.js";\n',
    );
    writeFileSync(
      join(root, "subgraphs", "example", "index.js"),
      [
        'import { BaseSubgraph } from "@powerhousedao/reactor-api";',
        'import { gql } from "graphql-tag";',
        "const schema = gql`",
        "  type Query {",
        "    callback: String",
        "    webhook: String",
        "  }",
        "`;",
        "const getResolvers = (subgraph) => ({",
        "  Query: {",
        "    callback: () => subgraph.callbackPath,",
        "    webhook: () => subgraph.webhookPath,",
        "  },",
        "});",
        "export class ExampleSubgraph extends BaseSubgraph {",
        '  name = "example";',
        "  typeDefs = schema;",
        "  resolvers = getResolvers(this);",
        "  additionalContextFields = {};",
        '  callbackPath = this.path.replace(/\\/$/, "") + "/callback";',
        "  webhookPath;",
        "  constructor(args) {",
        "    super(args);",
        "    this.webhookPath = `${this.path}/webhook`;",
        "  }",
        "  async onSetup() {}",
        "  async onDisconnect() {}",
        "}",
      ].join("\n"),
    );
    const [ExampleSubgraph] = await new ImportPackageLoader().loadSubgraphs(
      root,
    );
    const harness = servingHarness({ path: "/api" });
    await initAndFlush(harness.manager);
    await register(
      harness.manager,
      ExampleSubgraph,
      "@acme/legacy-path",
      "graphql",
    );

    expect(
      await query(harness, "/api/graphql/example", "{ callback webhook }"),
    ).toEqual({
      data: { callback: "/api/callback", webhook: "/api/webhook" },
    });
  });

  it("gives this.path at construction to old-style classes only", () => {
    const harness = servingHarness({ path: "/api" });
    const args = { path: "/api", graphqlManager: harness.manager } as never;
    class OldStyle extends PublishedBaseSubgraph {
      seen = this.path;
    }
    class Named extends BaseSubgraph {
      static override readonly subgraphName = "named";
    }
    abstract class SharedBase extends BaseSubgraph {
      static override getSchema() {
        return [];
      }
    }
    class HalfMigrated extends SharedBase {}

    expect(new OldStyle(args).seen).toBe("/api");
    expect(
      [new Named(args), new HalfMigrated(args)].map(
        (instance) => "path" in instance,
      ),
    ).toEqual([false, false]);
  });

  it("refuses a class with no schema of either style, with the migration message", async () => {
    class Empty extends BaseSubgraph {}
    const { manager } = servingHarness({ path: "/api" });
    await initAndFlush(manager);

    expect(await rejection(() => manager.registerSubgraph(Empty))).toBe(
      "Empty has no static subgraphName. Shared bases belong outside subgraphs/ or must be extended by an exported subgraph. Old-style subgraphs (`name`/`typeDefs`/`resolvers`): run `ph migrate`.",
    );
  });

  it("prints a deprecation notice once per class", async () => {
    class LegacyDev extends PublishedBaseSubgraph {
      override name = "legacy-dev";
      override typeDefs = gql`
        type Query {
          ping: String
        }
      `;
    }
    const { manager } = servingHarness();
    await initAndFlush(manager);

    vi.stubEnv("NODE_ENV", "development");
    await register(manager, LegacyDev);
    await register(manager, LegacyDev);

    expect(noticesFor("LegacyDev")).toEqual([
      "LegacyDev is an old-style subgraph: it declares name, typeDefs or resolvers instead of a static subgraphName and getSchema. This host serves it through a legacy adapter, which a later major release removes. Run `ph migrate` in its package to convert it.",
    ]);
  });

  it("prints the notice once per object-literal name, and names an anonymous class", async () => {
    const { manager } = servingHarness();
    await initAndFlush(manager);
    const literal = () => ({
      name: "legacy-reloaded",
      typeDefs: gql`
        type Query {
          ping: String
        }
      `,
      resolvers: { Query: { ping: () => "pong" } },
    });
    const Anonymous = [
      class extends PublishedBaseSubgraph {
        override name = "legacy-anonymous";
        override typeDefs = gql`
          type Query {
            pong: String
          }
        `;
      },
    ][0];

    vi.stubEnv("NODE_ENV", "development");
    for (const instance of [literal(), literal()]) {
      await settle(
        manager.registerSubgraphInstance(instance as never, "", false),
      );
    }
    await register(manager, Anonymous);

    expect([
      ...noticesFor('The object-literal subgraph "legacy-reloaded"'),
      ...noticesFor("An anonymous subgraph class"),
    ]).toEqual([
      'The object-literal subgraph "legacy-reloaded" is an old-style subgraph: it declares name, typeDefs or resolvers instead of a static subgraphName and getSchema. This host serves it through a legacy adapter, which a later major release removes. Run `ph migrate` in its package to convert it.',
      "An anonymous subgraph class is an old-style subgraph: it declares name, typeDefs or resolvers instead of a static subgraphName and getSchema. This host serves it through a legacy adapter, which a later major release removes. Run `ph migrate` in its package to convert it.",
    ]);
  });

  it.each([
    ["unset", undefined, true],
    ["development", "development", true],
    ["test", "test", true],
    ["production", "production", false],
  ] as const)(
    "with NODE_ENV %s, prints the notice and checks getSchema determinism only in development or test",
    async (_, nodeEnv, development) => {
      vi.stubEnv("VITEST", undefined);
      vi.stubEnv("NODE_ENV", nodeEnv);
      class Legacy extends PublishedBaseSubgraph {
        override name = "legacy";
        override typeDefs = gql`
          type Query {
            ping: String
          }
        `;
      }
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
      const { manager } = servingHarness();
      await initAndFlush(manager);
      await register(manager, Legacy);

      expect({
        notices: noticesFor("Legacy").length,
        drifting: await rejection(() => register(manager, Drifting)),
      }).toEqual(
        development
          ? {
              notices: 1,
              drifting:
                "Drifting.getSchema is not deterministic: two calls returned different schemas.",
            }
          : { notices: 0, drifting: "accepted" },
      );
    },
  );
});

describe("across copies of @powerhousedao/reactor-api", () => {
  const PhoneNumber = defineScalar({
    name: "PhoneNumber",
    description: "An E.164 phone number.",
    representation: "string",
    validator: z.string().regex(/^\+[1-9]\d{1,14}$/),
    zodSource: "z.string().regex(/^\\+[1-9]\\d{1,14}$/)",
  });

  function directoryOn<B extends abstract new (args: SubgraphArgs) => object>(
    Base: B,
    subgraphName: string,
  ) {
    abstract class Directory extends (Base as unknown as typeof BaseSubgraph) {
      static override getSchema(schema: SchemaBuilder<BaseSubgraph>) {
        return [
          schema.query("echo", {
            args: { phone: PhoneNumber({ required: true }) },
            returns: PhoneNumber({ required: true }),
            resolve: ({ args }) => args.phone,
          }),
          schema.query("stored", {
            returns: PhoneNumber({ required: true }),
            resolve: () => "555-0123",
          }),
        ];
      }
    }
    return class extends Directory {
      static override readonly subgraphName = subgraphName;
    };
  }

  async function phoneResults(harness: Harness, path: string) {
    return {
      variable: await query(
        harness,
        path,
        "query ($p: PhoneNumber!) { echo(phone: $p) }",
        {
          p: "+14155550123",
        },
      ),
      badVariable: await query(
        harness,
        path,
        "query ($p: PhoneNumber!) { echo(phone: $p) }",
        {
          p: "555-0123",
        },
      ),
      literal: await query(harness, path, '{ echo(phone: "+14155550123") }'),
      badLiteral: await query(harness, path, '{ echo(phone: "555-0123") }'),
      output: await query(harness, path, "{ stored }"),
    };
  }

  it("registers and serves a class built on another copy's BaseSubgraph, with the same scalar coercion", async () => {
    expect(CopyBBaseSubgraph).not.toBe(BaseSubgraph);
    const FromCopyB = directoryOn(CopyBBaseSubgraph, "directory-b");
    const FromCopyA = directoryOn(BaseSubgraph, "directory-a");
    expect(FromCopyB.prototype).not.toBeInstanceOf(BaseSubgraph);
    const harness = servingHarness();
    await initAndFlush(harness.manager);
    await register(harness.manager, FromCopyB);
    await register(harness.manager, FromCopyA);

    const fromB = await phoneResults(harness, "/directory-b");
    expect(fromB.variable).toEqual({ data: { echo: "+14155550123" } });
    expect(fromB.literal).toEqual({ data: { echo: "+14155550123" } });
    for (const refused of [fromB.badVariable, fromB.badLiteral, fromB.output]) {
      expect(refused.errors?.map((error) => error.message)).toEqual([
        expect.stringContaining("PhoneNumber cannot represent this value"),
      ]);
    }
    expect(fromB).toEqual(await phoneResults(harness, "/directory-a"));
  });

  it("serves a class written only against the protocol contract, with its scalar coercion", async () => {
    const seen: unknown[] = [];
    class ContractOnly {
      static readonly subgraphName = "contract-only";
      static [SUBGRAPH_PROTOCOL]() {
        return {
          version: 1,
          describe: () => ({
            subgraphName: "contract-only",
            definition: {},
            typeDefs: parse(
              "scalar Shout type Query { shout(word: Shout!): Shout! }",
            ),
            hasSubscriptions: false,
            diagnostics: [],
            scalarDefinitions: [],
          }),
          bind: () => ({
            resolvers: {
              Query: {
                shout: (_: unknown, { word }: { word: string }) => {
                  seen.push(word);
                  return word;
                },
              },
            },
            scalarCoercions: [
              {
                name: "Shout",
                serialize: (value: unknown) => String(value).toUpperCase(),
                parseValue: (value: unknown) => String(value).toLowerCase(),
                parseLiteral: (node: GraphQL.ValueNode) =>
                  node.kind === Kind.STRING ? node.value.toLowerCase() : null,
              },
            ],
          }),
        };
      }
      constructor(readonly args: SubgraphArgs) {}
    }
    const harness = servingHarness();
    await initAndFlush(harness.manager);
    await register(harness.manager, ContractOnly);

    expect(
      await query(
        harness,
        "/contract-only",
        "query ($w: Shout!) { shout(word: $w) }",
        {
          w: "Hey",
        },
      ),
    ).toEqual({ data: { shout: "HEY" } });
    expect(
      await query(harness, "/contract-only", '{ shout(word: "Ho") }'),
    ).toEqual({ data: { shout: "HO" } });
    expect(seen).toEqual(["hey", "ho"]);
  });

  it("serves a class from an older copy, which has no protocol, through the legacy adapter with the development notice", async () => {
    const OlderBaseSubgraph = (() => {
      class BaseSubgraph {
        name = "example";
        path: string | undefined;
        typeDefs = gql`
          type Query {
            hello: String
          }
        `;
        resolvers: Record<string, unknown> = {
          Query: { hello: () => "world" },
        };
        hasSubscriptions = false;
        constructor(args: SubgraphArgs & { path?: string }) {
          this.path = args.path;
        }
        async onSetup() {}
        async onDisconnect() {}
      }
      return BaseSubgraph;
    })();
    class OlderCopyGreeter extends OlderBaseSubgraph {
      override name = "older-greeter";
      override typeDefs = gql`
        type Query {
          greet: String
        }
      `;
      override resolvers = { Query: { greet: () => "hi from an older copy" } };
    }
    expect(extractSubgraphs({ OlderCopyGreeter })).toEqual([OlderCopyGreeter]);
    vi.stubEnv("NODE_ENV", "development");
    const harness = servingHarness();
    await initAndFlush(harness.manager);
    const registered = await register(
      harness.manager,
      OlderCopyGreeter,
      "@acme/older",
    );

    expect(await query(harness, "/older-greeter", "{ greet }")).toEqual({
      data: { greet: "hi from an older copy" },
    });
    expect((registered as { path?: string } | undefined)?.path).toBe("/");
    expect(noticesFor("OlderCopyGreeter")).toHaveLength(1);
  });
});

describe("tooling and the host", () => {
  const SUBGRAPHS = "./subgraphs/index.ts" as const;

  const toolingRead = (subgraphClass: { readonly name: string }) =>
    readSubgraphEntries([
      {
        specifier: SUBGRAPHS,
        namespace: { [subgraphClass.name]: subgraphClass },
      },
    ]);

  const fieldsIn = (verdict: string): readonly string[] => {
    if (verdict === "accepted") return [];
    const named = /the old-style fields? (.+), which the host/.exec(verdict);
    return named ? named[1].split(", ") : [verdict];
  };

  abstract class Pinging extends PublishedBaseSubgraph {
    static override getSchema(schema: SchemaBuilder<BaseSubgraph>) {
      return [
        schema.query("ping", { returns: ph.String(), resolve: () => "pong" }),
      ];
    }
  }
  const typeDefs = gql`
    type Query {
      old: String
    }
  `;

  it("agree on which old-style fields a class with a static subgraphName has", async () => {
    class FieldInit extends Pinging {
      static override readonly subgraphName = "field-init";
      override name = "old";
    }
    class Bracket extends Pinging {
      static override readonly subgraphName = "bracket";
      constructor(args: SubgraphArgs) {
        super(args);
        this["path"] = "/old";
      }
    }
    class AssignedInConstructor extends Pinging {
      static override readonly subgraphName = "assigned-in-constructor";
      constructor(args: SubgraphArgs) {
        super(args);
        Object.assign(this, { typeDefs });
      }
    }
    class AssignedInSetup extends Pinging {
      static override readonly subgraphName = "assigned-in-setup";
      override onSetup() {
        Object.assign(this, { resolvers: {} });
        return super.onSetup();
      }
    }
    class ArrowInConstructor extends Pinging {
      static override readonly subgraphName = "arrow-in-constructor";
      constructor(args: SubgraphArgs) {
        super(args);
        const subscribe = () => {
          this.hasSubscriptions = true;
        };
        subscribe();
      }
    }
    class Defined extends Pinging {
      static override readonly subgraphName = "defined";
      constructor(args: SubgraphArgs) {
        super(args);
        Object.defineProperty(this, "name", { value: "old" });
      }
    }
    class CompoundInSetup extends Pinging {
      static override readonly subgraphName = "compound-in-setup";
      override onSetup() {
        this.path ??= "/old";
        return super.onSetup();
      }
    }
    class MethodFromSetup extends Pinging {
      static override readonly subgraphName = "method-from-setup";
      reset() {
        this.typeDefs = typeDefs;
      }
      override onSetup() {
        this.reset();
        return super.onSetup();
      }
    }
    class HelperObject extends Pinging {
      static override readonly subgraphName = "helper-object";
      cursor() {
        return {
          path: "",
          go(path: string) {
            this.path = path;
          },
        };
      }
      override onSetup() {
        this.cursor().go("/elsewhere");
        return super.onSetup();
      }
    }
    class StaticWrites extends Pinging {
      static override readonly subgraphName = "static-writes";
      static path = "";
      static {
        this.path = "/static";
      }
      static reset() {
        this.path = "/reset";
      }
      override onSetup() {
        StaticWrites.reset();
        return super.onSetup();
      }
    }
    class NestedScopes extends Pinging {
      static override readonly subgraphName = "nested-scopes";
      override onSetup() {
        function Row(this: { name?: string }) {
          this.name = "row";
        }
        class Cell {
          typeDefs = typeDefs;
        }
        const other: { path?: string } = {};
        Object.assign(other, { path: "/other" });
        Reflect.construct(Row, []);
        new Cell();
        return super.onSetup();
      }
    }
    class PrivatePath extends Pinging {
      static override readonly subgraphName = "private-path";
      #path = "/private";
      get where() {
        return this.#path;
      }
    }
    const { manager } = servingHarness();
    await initAndFlush(manager);

    const verdicts: [string, readonly string[], readonly string[]][] = [];
    for (const subgraphClass of [
      FieldInit,
      Bracket,
      AssignedInConstructor,
      AssignedInSetup,
      ArrowInConstructor,
      Defined,
      CompoundInSetup,
      MethodFromSetup,
      HelperObject,
      StaticWrites,
      NestedScopes,
      PrivatePath,
    ]) {
      const tooling =
        toolingRead(subgraphClass).diagnostics[0]?.message ?? "accepted";
      const host = await rejection(() =>
        manager.registerSubgraph(subgraphClass as never),
      );
      verdicts.push([subgraphClass.name, fieldsIn(tooling), fieldsIn(host)]);
    }

    expect(verdicts).toEqual([
      ["FieldInit", ["name"], ["name"]],
      ["Bracket", ["path"], ["path"]],
      ["AssignedInConstructor", ["typeDefs"], ["typeDefs"]],
      ["AssignedInSetup", ["resolvers"], ["resolvers"]],
      ["ArrowInConstructor", ["hasSubscriptions"], ["hasSubscriptions"]],
      ["Defined", ["name"], ["name"]],
      ["CompoundInSetup", ["path"], ["path"]],
      ["MethodFromSetup", ["typeDefs"], ["typeDefs"]],
      ["HelperObject", [], []],
      ["StaticWrites", [], []],
      ["NestedScopes", [], []],
      ["PrivatePath", [], []],
    ]);
  });

  it.each([
    ["production", 1],
    ["development", 2],
  ] as const)(
    "with NODE_ENV %s, a host compiles a class with %i evaluations, and tooling checks it with at most one more",
    (nodeEnv, served) => {
      vi.stubEnv("NODE_ENV", nodeEnv);
      let evaluations = 0;
      class Counted extends BaseSubgraph {
        static override readonly subgraphName = "counted";
        static override getSchema(schema: SchemaBuilder<Counted>) {
          evaluations += 1;
          return [
            schema.query("ping", {
              returns: ph.String(),
              resolve: () => "pong",
            }),
          ];
        }
      }

      const description = describeSubgraphClass(Counted)?.description;
      const afterServing = evaluations;
      const reads = [toolingRead(Counted), toolingRead(Counted)];

      expect([afterServing, evaluations]).toEqual([served, 2]);
      expect(reads.map((read) => read.diagnostics)).toEqual([[], []]);
      expect(reads[0].subgraphs[0].description).toEqual(description);
      expect(describeSubgraphClass(Counted)?.description).toBe(description);
    },
  );

  it("keeps serving a class a production host compiled when tooling's check of it fails, and checks it again on the next read", () => {
    vi.stubEnv("NODE_ENV", "production");
    let evaluations = 0;
    class Drifting extends BaseSubgraph {
      static override readonly subgraphName = "drifting";
      static override getSchema(schema: SchemaBuilder<Drifting>) {
        evaluations += 1;
        return [
          schema.query(`field${evaluations}`, {
            returns: ph.String(),
            resolve: () => "x",
          }),
        ];
      }
    }

    const description = describeSubgraphClass(Drifting)?.description;
    const reads = [toolingRead(Drifting), toolingRead(Drifting)];

    expect(
      reads.map((read) => read.diagnostics.map(({ message }) => message)),
    ).toEqual([
      [
        "Drifting.getSchema is not deterministic: two calls returned different schemas.",
      ],
      [
        "Drifting.getSchema is not deterministic: two calls returned different schemas.",
      ],
    ]);
    expect(evaluations).toBe(3);
    expect(describeSubgraphClass(Drifting)?.description).toBe(description);
  });

  it("refuses a drifting getSchema in tooling whatever NODE_ENV is, while a production host serves it", () => {
    vi.stubEnv("NODE_ENV", "production");
    const drifting = (subgraphName: string) => {
      let calls = 0;
      return class Drifting extends BaseSubgraph {
        static override readonly subgraphName = subgraphName;
        static override getSchema(schema: SchemaBuilder<Drifting>) {
          calls += 1;
          return [
            schema.query(`field${calls}`, {
              returns: ph.String(),
              resolve: () => "x",
            }),
          ];
        }
      };
    };
    const ReadFirst = drifting("read-first");
    const ServedFirst = drifting("served-first");

    const served = describeSubgraphClass(ServedFirst)?.description.subgraphName;

    expect(served).toBe("served-first");
    expect(
      [ReadFirst, ServedFirst].map((subgraphClass) =>
        toolingRead(subgraphClass).diagnostics.map(({ message }) => message),
      ),
    ).toEqual([
      [
        "Drifting.getSchema is not deterministic: two calls returned different schemas.",
      ],
      [
        "Drifting.getSchema is not deterministic: two calls returned different schemas.",
      ],
    ]);
  });
});
