import { DEFAULT_AUTHORING_MODE } from "@powerhousedao/shared/clis/definition-sources";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  readFileSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import "document-model";
import { DefinitionSourceLoader } from "../../src/definition/tooling/definition-source-loader.js";
import {
  countingImporter,
  LOADER_CONTRACT_CASES,
  materializeFixturePackage,
  nodeImporter,
  packageRevisionOf,
  runLoaderSelection,
} from "./loader-contract.js";

const HELPER_EDIT =
  "export function normalizeTitle(title: string): string {\n  return title.toUpperCase();\n}\n";

function titleAfterSetTitle(module: unknown, title: string): unknown {
  const typed = module as {
    utils: { createDocument: () => unknown };
    reducer: (document: unknown, action: unknown) => unknown;
    actions: Record<string, (input: unknown) => unknown>;
  };
  const next = typed.reducer(
    typed.utils.createDocument(),
    typed.actions.setTitle({ title }),
  );
  return (next as { state: { global: { title: unknown } } }).state.global.title;
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
        upgradeManifestTypes: [],
        ...testCase.expected,
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

  it("names both duplicate positions", async () => {
    const { diagnostics } = await runLoaderSelection(
      { fixture: "control", configFile: "duplicate.config.json" },
      nodeImporter,
    );
    expect(diagnostics.map(({ path, related }) => ({ path, related }))).toEqual(
      [
        {
          path: ["definitionSources", "entries", 0],
          related: [
            {
              source: {
                specifier: "./src/invoice.ts",
                exportPath: ["invoiceFamily"],
              },
              path: ["definitionSources", "entries", 1],
              message:
                "This entry resolves to the same module and export path.",
            },
          ],
        },
      ],
    );
  });

  it("keeps each structured diagnostic's own code, path, phase and repair", async () => {
    const { diagnostics } = await runLoaderSelection(
      { fixture: "failures" },
      nodeImporter,
    );
    expect(
      diagnostics.map(({ code, phase, path, source, repair }) => ({
        code,
        phase,
        path,
        source,
        repair: repair.startsWith("Declare this scope as ph.object("),
      })),
    ).toEqual(
      (["global", "local"] as const).map((scope) => ({
        code: "PH-DM-STATE-ROOT-INVALID",
        phase: "definition",
        path: ["scopes", scope, "schema"],
        source: { specifier: "./src/structured.ts" },
        repair: true,
      })),
    );
  });

  it("keeps the other claimant of a duplicate name as a related location", async () => {
    const { diagnostics } = await runLoaderSelection(
      { fixture: "failures", configFile: "duplicate.config.json" },
      nodeImporter,
    );
    expect(
      diagnostics.map(({ code, source, path, related }) => ({
        code,
        source,
        path,
        related,
      })),
    ).toEqual([
      {
        code: "PH-DM-DUPLICATE-NAME",
        source: { specifier: "./src/duplicate.ts" },
        path: ["modules", 1, "key"],
        related: [
          {
            path: ["modules", 0, "key"],
            message: "The first module with this key was declared here.",
          },
        ],
      },
    ]);
  });

  it("keeps an ordinary import failure in the import phase", async () => {
    const { diagnostics } = await runLoaderSelection(
      { fixture: "failures", configFile: "throwing.config.json" },
      nodeImporter,
    );
    expect(
      diagnostics.map(({ code, phase, source, received }) => ({
        code,
        phase,
        source,
        received,
      })),
    ).toEqual([
      {
        code: "PH-IMPORT-FAILED",
        phase: "import",
        source: { specifier: "./src/throws.ts" },
        received: "Error: this source cannot be imported",
      },
    ]);
  });

  it("names both sources of a logical collision", async () => {
    const { diagnostics } = await runLoaderSelection(
      { fixture: "collisions" },
      nodeImporter,
    );
    expect(
      diagnostics.map(({ source, related }) => ({
        source,
        related: related?.map((entry) => entry.source),
      })),
    ).toEqual([
      {
        source: { specifier: "./src/second.ts", exportPath: ["ledgerCopy"] },
        related: [{ specifier: "./src/first.ts", exportPath: ["ledger"] }],
      },
    ]);
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
      const result = await new DefinitionSourceLoader(
        importer,
      ).normalizeDefinitionSources({
        configFile: join(fixture.root, "symlink.config.json"),
        packageRevision: packageRevisionOf(fixture.root),
      });
      expect(result.status).toBe("failed");
      expect(result.diagnostics.map(({ code }) => code)).toEqual([
        "PH-CONFIG-SOURCE-OUTSIDE-PACKAGE",
      ]);
      expect(importer.imported).toEqual([]);
    } finally {
      fixture.dispose();
      outside.dispose();
    }
  });

  it("rejects a dangling symlink that points outside the package root", async () => {
    const outside = materializeFixturePackage("control");
    const fixture = materializeFixturePackage("configs");
    try {
      const packageRevision = packageRevisionOf(fixture.root);
      symlinkSync(
        join(outside.root, "src", "not-written-yet.ts"),
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
      const result = await new DefinitionSourceLoader(
        importer,
      ).normalizeDefinitionSources({
        configFile: join(fixture.root, "symlink.config.json"),
        packageRevision,
      });
      expect(result.diagnostics.map(({ code }) => code)).toEqual([
        "PH-CONFIG-SOURCE-OUTSIDE-PACKAGE",
      ]);
      expect(importer.imported).toEqual([]);
    } finally {
      fixture.dispose();
      outside.dispose();
    }
  });

  it("refuses a package module outside the package root", async () => {
    const outside = materializeFixturePackage("control");
    const fixture = materializeFixturePackage("control");
    try {
      mkdirSync(join(fixture.root, "scalars"));
      symlinkSync(
        join(outside.root, "src", "invoice.ts"),
        join(fixture.root, "scalars", "index.ts"),
      );
      const importer = countingImporter(nodeImporter());
      const loader = new DefinitionSourceLoader(importer);
      const imported = async (specifier: `./${string}`) => {
        const result = await loader.importPackageModule({
          configFile: join(fixture.root, "powerhouse.config.json"),
          packageRevision: packageRevisionOf(fixture.root),
          specifier,
        });
        return result.ok
          ? Object.keys(result.namespace).length > 0
          : result.diagnostics.map(({ code, source, path }) => ({
              code,
              source,
              path,
            }));
      };
      expect(await imported("./../outside.ts")).toEqual([
        {
          code: "PH-CONFIG-SOURCE-OUTSIDE-PACKAGE",
          source: { specifier: "./../outside.ts" },
          path: [],
        },
      ]);
      expect(await imported("./scalars/index.ts")).toEqual([
        {
          code: "PH-CONFIG-SOURCE-OUTSIDE-PACKAGE",
          source: { specifier: "./scalars/index.ts" },
          path: [],
        },
      ]);
      expect(importer.imported).toEqual([]);
      expect(await imported("./src/invoice.ts")).toBe(true);
      expect(importer.imported).toEqual(["./src/invoice.ts"]);
      await loader.dispose();
    } finally {
      fixture.dispose();
      outside.dispose();
    }
  });

  it("re-imports a new package revision even when no definition digest moved", async () => {
    const fixture = materializeFixturePackage("control");
    try {
      const importer = countingImporter(nodeImporter());
      const disposed: string[] = [];
      const loader = new DefinitionSourceLoader({
        importModule: (request) => importer.importModule(request),
        disposeRevision: (revision) => {
          disposed.push(revision ?? "<all>");
          return importer.disposeRevision?.(revision);
        },
      });
      const request = () => ({
        configFile: join(fixture.root, "powerhouse.config.json"),
        packageRevision: packageRevisionOf(fixture.root),
      });
      const first = await loader.normalizeDefinitionSources(request());
      const again = await loader.normalizeDefinitionSources(request());
      expect(importer.imported).toEqual([
        "./src/catalog.ts",
        "./src/invoice.ts",
      ]);
      expect(again.documentModels[0].value).toBe(first.documentModels[0].value);

      writeFileSync(join(fixture.root, "src", "helper.ts"), HELPER_EDIT);
      const edited = await loader.normalizeDefinitionSources(request());
      expect(importer.imported).toHaveLength(4);
      const definitionOf = (value: unknown) =>
        JSON.stringify((value as { definition: unknown }).definition);
      expect(definitionOf(edited.documentModels[0].value)).toBe(
        definitionOf(first.documentModels[0].value),
      );
      expect(titleAfterSetTitle(first.documentModels[0].value, " hi ")).toBe(
        "hi",
      );
      expect(titleAfterSetTitle(edited.documentModels[0].value, " hi ")).toBe(
        " HI ",
      );
      expect(disposed).toHaveLength(1);

      await loader.dispose();
      expect(disposed).toHaveLength(2);
    } finally {
      fixture.dispose();
    }
  });

  it("refuses a package revision that is not a sha256 identifier", async () => {
    const fixture = materializeFixturePackage("control");
    try {
      const loader = new DefinitionSourceLoader(nodeImporter());
      const received = async (packageRevision: unknown) => {
        const result = await loader.normalizeDefinitionSources({
          configFile: join(fixture.root, "powerhouse.config.json"),
          packageRevision: packageRevision as never,
        });
        return [
          result.status,
          result.diagnostics[0]?.path,
          result.diagnostics[0]?.received,
        ];
      };
      expect([
        await received("not-a-digest"),
        await received(null),
        await received([]),
      ]).toEqual([
        ["failed", ["packageRevision"], "not-a-digest"],
        ["failed", ["packageRevision"], "null"],
        ["failed", ["packageRevision"], "array"],
      ]);
    } finally {
      fixture.dispose();
    }
  });

  it("settles a cancelled load with an AbortError", async () => {
    const fixture = materializeFixturePackage("control");
    try {
      const controller = new AbortController();
      controller.abort();
      await expect(
        new DefinitionSourceLoader(nodeImporter()).normalizeDefinitionSources({
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
    const first = materializeFixturePackage("control");
    const second = materializeFixturePackage("control");
    try {
      const importer = countingImporter(nodeImporter());
      const loader = new DefinitionSourceLoader(importer);
      const resolve = (root: string, configFile = "powerhouse.config.json") =>
        loader.resolve({ configFile: join(root, configFile) });
      const resolution = resolve(first.root);
      expect(resolution).toMatchObject({
        status: "ready",
        packageRoot: first.root,
        sourceSet: {
          mode: "code-first",
          origin: "config",
          sources: [
            { specifier: "./src/catalog.ts" },
            { specifier: "./src/invoice.ts", exportPath: ["invoiceFamily"] },
          ],
        },
      });

      expect(resolution.sourceSet.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(resolve(second.root).sourceSet.digest).toBe(
        resolution.sourceSet.digest,
      );
      expect(
        resolve(first.root, "reordered.config.json").sourceSet.digest,
      ).toBe(resolution.sourceSet.digest);
      expect(importer.imported).toEqual([]);
    } finally {
      first.dispose();
      second.dispose();
    }
  });

  it("reports a namespace the importer could not return as a record", async () => {
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
        result.diagnostics.map(({ code, source }) => [code, source]),
      ).toEqual([
        ["PH-IMPORT-FAILED", { specifier: "./src/catalog.ts" }],
        [
          "PH-IMPORT-FAILED",
          { specifier: "./src/invoice.ts", exportPath: ["invoiceFamily"] },
        ],
      ]);
    } finally {
      fixture.dispose();
    }
  });
});

it.each(["./src/catalog", "./src", "./src/catalog.ts/"])(
  "refuses a source without a module-file extension: %s",
  (specifier) => {
    const fixture = materializeFixturePackage("control");
    try {
      const configFile = join(fixture.root, "powerhouse.config.json");
      writeFileSync(
        configFile,
        JSON.stringify({
          definitionSources: {
            formatVersion: 1,
            mode: "code-first",
            entries: [{ specifier }],
          },
        }),
      );
      const result = new DefinitionSourceLoader(nodeImporter()).resolve({
        configFile,
      });
      expect(result.status).toBe("failed");
      expect(result.diagnostics.map(({ code }) => code)).toEqual([
        "PH-CONFIG-SOURCE-INVALID",
      ]);
    } finally {
      fixture.dispose();
    }
  },
);

it.each(["./src/entry.cjs", "./src/entry.cts"])(
  "refuses a CommonJS source before importing it: %s",
  async (specifier) => {
    const fixture = materializeFixturePackage("control");
    try {
      const configFile = join(fixture.root, "powerhouse.config.json");
      writeFileSync(join(fixture.root, specifier), "module.exports = {};\n");
      writeFileSync(
        configFile,
        JSON.stringify({
          definitionSources: {
            formatVersion: 1,
            mode: "code-first",
            entries: [{ specifier }],
          },
        }),
      );
      const result = await new DefinitionSourceLoader({
        importModule() {
          throw new Error("unexpected import");
        },
      }).normalizeDefinitionSources({
        configFile,
        packageRevision: packageRevisionOf(fixture.root),
      });
      expect(
        result.diagnostics.map(({ code, message, expected, repair }) => ({
          code,
          message,
          expected,
          repair,
        })),
      ).toEqual([
        {
          code: "PH-CONFIG-SOURCE-INVALID",
          message:
            "A definition source is evaluated as an ES module, so a CommonJS module cannot be one.",
          expected: "a .ts, .mts, .tsx, .js, .mjs or .jsx module",
          repair:
            "Rename the module to .ts, .mts, .js or .mjs and declare its definitions with ES module exports.",
        },
      ]);
    } finally {
      fixture.dispose();
    }
  },
);

it("loads the Node tooling entry without graphql", () => {
  const root = realpathSync.native(
    mkdtempSync(join(tmpdir(), "ph-tooling-no-graphql-")),
  );
  const source = join(import.meta.dirname, "../..");
  try {
    const pkg = join(root, "node_modules/document-model");
    mkdirSync(pkg, { recursive: true });
    cpSync(join(source, "dist"), join(pkg, "dist"), { recursive: true });
    writeFileSync(
      join(pkg, "package.json"),
      readFileSync(join(source, "package.json")),
    );
    for (const name of ["zod", "change-case", "@powerhousedao/shared"]) {
      const target = join(pkg, "node_modules", name);
      mkdirSync(join(target, ".."), { recursive: true });
      symlinkSync(join(source, "node_modules", name), target);
    }
    const peer = join(root, "peer.mjs");
    writeFileSync(peer, 'import "graphql";');
    expect(() =>
      execFileSync(process.execPath, [peer], { cwd: root, stdio: "pipe" }),
    ).toThrow("Cannot find package 'graphql'");
    const probe = join(root, "probe.mjs");
    writeFileSync(
      probe,
      `import { DefinitionSourceLoader } from "document-model/tooling";
      const loader = new DefinitionSourceLoader({ importModule() { throw new Error("unexpected import"); } });
      console.log(loader.resolve({ configFile: ${JSON.stringify(join(root, "absent.json"))}, allowMissingConfig: true }).status);`,
    );
    expect(
      execFileSync(process.execPath, [probe], { cwd: root, encoding: "utf8" }),
    ).toBe("skipped\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it.each([true, false])(
  "reports the shared default when config exists = %s",
  (exists) => {
    const root = mkdtempSync(join(tmpdir(), "ph-loader-default-"));
    try {
      const configFile = join(root, "powerhouse.config.json");
      if (exists) writeFileSync(configFile, "{}");
      const loader = new DefinitionSourceLoader({
        importModule() {
          throw new Error("unexpected import");
        },
      });
      const result = loader.resolve({ configFile, allowMissingConfig: true });
      expect(result).toMatchObject({
        status: "skipped",
        skipReason: "definition-sources-absent",
        sourceSet: { mode: DEFAULT_AUTHORING_MODE },
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

describe("importPackageModule", () => {
  it("shares one evaluation with the selected sources and imports again after a failure", async () => {
    const fixture = materializeFixturePackage("control");
    try {
      writeFileSync(
        join(fixture.root, "src", "flaky.ts"),
        "export const ok = 1;\n",
      );
      writeFileSync(join(fixture.root, "broken.config.json"), "{");
      const node = nodeImporter();
      let failures = 1;
      const importer = countingImporter({
        importModule: (request) =>
          request.specifier !== "./src/flaky.ts"
            ? node.importModule(request)
            : failures-- > 0
              ? Promise.reject(new Error("flaky"))
              : Promise.resolve({ ok: 1 }),
        disposeRevision: (revision) => node.disposeRevision?.(revision),
      });
      const loader = new DefinitionSourceLoader(importer);
      const packageRevision = packageRevisionOf(fixture.root);
      await loader.normalizeDefinitionSources({
        configFile: join(fixture.root, "powerhouse.config.json"),
        packageRevision,
      });
      const exportsOf = async (specifier: `./${string}`, config: string) => {
        const result = await loader.importPackageModule({
          configFile: join(fixture.root, config),
          packageRevision,
          specifier,
        });
        return result.ok
          ? Object.keys(result.namespace).sort()
          : result.diagnostics.map(({ code }) => code);
      };
      expect(await exportsOf("./src/invoice.ts", "broken.config.json")).toEqual(
        ["invoiceFamily", "invoiceV1"],
      );
      expect(
        await exportsOf("./src/flaky.ts", "powerhouse.config.json"),
      ).toEqual(["PH-IMPORT-FAILED"]);
      expect(
        await exportsOf("./src/flaky.ts", "powerhouse.config.json"),
      ).toEqual(["ok"]);
      expect(
        await exportsOf("./src/flaky.ts", "powerhouse.config.json"),
      ).toEqual(["ok"]);
      expect(importer.imported).toEqual([
        "./src/catalog.ts",
        "./src/invoice.ts",
        "./src/flaky.ts",
        "./src/flaky.ts",
      ]);
      await loader.dispose();
    } finally {
      fixture.dispose();
    }
  });
});
