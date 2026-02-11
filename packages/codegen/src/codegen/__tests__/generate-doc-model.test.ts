import { $ } from "bun";
import { describe, expect, test } from "bun:test";
import { cp, readdir } from "node:fs/promises";
import path from "path";
import { Project, ts } from "ts-morph";
import { generateDocumentModel } from "../generate.js";
import { loadDocumentModel } from "../utils.js";
const testsDir = import.meta.dirname;
const testOutputDir = path.join(testsDir, ".test-output");

function getDocumentModelJsonFilePath(basePath: string, dirName: string) {
  return path.join(basePath, dirName, `${dirName}.json`);
}

async function loadDocumentModelsInDir(
  documentModelsInDir: string,
  testOutDir: string,
  useVersioning = true,
) {
  const documentModelsOutDir = path.join(testOutDir, "document-models");
  const documentModelDirs = (
    await readdir(documentModelsInDir, {
      withFileTypes: true,
    })
  )
    .filter((value) => value.isDirectory())
    .map((value) => value.name);

  const documentModelStates = await Promise.all(
    documentModelDirs.map(
      async (dirName) =>
        await loadDocumentModel(
          getDocumentModelJsonFilePath(documentModelsInDir, dirName),
        ),
    ),
  );

  for (const documentModelState of documentModelStates) {
    await generateDocumentModel({
      documentModelState,
      dir: documentModelsOutDir,
      useTsMorph: true,
      useVersioning,
      specifiedPackageName: "test",
    });
  }
}

async function runDocumentModelTests(args: {
  testsDataDir: string;
  testOutputParentDir: string;
  useVersioning?: boolean;
  inDirName: string;
  specDirName: string;
}) {
  const {
    inDirName,
    specDirName,
    testsDataDir,
    testOutputParentDir,
    useVersioning = true,
  } = args;
  const dataDir = path.join(testsDataDir, inDirName);
  const documentModelsInDir = path.join(testsDataDir, specDirName);
  const outDir = path.join(testOutputParentDir, `${inDirName}-${specDirName}`);
  await cp(dataDir, outDir, {
    recursive: true,
    force: true,
  });
  await loadDocumentModelsInDir(documentModelsInDir, outDir, useVersioning);
  await $`bun run --cwd ${outDir} tsc --noEmit`;
  return outDir;
}

async function checkFileContents(outDir: string) {
  const project = new Project({
    tsConfigFilePath: path.join(outDir, "tsconfig.json"),
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    skipLoadingLibFiles: true,
  });
  project.addSourceFilesAtPaths(path.join(outDir, "document-models/**/*"));

  const documentModelsFile = project.getSourceFileOrThrow("document-models.ts");
  const documentModelsArray = documentModelsFile
    .getVariableStatementOrThrow("documentModels")
    .getDescendantsOfKind(ts.SyntaxKind.ArrayLiteralExpression)
    .at(0);

  const elements = documentModelsArray!
    .getElements()
    .map((e) => e.getText())
    .join(" ");
  expect(elements).toContain("BillingStatement");
  expect(elements).toContain("TestDoc");

  const billingStatementErrorFile = await Bun.file(
    path.join(
      outDir,
      "document-models",
      "billing-statement",
      "gen",
      "general",
      "error.ts",
    ),
  ).text();
  expect(billingStatementErrorFile).toContain("export type ErrorCode");
  expect(billingStatementErrorFile).toContain(`"InvalidStatusTransition"`);
  expect(billingStatementErrorFile).toContain(
    "export class InvalidStatusTransition extends Error implements ReducerError",
  );
  expect(billingStatementErrorFile).toContain(
    `errorCode = "InvalidStatusTransition" as ErrorCode`,
  );

  const lineItemsErrorFile = await Bun.file(
    path.join(
      outDir,
      "document-models",
      "billing-statement",
      "gen",
      "line-items",
      "error.ts",
    ),
  ).text();

  expect(lineItemsErrorFile).toContain("export type ErrorCode =");
  expect(lineItemsErrorFile).toContain(`"DuplicateLineItem"`);
  expect(lineItemsErrorFile).toContain(`"InvalidStatusTransition"`);
  expect(lineItemsErrorFile).toContain(
    "export class DuplicateLineItem extends Error implements ReducerError",
  );
  expect(lineItemsErrorFile).toContain(
    "export class InvalidStatusTransition extends Error implements ReducerError",
  );

  const errorCodeMatches = lineItemsErrorFile.match(
    /"InvalidStatusTransition"/g,
  );
  expect(errorCodeMatches?.length).toBe(3);
}

describe("generate doc model", () => {
  const parentOutDirName = "generate-doc-model";
  const testOutputParentDir = path.join(testOutputDir, parentOutDirName);
  const testsDataDir = path.join(testsDir, "data");
  const useVersioning = false;
  test("generate document models", async () => {
    const outDir = await runDocumentModelTests({
      inDirName: "document-models-test-project",
      specDirName: "document-models",
      testOutputParentDir,
      testsDataDir,
      useVersioning,
    });
    await checkFileContents(outDir);
  });
  test("generate document models in existing project", async () => {
    const outDir = await runDocumentModelTests({
      inDirName: "document-models-test-project-with-existing-document-models",
      specDirName: "document-models",
      testOutputParentDir,
      testsDataDir,
      useVersioning,
    });
    await checkFileContents(outDir);
  });
});

describe("versioned document models", () => {
  const parentOutDirName = "versioned-document-models";
  const testOutputParentDir = path.join(testOutputDir, parentOutDirName);
  const testsDataDir = path.join(testsDir, "data", "versioned-document-models");
  describe("v1", () => {
    test("should generate new document models as v1", async () => {
      await runDocumentModelTests({
        inDirName: "empty-project",
        specDirName: "spec-version-1",
        testOutputParentDir,
        testsDataDir,
      });
    });
    test("should persist existing reducers, tests, utils, and custom files when generating for the same spec version", async () => {
      await runDocumentModelTests({
        inDirName: "project-with-existing-document-models-at-spec-1",
        specDirName: "spec-version-1-with-more-operations",
        testOutputParentDir,
        testsDataDir,
      });
    });
  });
  describe("v2", () => {
    test("should handle generating document models as v2", async () => {
      const testOutDir = await runDocumentModelTests({
        inDirName: "empty-project",
        specDirName: "spec-version-2",
        testOutputParentDir,
        testsDataDir,
      });

      const v1ModulePath = path.join(
        testOutDir,
        "document-models",
        "test-doc",
        "v1",
        "module.ts",
      );
      const v2ModulePath = path.join(
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
    });
    test("should persist existing reducers, tests, utils, and custom files when generating a new spec version", async () => {
      await runDocumentModelTests({
        inDirName: "project-with-existing-document-models-at-spec-1",
        specDirName: "spec-version-2",
        testOutputParentDir,
        testsDataDir,
      });
    });

    test("should throw a typescript error in upgrades when new state does not match old state", () => {
      expect(
        async () =>
          await runDocumentModelTests({
            inDirName: "project-with-existing-document-models-at-spec-1",
            specDirName: "spec-version-2-with-state-changes",
            testOutputParentDir,
            testsDataDir,
          }),
      ).toThrow();
    });
  });

  describe("v3", () => {
    test("should handle generating document models as v3", async () => {
      await runDocumentModelTests({
        inDirName: "empty-project",
        specDirName: "spec-version-3",
        testOutputParentDir,
        testsDataDir,
      });
    });

    test("should persist existing reducers, tests, utils, and custom files when generating a new spec version", async () => {
      await runDocumentModelTests({
        inDirName: "project-with-existing-document-models-at-spec-2",
        specDirName: "spec-version-3",
        testOutputParentDir,
        testsDataDir,
      });
    });

    test("should throw a typescript error in upgrades when new state does not match old state", () => {
      expect(
        async () =>
          await runDocumentModelTests({
            inDirName: "project-with-existing-document-models-at-spec-2",
            specDirName: "spec-version-3-with-state-changes",
            testOutputParentDir,
            testsDataDir,
          }),
      ).toThrow();
    });
  });
});
