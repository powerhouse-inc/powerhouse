import type { ProcessorApps } from "shared";
import { $ } from "bun";
import { describe, it } from "bun:test";
import { cp } from "node:fs/promises";
import path from "path";
import { generateProcessor } from "../generate.js";

const testsDir = import.meta.dirname;
const testOutputDir = path.join(testsDir, ".test-output");
const testsDataDir = path.join(testsDir, "data");
const dataDirName = "processors-test-project";
const parentOutDirName = "generate-processors";
const testOutputParentDir = path.join(testOutputDir, parentOutDirName);
type ProcessorTestsInput = {
  processorName: string;
  processorType: "analytics" | "relationalDb";
  processorApps: ProcessorApps;
  documentTypes: string[];
};
async function runProcessorTests(args: {
  outDirName: string;
  inputs: ProcessorTestsInput[];
}) {
  const { outDirName, inputs } = args;

  const dataDir = path.join(testsDataDir, dataDirName);
  const outDir = path.join(testOutputParentDir, outDirName);

  await cp(dataDir, outDir, {
    recursive: true,
    force: true,
  });

  for (const input of inputs) {
    await generateProcessor({
      ...input,
      useTsMorph: true,
      rootDir: outDir,
    });
  }
  await $`bun run --cwd ${outDir} tsc`;
  return outDir;
}

describe("generate processor", () => {
  describe("analytics processor", () => {
    it("should generate an analytics processor and factory with app connect", async () => {
      await runProcessorTests({
        outDirName: "analytics-with-app-connect",
        inputs: [
          {
            processorName: "test-analytics-processor",
            processorType: "analytics",
            documentTypes: ["billing-statement"],
            processorApps: ["connect"],
          },
        ],
      });
    });
    it("should generate an analytics processor and factory with app switchboard", async () => {
      await runProcessorTests({
        outDirName: "analytics-with-app-switchboard",
        inputs: [
          {
            processorName: "test-analytics-processor",
            processorType: "analytics",
            documentTypes: ["billing-statement"],
            processorApps: ["switchboard"],
          },
        ],
      });
    });
    it("should generate an analytics processor and factory with app both connect and switchboard", async () => {
      await runProcessorTests({
        outDirName: "analytics-with-app-connect-and-switchboard",
        inputs: [
          {
            processorName: "test-analytics-processor",
            processorType: "analytics",
            documentTypes: ["billing-statement"],
            processorApps: ["switchboard", "connect"],
          },
        ],
      });
    });
    it("should generate multiple analytics processors with composable factories with app connect", async () => {
      await runProcessorTests({
        outDirName: "multiple-analytics-with-app-connect",
        inputs: [
          {
            processorName: "test1",
            processorType: "analytics",
            documentTypes: ["billing-statement"],
            processorApps: ["connect"],
          },
          {
            processorName: "test2",
            processorType: "analytics",
            documentTypes: ["billing-statement"],
            processorApps: ["connect"],
          },
          {
            processorName: "test3",
            processorType: "analytics",
            documentTypes: ["billing-statement"],
            processorApps: ["connect"],
          },
        ],
      });
    });
    it("should generate multiple analytics processors with composable factories with app switchboard", async () => {
      await runProcessorTests({
        outDirName: "multiple-analytics-with-app-switchboard",
        inputs: [
          {
            processorName: "test1",
            processorType: "analytics",
            documentTypes: ["billing-statement"],
            processorApps: ["switchboard"],
          },
          {
            processorName: "test2",
            processorType: "analytics",
            documentTypes: ["billing-statement"],
            processorApps: ["switchboard"],
          },
          {
            processorName: "test3",
            processorType: "analytics",
            documentTypes: ["billing-statement"],
            processorApps: ["switchboard"],
          },
        ],
      });
    });
    it("should generate multiple analytics processors with composable factories with a combination of processor apps", async () => {
      await runProcessorTests({
        outDirName:
          "multiple-analytics-with-switchboard-and-connect-switchboard-and-connect",
        inputs: [
          {
            processorName: "analytics-with-switchboard",
            processorType: "analytics",
            documentTypes: ["billing-statement"],
            processorApps: ["switchboard"],
          },
          {
            processorName: "analytics-with-connect",
            processorType: "analytics",
            documentTypes: ["billing-statement"],
            processorApps: ["connect"],
          },
          {
            processorName: "analytics-with-switchboard-and-connect",
            processorType: "analytics",
            documentTypes: ["billing-statement"],
            processorApps: ["switchboard", "connect"],
          },
        ],
      });
    });
  });
  describe("relational db processor", () => {
    it("should generate a relational db processor and factory with app connect", async () => {
      await runProcessorTests({
        outDirName: "relational-db-with-connect",
        inputs: [
          {
            processorName: "test-relational-processor",
            processorType: "relationalDb",
            documentTypes: ["billing-statement"],
            processorApps: ["connect"],
          },
        ],
      });
    });
    it("should generate a relational db processor and factory with app switchboard", async () => {
      await runProcessorTests({
        outDirName: "relational-db-with-switchboard",
        inputs: [
          {
            processorName: "test-relational-processor",
            processorType: "relationalDb",
            documentTypes: ["billing-statement"],
            processorApps: ["switchboard"],
          },
        ],
      });
    });
    it("should generate multiple relational db processors with composable factories with app connect", async () => {
      await runProcessorTests({
        outDirName: "multiple-relational-db-with-connect",
        inputs: [
          {
            processorName: "test1",
            processorType: "relationalDb",
            documentTypes: ["billing-statement"],
            processorApps: ["connect"],
          },
          {
            processorName: "test2",
            processorType: "relationalDb",
            documentTypes: ["billing-statement"],
            processorApps: ["connect"],
          },
          {
            processorName: "test3",
            processorType: "relationalDb",
            documentTypes: ["billing-statement"],
            processorApps: ["connect"],
          },
        ],
      });
    });
    it("should generate multiple relational db processors with composable factories with app switchboard", async () => {
      await runProcessorTests({
        outDirName: "multiple-relational-db-with-switchboard",
        inputs: [
          {
            processorName: "test1",
            processorType: "relationalDb",
            documentTypes: ["billing-statement"],
            processorApps: ["switchboard"],
          },
          {
            processorName: "test2",
            processorType: "relationalDb",
            documentTypes: ["billing-statement"],
            processorApps: ["switchboard"],
          },
          {
            processorName: "test3",
            processorType: "relationalDb",
            documentTypes: ["billing-statement"],
            processorApps: ["switchboard"],
          },
        ],
      });
    });
    it("should generate multiple relational db processors with composable factories with a combination of apps connect and switchboard", async () => {
      await runProcessorTests({
        outDirName: "multiple-relational-db-with-connect-and-switchboard",
        inputs: [
          {
            processorName: "relational-db-with-connect",
            processorType: "relationalDb",
            documentTypes: ["billing-statement"],
            processorApps: ["connect"],
          },
          {
            processorName: "relational-db-with-switchboard",
            processorType: "relationalDb",
            documentTypes: ["billing-statement"],
            processorApps: ["switchboard"],
          },
          {
            processorName: "relational-db-with-switchboard-and-connect",
            processorType: "relationalDb",
            documentTypes: ["billing-statement"],
            processorApps: ["connect", "switchboard"],
          },
        ],
      });
    });
  });
  describe("relational db and analytics processors", () => {
    it("should generate multiple relational db and analytics processors with a combination of processor apps", async () => {
      await runProcessorTests({
        outDirName: "multiple-relational-db-with-connect-and-switchboard",
        inputs: [
          {
            processorName: "relational-db-with-connect",
            processorType: "relationalDb",
            documentTypes: ["billing-statement"],
            processorApps: ["connect"],
          },
          {
            processorName: "relational-db-with-switchboard",
            processorType: "relationalDb",
            documentTypes: ["billing-statement"],
            processorApps: ["switchboard"],
          },
          {
            processorName: "relational-db-with-switchboard-and-connect",
            processorType: "relationalDb",
            documentTypes: ["billing-statement"],
            processorApps: ["connect", "switchboard"],
          },
          {
            processorName: "analytics-with-switchboard",
            processorType: "analytics",
            documentTypes: ["billing-statement"],
            processorApps: ["switchboard"],
          },
          {
            processorName: "analytics-with-connect",
            processorType: "analytics",
            documentTypes: ["billing-statement"],
            processorApps: ["connect"],
          },
          {
            processorName: "analytics-with-switchboard-and-connect",
            processorType: "analytics",
            documentTypes: ["billing-statement"],
            processorApps: ["switchboard", "connect"],
          },
        ],
      });
    });
  });
});
