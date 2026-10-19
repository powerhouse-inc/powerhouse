/**
 * One contract, one fixture table (testing policy R6): three package loaders
 * consume the same `subgraphs/index` module, and each used to apply its own
 * acceptance rule — the vite loader required a namespace alias equal to the
 * class name inside it, the http loader took any function one level deep,
 * and the import loader took every nested value. An export shape could work
 * when published and silently register nothing in local dev, or vice versa
 * (docs/bugs: codegen-does-not-register-subgraphs).
 *
 * The unified rule (`extractSubgraphs`): accept any export that passes
 * `isSubgraphClass` — the export itself, or any value of an exported object
 * (namespace under any alias, default-nested) — and reject everything else.
 * The table below runs against the shared predicate and against each
 * loader's own extraction path.
 */
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { ILogger } from "document-model";
import type { ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { BaseSubgraph } from "../src/graphql/base-subgraph.js";
import { SUBGRAPH_PROTOCOL } from "../src/graphql/subgraph-protocol.js";
import type { SubgraphClass } from "../src/graphql/types.js";
import { isSubgraphClass } from "../src/graphql/utils.js";
import { extractSubgraphsFromModule } from "../src/packages/http-loader.js";
import { ImportPackageLoader } from "../src/packages/import-loader.js";
import { extractSubgraphs } from "../src/packages/subgraph-extraction.js";
import type * as UtilModule from "../src/packages/util.js";
import {
  VitePackageLoader,
  startViteServer,
} from "../src/packages/vite-loader.mjs";
import { makeHarnessLogger } from "./utils/graphql-manager-harness.js";
import { sdlBase } from "./utils/sdl-base.js";

type SubgraphsExport = Record<string, Record<string, SubgraphClass>>;

const utilMocks = vi.hoisted(() => ({
  loadSubgraphs:
    vi.fn<(packageName: string) => Promise<SubgraphsExport | null>>(),
}));

// The import loader reaches its module namespace through `loadSubgraphs` in
// util.js (a real dynamic import of `<pkg>/subgraphs`). The table swaps that
// one seam for the fixture's namespace; everything downstream — the
// loader's extraction and logging — is real.
vi.mock("../src/packages/util.js", async (importOriginal) => {
  const actual = await importOriginal<typeof UtilModule>();
  return { ...actual, loadSubgraphs: utilMocks.loadSubgraphs };
});

class StatementsSubgraph extends BaseSubgraph {}
class LedgerSubgraph extends BaseSubgraph {}

class TasksSubgraph extends sdlBase("type Query { ping: String! }") {
  static override readonly subgraphName = "tasks";
}

// A different copy of the base class with the same name: what a project
// served by the vite dev server produces when it resolves reactor-api from
// its own node_modules. Accepted through the name fallback.
class ForeignBase {}
Object.defineProperty(ForeignBase, "name", { value: "BaseSubgraph" });
class ForeignCopySubgraph extends ForeignBase {}

class SubgraphRegistry {
  ForeignCopySubgraph = ForeignCopySubgraph;
  TasksSubgraph = TasksSubgraph;
}

const NamedLegacy = (() => {
  class BaseSubgraph extends ForeignBase {}
  return BaseSubgraph;
})();
const Framework = BaseSubgraph;
const NamedModern = (() => {
  class BaseSubgraph extends Framework {
    static override readonly subgraphName = "named-base";
  }
  return BaseSubgraph;
})();

// Junk the rule must reject: callables and classes that are not subgraphs.
class Unrelated {}
function helper(): number {
  return 1;
}
const arrow = (): number => 2;

type Fixture = {
  name: string;
  module: Record<string, unknown>;
  expected: unknown[];
};

const fixtures: Fixture[] = [
  {
    name: "published aggregate: namespace aliased to the class name",
    module: {
      StatementsSubgraph: { StatementsSubgraph },
      LedgerSubgraph: { LedgerSubgraph },
    },
    expected: [StatementsSubgraph, LedgerSubgraph],
  },
  {
    // The natural hand-written form the old vite rule silently dropped.
    name: "namespace under a lowercase folder alias",
    module: { statements: { StatementsSubgraph } },
    expected: [StatementsSubgraph],
  },
  {
    name: "generated barrel: direct named export of the class",
    module: { StatementsSubgraph },
    expected: [StatementsSubgraph],
  },
  {
    name: "class subgraph namespace under an arbitrary alias",
    module: { tasks: { TasksSubgraph } },
    expected: [TasksSubgraph],
  },
  {
    name: "class subgraph direct named export beside an old-style one",
    module: { TasksSubgraph, StatementsSubgraph },
    expected: [TasksSubgraph, StatementsSubgraph],
  },
  {
    name: "class subgraph direct export under a different key",
    module: { Renamed: TasksSubgraph },
    expected: [TasksSubgraph],
  },
  {
    name: "default export of the class",
    module: { default: StatementsSubgraph },
    expected: [StatementsSubgraph],
  },
  {
    name: "default-exported object of classes",
    module: { default: { StatementsSubgraph, LedgerSubgraph } },
    expected: [StatementsSubgraph, LedgerSubgraph],
  },
  {
    name: "class subgraph default export",
    module: { default: TasksSubgraph },
    expected: [TasksSubgraph],
  },
  {
    name: "default-exported object mixing class and old-style subgraphs",
    module: { default: { TasksSubgraph, StatementsSubgraph } },
    expected: [TasksSubgraph, StatementsSubgraph],
  },
  {
    name: "class extending a package-local copy of BaseSubgraph",
    module: { ForeignCopySubgraph: { ForeignCopySubgraph } },
    expected: [ForeignCopySubgraph],
  },
  {
    name: "class instance holding an old-style and a class subgraph",
    module: { registry: new SubgraphRegistry() },
    expected: [ForeignCopySubgraph, TasksSubgraph],
  },
  {
    name: "default-exported class instance holding subgraphs",
    module: { default: new SubgraphRegistry() },
    expected: [ForeignCopySubgraph, TasksSubgraph],
  },
  {
    name: "old-style and class subgraphs that are themselves named BaseSubgraph",
    module: { NamedLegacy, NamedModern },
    expected: [NamedLegacy, NamedModern],
  },
  {
    name: "same class reachable as named export and inside a namespace: once",
    module: {
      StatementsSubgraph,
      statements: { StatementsSubgraph },
    },
    expected: [StatementsSubgraph],
  },
  {
    name: "class subgraph as named export, in a namespace and in a default object: once",
    module: {
      TasksSubgraph,
      tasks: { TasksSubgraph },
      default: { TasksSubgraph },
    },
    expected: [TasksSubgraph],
  },
  {
    // What the banner-only template produces (the reported bug's input).
    name: "banner-only module: no exports",
    module: {},
    expected: [],
  },
  {
    name: "junk exports: constants, helpers, unrelated classes and the base class",
    module: {
      BaseSubgraph,
      VERSION: "1.0.0",
      config: { x: 1 },
      helper,
      arrow,
      Unrelated,
      nested: { helper, Unrelated, VALUE: 42 },
    },
    expected: [],
  },
  {
    name: "mixed namespace: the class registers, its neighbors do not",
    module: {
      statements: { StatementsSubgraph, SCHEMA_VERSION: 3, helper },
    },
    expected: [StatementsSubgraph],
  },
];

function names(subgraphs: readonly SubgraphClass[]): string[] {
  return subgraphs.map((s) => s.name).sort();
}

function classesSortedByName(subgraphs: readonly unknown[]): unknown[] {
  return [...(subgraphs as SubgraphClass[])].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

describe("the unified predicate (extractSubgraphs)", () => {
  it.each(fixtures)("$name", (fixture) => {
    expect(classesSortedByName(extractSubgraphs(fixture.module))).toEqual(
      classesSortedByName(fixture.expected),
    );
  });

  it("walks module namespaces in export-name order, however the loader built them", () => {
    class Zebra extends BaseSubgraph {}
    class Apple extends BaseSubgraph {}
    class Mango extends BaseSubgraph {}
    // Vite's SSR loader keeps statement order; native ESM sorts export names.
    const namespace = (entries: Record<string, unknown>) =>
      Object.freeze(
        Object.assign(Object.create(null) as object, entries, {
          [Symbol.toStringTag]: "Module",
        }),
      ) as Record<string, unknown>;
    const statementOrder = namespace({
      ZebraSubgraph: namespace({ Zebra }),
      AppleSubgraph: namespace({ Mango, Apple }),
    });
    const nativeOrder = namespace({
      AppleSubgraph: namespace({ Apple, Mango }),
      ZebraSubgraph: namespace({ Zebra }),
    });

    expect(extractSubgraphs(statementOrder)).toEqual([Apple, Mango, Zebra]);
    expect(extractSubgraphs(nativeOrder)).toEqual([Apple, Mango, Zebra]);
  });

  it("keeps the order of an exported array or plain object", () => {
    const classes = Array.from(
      { length: 12 },
      () => class extends BaseSubgraph {},
    );
    class Beta extends BaseSubgraph {}
    class Alpha extends BaseSubgraph {}

    expect(extractSubgraphs({ default: classes })).toEqual(classes);
    expect(extractSubgraphs({ default: { Beta, Alpha } })).toEqual([
      Beta,
      Alpha,
    ]);
  });

  it("accepts a class from another copy of reactor-api by its protocol, not by ancestry", () => {
    class OtherCopySubgraph {
      static readonly subgraphName = "other-copy";
      static [SUBGRAPH_PROTOCOL]() {
        return { version: 1 };
      }
    }
    expect(isSubgraphClass(OtherCopySubgraph)).toBe(true);
    expect(extractSubgraphs({ OtherCopySubgraph })).toEqual([
      OtherCopySubgraph,
    ]);
  });
});

describe("a nameless class among the exports", () => {
  abstract class SharedBase extends sdlBase("type Query { shared: String }") {}
  class Invoices extends SharedBase {
    static override readonly subgraphName = "invoices";
  }

  function logged(logger: ILogger): unknown[][] {
    return vi.mocked(logger.info).mock.calls;
  }

  it("is left out as a shared base when an exported subgraph extends it, and logged once per package", () => {
    const logger = makeHarnessLogger();
    const context = { packageName: "@acme/invoices", logger };
    expect(extractSubgraphs({ SharedBase, Invoices }, context)).toEqual([
      Invoices,
    ]);
    expect(extractSubgraphs({ SharedBase, Invoices }, context)).toEqual([
      Invoices,
    ]);
    expect(logged(logger)).toEqual([
      [
        "Treating @base in @package as a shared subgraph base: it has no static subgraphName, and @child extends it",
        "SharedBase",
        "@acme/invoices",
        "Invoices",
      ],
    ]);
  });

  it("does not make a named subgraph that another named subgraph extends a shared base", () => {
    class InvoicesV1 extends SharedBase {
      static override readonly subgraphName: string = "invoices";
    }
    class InvoicesV2 extends InvoicesV1 {
      static override readonly subgraphName = "invoices-v2";
    }
    const logger = makeHarnessLogger();

    expect(
      extractSubgraphs(
        { InvoicesV1, InvoicesV2 },
        { packageName: "@acme/invoices", logger },
      ),
    ).toEqual([InvoicesV1, InvoicesV2]);
    expect(logged(logger)).toEqual([]);
  });

  it("is classified after the export set is flattened, whichever export reaches the child", () => {
    expect(
      extractSubgraphs({ bases: { SharedBase }, default: { Invoices } }),
    ).toEqual([Invoices]);
    expect(extractSubgraphs({ SharedBase })).toEqual([SharedBase]);
  });

  it("is classified after nested namespaces and containers are flattened, at any depth and through cycles", () => {
    const cyclic: Record<string, unknown> = { Invoices };
    cyclic.self = cyclic;

    expect(
      extractSubgraphs({
        group: { definitions: { SharedBase }, subgraphs: [{ Invoices }] },
      }),
    ).toEqual([Invoices]);
    expect(
      extractSubgraphs({
        group: { deeper: { Invoices, SharedBase } },
        Invoices,
        again: [[Invoices]],
      }),
    ).toEqual([Invoices]);
    expect(extractSubgraphs({ cyclic, SharedBase })).toEqual([Invoices]);
  });

  it("keeps each level's export order when it flattens nested exports", () => {
    class Second extends sdlBase("type Query { second: String }") {
      static override readonly subgraphName = "second";
    }
    class First extends sdlBase("type Query { first: String }") {
      static override readonly subgraphName = "first";
    }

    expect(
      extractSubgraphs({ outer: { inner: { Second, First }, Invoices } }),
    ).toEqual([Second, First, Invoices]);
  });

  it("is a shared base only for a child whose own name is kebab-case", () => {
    class InvalidChild extends SharedBase {
      static override readonly subgraphName = "Invalid";
    }

    expect(extractSubgraphs({ SharedBase, InvalidChild })).toEqual([
      SharedBase,
      InvalidChild,
    ]);
  });

  it("is logged once per package for each distinct base class, even when two share a name", () => {
    const sharedBase = () =>
      class SharedBase extends sdlBase("type Query { shared: String }") {};
    const One = sharedBase();
    const Two = sharedBase();
    class ChildOne extends One {
      static override readonly subgraphName = "child-one";
    }
    class ChildTwo extends Two {
      static override readonly subgraphName = "child-two";
    }
    const logger = makeHarnessLogger();
    const exports = { One, Two, ChildOne, ChildTwo };

    expect(
      extractSubgraphs(exports, { packageName: "@acme/twins", logger }),
    ).toEqual([ChildOne, ChildTwo]);
    extractSubgraphs(exports, { packageName: "@acme/twins", logger });
    extractSubgraphs({ One, ChildOne }, { packageName: "@acme/other", logger });

    expect(
      logged(logger).map(([, base, packageName, child]) => [
        base,
        packageName,
        child,
      ]),
    ).toEqual([
      ["SharedBase", "@acme/twins", "ChildOne"],
      ["SharedBase", "@acme/twins", "ChildTwo"],
      ["SharedBase", "@acme/other", "ChildOne"],
    ]);
  });

  it("is kept for registration to decide when no exported subgraph extends it", () => {
    abstract class Unused extends sdlBase("type Query { unused: String }") {}
    expect(extractSubgraphs({ Unused, Invoices })).toEqual([Unused, Invoices]);
  });
});

describe("the http loader's extraction (extractSubgraphsFromModule)", () => {
  it.each(fixtures)("$name", (fixture) => {
    const module = fixture.module as Record<
      string,
      Record<string, SubgraphClass>
    >;
    expect(classesSortedByName(extractSubgraphsFromModule(module))).toEqual(
      classesSortedByName(fixture.expected),
    );
  });
});

describe("the import loader (ImportPackageLoader.loadSubgraphs)", () => {
  it.each(fixtures)("$name", async (fixture) => {
    utilMocks.loadSubgraphs.mockResolvedValueOnce(
      fixture.module as SubgraphsExport,
    );
    const loader = new ImportPackageLoader();
    expect(
      classesSortedByName(await loader.loadSubgraphs("@acme/fixture")),
    ).toEqual(classesSortedByName(fixture.expected));
  });
});

describe("the vite loader (VitePackageLoader.loadSubgraphs)", () => {
  // The loader takes the dev server as a constructor dependency; this stand-in
  // answers resolution and module loading with the fixture's namespace, so the
  // loader's own path — resolve, load, extract, log — runs unmodified.
  function fakeVite(namespace: Record<string, unknown>): ViteDevServer {
    return {
      config: { resolve: { alias: [] } },
      environments: {
        ssr: {
          pluginContainer: {
            resolveId: () =>
              Promise.resolve({ id: "\0fixture-subgraphs", external: false }),
          },
        },
      },
      ssrLoadModule: () => Promise.resolve(namespace),
    } as unknown as ViteDevServer;
  }

  it.each(fixtures)("$name", async (fixture) => {
    const loader = VitePackageLoader.build(fakeVite(fixture.module));
    const loaded = await loader.loadSubgraphs(resolve("/acme-fixture"));
    expect(classesSortedByName(loaded)).toEqual(
      classesSortedByName(fixture.expected),
    );
  });
});

describe("VitePackageLoader against a real project tree", () => {
  let root = "";
  let vite: ViteDevServer;

  beforeAll(async () => {
    // realpath: on Windows tmpdir() is an 8.3 short path, and watching one
    // aborts the process from libuv's uv__relative_path assertion.
    root = await realpath(
      await mkdtemp(join(tmpdir(), "vite-loader-subgraphs-")),
    );
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({
        name: "@acme/subgraph-project",
        version: "1.0.0",
        type: "module",
      }),
    );
    await mkdir(join(root, "subgraphs"), { recursive: true });
    await writeFile(
      join(root, "subgraphs", "base.ts"),
      // A stand-in for the project's own resolution of reactor-api's
      // BaseSubgraph: a different class instance under the same name.
      "export class BaseSubgraph {}\n",
    );
    const subgraph = (className: string) =>
      `import { BaseSubgraph } from "../base.js";\nexport class ${className} extends BaseSubgraph {}\n`;
    for (const [dir, className] of [
      ["statements", "StatementsSubgraph"],
      ["ledger", "LedgerSubgraph"],
      ["direct", "DirectSubgraph"],
    ] as const) {
      await mkdir(join(root, "subgraphs", dir), { recursive: true });
      await writeFile(
        join(root, "subgraphs", dir, "index.ts"),
        subgraph(className),
      );
    }
    await writeFile(
      join(root, "subgraphs", "index.ts"),
      [
        "/**",
        " * WARNING: DO NOT EDIT",
        " * This file is auto-generated and updated by codegen",
        " */",
        // The generated shape (makeSubgraphsIndexFile).
        'import { StatementsSubgraph } from "./statements/index.js";',
        "export { StatementsSubgraph };",
        'export * as DirectSubgraph from "./direct/index.js";',
        'export * as ledger from "./ledger/index.js";',
        // Junk that must not register.
        "export const notASubgraph = 42;",
        "",
      ].join("\n"),
    );
    vite = await startViteServer(root);
  }, 60_000);

  afterAll(async () => {
    await vite.close();
    await rm(root, { recursive: true, force: true });
  });

  it("loads all three export shapes and drops the junk", async () => {
    const loader = VitePackageLoader.build(vite);
    const loaded = await loader.loadSubgraphs(root);
    expect(names(loaded)).toEqual([
      "DirectSubgraph",
      "LedgerSubgraph",
      "StatementsSubgraph",
    ]);
  }, 60_000);
});
