import { PGlite } from "@electric-sql/pglite";
import {
  ReactorClientBuilder,
  ReactorBuilder,
  type ILiveReadModelCoordinator,
  type IReadModelCoordinator,
  type Database,
  type InProcessReactorClientModule,
} from "@powerhousedao/reactor";
import { PackageManagementService } from "@powerhousedao/reactor-api";
import type { HttpPackageLoader } from "@powerhousedao/reactor-api";
import {
  ATTACHMENT_REFERENCE_READ_MODEL_ID,
  AttachmentReferenceIndexBuilder,
  type AttachmentReferenceInput,
  type AttachmentReferenceReadModel,
  type IAttachmentReferenceWriter,
} from "@powerhousedao/reactor-attachments";
import type {
  Action,
  DocumentModelModule,
  DocumentSpecification,
  OperationWithContext,
} from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  registerAttachmentReferenceReadModel,
  registerAttachmentReferenceReadModelOnModule,
} from "../src/attachment-reference-read-model.mjs";
import { applySwitchboardReactorDefaults } from "../src/builder-defaults.mjs";
import { startSwitchboard } from "../src/server.mjs";

const REF_A = `attachment://v1:${"a".repeat(64)}` as const;
const REF_B = `attachment://v1:${"b".repeat(64)}` as const;
const REF_C = `attachment://v1:${"c".repeat(64)}` as const;
const DOCUMENT_TYPE = "runtime/attachments";

function runtimeModule(version: number, schema: string): DocumentModelModule {
  const specification: DocumentSpecification = {
    changeLog: [],
    modules: [
      {
        description: null,
        id: "attachments",
        name: "attachments",
        operations: [
          {
            description: null,
            errors: [],
            examples: [],
            id: `attach-files-${version}`,
            name: "ATTACH_FILES",
            reducer: null,
            schema,
            scope: "global",
            template: null,
          },
        ],
      },
    ],
    state: {
      global: { examples: [], initialValue: "{}", schema: "" },
      local: { examples: [], initialValue: "{}", schema: "" },
    },
    version,
  };
  return {
    actions: {},
    documentModel: {
      global: { id: DOCUMENT_TYPE, specifications: [specification] },
    },
    version,
  } as unknown as DocumentModelModule;
}

function operation(ordinal: number, input: unknown): OperationWithContext {
  return {
    operation: {
      id: `operation-${ordinal}`,
      index: ordinal,
      skip: 0,
      timestampUtcMs: "2026-07-22T00:00:00.000Z",
      hash: `hash-${ordinal}`,
      action: {
        id: `action-${ordinal}`,
        type: "ATTACH_FILES",
        scope: "global",
        input,
        timestampUtcMs: "2026-07-22T00:00:00.000Z",
      } as Action,
    },
    context: {
      documentId: "runtime-document",
      documentType: DOCUMENT_TYPE,
      scope: "global",
      branch: "main",
      ordinal,
    },
  };
}

function stubLogger(): ILogger & { info: ReturnType<typeof vi.fn> } {
  const logger = {
    verbose: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
  logger.child.mockReturnValue(logger);
  return logger as unknown as ILogger & { info: ReturnType<typeof vi.fn> };
}

describe("Switchboard attachment-reference read model registration", () => {
  let database: Kysely<unknown> | undefined;
  let reactor: Awaited<ReturnType<ReactorBuilder["buildModule"]>> | undefined;

  afterEach(async () => {
    const shutdown = reactor?.reactor.kill();
    await shutdown?.completed;
    await database?.destroy();
    reactor = undefined;
    database = undefined;
  });

  it("starts on the exact caller-provided client without owning its reactor", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "switchboard-prebuilt-"));
    const readModelPath = join(tempRoot, "read-model");
    const unusedReactorPath = join(tempRoot, "reactor-storage");
    database = new Kysely<unknown>({
      dialect: new PGliteDialect(new PGlite()),
    });
    const reactorBuilder = new ReactorBuilder().withKysely(
      database as unknown as Kysely<Database>,
    );
    const clientBuilder = new ReactorClientBuilder().withReactorBuilder(
      reactorBuilder,
    );
    applySwitchboardReactorDefaults(reactorBuilder, clientBuilder, {
      signalHandlers: false,
    });
    const callerModule = await clientBuilder.buildModule();
    reactor = callerModule.reactorModule;
    const logger = stubLogger();
    const previousReactorDb = process.env.PH_REACTOR_DATABASE_URL;
    process.env.PH_REACTOR_DATABASE_URL = unusedReactorPath;
    let switchboard: Awaited<ReturnType<typeof startSwitchboard>> | undefined;

    try {
      switchboard = await startSwitchboard({
        reactor: callerModule,
        dbPath: readModelPath,
        port: 0,
        mcp: false,
        disableLocalPackages: true,
        identity: { keypairPath: join(tempRoot, "identity.json") },
        logger,
      });

      expect(switchboard.reactor).toBe(callerModule.client);
      expect(switchboard.attachmentReferenceProjection).toEqual({
        status: "available",
      });
      expect(
        callerModule.reactorModule?.readModelCoordinator.readModels.filter(
          ({ name }) => name === ATTACHMENT_REFERENCE_READ_MODEL_ID,
        ),
      ).toHaveLength(1);
      expect(existsSync(unusedReactorPath)).toBe(false);
      expect(logger.info).toHaveBeenCalledWith(
        "Reactor metrics instrumentation started (using caller-provided reactor)",
      );

      const kill = vi.spyOn(callerModule.reactor, "kill");
      await switchboard.shutdown();
      expect(kill).not.toHaveBeenCalled();
      switchboard = undefined;
    } finally {
      await switchboard?.shutdown();
      if (previousReactorDb === undefined) {
        delete process.env.PH_REACTOR_DATABASE_URL;
      } else {
        process.env.PH_REACTOR_DATABASE_URL = previousReactorDb;
      }
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("backfills and closes the registration handoff without loss or duplication", async () => {
    database = new Kysely<unknown>({
      dialect: new PGliteDialect(new PGlite()),
    });
    const attachmentReferenceIndex = await new AttachmentReferenceIndexBuilder(
      database,
    ).build();
    reactor = await new ReactorBuilder()
      .withKysely(database as unknown as Kysely<Database>)
      .buildModule();
    reactor.documentModelRegistry.registerModules(
      runtimeModule(1, "input AttachFilesInput { direct: AttachmentRef! }"),
    );

    const persisted = [
      operation(1, { direct: REF_A }),
      operation(2, { direct: REF_B }),
    ];
    vi.spyOn(reactor.operationIndex, "getSinceOrdinal").mockImplementation(
      (ordinal: number) =>
        Promise.resolve({
          results: persisted.filter(
            ({ context }) =>
              context.ordinal > ordinal &&
              (ordinal > 0 || context.ordinal === 1),
          ),
          options: { cursor: String(ordinal), limit: 100 },
        }),
    );

    const writtenOrdinals: number[] = [];
    const writer: IAttachmentReferenceWriter = {
      addReferences: async (
        references: readonly AttachmentReferenceInput[],
      ) => {
        writtenOrdinals.push(...references.map(({ ordinal }) => ordinal));
        await attachmentReferenceIndex.store.addReferences(references);
      },
    };

    const coordinator =
      reactor.readModelCoordinator as ILiveReadModelCoordinator;
    const addReadModel = coordinator.addReadModel.bind(coordinator);
    let boundaryIndexing: Promise<void> | undefined;
    vi.spyOn(coordinator, "addReadModel").mockImplementation(
      (readModel, stage) => {
        addReadModel(readModel, stage);
        boundaryIndexing = readModel.indexOperations([persisted[1]!]);
      },
    );

    const clientModule = {
      reactorModule: reactor,
    } as InProcessReactorClientModule;
    await expect(
      registerAttachmentReferenceReadModelOnModule(clientModule, writer),
    ).resolves.toEqual({ status: "available" });
    await boundaryIndexing;

    const matchingReadModels = coordinator.readModels.filter(
      ({ name }) => name === ATTACHMENT_REFERENCE_READ_MODEL_ID,
    );
    expect(matchingReadModels).toHaveLength(1);
    expect(writtenOrdinals).toEqual([1, 2]);
    await expect(
      attachmentReferenceIndex.store.hasReference("runtime-document", REF_A),
    ).resolves.toBe(true);
    await expect(
      attachmentReferenceIndex.store.hasReference("runtime-document", REF_B),
    ).resolves.toBe(true);
  });

  it("leaves a custom coordinator running and reports projection unavailable", async () => {
    database = new Kysely<unknown>({
      dialect: new PGliteDialect(new PGlite()),
    });
    const start = vi.fn();
    const customCoordinator: IReadModelCoordinator = {
      readModels: [],
      start,
      stop: vi.fn(),
      drain: vi.fn().mockResolvedValue(undefined),
      getChainDepth: vi.fn().mockReturnValue(0),
    };
    reactor = await new ReactorBuilder()
      .withKysely(database as unknown as Kysely<Database>)
      .withReadModelCoordinator(customCoordinator)
      .buildModule();
    const addReferences = vi.fn();
    const writer = { addReferences } as IAttachmentReferenceWriter;

    await expect(
      registerAttachmentReferenceReadModelOnModule(
        { reactorModule: reactor } as InProcessReactorClientModule,
        writer,
      ),
    ).resolves.toEqual({
      status: "unavailable",
      reason: "live-read-model-registration-unsupported",
    });
    expect(start).toHaveBeenCalledOnce();
    expect(customCoordinator.readModels).toEqual([]);
    expect(addReferences).not.toHaveBeenCalled();
  });

  it("starts Switchboard with a custom coordinator while reporting projection unavailable", async () => {
    const tempRoot = await mkdtemp(
      join(tmpdir(), "switchboard-custom-coordinator-"),
    );
    database = new Kysely<unknown>({
      dialect: new PGliteDialect(new PGlite()),
    });
    const customCoordinator: IReadModelCoordinator = {
      readModels: [],
      start: vi.fn(),
      stop: vi.fn(),
      drain: vi.fn().mockResolvedValue(undefined),
      getChainDepth: vi.fn().mockReturnValue(0),
    };
    const reactorBuilder = new ReactorBuilder()
      .withKysely(database as unknown as Kysely<Database>)
      .withReadModelCoordinator(customCoordinator);
    const clientBuilder = new ReactorClientBuilder().withReactorBuilder(
      reactorBuilder,
    );
    applySwitchboardReactorDefaults(reactorBuilder, clientBuilder, {
      signalHandlers: false,
    });
    const callerModule = await clientBuilder.buildModule();
    reactor = callerModule.reactorModule;
    let switchboard: Awaited<ReturnType<typeof startSwitchboard>> | undefined;

    try {
      switchboard = await startSwitchboard({
        reactor: callerModule,
        dbPath: join(tempRoot, "read-model"),
        port: 0,
        mcp: false,
        disableLocalPackages: true,
        identity: { keypairPath: join(tempRoot, "identity.json") },
        logger: stubLogger(),
      });

      expect(switchboard.reactor).toBe(callerModule.client);
      expect(switchboard.attachmentReferenceProjection).toEqual({
        status: "unavailable",
        reason: "live-read-model-registration-unsupported",
      });
      expect(customCoordinator.readModels).toEqual([]);
      await switchboard.shutdown();
      switchboard = undefined;
    } finally {
      await switchboard?.shutdown();
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("uses the live registry for packages installed after startup and caches by module identity", async () => {
    database = new Kysely<unknown>({
      dialect: new PGliteDialect(new PGlite()),
    });
    const attachmentReferenceIndex = await new AttachmentReferenceIndexBuilder(
      database,
    ).build();
    const builder = new ReactorBuilder().withKysely(
      database as unknown as Kysely<Database>,
    );
    registerAttachmentReferenceReadModel(builder, {
      baseKysely: database,
      attachmentReferenceWriter: attachmentReferenceIndex.store,
    });
    reactor = await builder.buildModule();

    const matchingReadModels = reactor.readModelCoordinator.readModels.filter(
      ({ name }) => name === ATTACHMENT_REFERENCE_READ_MODEL_ID,
    );
    expect(matchingReadModels).toHaveLength(1);
    expect(() =>
      reactor!.documentModelRegistry.getModule(DOCUMENT_TYPE),
    ).toThrow();

    const firstModule = runtimeModule(
      1,
      "input NestedAttachmentInput { ref: AttachmentRef! }\n" +
        "input AttachFilesInput { direct: AttachmentRef!, nested: NestedAttachmentInput! }",
    );
    const secondModule = runtimeModule(
      2,
      "input ReplacementAttachmentInput { ref: AttachmentRef! }\n" +
        "input AttachFilesInput { payload: ReplacementAttachmentInput! }",
    );
    const modulesByPackage = new Map([
      ["runtime-v1", [firstModule]],
      ["runtime-v2", [secondModule]],
    ]);
    const httpLoader = {
      loadDocumentModels: (name: string) =>
        Promise.resolve(modulesByPackage.get(name) ?? []),
    } as unknown as HttpPackageLoader;
    const packageManagementService = new PackageManagementService({
      defaultRegistryUrl: "https://registry.example.test",
      httpLoader,
      documentModelRegistry: reactor.documentModelRegistry,
    });
    const readModel = matchingReadModels[0] as AttachmentReferenceReadModel;

    await packageManagementService.installPackage("runtime-v1");
    await readModel.indexOperations([
      operation(1, { direct: REF_A, nested: { ref: REF_B } }),
    ]);
    await expect(
      attachmentReferenceIndex.store.hasReference("runtime-document", REF_A),
    ).resolves.toBe(true);
    await expect(
      attachmentReferenceIndex.store.hasReference("runtime-document", REF_B),
    ).resolves.toBe(true);

    await packageManagementService.installPackage("runtime-v2");
    expect(reactor.documentModelRegistry.getModule(DOCUMENT_TYPE)).toBe(
      secondModule,
    );
    await readModel.indexOperations([
      operation(2, { payload: { ref: REF_C } }),
    ]);
    await expect(
      attachmentReferenceIndex.store.hasReference("runtime-document", REF_C),
    ).resolves.toBe(true);
  });
});
