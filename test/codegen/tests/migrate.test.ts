import { migrate } from "@powerhousedao/codegen";
import { $ } from "bun";
import { afterAll, describe, test } from "bun:test";
import { join } from "path";
import {
  TEST_OUTPUT,
  TEST_PROJECTS,
  WITH_DOCUMENT_MODELS_SPEC_1,
  WITH_LEGACY_UNVERSIONED_DOCUMENT_MODELS,
} from "../constants.js";
import {
  cpForce,
  mkdirRecursive,
  rmForce,
  runEslint,
  runTsc,
} from "../utils.js";

const cwd = process.cwd();
const parentOutDir = join(cwd, TEST_OUTPUT, "migrate");
const testProjectsDir = join(cwd, TEST_PROJECTS);
await rmForce(parentOutDir);
await mkdirRecursive(parentOutDir);

describe("migrate", () => {
  afterAll(() => {
    process.chdir(cwd);
  });
  test("non-versioned document models to versioned", async () => {
    const outDir = join(parentOutDir, "document-model-versioning");
    const legacyDocumentModelsDir = join(outDir, "legacy");
    const versionedDocumentModelsDir = join(outDir, "versioned");
    await cpForce(
      join(testProjectsDir, WITH_LEGACY_UNVERSIONED_DOCUMENT_MODELS),
      legacyDocumentModelsDir,
    );
    await cpForce(
      join(testProjectsDir, WITH_DOCUMENT_MODELS_SPEC_1),
      versionedDocumentModelsDir,
    );
    process.chdir(legacyDocumentModelsDir);
    const version = "dev";
    await migrate({ version });
    await runTsc();
    await runEslint();
    process.chdir(versionedDocumentModelsDir);
    await migrate({ version });
    await runTsc();
    await runEslint();
    process.chdir(outDir);
    const output =
      await $`bunx git diff --no-index legacy versioned --src-prefix=a/ --dst-prefix=b/`.nothrow();
    await Bun.write("legacy-vs-versioned.patch", output.text());
  });
});
