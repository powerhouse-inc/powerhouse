// The operation tests codegen scaffolds for a module, run with vitest against
// the stub reducers and against implemented ones.
import { generateAllDocumentModels } from "@powerhousedao/codegen";
import { buildTsMorphProject } from "@powerhousedao/codegen/utils";
import { beforeAll, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  CODEGEN_TESTS_PACKAGE_DIR,
  TEST_OUTPUT,
  WITH_DOCUMENT_MODELS_SPEC_2,
} from "../constants.js";
import { cpForce, mkdirRecursive, rmForce } from "../utils.js";

const outDir = join(TEST_OUTPUT, "generated-reducer-tests");
const projectDir = join(outDir, "project");
// The project's own config, which resolves its tsconfig paths.
const configPath = join(projectDir, "vitest.config.ts");
const versionDir = join(projectDir, "document-models", "test-doc", "v1");
const testFile = "document-models/test-doc/v1/tests/base-operations.test.ts";

function runScaffoldedTests() {
  const require = createRequire(
    join(CODEGEN_TESTS_PACKAGE_DIR, "package.json"),
  );
  const vitest = join(require.resolve("vitest/package.json"), "../vitest.mjs");
  const result = spawnSync(
    process.execPath,
    [vitest, "run", "--root", projectDir, "--config", configPath, testFile],
    { encoding: "utf8" },
  );
  return { status: result.status, output: result.stdout + result.stderr };
}

beforeAll(async () => {
  await rmForce(outDir);
  await mkdirRecursive(outDir);
  await cpForce(WITH_DOCUMENT_MODELS_SPEC_2, projectDir);
  // Scaffolded by this codegen, not the one the fixture was built with.
  await rmForce(join(projectDir, testFile));
  const project = buildTsMorphProject(projectDir);
  await generateAllDocumentModels(project);
  await project.save();
});

describe("scaffolded operation tests", () => {
  it("fail while the reducers only throw", () => {
    const { status, output } = runScaffoldedTests();
    expect(output).toContain(
      "Reducer for 'setTestIdOperation' not implemented",
    );
    expect(status).not.toBe(0);
  });

  it("resolve the project's tsconfig paths without the vite-tsconfig-paths plugin", () => {
    const { output } = runScaffoldedTests();
    expect(output).not.toContain("Cannot find package");
    expect(output).not.toContain("vite-tsconfig-paths");
  });

  it("pass once the reducers apply the operations", async () => {
    await writeFile(
      join(versionDir, "src", "reducers", "base-operations.ts"),
      `import type { TestDocBaseOperationsOperations } from "document-models/test-doc/v1";

export const testDocBaseOperationsOperations: TestDocBaseOperationsOperations =
  {
    setTestIdOperation() {},
    setTestNameOperation() {},
  };
`,
    );
    const { status, output } = runScaffoldedTests();
    expect(output).toContain("2 passed");
    expect(status).toBe(0);
  });
});

// A test file the project rewrote keeps its tests; codegen adds a scaffold
// test only for an operation nothing in the file exercises.
describe("regenerating a rewritten operation test file", () => {
  const rewrittenDir = join(TEST_OUTPUT, "rewritten-operation-tests");
  const file = join(rewrittenDir, testFile);

  async function regenerateWith(source: string) {
    await rmForce(rewrittenDir);
    await cpForce(WITH_DOCUMENT_MODELS_SPEC_2, rewrittenDir);
    await writeFile(file, source);
    const project = buildTsMorphProject(rewrittenDir);
    await generateAllDocumentModels(project);
    await project.save();
    return readFile(file, "utf8");
  }

  it("adds no scaffold test for an operation whose creator a test calls", async () => {
    const regenerated =
      await regenerateWith(`import { reducer, setTestId, utils } from "document-models/test-doc/v1";
import { describe, expect, it } from "vitest";

describe("BaseOperationsOperations", () => {
  it("records the id", () => {
    const document = reducer(utils.createDocument(), setTestId({ id: 1 }));
    expect(document.operations.global).toHaveLength(1);
  });
});
`);
    expect(regenerated).toContain('it("records the id"');
    expect(regenerated).not.toContain("should handle setTestId operation");
    // Nothing in the file tests setTestName yet.
    expect(regenerated).toContain("should handle setTestName operation");
  });

  it("adds none for an operation a test dispatches by its action type", async () => {
    const regenerated =
      await regenerateWith(`import { reducer, setTestId, utils } from "document-models/test-doc/v1";
import { describe, expect, it } from "vitest";

describe("BaseOperationsOperations", () => {
  it("records the id", () => {
    const document = reducer(utils.createDocument(), setTestId({ id: 1 }));
    expect(document.operations.global).toHaveLength(1);
  });

  it("records the name", () => {
    const document = reducer(utils.createDocument(), {
      type: "SET_TEST_NAME",
      input: { name: "a" },
      scope: "global",
    } as never);
    expect(document.operations.global).toHaveLength(1);
  });
});
`);
    expect(regenerated).not.toContain("should handle");
    expect(regenerated).toContain('it("records the name"');
  });
});
