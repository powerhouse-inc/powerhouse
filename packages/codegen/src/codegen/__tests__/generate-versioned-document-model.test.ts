import { paramCase } from "change-case";
import { readdirSync } from "fs";
import path from "path";
import { describe, it, type TestContext } from "vitest";
import { generateDocumentModel } from "../generate.js";
import { loadDocumentModel } from "../utils.js";
import { runGeneratedTests } from "./fixtures/run-generated-tests.js";
import { compile } from "./fixtures/typecheck.js";
import { copyAllFiles, purgeDirAfterTest, resetDirForTest } from "./utils.js";

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
  return path.join(testOutputParentDir, paramCase(context.task.name));
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
      purgeDirAfterTest(testOutDir);
      await compile(testOutDir);
      await runGeneratedTests(testOutDir);
    },
  );
});
