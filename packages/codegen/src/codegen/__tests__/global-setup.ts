import { mkdir } from "node:fs/promises";
import path from "path";
import { TEST_OUTPUT_DIR } from "./constants.js";

export default async function globalSetup() {
  const testDir = import.meta.dirname;
  const testOutputDir = path.join(testDir, TEST_OUTPUT_DIR);
  await mkdir(testOutputDir, { recursive: true });
}
