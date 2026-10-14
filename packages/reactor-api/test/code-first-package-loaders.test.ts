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
import type { DefinedSubgraph } from "../src/graphql/define-subgraph.js";
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

type Observed = { className: string; definition: string | null };

function observedSubgraphs(classes: readonly SubgraphClass[]): Observed[] {
  return classes
    .map((value) => ({
      className: value.name,
      definition: (value as Partial<DefinedSubgraph>).definition?.name ?? null,
    }))
    .sort(
      (left, right) =>
        left.className.localeCompare(right.className) ||
        String(left.definition).localeCompare(String(right.definition)),
    );
}

const example: Observed = {
  className: "CodeFirstSubgraph",
  definition: "example",
};
const notes: Observed = { className: "NotesSubgraph", definition: null };

type ExportForm = {
  form: string;
  variantIndex?: string;
  expected: Observed[];
};

const forms: ExportForm[] = [
  { form: "scaffold", expected: [example, notes] },
  {
    form: "namespace-alias",
    variantIndex: [
      'export * as tasks from "../../../subgraphs/example.js";',
      'export * as legacy from "../../../subgraphs/notes.js";',
    ].join("\n"),
    expected: [example, notes],
  },
  {
    form: "direct-renamed",
    variantIndex: [
      'export { ExampleSubgraph as TasksSubgraph } from "../../../subgraphs/example.js";',
      'export { NotesSubgraph } from "../../../subgraphs/notes.js";',
    ].join("\n"),
    expected: [example, notes],
  },
  {
    form: "default-class",
    variantIndex: [
      'export { ExampleSubgraph as default } from "../../../subgraphs/example.js";',
      'export { NotesSubgraph } from "../../../subgraphs/notes.js";',
    ].join("\n"),
    expected: [example, notes],
  },
  {
    form: "default-object",
    variantIndex: [
      'import { ExampleSubgraph } from "../../../subgraphs/example.js";',
      'import { NotesSubgraph } from "../../../subgraphs/notes.js";',
      "export default { ExampleSubgraph, NotesSubgraph };",
    ].join("\n"),
    expected: [example, notes],
  },
  {
    form: "several-paths",
    variantIndex: [
      'import { ExampleSubgraph } from "../../../subgraphs/example.js";',
      'import { NotesSubgraph } from "../../../subgraphs/notes.js";',
      'export * as tasks from "../../../subgraphs/example.js";',
      'export * as legacy from "../../../subgraphs/notes.js";',
      "export { ExampleSubgraph, NotesSubgraph };",
      "export default { ExampleSubgraph, NotesSubgraph };",
    ].join("\n"),
    expected: [example, notes],
  },
  {
    form: "unrelated-exports",
    variantIndex: [
      'export * as tasks from "../../../subgraphs/example.js";',
      'export const VERSION = "1.0.0";',
      "export function helper() { return 1; }",
      "export class Unrelated {}",
      "export const config = { helper, Unrelated, retries: 3 };",
      'export { BaseSubgraph, defineSubgraph } from "@powerhousedao/reactor-api";',
    ].join("\n"),
    expected: [example],
  },
];

type Variant = { root: string; packageName: string };

function variantOf({ form, variantIndex }: ExportForm): Variant {
  return variantIndex === undefined
    ? { root: fixture.root, packageName: FIXTURE_PACKAGE_NAME }
    : {
        root: join(fixture.root, "variants", form),
        packageName: `${FIXTURE_PACKAGE_NAME}-${form}`,
      };
}

const loaders: {
  loader: string;
  load(variant: Variant): Promise<SubgraphClass[]>;
}[] = [
  {
    loader: "Node / server import",
    load: ({ root }) => new ImportPackageLoader().loadSubgraphs(root),
  },
  {
    loader: "HTTP / CDN",
    load: ({ packageName }) =>
      new HttpPackageLoader({
        registryUrl: fixture.registryUrl,
      } as never).loadSubgraphs(packageName),
  },
  {
    loader: "Vite / local source",
    load: ({ root }) => VitePackageLoader.build(vite).loadSubgraphs(root),
  },
];

describe("subgraph export forms", () => {
  beforeAll(() => {
    for (const form of forms) {
      if (form.variantIndex === undefined) continue;
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

  describe.each(loaders)("$loader", ({ load }) => {
    it.each(forms)("$form", async (form) => {
      expect(observedSubgraphs(await load(variantOf(form)))).toEqual(
        form.expected,
      );
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
