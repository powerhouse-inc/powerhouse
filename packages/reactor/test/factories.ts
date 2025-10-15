import type {
  BaseDocumentDriveServer,
  IDocumentOperationStorage,
  IDocumentStorage,
} from "document-drive";
import {
  MemoryStorage,
  ReactorBuilder,
  driveDocumentModelModule,
} from "document-drive";
import type {
  Action,
  DocumentModelModule,
  Operation,
  PHDocument,
} from "document-model";
import { documentModelDocumentModelModule } from "document-model";
import { v4 as uuidv4 } from "uuid";
import { vi } from "vitest";
import { Reactor } from "../src/core/reactor.js";
import { EventBus } from "../src/events/event-bus.js";
import type { IEventBus } from "../src/events/interfaces.js";
import type { IJobExecutor } from "../src/executor/interfaces.js";
import { SimpleJobExecutorManager } from "../src/executor/simple-job-executor-manager.js";
import { SimpleJobExecutor } from "../src/executor/simple-job-executor.js";
import type { IJobTracker } from "../src/job-tracker/interfaces.js";
import { InMemoryJobTracker } from "../src/job-tracker/in-memory-job-tracker.js";
import type { IQueue } from "../src/queue/interfaces.js";
import { InMemoryQueue } from "../src/queue/queue.js";
import type { Job } from "../src/queue/types.js";
import { DocumentModelRegistry } from "../src/registry/implementation.js";
import type { IDocumentModelRegistry } from "../src/registry/interfaces.js";
import type { IOperationStore } from "../src/storage/interfaces.js";
import { Kysely } from "kysely";
import { KyselyPGlite } from "kysely-pglite";
import { KyselyOperationStore } from "../src/storage/kysely/store.js";
import type { Database as DatabaseSchema } from "../src/storage/kysely/types.js";

/**
 * Creates a real PGLite-backed KyselyOperationStore for testing.
 * Returns both the database instance and the operation store.
 *
 * @returns Object containing db and store instances
 */
export async function createTestOperationStore(): Promise<{
  db: Kysely<DatabaseSchema>;
  store: KyselyOperationStore;
}> {
  // Create in-memory PGLite database
  const kyselyPGlite = await KyselyPGlite.create();
  const db = new Kysely<DatabaseSchema>({
    dialect: kyselyPGlite.dialect,
  });

  // Create the Operation table
  await db.schema
    .createTable("Operation")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("jobId", "text", (col) => col.notNull())
    .addColumn("opId", "text", (col) => col.notNull().unique())
    .addColumn("prevOpId", "text", (col) => col.notNull())
    .addColumn("writeTimestampUtcMs", "timestamptz", (col) =>
      col.notNull().defaultTo(new Date()),
    )
    .addColumn("documentId", "text", (col) => col.notNull())
    .addColumn("documentType", "text", (col) => col.notNull())
    .addColumn("scope", "text", (col) => col.notNull())
    .addColumn("branch", "text", (col) => col.notNull())
    .addColumn("timestampUtcMs", "timestamptz", (col) => col.notNull())
    .addColumn("index", "integer", (col) => col.notNull())
    .addColumn("action", "text", (col) => col.notNull())
    .addColumn("skip", "integer", (col) => col.notNull())
    .addColumn("resultingState", "text")
    .addColumn("error", "text")
    .addColumn("hash", "text", (col) => col.notNull())
    .addUniqueConstraint("unique_revision", [
      "documentId",
      "scope",
      "branch",
      "index",
    ])
    .execute();

  // Create indexes
  await db.schema
    .createIndex("streamOperations")
    .on("Operation")
    .columns(["documentId", "scope", "branch", "id"])
    .execute();

  await db.schema
    .createIndex("branchlessStreamOperations")
    .on("Operation")
    .columns(["documentId", "scope", "id"])
    .execute();

  const store = new KyselyOperationStore(db);

  return { db, store };
}

/**
 * Factory for creating test Job objects
 */
export function createTestJob(overrides: Partial<Job> = {}): Job {
  const defaultJob: Job = {
    id: overrides.id || `job-${uuidv4()}`,
    documentId: "doc-1",
    scope: "global",
    branch: "main",
    operation: createTestOperation(
      overrides.operation ? { ...overrides.operation } : undefined,
    ),
    createdAt: new Date().toISOString(),
    queueHint: [],
    retryCount: 0,
    maxRetries: 3,
  };

  return {
    ...defaultJob,
    ...overrides,
  };
}

/**
 * Factory for creating minimal Job objects (useful for performance tests)
 */
export function createMinimalJob(overrides: Partial<Job> = {}): Job {
  return {
    id: overrides.id || `job-${uuidv4()}`,
    documentId: overrides.documentId || "doc-1",
    scope: overrides.scope || "global",
    branch: overrides.branch || "main",
    operation: createMinimalOperation(),
    createdAt: overrides.createdAt || "2023-01-01T00:00:00.000Z",
    queueHint: overrides.queueHint || [],
    ...overrides,
  };
}

/**
 * Factory for creating test Operation objects
 */
export function createTestOperation(
  overrides: Partial<Operation> = {},
): Operation {
  const defaultOperation: Operation = {
    index: 1,
    timestampUtcMs: new Date().toISOString(),
    hash: "test-hash",
    skip: 0,
    action: createTestAction(
      overrides.action ? { ...overrides.action } : undefined,
    ),
    id: "op-1",
  };

  return {
    ...defaultOperation,
    ...overrides,
  };
}

/**
 * Factory for creating minimal Operation objects
 */
export function createMinimalOperation(
  overrides: Partial<Operation> = {},
): Operation {
  return {
    index: overrides.index ?? 0,
    timestampUtcMs: overrides.timestampUtcMs || "2023-01-01T00:00:00.000Z",
    hash: overrides.hash || "hash-123",
    skip: overrides.skip ?? 0,
    action: overrides.action || createMinimalAction(),
    id: overrides.id || `op-${uuidv4()}`,
  };
}

/**
 * Factory for creating test Action objects
 */
export function createTestAction(overrides: Partial<Action> = {}): Action {
  const defaultAction: Action = {
    id: uuidv4(),
    type: "test-operation",
    timestampUtcMs: new Date().toISOString(),
    input: { test: "data" },
    scope: "global",
  } as Action;

  return {
    ...defaultAction,
    ...overrides,
  } as Action;
}

/**
 * Factory for creating minimal Action objects
 */
export function createMinimalAction(overrides: Partial<Action> = {}): Action {
  return {
    id: overrides.id || `action-${uuidv4()}`,
    type: overrides.type || "CREATE",
    timestampUtcMs: overrides.timestampUtcMs || "2023-01-01T00:00:00.000Z",
    input: overrides.input || { data: "test" },
    scope: overrides.scope || "global",
  } as Action;
}

/**
 * Factory for creating specific document model actions
 */
export function createDocumentModelAction(
  type: "SET_NAME" | "SET_DESCRIPTION" | "CREATE" | "UPDATE",
  overrides: Partial<Action> = {},
): Action {
  const actionTypes: Record<string, any> = {
    SET_NAME: { name: "Test Name" },
    SET_DESCRIPTION: { description: "Test Description" },
    CREATE: { name: "New Document" },
    UPDATE: { data: "Updated Data" },
  };

  return {
    id: uuidv4(),
    type,
    scope: "global",
    timestampUtcMs: String(Date.now()),
    input: actionTypes[type] || {},
    ...overrides,
  } as Action;
}

/**
 * Factory for creating mock PHDocument objects
 */
export function createDocModelDocument(
  overrides: {
    id?: string;
    slug?: string;
    documentType?: string;
    state?: any;
  } = {},
): PHDocument {
  const baseDocument = documentModelDocumentModelModule.utils.createDocument();

  if (overrides.id) {
    baseDocument.header.id = overrides.id;
  }
  if (overrides.slug) {
    baseDocument.header.slug = overrides.slug;
  }
  if (overrides.documentType) {
    baseDocument.header.documentType = overrides.documentType;
  }
  if (overrides.state) {
    baseDocument.state = {
      ...baseDocument.state,
      ...(overrides.state as typeof baseDocument.state),
    };
  }

  return baseDocument;
}

/**
 * Factory for creating test EventBus instances
 */
export function createTestEventBus(): IEventBus {
  return new EventBus();
}

/**
 * Factory for creating test Queue instances
 */
export function createTestQueue(eventBus?: IEventBus): IQueue {
  return new InMemoryQueue(eventBus || createTestEventBus());
}

/**
 * Factory for creating test JobTracker instances
 */
export function createTestJobTracker(): IJobTracker {
  return new InMemoryJobTracker();
}

/**
 * Factory for creating test Registry instances
 */
export function createTestRegistry(
  modules?: DocumentModelModule<any>[],
): IDocumentModelRegistry {
  const registry = new DocumentModelRegistry();

  if (modules) {
    modules.forEach((module) => registry.registerModules(module));
  } else {
    // Register default module
    registry.registerModules(documentModelDocumentModelModule);
  }

  return registry;
}

/**
 * Factory for creating mock JobExecutor
 */
export function createMockJobExecutor(
  overrides: Partial<IJobExecutor> = {},
): IJobExecutor {
  return {
    executeJob: vi.fn().mockResolvedValue({ success: true }),
    ...overrides,
  };
}

/**
 * Factory for creating mock IDocumentStorage
 */
export function createMockDocumentStorage(
  overrides: Partial<IDocumentStorage> = {},
): IDocumentStorage {
  return {
    get: vi.fn().mockResolvedValue({
      header: {
        id: "doc-1",
        documentType: "powerhouse/document-model",
      },
      operations: { global: [] },
      state: {},
    }),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(false),
    getChildren: vi.fn().mockResolvedValue([]),
    findByType: vi.fn().mockResolvedValue([]),
    resolveIds: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as IDocumentStorage;
}

/**
 * Factory for creating mock IDocumentOperationStorage
 */
export function createMockOperationStorage(
  overrides: Partial<IDocumentOperationStorage> = {},
): IDocumentOperationStorage {
  return {
    addDocumentOperations: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as IDocumentOperationStorage;
}

/**
 * Factory for creating mock IOperationStore
 */
export function createMockOperationStore(
  overrides: Partial<IOperationStore> = {},
): IOperationStore {
  return {
    apply: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue({
      operation: {
        index: 0,
        timestampUtcMs: "2023-01-01T00:00:00.000Z",
        hash: "hash-123",
        skip: 0,
        action: { type: "CREATE", input: {}, scope: "global" },
      },
      context: {
        documentId: "doc-1",
        documentType: "powerhouse/document-model",
        scope: "global",
        branch: "main",
      },
    }),
    getSince: vi.fn().mockResolvedValue([]),
    getSinceTimestamp: vi.fn().mockResolvedValue([]),
    getSinceId: vi.fn().mockResolvedValue([]),
    getRevisions: vi.fn().mockResolvedValue({
      revision: {},
      latestTimestamp: new Date(0).toISOString(),
    }),
    ...overrides,
  } as unknown as IOperationStore;
}

/**
 * Factory for creating a complete test reactor setup
 */
export async function createTestReactorSetup(
  documentModels: DocumentModelModule<any>[] = [
    documentModelDocumentModelModule,
    driveDocumentModelModule,
  ],
) {
  const storage = new MemoryStorage();
  const eventBus = new EventBus();
  const queue = new InMemoryQueue(eventBus);
  const jobTracker = new InMemoryJobTracker();

  // Create real drive server
  const builder = new ReactorBuilder(documentModels).withStorage(storage);
  const driveServer = builder.build() as unknown as BaseDocumentDriveServer;
  await driveServer.initialize();

  // Create registry and register modules
  const registry = new DocumentModelRegistry();
  registry.registerModules(documentModelDocumentModelModule);

  // Create mock operation store for testing
  const operationStore = createMockOperationStore();

  // Create job executor
  const jobExecutor = new SimpleJobExecutor(
    registry,
    storage,
    storage,
    operationStore,
  );

  // Create reactor
  const reactor = new Reactor(driveServer, storage, queue, jobTracker);

  return {
    reactor,
    driveServer,
    storage,
    eventBus,
    queue,
    jobTracker,
    jobExecutor,
    registry,
    operationStore,
  };
}

/**
 * Factory for creating SimpleJobExecutorManager with dependencies
 */
export function createTestJobExecutorManager(
  queue?: IQueue,
  eventBus?: IEventBus,
  executor?: IJobExecutor,
  jobTracker?: IJobTracker,
) {
  const actualQueue = queue || createTestQueue();
  const actualEventBus = eventBus || createTestEventBus();
  const actualExecutor = executor || createMockJobExecutor();
  const actualJobTracker = jobTracker || createTestJobTracker();

  const manager = new SimpleJobExecutorManager(
    () => actualExecutor,
    actualEventBus,
    actualQueue,
    actualJobTracker,
  );

  return {
    manager,
    queue: actualQueue,
    eventBus: actualEventBus,
    executor: actualExecutor,
    jobTracker: actualJobTracker,
  };
}

/**
 * Factory for creating test data sets
 */
export function createTestJobSet(
  count: number,
  baseOverrides: Partial<Job> = {},
): Job[] {
  return Array.from({ length: count }, (_, i) =>
    createTestJob({
      id: `job-${i + 1}`,
      ...baseOverrides,
      operation: createTestOperation({
        index: i,
        action: createTestAction({
          input: { name: `Action ${i + 1}` },
        }),
      }),
    }),
  );
}

/**
 * Factory for creating jobs with dependencies
 */
export function createJobWithDependencies(
  id: string,
  dependencies: string[],
  overrides: Partial<Job> = {},
): Job {
  return createTestJob({
    id,
    queueHint: dependencies,
    ...overrides,
  });
}

/**
 * Factory for creating a dependency chain of jobs
 */
export function createJobDependencyChain(length: number): Job[] {
  const jobs: Job[] = [];

  for (let i = 0; i < length; i++) {
    const dependencies = i === 0 ? [] : [`job-${i}`];
    jobs.push(
      createJobWithDependencies(`job-${i + 1}`, dependencies, {
        operation: createTestOperation({
          index: i,
          action: createTestAction({
            input: { name: `Chain Action ${i + 1}` },
          }),
        }),
      }),
    );
  }

  return jobs;
}

/**
 * Factory for creating multiple actions for testing
 */
export function createTestActions(
  count: number,
  type: "SET_NAME" | "SET_DESCRIPTION" | "CREATE" | "UPDATE" = "SET_NAME",
): Action[] {
  return Array.from({ length: count }, (_, i) =>
    createDocumentModelAction(type, {
      input: { name: `Action ${i + 1}` },
      timestampUtcMs: String(Date.now() + i * 1000),
    }),
  );
}

/**
 * Factory for creating mock documents in bulk
 */
export function createTestDocuments(
  count: number,
  baseOverrides: {
    id?: string;
    slug?: string;
    documentType?: string;
    state?: any;
  } = {},
): PHDocument[] {
  return Array.from({ length: count }, (_, i) =>
    createDocModelDocument({
      id: `doc-${i + 1}`,
      slug: `doc-${i + 1}`,
      ...baseOverrides,
    }),
  );
}
