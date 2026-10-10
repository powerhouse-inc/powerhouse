import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
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
 *
 * A code-first subgraph loads through the same loaders. The Vite loader
 * indexes the inner namespace with the outer export name, and the import and
 * HTTP loaders flatten it. So `export * as ExampleSubgraph from "./example.js"`
 * must wrap `export const ExampleSubgraph`.
 */

let fixture: MaterializedPackage;

beforeAll(() => {
  fixture = materializeLoaderPackage();
});

afterAll(() => {
  fixture.dispose();
});

function models(loaded: readonly DocumentModelModule[]) {
  return loaded.filter((module) => module.documentModel !== null);
}

/** What a loader's caller can see about one subgraph class. */
function observedSubgraphs(classes: readonly SubgraphClass[]) {
  return classes
    .map((value) => {
      const { definition } = value as Partial<DefinedSubgraph>;
      return {
        name: definition?.name ?? null,
        schemaKind: definition?.schemaKind ?? null,
        isClass: typeof value === "function",
      };
    })
    .sort((left, right) => String(left.name).localeCompare(String(right.name)));
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

  it("flattens the subgraph namespace and finds the class", async () => {
    const loaded = await loader.loadSubgraphs(fixture.root);
    expect(observedSubgraphs(loaded)).toEqual([
      { name: "example", schemaKind: "typed", isClass: true },
    ]);
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

  it("flattens the subgraph namespace the same way", async () => {
    const loader = new HttpPackageLoader({
      registryUrl: fixture.registryUrl,
    } as never);
    const loaded = await loader.loadSubgraphs(FIXTURE_PACKAGE_NAME);
    expect(observedSubgraphs(loaded)).toEqual([
      { name: "example", schemaKind: "typed", isClass: true },
    ]);
  });
});

describe("Vite / local source", () => {
  let vite: ViteDevServer;

  beforeAll(async () => {
    vite = await createServer({
      root: fixture.root,
      logLevel: "silent",
      server: { hmr: false, middlewareMode: true },
      optimizeDeps: { noDiscovery: true, include: [] },
    });
  });

  afterAll(async () => {
    await vite.close();
  });

  it("reads model subpath exports and keeps only a non-null documentModel", async () => {
    const loader = VitePackageLoader.build(vite);
    const loaded = await loader.loadDocumentModels(fixture.root, true);
    expect(
      observedModels(models(loaded)).map((entry) => [entry.id, entry.version]),
    ).toEqual([
      ["test/ledger", 1],
      ["test/ledger", 2],
    ]);
    expect(loaded).toHaveLength(2);
    const schemaFirst = await loader.loadDocumentModels(
      fixture.schemaFirstRoot,
      true,
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

  it("indexes the inner subgraph namespace with the outer export name", async () => {
    const loaded = await VitePackageLoader.build(vite).loadSubgraphs(
      fixture.root,
    );
    expect(observedSubgraphs(loaded)).toEqual([
      { name: "example", schemaKind: "typed", isClass: true },
    ]);
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
