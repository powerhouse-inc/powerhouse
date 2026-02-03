import { paramCase } from "change-case";
import { mkdirSync, rmSync } from "node:fs";
import fs from "node:fs/promises";
import path from "path";
import {
  DiagnosticCategory,
  IndentationText,
  ModuleKind,
  Project,
  ScriptTarget,
  ts,
} from "ts-morph";
import { PURGE_AFTER_TEST } from "./config.js";
import { TEST_DATA_DIR, TEST_OUTPUT_DIR } from "./constants.js";

export async function copyAllFiles(srcDir: string, destDir: string) {
  // Ensure destination exists
  await fs.mkdir(destDir, { recursive: true });

  // Read all entries in the source directory
  const entries = await fs.readdir(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      // Recursively copy subdirectories
      await copyAllFiles(srcPath, destPath);
    } else if (entry.isFile()) {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

export function getTestOutputDir(testDir: string, testOutputDir: string) {
  return path.join(testDir, TEST_OUTPUT_DIR, testOutputDir);
}

export function getTestDataDir(testDir: string, testDataDir: string) {
  return path.join(testDir, TEST_DATA_DIR, testDataDir);
}

export function getTestOutDirPath(testName: string, outDirName: string) {
  return path.join(outDirName, `test-${paramCase(testName)}`);
}

export function resetDirForTest(outDirName: string) {
  try {
    rmSync(outDirName, { recursive: true, force: true });
    mkdirSync(outDirName, { recursive: true });
  } catch (error) {
    // Ignore error if folder doesn't exist
  }
}

export function purgeDirAfterTest(outDirName: string) {
  if (PURGE_AFTER_TEST) {
    try {
      rmSync(outDirName, { recursive: true, force: true });
    } catch (error) {
      // Ignore error if folder doesn't exist
    }
  }
}

export async function runTsc(testOutDirPath: string) {
  const project = new Project({
    compilerOptions: {
      module: ModuleKind.NodeNext,
      target: ScriptTarget.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
      sourceMap: false,
      declaration: false,
      declarationMap: false,
      strict: true,
      verbatimModuleSyntax: true,
      isolatedModules: true,
      noUncheckedSideEffectImports: true,
      moduleDetection: ts.ModuleDetectionKind.Force,
      skipLibCheck: true,
    },
    skipAddingFilesFromTsConfig: true,
    // use formatting rules which match prettier
    manipulationSettings: {
      useTrailingCommas: true,
      indentationText: IndentationText.TwoSpaces,
    },
  });
  project.addSourceFilesAtPaths(path.join(testOutDirPath, "**/*"));
  await project.save();
  const diagnostics = project.getPreEmitDiagnostics();
  const errorDiagnostics = diagnostics.filter(
    (diagnostic) => diagnostic.getCategory() === DiagnosticCategory.Error,
  );
  if (errorDiagnostics.length !== 0) {
    const formattedDiagnostics =
      project.formatDiagnosticsWithColorAndContext(errorDiagnostics);
    throw new Error(formattedDiagnostics);
  }
}
