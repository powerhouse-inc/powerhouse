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
import { Kysely } from "kysely";
import { KyselyPGlite } from "kysely-pglite";
import { v4 as uuidv4 } from "uuid";
import { vi } from "vitest";
import type { IWriteCache } from "../src/cache/write/interfaces.js";
import { Reactor } from "../src/core/reactor.js";
import type { ReactorFeatures } from "../src/core/types.js";
import { EventBus } from "../src/events/event-bus.js";
import type { IEventBus } from "../src/events/interfaces.js";
import type { IJobExecutor } from "../src/executor/interfaces.js";
import { SimpleJobExecutorManager } from "../src/executor/simple-job-executor-manager.js";
import { SimpleJobExecutor } from "../src/executor/simple-job-executor.js";
import type { JobExecutorConfig } from "../src/executor/types.js";
import { InMemoryJobTracker } from "../src/job-tracker/in-memory-job-tracker.js";
import type { IJobTracker } from "../src/job-tracker/interfaces.js";
import type { IQueue } from "../src/queue/interfaces.js";
import { InMemoryQueue } from "../src/queue/queue.js";
import type { Job } from "../src/queue/types.js";
import type { IReadModelCoordinator } from "../src/read-models/interfaces.js";
import { DocumentModelRegistry } from "../src/registry/implementation.js";
import type { IDocumentModelRegistry } from "../src/registry/interfaces.js";
import type {
  IDocumentIndexer,
  IDocumentView,
  IOperationStore,
} from "../src/storage/interfaces.js";
import { KyselyKeyframeStore } from "../src/storage/kysely/keyframe-store.js";
import { KyselyOperationStore } from "../src/storage/kysely/store.js";
import type { Database as DatabaseSchema } from "../src/storage/kysely/types.js";

/**
 * Creates a real PGLite-backed KyselyOperationStore for testing.
 * Returns the database instance, operation store, and keyframe store.
 *
 * @returns Object containing db, store, and keyframeStore instances
 */
export async function createTestOperationStore(): Promise<{
  db: Kysely<DatabaseSchema>;
  store: KyselyOperationStore;
  keyframeStore: KyselyKeyframeStore;
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
    .addColumn("error", "text")
    .addColumn("hash", "text", (col) => col.notNull())
    .addUniqueConstraint("unique_revision", [
      "documentId",
      "scope",
      "branch",
      "index",
    ])
    .execute();

  // Create indexes for Operation table
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

  // Create the Keyframe table
  await db.schema
    .createTable("Keyframe")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("documentId", "text", (col) => col.notNull())
    .addColumn("documentType", "text", (col) => col.notNull())
    .addColumn("scope", "text", (col) => col.notNull())
    .addColumn("branch", "text", (col) => col.notNull())
    .addColumn("revision", "integer", (col) => col.notNull())
    .addColumn("document", "text", (col) => col.notNull())
    .addColumn("createdAt", "timestamptz", (col) =>
      col.notNull().defaultTo(new Date()),
    )
    .addUniqueConstraint("unique_keyframe", [
      "documentId",
      "scope",
      "branch",
      "revision",
    ])
    .execute();

  // Create index for fast nearest-keyframe lookups
  await db.schema
    .createIndex("keyframe_lookup")
    .on("Keyframe")
    .columns(["documentId", "scope", "branch", "revision"])
    .execute();

  const store = new KyselyOperationStore(db);
  const keyframeStore = new KyselyKeyframeStore(db);

  return { db, store, keyframeStore };
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
    actions: overrides.actions || [createTestAction()],
    createdAt: new Date().toISOString(),
    queueHint: [],
    retryCount: 0,
    maxRetries: 3,
    errorHistory: [],
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
    actions: overrides.actions || [createMinimalAction()],
    createdAt: overrides.createdAt || "2023-01-01T00:00:00.000Z",
    queueHint: overrides.queueHint || [],
    errorHistory: overrides.errorHistory || [],
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
 * Factory for creating CREATE_DOCUMENT operation
 */
export function createCreateDocumentOperation(
  documentId: string,
  documentType: string,
  overrides: Partial<Operation> = {},
): Operation {
  return {
    id: overrides.id || `${documentId}-create`,
    index: 0,
    skip: 0,
    hash: overrides.hash || "hash-0",
    timestampUtcMs: overrides.timestampUtcMs || new Date().toISOString(),
    action: {
      id: `${documentId}-create-action`,
      type: "CREATE_DOCUMENT",
      scope: "document",
      timestampUtcMs: overrides.timestampUtcMs || new Date().toISOString(),
      input: {
        documentId,
        model: documentType,
        version: "0.0.0",
      },
    } as Action,
    ...overrides,
  };
}

export function createUpgradeDocumentOperation(
  documentId: string,
  index: number,
  initialState: Record<string, any> = {},
  overrides: Partial<Operation> = {},
): Operation {
  return {
    id: overrides.id || `${documentId}-upgrade-${index}`,
    index,
    skip: 0,
    hash: overrides.hash || `hash-${index}`,
    timestampUtcMs: overrides.timestampUtcMs || new Date().toISOString(),
    action: {
      id: `${documentId}-upgrade-action-${index}`,
      type: "UPGRADE_DOCUMENT",
      scope: "document",
      timestampUtcMs: overrides.timestampUtcMs || new Date().toISOString(),
      input: {
        documentId,
        initialState,
      },
    } as Action,
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
 * Factory for creating mock IReadModelCoordinator
 */
export function createMockReadModelCoordinator(
  overrides: Partial<IReadModelCoordinator> = {},
): IReadModelCoordinator {
  return {
    start: vi.fn(),
    stop: vi.fn(),
    ...overrides,
  };
}

/**
 * Factory for creating a complete test reactor setup
 */
export async function createTestReactorSetup(
  documentModels: DocumentModelModule<any>[] = [
    documentModelDocumentModelModule,
    driveDocumentModelModule,
  ],
  executorConfig?: JobExecutorConfig,
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

  // Create mock write cache
  const mockWriteCache: IWriteCache = {
    getState: vi.fn().mockImplementation(async (docId: string) => {
      return await storage.get(docId);
    }),
    putState: vi.fn(),
    invalidate: vi.fn(),
    clear: vi.fn(),
    startup: vi.fn(),
    shutdown: vi.fn(),
  };

  // Create job executor with event bus
  const jobExecutor = new SimpleJobExecutor(
    registry,
    storage,
    storage,
    operationStore,
    eventBus,
    mockWriteCache,
    executorConfig,
  );

  // Create mock read model coordinator
  const readModelCoordinator = createMockReadModelCoordinator();

  // Create mock dependencies for new Reactor constructor parameters
  const features = createMockReactorFeatures();
  const documentView = createMockDocumentView();
  const documentIndexer = createMockDocumentIndexer();

  // Create reactor
  const reactor = new Reactor(
    driveServer,
    storage,
    queue,
    jobTracker,
    readModelCoordinator,
    features,
    documentView,
    documentIndexer,
  );

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
      actions: [
        createTestAction({
          input: { name: `Action ${i + 1}` },
        }),
      ],
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
        actions: [
          createTestAction({
            input: { name: `Chain Action ${i + 1}` },
          }),
        ],
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

/**
 * Creates a JobInfo object with an empty consistency token.
 * Useful for test scenarios where consistency token details don't matter.
 */
export function createEmptyConsistencyToken() {
  return {
    version: 1 as const,
    createdAtUtcIso: new Date().toISOString(),
    coordinates: [],
  };
}

/**
 * Creates mock ReactorFeatures with legacy storage enabled by default.
 */
export function createMockReactorFeatures(
  legacyStorageEnabled = true,
): ReactorFeatures {
  return {
    legacyStorageEnabled,
  };
}

/**
 * Creates a mock IDocumentView for testing.
 */
export function createMockDocumentView(): IDocumentView {
  return {
    init: vi.fn().mockResolvedValue(undefined),
    indexOperations: vi.fn().mockResolvedValue(undefined),
    waitForConsistency: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockRejectedValue(new Error("Not implemented")),
  };
}

/**
 * Creates a mock IDocumentIndexer for testing.
 */
export function createMockDocumentIndexer(): IDocumentIndexer {
  return {
    init: vi.fn().mockResolvedValue(undefined),
    indexOperations: vi.fn().mockResolvedValue(undefined),
    waitForConsistency: vi.fn().mockResolvedValue(undefined),
    getOutgoing: vi.fn().mockResolvedValue([]),
    getIncoming: vi.fn().mockResolvedValue([]),
    hasRelationship: vi.fn().mockResolvedValue(false),
    getUndirectedRelationships: vi.fn().mockResolvedValue([]),
    getDirectedRelationships: vi.fn().mockResolvedValue([]),
    findPath: vi.fn().mockResolvedValue(null),
    findAncestors: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
    getRelationshipTypes: vi.fn().mockResolvedValue([]),
  };
}
