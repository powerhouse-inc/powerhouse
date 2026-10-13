import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  LOADER_CONTRACT_CASES,
  materializeFixturePackage,
  packageRevisionOf,
  runLoaderSelection,
} from "../../../packages/document-model/test/tooling/loader-contract.js";
import {
  BuildGraphTypeScriptSourceImportAdapter,
  ViteTypeScriptSourceImportAdapter,
} from "../src/services/definitions/import-adapters.js";
import { emitFixture, writeFixtureTsconfig } from "./helpers/emit-fixture.js";
import { GENERATION_DIRECTORY } from "../src/services/definitions/generation.js";

type AdapterCase = {
  readonly adapter: string;
  readonly create: (packageRoot: string) => {
    importModule: (request: {
      readonly packageRoot: string;
      readonly specifier: `./${string}`;
      readonly packageRevision: `sha256:${string}`;
    }) => Promise<Readonly<Record<string, unknown>>>;
    disposeRevision?: (revision?: `sha256:${string}`) => Promise<void> | void;
  };
};

const viteAdapters: ViteTypeScriptSourceImportAdapter[] = [];
const emittedModules = new Map<string, ReadonlyMap<string, string>>();

const adapters: readonly AdapterCase[] = [
  {
    adapter: "vite",
    create: () => {
      const adapter = new ViteTypeScriptSourceImportAdapter();
      viteAdapters.push(adapter);
      return adapter;
    },
  },
  {
    adapter: "build-graph",
    create: (packageRoot) => {
      const modules = emittedModules.get(packageRoot);
      if (modules === undefined)
        throw new Error("The fixture was not compiled.");
      return new BuildGraphTypeScriptSourceImportAdapter({
        packageRoot,
        emittedModules: modules,
      });
    },
  },
];

afterAll(async () => {
  await Promise.all(viteAdapters.map((adapter) => adapter.disposeRevision()));
});

async function prepare(adapter: string, packageRoot: string): Promise<void> {
  if (adapter !== "build-graph") return;
  writeFixtureTsconfig(packageRoot);
  const result = await emitFixture(
    packageRoot,
    join(packageRoot, GENERATION_DIRECTORY, "types"),
  );
  if (!result.ok) throw new Error(result.summary);
  emittedModules.set(packageRoot, result.emittedModules);
}

describe.each(adapters)("$adapter import adapter", ({ adapter, create }) => {
  for (const testCase of LOADER_CONTRACT_CASES) {
    it(
      testCase.name,
      async () => {
        const outcome = await runLoaderSelection(testCase, create, (root) =>
          prepare(adapter, root),
        );
        expect({
          status: outcome.status,
          mode: outcome.mode,
          origin: outcome.origin,
          diagnosticCodes: outcome.diagnosticCodes,
          documentModels: outcome.documentModels,
          upgradeManifestTypes: outcome.upgradeManifestTypes,
          imported: outcome.imported,
        }).toEqual({
          status: testCase.expected.status,
          mode: testCase.expected.mode,
          origin: testCase.expected.origin,
          diagnosticCodes: testCase.expected.diagnosticCodes,
          documentModels: testCase.expected.documentModels,
          upgradeManifestTypes: testCase.expected.upgradeManifestTypes ?? [],
          imported: testCase.expected.imported,
        });
      },
      60_000,
    );
  }
});

describe("ViteTypeScriptSourceImportAdapter", () => {
  it("keeps its cache outside the package it is reading", async () => {
    const fixture = materializeFixturePackage("control");
    const adapter = new ViteTypeScriptSourceImportAdapter();
    try {
      const namespace = await adapter.importModule({
        packageRoot: fixture.root,
        specifier: "./src/invoice.ts",
        packageRevision: packageRevisionOf(fixture.root),
      });
      expect(Object.keys(namespace).sort()).toEqual([
        "invoiceFamily",
        "invoiceV1",
      ]);
      expect(existsSync(join(fixture.root, "node_modules", ".vite"))).toBe(
        false,
      );
    } finally {
      await adapter.disposeRevision();
      fixture.dispose();
    }
  }, 60_000);

  it("evaluates a module once across roots, so an alias is not a collision", async () => {
    const fixture = materializeFixturePackage("control");
    const adapter = new ViteTypeScriptSourceImportAdapter();
    try {
      const revision = packageRevisionOf(fixture.root);
      const [invoice, catalog] = await Promise.all([
        adapter.importModule({
          packageRoot: fixture.root,
          specifier: "./src/invoice.ts",
          packageRevision: revision,
        }),
        adapter.importModule({
          packageRoot: fixture.root,
          specifier: "./src/catalog.ts",
          packageRevision: revision,
        }),
      ]);
      expect(catalog.publishedInvoice).toBe(invoice.invoiceV1);
    } finally {
      await adapter.disposeRevision();
      fixture.dispose();
    }
  }, 60_000);
});

describe("compiler output layouts", () => {
  it.each([
    { name: "explicit src root", options: { rootDir: "src" } },
    { name: "inferred root", options: {} },
    { name: "composite config root", options: { composite: true } },
  ])(
    "imports mixed module formats with $name",
    async ({ options }) => {
      const fixture = materializeFixturePackage("control");
      try {
        writeFileSync(
          join(fixture.root, "src", "entry.mts"),
          "export const item = { value: 1 };",
        );
        writeFileSync(
          join(fixture.root, "src", "alias.mts"),
          'export { item } from "./entry.mjs";',
        );
        writeFileSync(
          join(fixture.root, "src", "common.cts"),
          "export const value = 2;",
        );
        writeFileSync(join(fixture.root, "root.mts"), "export {};");
        writeFileSync(
          join(fixture.root, "tsconfig.json"),
          JSON.stringify({
            compilerOptions: {
              module: "nodenext",
              target: "esnext",
              skipLibCheck: true,
              declarationMap: true,
              ...options,
            },
            include: [
              "src/*.mts",
              "src/*.cts",
              ...("rootDir" in options ? [] : ["root.mts"]),
            ],
          }),
        );
        const build = await emitFixture(
          fixture.root,
          join(fixture.root, GENERATION_DIRECTORY, "types"),
        );
        if (!build.ok) throw new Error(build.summary);
        const adapter = new BuildGraphTypeScriptSourceImportAdapter({
          packageRoot: fixture.root,
          emittedModules: build.emittedModules,
        });
        const direct = await adapter.importModule({
          specifier: "./src/entry.mts",
        });
        const alias = await adapter.importModule({
          specifier: "./src/alias.mts",
        });
        const common = await adapter.importModule({
          specifier: "./src/common.cts",
        });
        expect(direct.item).toEqual({ value: 1 });
        expect(alias.item).toBe(direct.item);
        expect(common.value).toBe(2);
      } finally {
        fixture.dispose();
      }
    },
    60_000,
  );

  it("maps transitively imported sources outside the configured root files", async () => {
    const fixture = materializeFixturePackage("control");
    try {
      mkdirSync(join(fixture.root, "shared"));
      writeFileSync(
        join(fixture.root, "shared", "value.ts"),
        "export const item = { value: 3 };",
      );
      writeFileSync(
        join(fixture.root, "src", "entry.ts"),
        'export { item } from "../shared/value.js";',
      );
      writeFileSync(
        join(fixture.root, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: {
            module: "nodenext",
            target: "esnext",
            skipLibCheck: true,
          },
          files: ["src/entry.ts"],
        }),
      );
      const build = await emitFixture(
        fixture.root,
        join(fixture.root, GENERATION_DIRECTORY, "types"),
      );
      if (!build.ok) throw new Error(build.summary);
      const adapter = new BuildGraphTypeScriptSourceImportAdapter({
        packageRoot: fixture.root,
        emittedModules: build.emittedModules,
      });
      const entry = await adapter.importModule({ specifier: "./src/entry.ts" });
      const dependency = await adapter.importModule({
        specifier: "./shared/value.ts",
      });
      expect(entry.item).toEqual({ value: 3 });
      expect(dependency.item).toBe(entry.item);
    } finally {
      fixture.dispose();
    }
  }, 60_000);
});
