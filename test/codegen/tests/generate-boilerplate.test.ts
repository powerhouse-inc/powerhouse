import { createProject } from "@powerhousedao/codegen";
import { $ } from "bun";
import { afterAll, describe, test } from "bun:test";
import { join } from "path";
import process from "process";
import { TEST_OUTPUT } from "../constants.js";
import { mkdirRecursive, rmForce } from "../utils.js";

const cwd = process.cwd();
const testOutputDir = join(cwd, TEST_OUTPUT);
const outDir = join(testOutputDir, "generate-boilerplate");

describe("generate boilerplate", () => {
  afterAll(() => {
    process.chdir(cwd);
  });
  test("should generate correct boilerplate", async () => {
    const name = "test-boilerplate-project";
    await rmForce(outDir);
    await mkdirRecursive(outDir);
    process.chdir(outDir);
    await createProject({
      name,
      packageManager: "bun",
      tag: "dev",
      skipGitInit: true,
      skipInstall: true,
    });
    const generatedProjectDir = join(outDir, name);
    await $`bun run --cwd ${generatedProjectDir} tsc --noEmit`;
  });
});
