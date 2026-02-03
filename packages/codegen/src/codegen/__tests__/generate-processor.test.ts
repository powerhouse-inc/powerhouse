import { paramCase } from "change-case";
import { rm } from "node:fs/promises";
import path from "path";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  it,
  type TestContext,
} from "vitest";
import { generateProcessor } from "../generate.js";
import { USE_TS_MORPH } from "./config.js";
import { compile } from "./fixtures/typecheck.js";
import { copyAllFiles, purgeDirAfterTest, resetDirForTest } from "./utils.js";

let testCount = 1;

const parentOutDirName = "generate-processors";
const testsDir = import.meta.dirname;
const testOutputParentDir = path.join(
  testsDir,
  ".test-output",
  parentOutDirName,
);
let testOutDirPath = "";

const testsDataDir = path.join(testsDir, "data", "processors-test-project");

function getTestOutDir(context: TestContext) {
  const testDirName = `${testCount++}-${paramCase(context.task.name)}`;
  return path.join(testOutputParentDir, testDirName);
}

describe("generate processor", () => {
  beforeEach(async (context) => {
    testOutDirPath = getTestOutDir(context);
    await rm(testOutDirPath, { recursive: true, force: true });
    // await mkdir(testOutDirPath, { recursive: true });
    await copyAllFiles(testsDataDir, testOutDirPath);
    process.chdir(testOutDirPath);
  });
  beforeAll(() => {
    resetDirForTest(testOutputParentDir);
  });
  afterAll(() => {
    purgeDirAfterTest(testOutputParentDir);
  });

  it(
    "should generate an analytics processor and factory",
    {
      timeout: 100000,
    },
    async () => {
      await generateProcessor(
        "test-analytics-processor",
        "analytics",
        ["billing-statement"],
        true,
        USE_TS_MORPH,
      );

      // await compile(testOutDirPath);
      await compile(testOutDirPath);
    },
  );
  it(
    "should generate multiple analytics processors with composable factories",
    {
      timeout: 100000,
    },
    async () => {
      await generateProcessor(
        "test1",
        "analytics",
        ["billing-statement"],
        true,
        USE_TS_MORPH,
      );

      await generateProcessor(
        "test2",
        "analytics",
        ["billing-statement"],

        true,
        USE_TS_MORPH,
      );

      await generateProcessor(
        "test3",
        "analytics",
        ["billing-statement"],
        true,
        USE_TS_MORPH,
      );

      await compile(testOutDirPath);
    },
  );
  it(
    "should generate a relational db processor and factory",
    {
      timeout: 100000,
    },
    async () => {
      await generateProcessor(
        "test-relational-processor",
        "relationalDb",
        ["billing-statement"],
        true,
        USE_TS_MORPH,
      );

      await compile(testOutDirPath);
    },
  );

  it(
    "should generate multiple relational db processors with composable factories",
    {
      timeout: 100000,
    },
    async () => {
      await generateProcessor(
        "test1",
        "relationalDb",
        ["billing-statement"],
        true,
        USE_TS_MORPH,
      );

      await generateProcessor(
        "test2",
        "relationalDb",
        ["billing-statement"],
        true,
        USE_TS_MORPH,
      );

      await generateProcessor(
        "test3",
        "relationalDb",
        ["billing-statement"],
        true,
        USE_TS_MORPH,
      );

      await compile(testOutDirPath);
    },
  );
});
