import { generateProcessor } from "@powerhousedao/codegen";
import { ReactorBuilder } from "@powerhousedao/reactor";
import type { ReactorModule } from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type {
  DocumentModelModule,
  OperationWithContext,
} from "@powerhousedao/shared/document-model";
import type { IProcessor } from "@powerhousedao/shared/processors";
import type { ProcessorApps } from "@powerhousedao/shared/processors";
import { $ } from "bun";
import { afterEach, describe, expect, it } from "bun:test";
import { join } from "path";
import { Project } from "ts-morph";
import { NEW_PROJECT, TEST_OUTPUT, TEST_PROJECTS } from "../constants.js";
import { cpForce, mkdirRecursive, rmForce } from "../utils.js";

const parentOutDir = join(process.cwd(), TEST_OUTPUT);
const testProjectDir = join(process.cwd(), TEST_PROJECTS);
await rmForce(parentOutDir);
await mkdirRecursive(parentOutDir);

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

  const outDir = join(parentOutDir, outDirName);

  await cpForce(join(testProjectDir, NEW_PROJECT), outDir);

  for (const input of inputs) {
    await generateProcessor({
      ...input,
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

/**
 * Polls an assertion function until it passes or the timeout is reached.
 */
async function waitFor(fn: () => void, timeout = 5000) {
  const start = Date.now();
  let lastError: unknown;
  while (Date.now() - start < timeout) {
    try {
      fn();
      return;
    } catch (e) {
      lastError = e;
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  throw lastError;
}

/**
 * Uses ts-morph to instrument a generated processor's index.ts:
 * - Adds a module-level `export const log: any[] = [];`
 * - Inserts `log.push(...operations);` as the first statement in `onOperations`
 */
function instrumentProcessorWithLog(indexFilePath: string) {
  const project = new Project();
  const sourceFile = project.addSourceFileAtPath(indexFilePath);

  // Add module-level log array
  sourceFile.addStatements(`\nexport const log: any[] = [];`);

  // Find the processor class and its onOperations method, then inject log statement
  const processorClass = sourceFile.getClassOrThrow(
    "TestE2eProcessorProcessor",
  );
  const onOperationsMethod = processorClass.getMethodOrThrow("onOperations");

  onOperationsMethod.insertStatements(0, "log.push(...operations);");

  sourceFile.saveSync();
}

describe("processor e2e integration", () => {
  let reactorModule: ReactorModule | undefined;

  afterEach(async () => {
    if (reactorModule) {
      reactorModule.reactor.kill();
      await reactorModule.database.destroy();
      reactorModule = undefined;
    }
  });

  it("should generate a processor, instrument it, plug into a reactor, and observe operations", async () => {
    const outDir = join(parentOutDir, "e2e-processor");
    await cpForce(join(testProjectDir, NEW_PROJECT), outDir);

    // 1. Generate a processor via codegen
    await generateProcessor({
      processorName: "test-e2e-processor",
      processorType: "analytics",
      documentTypes: ["powerhouse/document-drive"],
      processorApps: ["connect"],
      rootDir: outDir,
    });

    // 2. Instrument the generated processor with ts-morph to add a log
    const processorIndexPath = join(
      outDir,
      "processors",
      "test-e2e-processor",
      "index.ts",
    );
    instrumentProcessorWithLog(processorIndexPath);

    // 3. Dynamic import the instrumented processor (bun handles .ts natively)
    const processorModule = (await import(processorIndexPath)) as {
      TestE2eProcessorProcessor: new (analyticsStore: null) => IProcessor;
      log: OperationWithContext[];
    };
    const { TestE2eProcessorProcessor: ProcessorClass, log } = processorModule;

    expect(ProcessorClass).toBeDefined();
    expect(log).toBeInstanceOf(Array);
    expect(log).toHaveLength(0);

    // 4. Build a reactor with the drive document model
    reactorModule = await new ReactorBuilder()
      .withDocumentModels([
        driveDocumentModelModule as unknown as DocumentModelModule,
      ])
      .buildModule();

    // 5. Register a factory that uses the generated processor class
    await reactorModule.processorManager.registerFactory(
      "e2e-test-factory",
      () => {
        const processor = new ProcessorClass(null);
        return [{ processor, filter: {} }];
      },
    );

    // 6. Create a drive document to trigger operations
    const driveDoc = driveDocumentModelModule.utils.createDocument();
    await reactorModule.reactor.create(driveDoc);

    // 7. Wait for the processor to receive operations
    await waitFor(() => {
      expect(log.length).toBeGreaterThan(0);
    });

    // 8. Verify the processor received drive operations
    const driveOps = log.filter(
      (op) => op.context.documentType === "powerhouse/document-drive",
    );
    expect(driveOps.length).toBeGreaterThan(0);
  });
});
