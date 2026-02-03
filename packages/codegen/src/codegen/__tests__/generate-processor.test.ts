import { paramCase } from "change-case";
import { mkdir, rm } from "node:fs/promises";
import path from "path";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  it,
  type TestContext,
} from "vitest";
import { hygenGenerateProcessor } from "../hygen.js";
import { purgeDirAfterTest, resetDirForTest, runTsc } from "./utils.js";

let testCount = 1;

const parentOutDirName = "generate-processors";
const testsDir = import.meta.dirname;
const testOutputParentDir = path.join(
  testsDir,
  ".test-output",
  parentOutDirName,
);
let testOutDirPath = "";
const processorsDirName = "processors";

function getTestOutDir(context: TestContext) {
  const testDirName = `${testCount++}-${paramCase(context.task.name)}`;
  return path.join(testOutputParentDir, testDirName);
}

describe("generate processor", () => {
  beforeEach(async (context) => {
    testOutDirPath = getTestOutDir(context);
    await rm(testOutDirPath, { recursive: true, force: true });
    await mkdir(testOutDirPath, { recursive: true });
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
      await hygenGenerateProcessor(
        "test-analytics-processor",
        ["billing-statement"],
        path.join(testOutDirPath, processorsDirName),
        "analytics",
        {
          skipFormat: true,
        },
      );

      // await compile(testOutDirPath);
      await runTsc(testOutDirPath);
    },
  );
  it(
    "should generate multiple analytics processors with composable factories",
    {
      timeout: 100000,
    },
    async () => {
      await hygenGenerateProcessor(
        "test1",
        ["billing-statement"],
        path.join(testOutDirPath, processorsDirName),
        "analytics",
        {
          skipFormat: true,
        },
      );

      await hygenGenerateProcessor(
        "test2",
        ["billing-statement"],
        path.join(testOutDirPath, processorsDirName),
        "analytics",
        {
          skipFormat: true,
        },
      );

      await hygenGenerateProcessor(
        "test3",
        ["billing-statement"],
        path.join(testOutDirPath, processorsDirName),
        "analytics",
        {
          skipFormat: true,
        },
      );

      // await compile(testOutDirPath);
      await runTsc(testOutDirPath);
    },
  );
  it(
    "should generate a relational db processor and factory",
    {
      timeout: 100000,
    },
    async () => {
      await hygenGenerateProcessor(
        "test-relational-processor",
        ["billing-statement"],
        path.join(testOutDirPath, processorsDirName),
        "relationalDb",
        {
          skipFormat: true,
        },
      );

      // await compile(testOutDirPath);
      await runTsc(testOutDirPath);
    },
  );

  it(
    "should generate multiple relational db processors with composable factories",
    {
      timeout: 100000,
    },
    async () => {
      await hygenGenerateProcessor(
        "test1",
        ["billing-statement"],
        path.join(testOutDirPath, processorsDirName),
        "relationalDb",
        {
          skipFormat: true,
        },
      );

      await hygenGenerateProcessor(
        "test2",
        ["billing-statement"],
        path.join(testOutDirPath, processorsDirName),
        "relationalDb",
        {
          skipFormat: true,
        },
      );

      await hygenGenerateProcessor(
        "test3",
        ["billing-statement"],
        path.join(testOutDirPath, processorsDirName),
        "relationalDb",
        {
          skipFormat: true,
        },
      );

      // await compile(testOutDirPath);
      await runTsc(testOutDirPath);
    },
  );
});
