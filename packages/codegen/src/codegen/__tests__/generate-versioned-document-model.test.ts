import { paramCase } from "change-case";
import { readdirSync } from "fs";
import path from "path";
import { describe, expect, it, type TestContext } from "vitest";
import { generateDocumentModel } from "../generate.js";
import { loadDocumentModel } from "../utils.js";
import { runGeneratedTests } from "./fixtures/run-generated-tests.js";
import { compile } from "./fixtures/typecheck.js";
import { copyAllFiles, purgeDirAfterTest, resetDirForTest } from "./utils.js";

let testCount = 1;

const parentOutDirName = "versioned-document-models";
const testsDir = import.meta.dirname;
const testOutputParentDir = path.join(
  testsDir,
  ".test-output",
  parentOutDirName,
);
const testsDataDir = path.join(testsDir, "data", "versioned-document-models");
function getDirInTestDataDir(dirName: string) {
  return path.join(testsDataDir, dirName);
}

function getTestOutDir(context: TestContext) {
  const testDirName = `${testCount++}-${paramCase(context.task.name)}`;
  return path.join(testOutputParentDir, testDirName);
}

function getDocumentModelJsonFilePath(basePath: string, dirName: string) {
  return path.join(basePath, dirName, `${dirName}.json`);
}

async function loadDocumentModelsInDir(inDirName: string, testOutDir: string) {
  const documentModelsInDir = getDirInTestDataDir(inDirName);
  const documentModelsOutDir = path.join(testOutDir, "document-models");
  const documentModelDirs = readdirSync(documentModelsInDir, {
    withFileTypes: true,
  })
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
      legacy: false,
      specifiedPackageName: "test",
    });
  }
}

async function loadBaseProjectFromDir(dirName: string, testOutDir: string) {
  const projectDir = getDirInTestDataDir(dirName);
  await copyAllFiles(projectDir, testOutDir);
}

describe("versioned document models", () => {
  describe("spec version 1", () => {
    it(
      "should generate new document models as v1",
      {
        timeout: 10000000,
      },
      async (context) => {
        const testOutDir = getTestOutDir(context);
        resetDirForTest(testOutDir);
        await loadBaseProjectFromDir("empty-project", testOutDir);
        await loadDocumentModelsInDir("spec-version-1", testOutDir);
        await compile(testOutDir);
        await runGeneratedTests(testOutDir);
        purgeDirAfterTest(testOutDir);
      },
    );

    it(
      "should persist existing reducers, tests, utils, and custom files when generating for the same spec version",
      {
        timeout: 10000000,
      },
      async (context) => {
        const testOutDir = getTestOutDir(context);
        resetDirForTest(testOutDir);
        await loadBaseProjectFromDir(
          "project-with-existing-document-models-at-spec-1",
          testOutDir,
        );
        await loadDocumentModelsInDir(
          "spec-version-1-with-more-operations",
          testOutDir,
        );
        await compile(testOutDir);
        await runGeneratedTests(testOutDir);
        purgeDirAfterTest(testOutDir);
      },
    );
  });

  describe("spec version 2", () => {
    it(
      "should handle generating document models as v2",
      {
        timeout: 10000000,
      },
      async (context) => {
        const testOutDir = getTestOutDir(context);
        resetDirForTest(testOutDir);
        await loadBaseProjectFromDir("empty-project", testOutDir);
        await loadDocumentModelsInDir("spec-version-2", testOutDir);
        await compile(testOutDir);
        await runGeneratedTests(testOutDir);
        purgeDirAfterTest(testOutDir);
      },
    );

    it(
      "should persist existing reducers, tests, utils, and custom files when generating a new spec version",
      {
        timeout: 10000000,
      },
      async (context) => {
        const testOutDir = getTestOutDir(context);
        resetDirForTest(testOutDir);
        await loadBaseProjectFromDir(
          "project-with-existing-document-models-at-spec-1",
          testOutDir,
        );
        await loadDocumentModelsInDir("spec-version-2", testOutDir);
        await compile(testOutDir);
        await runGeneratedTests(testOutDir);
        purgeDirAfterTest(testOutDir);
      },
    );

    it(
      "should throw a typescript error in upgrades when new state does not match old state",
      {
        timeout: 10000000,
      },
      async (context) => {
        const testOutDir = getTestOutDir(context);
        resetDirForTest(testOutDir);
        await loadBaseProjectFromDir(
          "project-with-existing-document-models-at-spec-1",
          testOutDir,
        );
        await loadDocumentModelsInDir(
          "spec-version-2-with-state-changes",
          testOutDir,
        );
        await expect(() => compile(testOutDir)).rejects.toThrow();
        purgeDirAfterTest(testOutDir);
      },
    );
  });

  describe("spec version 3", () => {
    it(
      "should handle generating document models as v3",
      {
        timeout: 10000000,
      },
      async (context) => {
        const testOutDir = getTestOutDir(context);
        resetDirForTest(testOutDir);
        await loadBaseProjectFromDir("empty-project", testOutDir);
        await loadDocumentModelsInDir("spec-version-3", testOutDir);
        await compile(testOutDir);
        await runGeneratedTests(testOutDir);
        purgeDirAfterTest(testOutDir);
      },
    );

    it(
      "should persist existing reducers, tests, utils, and custom files when generating a new spec version",
      {
        timeout: 10000000,
      },
      async (context) => {
        const testOutDir = getTestOutDir(context);
        resetDirForTest(testOutDir);
        await loadBaseProjectFromDir(
          "project-with-existing-document-models-at-spec-2",
          testOutDir,
        );
        await loadDocumentModelsInDir("spec-version-3", testOutDir);
        await compile(testOutDir);
        await runGeneratedTests(testOutDir);
        purgeDirAfterTest(testOutDir);
      },
    );

    it(
      "should throw a typescript error in upgrades when new state does not match old state",
      {
        timeout: 10000000,
      },
      async (context) => {
        const testOutDir = getTestOutDir(context);
        resetDirForTest(testOutDir);
        await loadBaseProjectFromDir(
          "project-with-existing-document-models-at-spec-2",
          testOutDir,
        );
        await loadDocumentModelsInDir(
          "spec-version-3-with-state-changes",
          testOutDir,
        );
        await expect(() => compile(testOutDir)).rejects.toThrow();
        purgeDirAfterTest(testOutDir);
      },
    );
  });
});
