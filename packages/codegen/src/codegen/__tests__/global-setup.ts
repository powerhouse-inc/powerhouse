import { mkdirSync, rmSync } from "fs";
import path from "path";
import { PURGE_AFTER_TEST } from "./config.js";
import { TEST_OUTPUT_DIR } from "./constants.js";

export default function globalSetup() {
  const testDir = import.meta.dirname;
  const testOutputDir = path.join(testDir, TEST_OUTPUT_DIR);

  try {
    rmSync(testOutputDir, { recursive: true, force: true });
  } catch (error) {
    // Ignore error if folder doesn't exist
  }

  mkdirSync(testOutputDir, { recursive: true });

  return () => {
    if (!PURGE_AFTER_TEST) return;
    rmSync(testOutputDir, { recursive: true, force: true });
  };
}
