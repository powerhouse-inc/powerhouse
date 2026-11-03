import {
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
import { afterEach, describe, expect, it } from "vitest";
import { DefinitionSourceLoader } from "../../src/definition/tooling/definition-source-loader.js";
import { readStoredDocumentModels } from "../../src/definition/tooling/schema-first/stored-models.js";
import {
  materializeFixturePackage,
  packageRevisionOf,
} from "./loader-contract.js";
import { storedModel } from "./project-fixtures.js";

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

function writeModel(directory: string, name: string, id: string): void {
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, `${name}.json`), storedModel(id, "Shelf"));
}

/** Reads the stored models of a package the way `loadProjectDefinitions` does. */
async function readStored(root: string) {
  const loader = new DefinitionSourceLoader({
    importModule: async ({ packageRoot, specifier }) =>
      (await import(
        pathToFileURL(join(packageRoot, specifier)).href
      )) as Readonly<Record<string, unknown>>,
  });
  const load = {
    configFile: join(root, "powerhouse.config.json"),
    packageRevision: packageRevisionOf(root),
  };
  const loaded = await loader.normalizeDefinitionSources(load);
  try {
    return await readStoredDocumentModels({
      ...load,
      loader,
      packageRoot: loaded.packageRoot,
      loaded,
      documentModelsDir: join(root, "document-models"),
    });
  } finally {
    await loader.dispose();
  }
}

describe("readStoredDocumentModels with symlinks", () => {
  it("reads a symlinked model directory inside the package and refuses ones that leave it", async () => {
    const fixture = materializeFixturePackage("stored");
    cleanups.push(fixture.dispose);
    const outside = realpathSync.native(
      mkdtempSync(join(tmpdir(), "ph-stored-outside-")),
    );
    cleanups.push(() => rmSync(outside, { recursive: true, force: true }));
    const models = join(fixture.root, "document-models");

    writeModel(
      join(fixture.root, "models-src", "aliased"),
      "aliased",
      "test/aliased",
    );
    symlinkSync(
      join(fixture.root, "models-src", "aliased"),
      join(models, "aliased"),
    );
    writeModel(join(outside, "escaped"), "escaped", "test/escaped");
    symlinkSync(join(outside, "escaped"), join(models, "escaped"));
    writeModel(outside, "leaked", "test/leaked");
    mkdirSync(join(models, "leaked"));
    symlinkSync(
      join(outside, "leaked.json"),
      join(models, "leaked", "leaked.json"),
    );

    const produced = await readStored(fixture.root);
    expect(
      produced.artifacts.map(
        ({ documentType, source }) => `${documentType} ${source.specifier}`,
      ),
    ).toEqual([
      "test/aliased ./document-models/aliased/aliased.json",
      "example/wallet ./document-models/wallet/wallet.json",
    ]);
    const outsideDiagnostic = (specifier: `./${string}`) => ({
      code: "PH-CONFIG-SOURCE-OUTSIDE-PACKAGE",
      severity: "error",
      phase: "configuration",
      source: { specifier },
      path: [],
      message:
        "The stored document model resolves through a symlink that leaves the package root, so it is not this package's model.",
      expected: "a real path contained by the package root",
      received: specifier,
      repair:
        "Replace the symlink with a model file that really lives in this package.",
    });
    expect(produced.diagnostics).toEqual([
      outsideDiagnostic("./document-models/escaped/escaped.json"),
      outsideDiagnostic("./document-models/leaked/leaked.json"),
    ]);
  });
});
