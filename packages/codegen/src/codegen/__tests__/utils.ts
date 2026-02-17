import { kebabCase } from "change-case";
import { copyFile, mkdir, readdir, rm } from "node:fs/promises";
import path from "path";
import { PURGE_AFTER_TEST } from "./config.js";
import { TEST_DATA_DIR, TEST_OUTPUT_DIR } from "./constants.js";

export async function copyAllFiles(srcDir: string, destDir: string) {
  // Ensure destination exists
  await mkdir(destDir, { recursive: true });

  // Read all entries in the source directory
  const entries = await readdir(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      // Recursively copy subdirectories
      await copyAllFiles(srcPath, destPath);
    } else if (entry.isFile()) {
      await copyFile(srcPath, destPath);
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
  return path.join(outDirName, `test-${kebabCase(testName)}`);
}

export async function resetDirForTest(outDirName: string) {
  try {
    await rm(outDirName, { recursive: true, force: true });
    await mkdir(outDirName, { recursive: true });
  } catch (error) {
    // Ignore error if folder doesn't exist
  }
}

export async function purgeDirAfterTest(outDirName: string) {
  if (PURGE_AFTER_TEST) {
    try {
      await rm(outDirName, { recursive: true, force: true });
    } catch (error) {
      // Ignore error if folder doesn't exist
    }
  }
}
