import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { DefinitionSourceLoader } from "../../src/definition/tooling/definition-source-loader.js";
import type { TypeScriptSourceImportInterface } from "../../src/definition/tooling/definition-source-types.js";
import { sha256 } from "../../src/definition/primitives.js";
import {
  countingImporter,
  LOADER_CONTRACT_CASES,
  materializeFixturePackage,
  packageRevisionOf,
  runLoaderSelection,
} from "./loader-contract.js";

/**
 * The loader's own suite. It runs the shared contract through the plainest
 * possible adapter — Node's own dynamic import — so a contract failure here
 * means the loader is wrong, not that an adapter is. The CLI suite runs the
 * same cases through the two real adapters.
 */

/**
 * One evaluation root per package revision.
 *
 * Isolating by a per-module query string would look simpler and would be
 * wrong: a module imported directly and the same module imported by one of its
 * siblings would become two objects, and the loader would report an alias as a
 * collision. A revision gets one root, so every module inside it shares one
 * identity, and a new revision gets a new one.
 */
function nodeImporter(): TypeScriptSourceImportInterface {
  const roots = new Map<string, string>();
  return {
    importModule: async ({ packageRoot, specifier, packageRevision }) => {
      let root = roots.get(packageRevision);
      if (root === undefined) {
        root = realpathSync.native(mkdtempSync(join(tmpdir(), "ph-revision-")));
        cpSync(packageRoot, root, { recursive: true });
        roots.set(packageRevision, root);
      }
      const url = pathToFileURL(join(root, specifier));
      return (await import(url.href)) as Readonly<Record<string, unknown>>;
    },
    disposeRevision: (revision) => {
      for (const [key, root] of [...roots]) {
        if (revision !== undefined && key !== revision) continue;
        roots.delete(key);
        rmSync(root, { recursive: true, force: true });
      }
    },
  };
}

describe("definition source loader contract", () => {
  for (const testCase of LOADER_CONTRACT_CASES) {
    it(testCase.name, async () => {
      const outcome = await runLoaderSelection(testCase, nodeImporter);
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
    });
  }
});

describe("DefinitionSourceLoader", () => {
  it("produces byte-identical results for two orderings of one selection", async () => {
    const [ordered, reordered] = await Promise.all(
      ["powerhouse.config.json", "reordered.config.json"].map((configFile) =>
        runLoaderSelection({ fixture: "control", configFile }, nodeImporter),
      ),
    );
    expect(JSON.stringify(reordered.documentModels)).toBe(
      JSON.stringify(ordered.documentModels),
    );
    expect(JSON.stringify(reordered.diagnostics)).toBe(
      JSON.stringify(ordered.diagnostics),
    );
  });

  it("names both duplicate positions and imports neither", async () => {
    const outcome = await runLoaderSelection(
      { fixture: "control", configFile: "duplicate.config.json" },
      nodeImporter,
    );
    const [duplicate] = outcome.diagnostics;
    expect(duplicate.code).toBe("PH-CONFIG-DUPLICATE-SOURCE");
    expect(duplicate.path).toEqual(["definitionSources", "entries", 0]);
    expect(duplicate.related?.[0].path).toEqual([
      "definitionSources",
      "entries",
      1,
    ]);
    expect(outcome.imported).toEqual([]);
  });

  it("keeps each structured diagnostic's own code, path, and repair", async () => {
    const outcome = await runLoaderSelection(
      { fixture: "failures" },
      nodeImporter,
    );
    const structured = outcome.diagnostics.filter(
      (diagnostic) => diagnostic.code === "PH-DM-STATE-ROOT-INVALID",
    );
    expect(structured.map((diagnostic) => diagnostic.path)).toEqual([
      ["specifications", "global", "schema"],
      ["specifications", "local", "schema"],
    ]);
    for (const diagnostic of structured) {
      expect(diagnostic.source?.specifier).toBe("./src/structured.ts");
      expect(diagnostic.repair).toContain("ph.object(");
      expect(diagnostic.phase).toBe("definition");
    }
    // A definition failure is not an import failure: the two decide different
    // exit codes, so they must not be confused for one another.
    expect(
      outcome.diagnostics.some(
        (diagnostic) => diagnostic.code === "PH-IMPORT-FAILED",
      ),
    ).toBe(false);
  });

  it("keeps an ordinary import failure in the import phase", async () => {
    const outcome = await runLoaderSelection(
      { fixture: "failures", configFile: "throwing.config.json" },
      nodeImporter,
    );
    const [failure] = outcome.diagnostics;
    expect(failure.code).toBe("PH-IMPORT-FAILED");
    expect(failure.phase).toBe("import");
    expect(failure.source?.specifier).toBe("./src/throws.ts");
  });

  it("names both sources of a logical collision", async () => {
    const outcome = await runLoaderSelection(
      { fixture: "collisions" },
      nodeImporter,
    );
    const [collision] = outcome.diagnostics;
    expect(collision.code).toBe("PH-PKG-LOGICAL-COLLISION");
    expect(collision.source?.specifier).toBe("./src/second.ts");
    expect(collision.related?.[0].source?.specifier).toBe("./src/first.ts");
  });

  it("rejects a source that reaches outside the package root through a symlink", async () => {
    const outside = materializeFixturePackage("control");
    const fixture = materializeFixturePackage("configs");
    try {
      symlinkSync(
        join(outside.root, "src", "invoice.ts"),
        join(fixture.root, "src", "linked.ts"),
      );
      writeFileSync(
        join(fixture.root, "symlink.config.json"),
        JSON.stringify({
          definitionSources: {
            formatVersion: 1,
            mode: "code-first",
            entries: [{ specifier: "./src/linked.ts" }],
          },
        }),
      );
      const importer = countingImporter(nodeImporter());
      const loader = new DefinitionSourceLoader(importer);
      const result = await loader.normalizeDefinitionSources({
        configFile: join(fixture.root, "symlink.config.json"),
        packageRevision: packageRevisionOf(fixture.root),
      });
      expect(result.status).toBe("failed");
      expect(result.diagnostics.map((entry) => entry.code)).toEqual([
        "PH-CONFIG-SOURCE-OUTSIDE-PACKAGE",
      ]);
      expect(importer.imported).toEqual([]);
    } finally {
      fixture.dispose();
      outside.dispose();
    }
  });

  it("re-imports when a helper changes but every definition digest does not", async () => {
    const fixture = materializeFixturePackage("control");
    try {
      const importer = countingImporter(nodeImporter());
      const disposed: string[] = [];
      const loader = new DefinitionSourceLoader({
        importModule: (request) => importer.importModule(request),
        disposeRevision: (revision) => {
          disposed.push(revision ?? "<all>");
        },
      });
      const configFile = join(fixture.root, "powerhouse.config.json");
      const first = await loader.normalizeDefinitionSources({
        configFile,
        packageRevision: packageRevisionOf(fixture.root),
      });
      const again = await loader.normalizeDefinitionSources({
        configFile,
        packageRevision: packageRevisionOf(fixture.root),
      });
      // The same revision reuses the same evaluation.
      expect(importer.imported).toEqual([
        "./src/catalog.ts",
        "./src/invoice.ts",
      ]);
      expect(again.documentModels[0].value).toBe(first.documentModels[0].value);

      writeFileSync(
        join(fixture.root, "src", "helper.ts"),
        "export function normalizeTitle(title: string): string {\n  return title.toUpperCase();\n}\n",
      );
      const edited = await loader.normalizeDefinitionSources({
        configFile,
        packageRevision: packageRevisionOf(fixture.root),
      });
      expect(importer.imported).toHaveLength(4);
      // The definition never mentions a reducer helper, so the digest cannot
      // notice the edit; the revision is what does.
      const before = first.documentModels[0].value as unknown as {
        definition: unknown;
      };
      const after = edited.documentModels[0].value as unknown as {
        definition: unknown;
      };
      expect(JSON.stringify(after.definition)).toBe(
        JSON.stringify(before.definition),
      );
      expect(after).not.toBe(before);
      expect(disposed).toHaveLength(1);

      await loader.dispose();
      expect(disposed).toHaveLength(2);
    } finally {
      fixture.dispose();
    }
  });

  it("executes the edited closure, not the one it already evaluated", async () => {
    const fixture = materializeFixturePackage("control");
    try {
      const loader = new DefinitionSourceLoader(nodeImporter());
      const configFile = join(fixture.root, "powerhouse.config.json");
      const before = await loader.normalizeDefinitionSources({
        configFile,
        packageRevision: packageRevisionOf(fixture.root),
      });
      writeFileSync(
        join(fixture.root, "src", "helper.ts"),
        "export function normalizeTitle(title: string): string {\n  return title.toUpperCase();\n}\n",
      );
      const after = await loader.normalizeDefinitionSources({
        configFile,
        packageRevision: packageRevisionOf(fixture.root),
      });
      expect(titleAfterSetTitle(before.documentModels[0].value, " hi ")).toBe(
        "hi",
      );
      expect(titleAfterSetTitle(after.documentModels[0].value, " hi ")).toBe(
        " HI ",
      );
      await loader.dispose();
    } finally {
      fixture.dispose();
    }
  });

  it("rejects a package revision that is not a sha256 identifier", async () => {
    const fixture = materializeFixturePackage("control");
    try {
      const loader = new DefinitionSourceLoader(nodeImporter());
      const result = await loader.normalizeDefinitionSources({
        configFile: join(fixture.root, "powerhouse.config.json"),
        packageRevision: "not-a-digest" as never,
      });
      expect(result.status).toBe("failed");
      expect(result.diagnostics[0].path).toEqual(["packageRevision"]);
    } finally {
      fixture.dispose();
    }
  });

  it("settles a cancelled load with a stable AbortError", async () => {
    const fixture = materializeFixturePackage("control");
    try {
      const loader = new DefinitionSourceLoader(nodeImporter());
      const controller = new AbortController();
      controller.abort();
      await expect(
        loader.normalizeDefinitionSources({
          configFile: join(fixture.root, "powerhouse.config.json"),
          packageRevision: packageRevisionOf(fixture.root),
          signal: controller.signal,
        }),
      ).rejects.toMatchObject({ name: "AbortError" });
    } finally {
      fixture.dispose();
    }
  });

  it("resolves the selection without importing anything", () => {
    const fixture = materializeFixturePackage("control");
    try {
      const importer = countingImporter(nodeImporter());
      const loader = new DefinitionSourceLoader(importer);
      const resolution = loader.resolve({
        configFile: join(fixture.root, "powerhouse.config.json"),
      });
      expect(resolution.status).toBe("ready");
      expect(resolution.sourceSet.sources).toEqual([
        { specifier: "./src/catalog.ts" },
        { specifier: "./src/invoice.ts", exportPath: ["invoiceFamily"] },
      ]);
      expect(resolution.sourceSet.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(importer.imported).toEqual([]);
    } finally {
      fixture.dispose();
    }
  });

  it("reports a namespace the adapter could not return as a plain record", async () => {
    const fixture = materializeFixturePackage("control");
    try {
      const loader = new DefinitionSourceLoader({
        importModule: () =>
          Promise.resolve(
            "not a namespace" as unknown as Readonly<Record<string, unknown>>,
          ),
      });
      const result = await loader.normalizeDefinitionSources({
        configFile: join(fixture.root, "powerhouse.config.json"),
        packageRevision: packageRevisionOf(fixture.root),
      });
      expect(
        new Set(result.diagnostics.map((diagnostic) => diagnostic.code)),
      ).toEqual(new Set(["PH-IMPORT-FAILED"]));
      expect(result.diagnostics).toHaveLength(2);
    } finally {
      fixture.dispose();
    }
  });

  it("does not treat a package root outside the repository as special", () => {
    const fixture = materializeFixturePackage("control");
    try {
      mkdirSync(join(fixture.root, "nested"), { recursive: true });
      writeFileSync(
        join(fixture.root, "nested", "powerhouse.config.json"),
        JSON.stringify({
          definitionSources: { formatVersion: 1, mode: "schema-first" },
        }),
      );
      const loader = new DefinitionSourceLoader(nodeImporter());
      // A nested config selects the nested package, not the directory the
      // command happened to be run from.
      expect(
        loader.resolve({
          configFile: join(fixture.root, "nested", "powerhouse.config.json"),
        }).packageRoot,
      ).toBe(join(fixture.root, "nested"));
    } finally {
      fixture.dispose();
    }
  });

  it("binds the source-set digest to the selection, not to the machine", () => {
    const first = materializeFixturePackage("control");
    const second = materializeFixturePackage("control");
    try {
      const loader = new DefinitionSourceLoader(nodeImporter());
      expect(
        loader.resolve({
          configFile: join(first.root, "powerhouse.config.json"),
        }).sourceSet.digest,
      ).toBe(
        loader.resolve({
          configFile: join(second.root, "powerhouse.config.json"),
        }).sourceSet.digest,
      );
      expect(
        loader.resolve({
          configFile: join(first.root, "reordered.config.json"),
        }).sourceSet.digest,
      ).toBe(
        loader.resolve({
          configFile: join(first.root, "powerhouse.config.json"),
        }).sourceSet.digest,
      );
    } finally {
      first.dispose();
      second.dispose();
    }
  });

  it("computes one revision per package state", () => {
    const fixture = materializeFixturePackage("control");
    try {
      const before = packageRevisionOf(fixture.root);
      expect(before).toBe(packageRevisionOf(fixture.root));
      writeFileSync(
        join(fixture.root, "src", "helper.ts"),
        "export const x = 1;\n",
      );
      expect(packageRevisionOf(fixture.root)).not.toBe(before);
      expect(sha256("")).toMatch(/^sha256:[0-9a-f]{64}$/);
    } finally {
      fixture.dispose();
    }
  });
});

function titleAfterSetTitle(module: unknown, title: string): unknown {
  const typed = module as {
    utils: { createDocument: () => unknown };
    reducer: (document: unknown, action: unknown) => unknown;
    actions: Record<string, (input: unknown) => unknown>;
  };
  const document = typed.utils.createDocument();
  const next = typed.reducer(document, typed.actions.setTitle({ title }));
  return (next as { state: { global: { title: unknown } } }).state.global.title;
}
