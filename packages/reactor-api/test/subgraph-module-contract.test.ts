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
 *
 * Generator half of the contract: codegen emits
 *   export * as <ClassName> from "./<dir>/index.js";
 * (`makeSubgraphsIndexFile`), pinned by
 * packages/codegen/src/file-builders/subgraphs.test.ts. The "generated
 * aggregate" fixture and the composed vite test below encode exactly that
 * shape; if the emitted shape changes, both files change in the same commit.
 */
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ph } from "document-model";
import type { ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { BaseSubgraph } from "../src/graphql/base-subgraph.js";
import { defineSubgraph } from "../src/graphql/define-subgraph.js";
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

// Subgraph classes extending the host's own BaseSubgraph: the identity path.
class StatementsSubgraph extends BaseSubgraph {}
class LedgerSubgraph extends BaseSubgraph {}

const TasksSubgraph = defineSubgraph({
  name: "tasks",
  schemaKind: "typed",
  entries: (build) => [
    build.query("ping", {
      returns: ph.String({ required: true }),
      resolve: () => "pong",
    }),
  ],
});

// A different copy of the base class with the same name: what a project
// served by the vite dev server produces when it resolves reactor-api from
// its own node_modules. Accepted through the name fallback.
class ForeignBase {}
Object.defineProperty(ForeignBase, "name", { value: "BaseSubgraph" });
class ForeignCopySubgraph extends ForeignBase {}

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
    // The shape codegen's makeSubgraphsIndexFile emits — see the header
    // comment and packages/codegen/src/file-builders/subgraphs.test.ts.
    name: "generated aggregate: namespace aliased to the class name",
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
    // The ordinary re-export the old vite rule also dropped.
    name: "direct named re-export of the class",
    module: { StatementsSubgraph },
    expected: [StatementsSubgraph],
  },
  {
    name: "code-first namespace under an arbitrary alias",
    module: { tasks: { TasksSubgraph } },
    expected: [TasksSubgraph],
  },
  {
    name: "code-first direct named export beside a schema-first one",
    module: { TasksSubgraph, StatementsSubgraph },
    expected: [TasksSubgraph, StatementsSubgraph],
  },
  {
    name: "code-first direct export under a different key",
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
    name: "code-first default export",
    module: { default: TasksSubgraph },
    expected: [TasksSubgraph],
  },
  {
    name: "default-exported object mixing code-first and schema-first",
    module: { default: { TasksSubgraph, StatementsSubgraph } },
    expected: [TasksSubgraph, StatementsSubgraph],
  },
  {
    name: "class extending a package-local copy of BaseSubgraph",
    module: { ForeignCopySubgraph: { ForeignCopySubgraph } },
    expected: [ForeignCopySubgraph],
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
    name: "code-first class as named export, in a namespace and in a default object: once",
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
    name: "junk exports: constants, helpers, unrelated classes, the base class and the factory",
    module: {
      BaseSubgraph,
      defineSubgraph,
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

  it("returns a package's subgraphs in export-name order, however the loader built the namespace", () => {
    class Zebra extends BaseSubgraph {}
    class Apple extends BaseSubgraph {}
    class Mango extends BaseSubgraph {}
    // Vite's SSR loader keeps statement order; native ESM sorts export names.
    const statementOrder = {
      ZebraSubgraph: { Zebra },
      AppleSubgraph: { Mango, Apple },
    };
    const nativeOrder = {
      AppleSubgraph: { Apple, Mango },
      ZebraSubgraph: { Zebra },
    };

    expect(extractSubgraphs(statementOrder)).toEqual([Apple, Mango, Zebra]);
    expect(extractSubgraphs(nativeOrder)).toEqual([Apple, Mango, Zebra]);
  });

  it("accepts a code-first class by ancestry, not by its class name", () => {
    expect(TasksSubgraph.name).toBe("CodeFirstSubgraph");
    expect(isSubgraphClass(TasksSubgraph)).toBe(true);
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

// The composed half: a real vite dev server over a real project tree whose
// subgraphs/index.ts carries the generated shape plus the two hand-written
// forms, with the project's own copy of the base class — the exact local-dev
// setup the bug report came from. This is the one place the synthetic
// namespaces above are checked against what ssrLoadModule actually produces.
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
        'export * as StatementsSubgraph from "./statements/index.js";',
        // The two hand-written shapes the old rule silently dropped.
        'export * as ledger from "./ledger/index.js";',
        'export { DirectSubgraph } from "./direct/index.js";',
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
