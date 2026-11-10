import {
  mkdirSync,
  readFileSync,
  renameSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DefinitionSourceLoader } from "../../src/definition/tooling/definition-source-loader.js";
import {
  countingImporter,
  materializeFixturePackage,
  nodeImporter,
  packageRevisionOf,
} from "./loader-contract.js";
import { loadFixture, storedModel, writeFiles } from "./project-fixtures.js";

const LEDGER = "./document-models/ledger/index.ts";

/** Loads the fixture's discovered sources, after `prepare` edits its copy. */
async function discover(prepare: (root: string) => void, fixture = "mixed") {
  const materialized = materializeFixturePackage(fixture);
  try {
    prepare(materialized.root);
    const importer = countingImporter(nodeImporter());
    const loader = new DefinitionSourceLoader(importer);
    const loaded = await loader.normalizeDefinitionSources({
      configFile: join(materialized.root, "powerhouse.config.json"),
      packageRevision: packageRevisionOf(materialized.root),
    });
    await loader.dispose();
    return {
      root: materialized.root,
      loaded,
      imported: [...importer.imported].sort(),
      codes: loaded.diagnostics.map(({ code }) => code),
    };
  } finally {
    materialized.dispose();
  }
}

describe("document model discovery", () => {
  it("ignores generated barrels, helper files, and hidden directories during discovery", async () => {
    const { loaded, imported } = await discover((root) => {
      writeFiles(root, {
        "document-models/helpers/format.ts":
          'throw new Error("helper imported");\n',
        "document-models/.hidden/index.ts":
          'throw new Error("hidden entry imported");\n',
        "document-models/index.ts": 'throw new Error("barrel imported");\n',
        "document-models/document-models.ts":
          'throw new Error("barrel imported");\n',
        "document-models/upgrade-manifests.ts":
          'throw new Error("barrel imported");\n',
      });
    });
    expect(loaded.status).toBe("ready");
    expect(imported).toEqual([LEDGER]);
  });

  it("reads the configured documentModelsDir", async () => {
    const { loaded, imported } = await discover((root) => {
      renameSync(join(root, "document-models"), join(root, "models"));
      writeFileSync(
        join(root, "powerhouse.config.json"),
        JSON.stringify({ documentModelsDir: "./models" }),
      );
    });
    expect(loaded.status).toBe("ready");
    expect(loaded.sourceSet).toMatchObject({
      documentModelsDir: "./models",
      sources: [{ specifier: "./models/ledger/index.ts" }],
      stored: [{ specifier: "./models/wallet/wallet.json" }],
    });
    expect(imported).toEqual(["./models/ledger/index.ts"]);
  });

  it("keeps a directory with a stored file schema-first even when the file is not JSON", async () => {
    const { loaded, imported } = await discover((root) => {
      writeFiles(root, {
        "document-models/ledger/ledger.json": "{ not json",
      });
    });
    expect(imported).toEqual([]);
    expect(loaded.sourceSet).toMatchObject({
      sources: [],
      stored: [
        { specifier: "./document-models/ledger/ledger.json" },
        { specifier: "./document-models/wallet/wallet.json" },
      ],
    });
    const { report } = await loadFixture("mixed", {
      files: { "document-models/ledger/ledger.json": "{ not json" },
    });
    expect(report.status).toBe("invalid");
    expect(
      report.diagnostics.map(({ code, source }) => [code, source?.specifier]),
    ).toEqual([
      ["PH-PKG-DEFINITION-UNREGISTERED", LEDGER],
      ["PH-DM-DECLARATION-INVALID", "./document-models/ledger/ledger.json"],
    ]);
  });

  it("fails a directory with several entry modules and imports nothing", async () => {
    const { loaded, imported, codes } = await discover((root) => {
      writeFileSync(
        join(root, "document-models", "ledger", "index.js"),
        "export {};\n",
      );
    });
    expect(loaded.status).toBe("failed");
    expect(codes).toEqual(["PH-CONFIG-SOURCE-INVALID"]);
    expect(loaded.diagnostics[0].received).toBe(
      "./document-models/ledger/index.ts, ./document-models/ledger/index.js",
    );
    expect(imported).toEqual([]);
  });

  it("follows a model directory symlink that stays in the package", async () => {
    const { loaded, imported } = await discover((root) => {
      renameSync(
        join(root, "document-models", "ledger"),
        join(root, "authored-ledger"),
      );
      symlinkSync(
        join(root, "authored-ledger"),
        join(root, "document-models", "ledger"),
      );
    });
    expect(loaded.status).toBe("ready");
    expect(imported).toEqual([LEDGER]);
  });

  it("loads one source for symlinked aliases of the same code-first directory", async () => {
    const { loaded, imported, codes } = await discover((root) => {
      symlinkSync("ledger", join(root, "document-models/z-ledger"));
    });
    expect(loaded.status).toBe("ready");
    expect(loaded.documentModels).toHaveLength(1);
    expect(loaded.sourcesWithDefinitions).toEqual([{ specifier: LEDGER }]);
    expect(imported).toEqual([LEDGER]);
    expect(codes).toEqual([]);
  });

  it("counts a directory that re-exports another directory's model as a source with definitions", async () => {
    const reExporting = "./document-models/all/index.ts";
    const { loaded } = await discover((root) => {
      writeFiles(root, {
        "document-models/all/index.ts": 'export * from "../ledger/index.js";\n',
      });
    });
    expect(loaded.documentModels.map(({ source }) => source.specifier)).toEqual(
      [reExporting],
    );
    expect(loaded.sourcesWithDefinitions).toEqual([
      { specifier: reExporting },
      { specifier: LEDGER },
    ]);
  });

  it("refuses a model directory symlink that leaves the package", async () => {
    const outside = materializeFixturePackage("mixed");
    try {
      const { loaded, imported, codes } = await discover((root) => {
        symlinkSync(
          join(outside.root, "document-models", "ledger"),
          join(root, "document-models", "elsewhere"),
        );
      });
      expect(loaded.status).toBe("failed");
      expect(codes).toEqual(["PH-CONFIG-SOURCE-OUTSIDE-PACKAGE"]);
      expect(loaded.diagnostics[0].source).toEqual({
        specifier: "./document-models/elsewhere",
      });
      expect(imported).toEqual([]);
    } finally {
      outside.dispose();
    }
  });

  it("refuses an entry module symlink that leaves the package", async () => {
    const outside = materializeFixturePackage("mixed");
    try {
      const { loaded, imported, codes } = await discover((root) => {
        mkdirSync(join(root, "document-models", "linked"));
        symlinkSync(
          join(outside.root, "document-models", "ledger", "index.ts"),
          join(root, "document-models", "linked", "index.ts"),
        );
      });
      expect(loaded.status).toBe("failed");
      expect(codes).toEqual(["PH-CONFIG-SOURCE-OUTSIDE-PACKAGE"]);
      expect(imported).toEqual([]);
    } finally {
      outside.dispose();
    }
  });

  it("refuses the package root as the models directory", async () => {
    const { loaded, codes } = await discover((root) => {
      writeFileSync(
        join(root, "powerhouse.config.json"),
        JSON.stringify({ documentModelsDir: "./" }),
      );
    });
    expect(loaded.status).toBe("failed");
    expect(codes).toEqual(["PH-CONFIG-SOURCE-INVALID"]);
    expect(loaded.diagnostics[0].path).toEqual(["documentModelsDir"]);
  });

  it("reports generated schema-first code without its stored file, and keeps checking the rest", async () => {
    const { report } = await loadFixture("mixed", {
      files: {
        "document-models/orphan/v1/gen/types.ts": "export {};\n",
        "document-models/orphan/index.ts":
          'throw new Error("generated index imported");\n',
      },
    });
    expect(report.status).toBe("ok");
    expect(
      report.diagnostics.map(({ code, severity, source }) => [
        code,
        severity,
        source?.specifier,
      ]),
    ).toEqual([
      ["PH-PKG-STORED-SPEC-MISSING", "warning", "./document-models/orphan"],
    ]);
    expect(report.definitions.map(({ key }) => key)).toEqual([
      "example/ledger",
      "example/wallet",
    ]);
  });

  it("adds a new conventional model without any registration", async () => {
    const ledger = readFileSync(
      join(
        import.meta.dirname,
        "fixtures",
        "mixed",
        "document-models",
        "ledger",
        "index.ts",
      ),
      "utf8",
    );
    const { report } = await loadFixture("mixed", {
      files: {
        "document-models/journal/index.ts": ledger
          .replace("example/ledger", "example/journal")
          .replace('name: "Ledger"', 'name: "Journal"')
          .replace('"LedgerState"', '"JournalState"')
          .replace("export const Ledger", "export const Journal"),
        "document-models/copy/copy.json": storedModel("example/copy", "Copy"),
      },
    });
    expect(report.status).toBe("ok");
    expect(
      report.definitions.map(({ key, source }) => [key, source.specifier]),
    ).toEqual([
      ["example/copy", "./document-models/copy/copy.json"],
      ["example/journal", "./document-models/journal/index.ts"],
      ["example/ledger", LEDGER],
      ["example/wallet", "./document-models/wallet/wallet.json"],
    ]);
  });
});
