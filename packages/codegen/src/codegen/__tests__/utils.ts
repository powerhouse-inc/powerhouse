import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "path";
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

export function getTestOutDirPath(testOutDirCount: number, outDirName: string) {
  return path.join(outDirName, `test-${testOutDirCount}`);
}
