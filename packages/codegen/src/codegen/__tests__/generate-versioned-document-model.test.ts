import { paramCase } from "change-case";
import { readdirSync } from "fs";
import path from "path";
import { describe, it, type TestContext } from "vitest";
import { generateDocumentModel } from "../generate.js";
import { loadDocumentModel } from "../utils.js";
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

function getDocumentModelsDirName(testOutDir: string) {
  return path.join(testOutDir, "document-models");
}

describe("versioned document models", () => {
  it("should generate new document models as v1", async (context) => {
    const testOutDir = getTestOutDir(context);
    resetDirForTest(testOutDir);
    const documentModelsDir = getDocumentModelsDirName(testOutDir);
    const emptyProjectDir = getDirInTestDataDir("empty-project");
    await copyAllFiles(emptyProjectDir, testOutDir);

    const specVersion1DocumentModelsDir = getDirInTestDataDir("spec-version-1");
    const documentModelDirs = readdirSync(specVersion1DocumentModelsDir, {
      withFileTypes: true,
    })
      .filter((value) => value.isDirectory())
      .map((value) => value.name);

    const documentModelStates = await Promise.all(
      documentModelDirs.map(
        async (dirName) =>
          await loadDocumentModel(
            getDocumentModelJsonFilePath(
              specVersion1DocumentModelsDir,
              dirName,
            ),
          ),
      ),
    );

    for (const documentModelState of documentModelStates) {
      await generateDocumentModel({
        documentModelState,
        dir: documentModelsDir,
        legacy: false,
      });
    }
    purgeDirAfterTest(testOutDir);
  });
});
