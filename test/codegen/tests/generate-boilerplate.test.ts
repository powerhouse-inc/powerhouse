import { createProject } from "@powerhousedao/codegen";
import { $ } from "bun";
import { describe, test } from "bun:test";
import { mkdir, rm } from "fs/promises";
import path from "path";
import process from "process";

const testOutputDir = path.join(process.cwd(), "test-output");
const parentOutDirName = "generate-boilerplate";
const outDir = path.join(testOutputDir, parentOutDirName);

describe("generate boilerplate", () => {
  test("should generate correct boilerplate", async () => {
    const originalDir = process.cwd();
    const name = "test-boilerplate-project";
    await rm(outDir, { recursive: true, force: true });
    await mkdir(outDir, { recursive: true });
    process.chdir(outDir);
    await createProject({
      name,
      packageManager: "bun",
      tag: "dev",
    });
    process.chdir(originalDir);
    const generatedProjectDir = path.join(outDir, name);
    await $`bun run --cwd ${generatedProjectDir} tsc --noEmit`;
  });
});
