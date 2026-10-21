import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  FIXTURE_PACKAGE_NAME,
  materializeLoaderPackage,
  observedModels,
  type MaterializedPackage,
} from "../../document-model/test/fixtures/loaders/materialize.js";
import { SUBGRAPH_PROTOCOL } from "../src/graphql/subgraph-protocol.js";
import type { SubgraphClass } from "../src/graphql/types.js";
import type { DocumentModelSubgraph } from "../src/graphql/document-model-subgraph.js";
import { asSchemaFirst, reactorClientFor } from "./utils/graphql-host.js";
import { HttpPackageLoader } from "../src/packages/http-loader.js";
import { ImportPackageLoader } from "../src/packages/import-loader.js";
import { VitePackageLoader } from "../src/packages/vite-loader.mjs";
import {
  initAndFlush,
  makeDriveModule,
  makeHarness,
  makeMockReactorClient,
} from "./utils/graphql-manager-harness.js";

/**
 * Each server-side loader accepts a code-first package and observes the same
 * models as for the schema-first package it replaces. The loaders differ in
 * subpath, export filtering, and version choice, and this file pins those
 * differences. The fixture is a real package on disk because each loader
 * resolves files.
 */

let fixture: MaterializedPackage;
let vite: ViteDevServer;

beforeAll(async () => {
  fixture = materializeLoaderPackage();
  vite = await createServer({
    root: fixture.root,
    logLevel: "silent",
    server: { hmr: false, middlewareMode: true },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
});

afterAll(async () => {
  await vite.close();
  fixture.dispose();
});

function models(loaded: readonly DocumentModelModule[]) {
  return loaded.filter((module) => module.documentModel !== null);
}

describe("Node / server import", () => {
  const loader = new ImportPackageLoader();

  it("reads the document-model subpath and keeps only a non-null documentModel", async () => {
    const loaded = await loader.loadDocumentModels(fixture.root);
    expect(
      observedModels(models(loaded)).map((entry) => [entry.id, entry.version]),
    ).toEqual([
      ["test/ledger", 1],
      ["test/ledger", 2],
    ]);
    expect(loaded).toHaveLength(2);
  });

  it("observes the same thing for the schema-first package", async () => {
    const codeFirst = await loader.loadDocumentModels(fixture.root);
    const schemaFirst = await loader.loadDocumentModels(
      fixture.schemaFirstRoot,
    );
    expect(observedModels(models(codeFirst))).toEqual(
      observedModels(models(schemaFirst)),
    );
    expect(codeFirst).toHaveLength(schemaFirst.length);
    // The only difference a caller sees is the `definition` property.
    expect(models(codeFirst).every((m) => "definition" in m)).toBe(true);
    expect(models(schemaFirst).some((m) => "definition" in m)).toBe(false);
  });

  it("resolves the manifest subpath without an editor", async () => {
    const manifests = await loader.loadUpgradeManifests(fixture.root);
    expect(
      manifests.map((manifest) => [
        manifest.documentType,
        [...manifest.supportedVersions],
      ]),
    ).toEqual([["test/ledger", [1, 2]]]);
    // The two packages compile the same declaration separately, so their
    // upgrade reducers are different function objects. The comparison uses
    // what a caller reads instead of identity.
    const described = (entries: readonly unknown[]) =>
      entries.map((entry) => {
        const manifest = entry as {
          documentType: string;
          latestVersion: number;
          supportedVersions: readonly number[];
          upgrades: Record<string, unknown>;
        };
        return {
          documentType: manifest.documentType,
          latestVersion: manifest.latestVersion,
          supportedVersions: [...manifest.supportedVersions],
          upgrades: Object.keys(manifest.upgrades).sort(),
        };
      });
    expect(
      described(await loader.loadUpgradeManifests(fixture.schemaFirstRoot)),
    ).toEqual(described(manifests));
  });
});

describe("HTTP / CDN", () => {
  it("reads the node model subpath and keeps only a non-null documentModel", async () => {
    const loader = new HttpPackageLoader({
      registryUrl: fixture.registryUrl,
    } as never);
    const loaded = await loader.loadDocumentModels(FIXTURE_PACKAGE_NAME);
    expect(
      observedModels(models(loaded)).map((entry) => [entry.id, entry.version]),
    ).toEqual([
      ["test/ledger", 1],
      ["test/ledger", 2],
    ]);
    expect(loaded).toHaveLength(2);
  });

  it("loads the upgrade manifests from the same subpath", async () => {
    const loader = new HttpPackageLoader({
      registryUrl: fixture.registryUrl,
    } as never);
    const manifests = await loader.loadUpgradeManifests(FIXTURE_PACKAGE_NAME);
    expect(manifests.map((manifest) => manifest.documentType)).toEqual([
      "test/ledger",
    ]);
  });
});

describe("Vite / local source", () => {
  it("reads model subpath exports and keeps only a non-null documentModel", async () => {
    const loader = VitePackageLoader.build(vite);
    const loaded = await loader.loadDocumentModels(fixture.root);
    expect(
      observedModels(models(loaded)).map((entry) => [entry.id, entry.version]),
    ).toEqual([
      ["test/ledger", 1],
      ["test/ledger", 2],
    ]);
    expect(loaded).toHaveLength(2);
    const schemaFirst = await loader.loadDocumentModels(
      fixture.schemaFirstRoot,
    );
    expect(observedModels(models(loaded))).toEqual(
      observedModels(models(schemaFirst)),
    );
  });

  it("keeps the manifest fallback subpath for a package that predates the aggregate index", async () => {
    const loader = VitePackageLoader.build(vite);
    expect(
      (await loader.loadUpgradeManifests(fixture.root)).map(
        (manifest) => manifest.documentType,
      ),
    ).toEqual(["test/ledger"]);
    expect(
      (await loader.loadUpgradeManifests(fixture.legacyRoot)).map(
        (manifest) => manifest.documentType,
      ),
    ).toEqual(["test/ledger"]);
  });
});

type Observed = { className: string; subgraphName: string | null };

function subgraphNameOf(value: SubgraphClass): string | null {
  return Object.hasOwn(value, "subgraphName")
    ? value[SUBGRAPH_PROTOCOL]().describe().subgraphName
    : null;
}

function observedSubgraphs(classes: readonly SubgraphClass[]): Observed[] {
  return classes
    .map((value) => ({
      className: value.name,
      subgraphName: subgraphNameOf(value),
    }))
    .sort(
      (left, right) =>
        left.className.localeCompare(right.className) ||
        String(left.subgraphName).localeCompare(String(right.subgraphName)),
    );
}

const SOURCES = {
  "base.ts": [
    'import { BaseSubgraph } from "@powerhousedao/reactor-api";',
    "export abstract class WidgetBase extends BaseSubgraph {}",
  ].join("\n"),
  "example.ts": [
    'import { ph } from "document-model";',
    'import { WidgetBase } from "./base.js";',
    'const Widget = ph.object("Widget", {',
    "  fields: { id: ph.OID({ required: true }), label: ph.String({ required: true }) },",
    "});",
    "export class ExampleSubgraph extends WidgetBase {",
    '  static subgraphName = "example";',
    "  static getSchema(schema) {",
    "    return [",
    '      schema.query("widget", {',
    "        args: { id: ph.OID({ required: true }) },",
    "        returns: ph.ref(Widget),",
    '        resolve: ({ args }) => ({ id: String(args.id), label: "One" }),',
    "      }),",
    "    ];",
    "  }",
    "}",
  ].join("\n"),
  "notes.ts": [
    'import { BaseSubgraph } from "@powerhousedao/reactor-api";',
    "export class NotesSubgraph extends BaseSubgraph {",
    '  name = "notes";',
    "}",
  ].join("\n"),
  "group.ts": [
    'export * as bases from "./base.js";',
    'export * as definitions from "./example.js";',
  ].join("\n"),
  "cycle.ts": [
    'export * as self from "./cycle.js";',
    'export * as group from "./group.js";',
    'export * as legacy from "./notes.js";',
  ].join("\n"),
};

const example: Observed = {
  className: "ExampleSubgraph",
  subgraphName: "example",
};
const notes: Observed = { className: "NotesSubgraph", subgraphName: null };

type ExportForm = {
  form: string;
  variantIndex: string;
  expected: Observed[];
  sharedBase?: true;
};

const forms: ExportForm[] = [
  {
    form: "generated",
    variantIndex: [
      'export * as ExampleSubgraph from "../../sources/example.js";',
      'export * as NotesSubgraph from "../../sources/notes.js";',
    ].join("\n"),
    expected: [example, notes],
  },
  {
    form: "namespace-alias",
    variantIndex: [
      'export * as tasks from "../../sources/example.js";',
      'export * as legacy from "../../sources/notes.js";',
    ].join("\n"),
    expected: [example, notes],
  },
  {
    form: "direct-renamed",
    variantIndex: [
      'export { ExampleSubgraph as TasksSubgraph } from "../../sources/example.js";',
      'export { NotesSubgraph } from "../../sources/notes.js";',
    ].join("\n"),
    expected: [example, notes],
  },
  {
    form: "default-class",
    variantIndex: [
      'export { ExampleSubgraph as default } from "../../sources/example.js";',
      'export { NotesSubgraph } from "../../sources/notes.js";',
    ].join("\n"),
    expected: [example, notes],
  },
  {
    form: "default-object",
    variantIndex: [
      'import { ExampleSubgraph } from "../../sources/example.js";',
      'import { NotesSubgraph } from "../../sources/notes.js";',
      "export default { ExampleSubgraph, NotesSubgraph };",
    ].join("\n"),
    expected: [example, notes],
  },
  {
    form: "several-paths",
    variantIndex: [
      'import { ExampleSubgraph } from "../../sources/example.js";',
      'import { NotesSubgraph } from "../../sources/notes.js";',
      'export * as tasks from "../../sources/example.js";',
      'export * as legacy from "../../sources/notes.js";',
      "export { ExampleSubgraph, NotesSubgraph };",
      "export default { ExampleSubgraph, NotesSubgraph };",
    ].join("\n"),
    expected: [example, notes],
  },
  {
    form: "statement-order",
    variantIndex: [
      'export * as Zebra from "../../sources/example.js";',
      'export { NotesSubgraph as AppleSubgraph } from "../../sources/notes.js";',
    ].join("\n"),
    expected: [example, notes],
  },
  {
    form: "shared-base-exported",
    variantIndex: [
      'export * as bases from "../../sources/base.js";',
      'export * as ExampleSubgraph from "../../sources/example.js";',
    ].join("\n"),
    expected: [example],
    sharedBase: true,
  },
  {
    form: "nested-namespaces",
    variantIndex: 'export * as group from "../../sources/group.js";',
    expected: [example],
    sharedBase: true,
  },
  {
    form: "cyclic-namespace",
    variantIndex: [
      'export * as cycle from "../../sources/cycle.js";',
      'export { ExampleSubgraph } from "../../sources/example.js";',
    ].join("\n"),
    expected: [example, notes],
    sharedBase: true,
  },
  {
    form: "unrelated-exports",
    variantIndex: [
      'export * as tasks from "../../sources/example.js";',
      'export const VERSION = "1.0.0";',
      "export function helper() { return 1; }",
      "export class Unrelated {}",
      "export const config = { helper, Unrelated, retries: 3 };",
      'export { BaseSubgraph } from "@powerhousedao/reactor-api";',
    ].join("\n"),
    expected: [example],
  },
];

type Variant = { root: string; packageName: string };

function variantOf({ form }: ExportForm): Variant {
  return {
    root: join(fixture.root, "variants", form),
    packageName: `${FIXTURE_PACKAGE_NAME}-${form}`,
  };
}

const loaders: {
  loader: string;
  tag: string;
  identifier(variant: Variant): string;
  load(variant: Variant): Promise<SubgraphClass[]>;
}[] = [
  {
    loader: "Node / server import",
    tag: "[reactor-api][import-loader]",
    identifier: ({ root }) => root,
    load: ({ root }) => new ImportPackageLoader().loadSubgraphs(root),
  },
  {
    loader: "HTTP / CDN",
    tag: "[reactor-api][http-loader]",
    identifier: ({ packageName }) => packageName,
    load: ({ packageName }) =>
      new HttpPackageLoader({
        registryUrl: fixture.registryUrl,
      } as never).loadSubgraphs(packageName),
  },
  {
    loader: "Vite / local source",
    tag: "[reactor-api][vite-loader]",
    identifier: ({ root }) => root,
    load: ({ root }) => VitePackageLoader.build(vite).loadSubgraphs(root),
  },
];

function sharedBaseNotices(info: { mock: { calls: unknown[][] } }): string[] {
  return info.mock.calls
    .map(([line]) => String(line).replace(/^\[[^\]]+\] /, ""))
    .filter((line) => line.includes("as a shared subgraph base"));
}

describe("subgraph export forms", () => {
  beforeAll(() => {
    const sources = join(fixture.root, "variants", "sources");
    mkdirSync(sources, { recursive: true });
    for (const [file, source] of Object.entries(SOURCES)) {
      writeFileSync(join(sources, file), source);
    }
    for (const form of forms) {
      const { root, packageName } = variantOf(form);
      mkdirSync(join(root, "subgraphs"), { recursive: true });
      mkdirSync(join(root, "node", "subgraphs"), { recursive: true });
      writeFileSync(
        join(root, "package.json"),
        JSON.stringify({
          name: packageName,
          type: "module",
          exports: {
            "./subgraphs": "./subgraphs/index.ts",
            "./node/subgraphs": "./node/subgraphs/index.mjs",
          },
        }),
      );
      writeFileSync(join(root, "subgraphs", "index.ts"), form.variantIndex);
      // `export *` drops the default export, which a real bundle keeps.
      const bundle = ['export * from "../../subgraphs/index.ts";'];
      if (/\bdefault\b/.test(form.variantIndex)) {
        bundle.push('export { default } from "../../subgraphs/index.ts";');
      }
      writeFileSync(
        join(root, "node", "subgraphs", "index.mjs"),
        bundle.join("\n"),
      );
      symlinkSync(
        root,
        join(fileURLToPath(fixture.registryUrl), "-", "cdn", packageName),
      );
    }
  });

  describe.each(loaders)("$loader", ({ tag, identifier, load }) => {
    it.each(forms)("$form", async (form) => {
      const info = vi.spyOn(console, "info").mockImplementation(() => {});
      try {
        expect(observedSubgraphs(await load(variantOf(form)))).toEqual(
          form.expected,
        );
        expect(sharedBaseNotices(info)).toEqual(
          form.sharedBase
            ? [
                `${tag} Treating WidgetBase in ${identifier(variantOf(form))} as a shared subgraph base: it has no static subgraphName, and ExampleSubgraph extends it`,
              ]
            : [],
        );
      } finally {
        info.mockRestore();
      }
    });

    // The order decides which subgraph keeps a contested claim, so a dev
    // server and a built package must register in the same one.
    it("registers in export-name order, not statement order", async () => {
      const form = forms.find(({ form }) => form === "statement-order");
      const loaded = await load(variantOf(form!));
      expect(
        loaded.map((value) => subgraphNameOf(value) ?? value.name),
      ).toEqual(["NotesSubgraph", "example"]);
    });
  });
});

/** Boots a real manager over one package's models and returns what it mounted. */
async function mountedSubgraphs(
  models: readonly DocumentModelModule[],
): Promise<readonly string[]> {
  const { manager, mounts } = makeHarness({
    enableDocumentModelSubgraphs: true,
    reactorClient: makeMockReactorClient({
      getDocumentModelModules: vi
        .fn()
        .mockResolvedValue({ results: [makeDriveModule(), ...models] }),
    }),
  });
  vi.useFakeTimers();
  try {
    await initAndFlush(manager);
  } finally {
    vi.useRealTimers();
  }
  return [...mounts.keys()].sort();
}

describe("GraphQL", () => {
  it.each([
    { stored: false, reverse: false },
    { stored: true, reverse: false },
    { stored: false, reverse: true },
    { stored: true, reverse: true },
  ])(
    "runs latest-version actions with complete history (stored: $stored, reverse: $reverse)",
    async ({ stored, reverse }) => {
      const loader = new ImportPackageLoader();
      const loaded = models(await loader.loadDocumentModels(fixture.root));
      if (reverse) loaded.reverse();
      const latest = loaded.find((module) => module.version === 2)!;
      const live = reactorClientFor(latest);
      const { manager } = makeHarness({
        enableDocumentModelSubgraphs: true,
        reactorClient: makeMockReactorClient({
          ...live.client,
          getDocumentModelModules: vi.fn().mockResolvedValue({
            results: [
              makeDriveModule(),
              ...loaded.map((module) =>
                stored ? asSchemaFirst(module) : module,
              ),
            ],
          }),
        }),
      });
      vi.useFakeTimers();
      try {
        await initAndFlush(manager);
        const subgraph = manager.getSubgraphByName(
          "ledger",
        ) as DocumentModelSubgraph;
        await expect(
          subgraph.mutationResolvers.setCurrency(
            null,
            { documentIdOrSlug: "doc-1", input: { currency: "USD" } },
            { user: { address: "owner" } } as never,
          ),
        ).resolves.toBeDefined();
        expect(live.current().state).toMatchObject({
          global: { currency: "USD" },
        });
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it("selects a code-first model the way it selects any other", async () => {
    const loader = new ImportPackageLoader();
    const codeFirst = models(await loader.loadDocumentModels(fixture.root));
    const schemaFirst = models(
      await loader.loadDocumentModels(fixture.schemaFirstRoot),
    );

    const fromCodeFirst = await mountedSubgraphs(codeFirst);
    const fromSchemaFirst = await mountedSubgraphs(schemaFirst);

    expect(fromCodeFirst).toEqual(fromSchemaFirst);
    // The selection keeps the latest specification version of each model, so
    // the ledger mounts one route.
    expect(fromCodeFirst.filter((path) => path.includes("ledger"))).toEqual([
      "/graphql/ledger",
    ]);
  });
});
