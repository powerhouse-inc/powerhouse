import {
  generateDocumentModel,
  loadDocumentModel,
} from "@powerhousedao/codegen";
import { buildTsMorphProject } from "@powerhousedao/codegen/utils";
import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  DATA,
  NEW_PROJECT,
  SPEC_VERSION_1,
  SPEC_VERSION_2,
  SPEC_VERSION_3,
  TEST_OUTPUT,
  WITH_DOCUMENT_MODELS_SPEC_1,
  WITH_DOCUMENT_MODELS_SPEC_2,
} from "../constants.js";
import {
  cpForce,
  loadDocumentModelsInDir,
  mkdirRecursive,
  rmForce,
  runTsc,
} from "../utils.js";

const parentOutDir = join(TEST_OUTPUT, "generate-doc-model");
await rmForce(parentOutDir);
await mkdirRecursive(parentOutDir);

async function runDocumentModelTests(args: {
  testOutputParentDir: string;
  inDirName: string;
  specDirName: string;
}) {
  const { inDirName, specDirName, testOutputParentDir } = args;
  const outDir = join(
    testOutputParentDir,
    `${basename(inDirName)}-${basename(specDirName)}`,
  );
  await rmForce(outDir);
  await cpForce(inDirName, outDir);
  await loadDocumentModelsInDir(specDirName, outDir);
  await runTsc(outDir);
  return outDir;
}

describe("versioned document models", () => {
  describe("v1", () => {
    test("should generate new document models as v1", async () => {
      await runDocumentModelTests({
        inDirName: NEW_PROJECT,
        specDirName: SPEC_VERSION_1,
        testOutputParentDir: parentOutDir,
      });
    });
    test("should persist existing reducers, tests, utils, and custom files when generating for the same spec version", async () => {
      await runDocumentModelTests({
        inDirName: WITH_DOCUMENT_MODELS_SPEC_1,
        specDirName: join(DATA, "spec-version-1-with-more-operations"),
        testOutputParentDir: parentOutDir,
      });
    });
  });
  describe("v2", () => {
    test("should handle generating document models as v2", async () => {
      const testOutDir = await runDocumentModelTests({
        inDirName: NEW_PROJECT,
        specDirName: SPEC_VERSION_2,
        testOutputParentDir: parentOutDir,
      });

      const v1ModulePath = join(
        testOutDir,
        "document-models",
        "test-doc",
        "v1",
        "module.ts",
      );
      const v2ModulePath = join(
        testOutDir,
        "document-models",
        "test-doc",
        "v2",
        "module.ts",
      );

      const v1ModuleContent = await Bun.file(v1ModulePath).text();
      const v2ModuleContent = await Bun.file(v2ModulePath).text();

      expect(v1ModuleContent).toContain("version: 1,");
      expect(v2ModuleContent).toContain("version: 2,");

      const v1SchemaPath = join(
        testOutDir,
        "document-models",
        "test-doc",
        "v1",
        "gen",
        "document-schema.ts",
      );
      const v2SchemaPath = join(
        testOutDir,
        "document-models",
        "test-doc",
        "v2",
        "gen",
        "document-schema.ts",
      );

      const v1SchemaContent = await Bun.file(v1SchemaPath).text();
      const v2SchemaContent = await Bun.file(v2SchemaPath).text();

      // v1 keeps the single-version validators; only the latest version
      // dispatches on the document's stamped version so pre-upgrade documents
      // validate against the schema they were created with.
      expect(v1SchemaContent).not.toContain("SchemasByVersion");
      expect(v2SchemaContent).toContain(
        'from "../../v1/gen/document-schema.js"',
      );
      expect(v2SchemaContent).toContain("SchemasByVersion");
      expect(v2SchemaContent).toContain("stampedDocumentModelVersion");
    });
    test("should persist existing reducers, tests, utils, and custom files when generating a new spec version", async () => {
      await runDocumentModelTests({
        inDirName: WITH_DOCUMENT_MODELS_SPEC_1,
        specDirName: SPEC_VERSION_2,
        testOutputParentDir: parentOutDir,
      });
    });

    // v2 adds a non-nullable field that v1 documents cannot have until they
    // are upgraded, so the generated validators must dispatch on the version
    // stamped in the document instead of always using the latest schema.
    // Generation is asserted at runtime without tsc: the fresh upgrade stub
    // intentionally does not compile until the migration is hand-written.
    test("validates documents against the schema of their stamped version", async () => {
      const outDir = join(parentOutDir, "version-aware-validation");
      await rmForce(outDir);
      await cpForce(NEW_PROJECT, outDir);

      const testDoc = await loadDocumentModel(
        join(
          DATA,
          "spec-version-2-with-required-field",
          "test-doc",
          "test-doc.json",
        ),
      );
      const project = buildTsMorphProject(outDir);
      await generateDocumentModel(testDoc, project);
      await project.save();

      type GeneratedDocument = {
        state: { document: { version: number } };
        initialState: { document: { version: number } };
      };
      type SchemaModule = {
        isTestDocDocument: (document: unknown) => boolean;
      };
      type UtilsModule = {
        utils: { createDocument: () => GeneratedDocument };
      };

      const modelDir = join(outDir, "document-models", "test-doc");
      const schemaModule = (await import(
        join(modelDir, "v2", "gen", "document-schema.ts")
      )) as SchemaModule;
      const v1Utils = (await import(
        join(modelDir, "v1", "gen", "utils.ts")
      )) as UtilsModule;
      const v2Utils = (await import(
        join(modelDir, "v2", "gen", "utils.ts")
      )) as UtilsModule;

      const v1Document = v1Utils.utils.createDocument();
      expect(schemaModule.isTestDocDocument(v1Document)).toBe(true);

      const v2Document = v2Utils.utils.createDocument();
      expect(schemaModule.isTestDocDocument(v2Document)).toBe(true);

      const v1ShapeStampedAsV2 = structuredClone(v1Document);
      v1ShapeStampedAsV2.state.document.version = 2;
      v1ShapeStampedAsV2.initialState.document.version = 2;
      expect(schemaModule.isTestDocDocument(v1ShapeStampedAsV2)).toBe(false);
    });

    test("should throw a typescript error in upgrades when new state does not match old state", () => {
      expect(
        async () =>
          await runDocumentModelTests({
            inDirName: WITH_DOCUMENT_MODELS_SPEC_1,
            specDirName: join(DATA, "spec-version-2-with-state-changes"),
            testOutputParentDir: parentOutDir,
          }),
      ).toThrow();
    });
  });

  describe("v3", () => {
    test("should handle generating document models as v3", async () => {
      await runDocumentModelTests({
        inDirName: NEW_PROJECT,
        specDirName: SPEC_VERSION_3,
        testOutputParentDir: parentOutDir,
      });
    });

    test("should persist existing reducers, tests, utils, and custom files when generating a new spec version", async () => {
      await runDocumentModelTests({
        inDirName: WITH_DOCUMENT_MODELS_SPEC_2,
        specDirName: SPEC_VERSION_3,
        testOutputParentDir: parentOutDir,
      });
    });

    test("should throw a typescript error in upgrades when new state does not match old state", () => {
      expect(
        async () =>
          await runDocumentModelTests({
            inDirName: WITH_DOCUMENT_MODELS_SPEC_2,
            specDirName: join(DATA, "spec-version-3-with-state-changes"),
            testOutputParentDir: parentOutDir,
          }),
      ).toThrow();
    });
  });

  // Each generate runs on its own project, so the prior model is only on disk,
  // not in-process — the case skipAddingFilesFromTsConfig regresses.
  test("should preserve other models in aggregates when generating one on a fresh project", async () => {
    const outDir = join(parentOutDir, "append-to-existing-document-models");
    await rmForce(outDir);
    await cpForce(NEW_PROJECT, outDir);

    const billing = await loadDocumentModel(
      join(SPEC_VERSION_1, "billing-statement", "billing-statement.json"),
    );
    const firstProject = buildTsMorphProject(outDir);
    await generateDocumentModel(billing, firstProject);
    await firstProject.save();

    const testDoc = await loadDocumentModel(
      join(SPEC_VERSION_1, "test-doc", "test-doc.json"),
    );
    const freshProject = buildTsMorphProject(outDir);
    await generateDocumentModel(testDoc, freshProject);
    await freshProject.save();

    const documentModelsFile = await readFile(
      join(outDir, "document-models", "document-models.ts"),
      "utf-8",
    );
    expect(documentModelsFile).toContain("billing-statement/v1");
    expect(documentModelsFile).toContain("test-doc/v1");

    await runTsc(outDir);
  });
});
