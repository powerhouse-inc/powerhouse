import { generateProcessor } from "@powerhousedao/codegen";
import { fileExists } from "@powerhousedao/shared/clis";
import type { InProcessReactorModule } from "@powerhousedao/reactor";
import { ReactorBuilder } from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";

import { createAnalyticsStore } from "@powerhousedao/reactor-browser";
import {
  type DocumentModelModule,
  type OperationWithContext,
  type PHDocumentHeader,
} from "@powerhousedao/shared/document-model";
import type {
  IProcessor,
  IProcessorHostModule,
  ProcessorApps,
  ProcessorRecord,
} from "@powerhousedao/shared/processors";
import { afterEach, describe, expect, it } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "path";
import { Project } from "ts-morph";
import { NEW_PROJECT, TEST_OUTPUT } from "../constants.js";
import { cpForce, mkdirRecursive, rmForce, runTsc } from "../utils.js";

import { PGlite } from "@electric-sql/pglite";
import { live } from "@electric-sql/pglite/live";
import { buildTsMorphProject } from "@powerhousedao/codegen/utils";
import { createRelationalDb } from "@powerhousedao/shared/processors";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";

async function getDb() {
  const pgLite = await PGlite.create({
    extensions: { live },
  });

  const kysely = new Kysely({
    dialect: new PGliteDialect(pgLite),
  });

  const relationalDb = createRelationalDb(kysely);

  return { pgLite, relationalDb };
}

const parentOutDir = join(TEST_OUTPUT, "generate-processor");
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

  await cpForce(NEW_PROJECT, outDir);
  const project = buildTsMorphProject(outDir);

  for (const input of inputs) {
    await generateProcessor(
      {
        ...input,
      },
      project,
    );
  }
  await project.save();
  await runTsc(outDir);

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
  // A customized processor's files are only on disk on a fresh project — the
  // case skipAddingFilesFromTsConfig regresses, overwriting user code.
  it("should not overwrite a customized processor on a fresh project", async () => {
    const outDir = join(parentOutDir, "preserve-customized-processor");
    await cpForce(NEW_PROJECT, outDir);
    const customDir = join(outDir, "processors", "my-custom");
    await mkdirRecursive(customDir);
    const customIndex = "export class MyCustomProcessor {}\n";
    await writeFile(join(customDir, "index.ts"), customIndex);

    const project = buildTsMorphProject(outDir);
    await generateProcessor(
      {
        processorName: "my-custom",
        processorType: "analytics",
        documentTypes: ["billing-statement"],
        processorApps: ["connect"],
      },
      project,
    );
    await project.save();

    expect(await readFile(join(customDir, "index.ts"), "utf-8")).toBe(
      customIndex,
    );
    expect(await fileExists(join(customDir, "processor.ts"))).toBe(false);
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
  const processorClass = sourceFile.getClassOrThrow("TestConnectAnalytics");
  const onOperationsMethod = processorClass.getMethodOrThrow("onOperations");

  onOperationsMethod.insertStatements(0, "log.push(...operations);");

  sourceFile.saveSync();
}

describe("processor e2e integration", () => {
  let reactorModule: InProcessReactorModule | undefined;

  afterEach(async () => {
    if (reactorModule) {
      reactorModule.reactor.kill();
      await reactorModule.database.destroy();
      reactorModule = undefined;
    }
  });

  it("should generate a processor, instrument it, plug into a reactor, and observe operations", async () => {
    const outDir = join(parentOutDir, "e2e-processor");
    await cpForce(NEW_PROJECT, outDir);
    const project = buildTsMorphProject(outDir);
    // 1. Generate a processor via codegen
    await generateProcessor(
      {
        processorName: "test-connect-analytics",
        processorType: "analytics",
        documentTypes: ["powerhouse/document-drive"],
        processorApps: ["connect"],
      },
      project,
    );

    // 1. Generate a processor via codegen
    await generateProcessor(
      {
        processorName: "test-switchboard-analytics",
        processorType: "analytics",
        documentTypes: ["powerhouse/document-drive"],
        processorApps: ["switchboard"],
      },
      project,
    );

    // 1. Generate a processor via codegen
    await generateProcessor(
      {
        processorName: "test-isomorphic-analytics",
        processorType: "analytics",
        documentTypes: ["powerhouse/document-drive"],
        processorApps: ["connect", "switchboard"],
      },
      project,
    );

    await generateProcessor(
      {
        processorName: "test-connect-relational-db",
        processorType: "relationalDb",
        documentTypes: ["powerhouse/document-drive"],
        processorApps: ["connect"],
      },
      project,
    );

    await generateProcessor(
      {
        processorName: "test-switchboard-relational-db",
        processorType: "relationalDb",
        documentTypes: ["powerhouse/document-drive"],
        processorApps: ["switchboard"],
      },
      project,
    );

    await generateProcessor(
      {
        processorName: "test-isomorphic-relational-db",
        processorType: "relationalDb",
        documentTypes: ["powerhouse/document-drive"],
        processorApps: ["connect", "switchboard"],
      },
      project,
    );

    await project.save();

    // 2. Instrument the generated processor with ts-morph to add a log
    const processorFilePath = join(
      outDir,
      "processors",
      "test-connect-analytics",
      "processor.ts",
    );
    instrumentProcessorWithLog(processorFilePath);

    // 3. Dynamic import the instrumented processor (bun handles .ts natively)
    const processorModule = (await import(processorFilePath)) as {
      TestConnectAnalytics: new (analyticsStore: null) => IProcessor;
      log: OperationWithContext[];
    };
    const { TestConnectAnalytics: ProcessorClass, log } = processorModule;

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

    const processorsIndexPath = join(outDir, "processors", "index.ts");
    const { pgLite, relationalDb } = await getDb();
    const { store } = await createAnalyticsStore({ pgLite });

    const mockDispatch = {
      execute() {
        return Promise.resolve({ id: "mock", status: "mock" });
      },
    };
    const mockGetReadModel = <T>(): T => {
      throw new Error("No read models in test");
    };
    const mockConnectHostModule: IProcessorHostModule = {
      processorApp: "connect",
      analyticsStore: store,
      relationalDb,
      dispatch: mockDispatch,
      getReadModel: mockGetReadModel,
    };
    const mockSwitchboardHostModule: IProcessorHostModule = {
      processorApp: "switchboard",
      analyticsStore: store,
      relationalDb,
      dispatch: mockDispatch,
      getReadModel: mockGetReadModel,
    };
    const mockDocumentHeader = {
      id: "some-id",
      slug: "vetra-dev",
    } as PHDocumentHeader;
    const { processorFactory } = (await import(processorsIndexPath)) as {
      processorFactory: (
        module: IProcessorHostModule,
      ) => Promise<
        (driveHeader: PHDocumentHeader) => Promise<ProcessorRecord[]>
      >;
    };
    const connectProcessorRecordFactory = await processorFactory(
      mockConnectHostModule,
    );
    const switchboardProcessorRecordFactory = await processorFactory(
      mockSwitchboardHostModule,
    );
    const connectProcessorRecords =
      await connectProcessorRecordFactory(mockDocumentHeader);
    const connectProcessorNames = getProcessorNames(connectProcessorRecords);
    expect(
      connectProcessorNames.filter((n) =>
        n.toLowerCase().includes("switchboard"),
      ),
    ).toHaveLength(0);

    expect(
      connectProcessorNames.filter((n) => n.toLowerCase().includes("connect")),
    ).toHaveLength(2);

    expect(
      connectProcessorNames.filter((n) =>
        n.toLowerCase().includes("isomorphic"),
      ),
    ).toHaveLength(2);

    const switchboardProcessorRecords =
      await switchboardProcessorRecordFactory(mockDocumentHeader);
    const switchboardProcessorNames = getProcessorNames(
      switchboardProcessorRecords,
    );

    expect(
      switchboardProcessorNames.filter((n) =>
        n.toLowerCase().includes("connect"),
      ),
    ).toHaveLength(0);

    expect(
      switchboardProcessorNames.filter((n) =>
        n.toLowerCase().includes("switchboard"),
      ),
    ).toHaveLength(2);

    expect(
      switchboardProcessorNames.filter((n) =>
        n.toLowerCase().includes("isomorphic"),
      ),
    ).toHaveLength(2);
  });
});

function getProcessorNames(processorRecords: ProcessorRecord[]): string[] {
  /* eslint-disable */
  return processorRecords.map(
    ({ processor }) =>
      // @ts-expect-error
      processor._namespace ?? processor.NAMESPACE ?? processor.namespace,
  );
  /* eslint-enable */
}
