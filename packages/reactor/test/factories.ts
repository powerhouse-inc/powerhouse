import { PGlite } from "@electric-sql/pglite";
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
  ISigner,
  Operation,
  PHDocument,
} from "document-model";
import {
  deriveOperationId,
  documentModelDocumentModelModule,
  generateId,
} from "document-model";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { v4 as uuidv4 } from "uuid";
import { vi } from "vitest";
import type {
  CachedDocumentMeta,
  IDocumentMetaCache,
} from "../src/cache/document-meta-cache-types.js";
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
import type { ILogger } from "../src/logging/types.js";
import type { IQueue } from "../src/queue/interfaces.js";
import { InMemoryQueue } from "../src/queue/queue.js";
import type { Job } from "../src/queue/types.js";
import type { IReadModelCoordinator } from "../src/read-models/interfaces.js";
import { DocumentModelRegistry } from "../src/registry/implementation.js";
import type { IDocumentModelRegistry } from "../src/registry/interfaces.js";
import type { IJobAwaiter } from "../src/shared/awaiter.js";
import { ConsistencyTracker } from "../src/shared/consistency-tracker.js";
import { JobStatus } from "../src/shared/types.js";
import { ConsistencyAwareLegacyStorage } from "../src/storage/consistency-aware-legacy-storage.js";
import type {
  IDocumentIndexer,
  IDocumentView,
  IOperationStore,
  ISyncCursorStorage,
  OperationContext,
} from "../src/storage/interfaces.js";
import { KyselyKeyframeStore } from "../src/storage/kysely/keyframe-store.js";
import { KyselyOperationStore } from "../src/storage/kysely/store.js";
import { KyselySyncCursorStorage } from "../src/storage/kysely/sync-cursor-storage.js";
import { KyselySyncRemoteStorage } from "../src/storage/kysely/sync-remote-storage.js";
import type { Database as DatabaseSchema } from "../src/storage/kysely/types.js";
import {
  REACTOR_SCHEMA,
  runMigrations,
} from "../src/storage/migrations/migrator.js";
import type { IReactorSubscriptionManager } from "../src/subs/types.js";
import type { IChannel, IChannelFactory } from "../src/sync/interfaces.js";
import type { ChannelConfig, SyncEnvelope } from "../src/sync/types.js";
import { TestChannel } from "./sync/channels/test-channel.js";

/**
 * Creates a mock logger for testing that no-ops all log methods.
 */
export function createMockLogger(): ILogger {
  const logger: ILogger = {
    level: "error",
    verbose: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    errorHandler: () => {},
    child: () => logger,
  };
  return logger;
}

/**
 * Creates an operation context with default ordinal for testing.
 */
export function createTestContext(
  params: Omit<OperationContext, "ordinal"> & { ordinal?: number },
): OperationContext {
  return {
    ...params,
    ordinal: params.ordinal ?? 1,
  };
}

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
  const baseDb = new Kysely<DatabaseSchema>({
    dialect: new PGliteDialect(new PGlite()),
  });

  const result = await runMigrations(baseDb, REACTOR_SCHEMA);
  if (!result.success && result.error) {
    throw new Error(`Test migration failed: ${result.error.message}`);
  }

  const db = baseDb.withSchema(REACTOR_SCHEMA);
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
    kind: overrides.kind ?? "mutation",
    documentId: "doc-1",
    scope: "global",
    branch: "main",
    actions: overrides.actions || [createTestAction()],
    operations: overrides.operations || [],
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
    kind: overrides.kind ?? "mutation",
    documentId: overrides.documentId || "doc-1",
    scope: overrides.scope || "global",
    branch: overrides.branch || "main",
    actions: overrides.actions || [createMinimalAction()],
    operations: overrides.operations || [],
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
  documentId: string,
  overrides: Partial<Operation> = {},
): Operation {
  const action = createTestAction(
    overrides.action ? { ...overrides.action } : undefined,
  );

  const defaultOperation: Operation = {
    index: 1,
    timestampUtcMs: action.timestampUtcMs,
    hash: "test-hash",
    skip: 0,
    action,
    id: deriveOperationId(documentId, "document", "main", action.id),
    resultingState: JSON.stringify({ state: "test" }),
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
  const actionId = generateId();

  return {
    id:
      overrides.id ||
      deriveOperationId(documentId, "document", "main", actionId),
    index: 0,
    skip: 0,
    hash: overrides.hash || "hash-0",
    timestampUtcMs: overrides.timestampUtcMs || new Date().toISOString(),
    action: {
      id: actionId,
      type: "CREATE_DOCUMENT",
      scope: "document",
      timestampUtcMs: overrides.timestampUtcMs || new Date().toISOString(),
      input: {
        documentId,
        model: documentType,
        version: 0,
      },
    } as Action,
    resultingState:
      overrides.resultingState ||
      JSON.stringify({ document: { id: documentId } }),
    ...overrides,
  };
}

export function createUpgradeDocumentOperation(
  documentId: string,
  fromVersion: number,
  toVersion: number,
  initialState: Record<string, unknown> = {},
  overrides: Partial<Operation> = {},
): Operation {
  const index = overrides.index ?? 1;
  const actionId = generateId();
  return {
    id:
      overrides.id ||
      deriveOperationId(documentId, "document", "main", actionId),
    index,
    skip: 0,
    hash: overrides.hash || `hash-${index}`,
    timestampUtcMs: overrides.timestampUtcMs || new Date().toISOString(),
    action: {
      id: actionId,
      type: "UPGRADE_DOCUMENT",
      scope: "document",
      timestampUtcMs: overrides.timestampUtcMs || new Date().toISOString(),
      input: {
        documentId,
        fromVersion,
        toVersion,
        initialState,
      },
    } as Action,
    resultingState:
      overrides.resultingState ||
      JSON.stringify({ document: { id: documentId, version: toVersion } }),
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
    resultingState:
      overrides.resultingState || JSON.stringify({ state: "minimal" }),
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
export function createTestJobTracker(eventBus?: IEventBus): IJobTracker {
  return new InMemoryJobTracker(eventBus || new EventBus());
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
 * Factory for creating mock IDocumentMetaCache
 */
export function createMockDocumentMetaCache(
  overrides: Partial<IDocumentMetaCache> = {},
): IDocumentMetaCache {
  const defaultMeta: CachedDocumentMeta = {
    state: {
      version: 1,
      hash: { algorithm: "sha256", encoding: "base64" },
    },
    documentType: "powerhouse/document-model",
    documentScopeRevision: 1,
  };

  return {
    getDocumentMeta: vi.fn().mockResolvedValue(defaultMeta),
    rebuildAtRevision: vi.fn().mockResolvedValue(defaultMeta),
    putDocumentMeta: vi.fn(),
    invalidate: vi.fn().mockReturnValue(0),
    clear: vi.fn(),
    startup: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
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
  const jobTracker = new InMemoryJobTracker(eventBus);

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

  // Create mock operation index
  const mockOperationIndex: any = {
    start: vi.fn().mockReturnValue({
      createCollection: vi.fn(),
      addToCollection: vi.fn(),
      write: vi.fn(),
    }),
    commit: vi.fn().mockResolvedValue([]),
    find: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  };

  // Create mock document meta cache
  const mockDocumentMetaCache = createMockDocumentMetaCache();

  // Create job executor with event bus
  const jobExecutor = new SimpleJobExecutor(
    createMockLogger(),
    registry,
    storage,
    storage,
    operationStore,
    eventBus,
    mockWriteCache,
    mockOperationIndex,
    mockDocumentMetaCache,
    executorConfig ?? { legacyStorageEnabled: true },
    undefined,
  );

  // Create mock read model coordinator
  const readModelCoordinator = createMockReadModelCoordinator();

  // Create mock dependencies for new Reactor constructor parameters
  const features = createMockReactorFeatures();
  const documentView = createMockDocumentView();
  const documentIndexer = createMockDocumentIndexer();

  // Wrap storage with consistency-aware storage
  const legacyStorageConsistencyTracker = new ConsistencyTracker();
  const consistencyAwareStorage = new ConsistencyAwareLegacyStorage(
    storage,
    legacyStorageConsistencyTracker,
    eventBus,
  );

  // Create reactor
  const reactor = new Reactor(
    createMockLogger(),
    registry,
    consistencyAwareStorage,
    queue,
    jobTracker,
    readModelCoordinator,
    features,
    documentView,
    documentIndexer,
    operationStore,
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
    createMockLogger(),
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
    getByIdOrSlug: vi.fn().mockRejectedValue(new Error("Not implemented")),
    findByType: vi.fn().mockResolvedValue({
      items: [],
      nextCursor: undefined,
      hasMore: false,
    }),
    resolveSlug: vi.fn().mockResolvedValue(undefined),
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

/**
 * Creates a real PGLite-backed sync storage for testing.
 * Returns the database instance, sync remote storage, and sync cursor storage.
 *
 * @returns Object containing db, syncRemoteStorage, and syncCursorStorage instances
 */
export async function createTestSyncStorage(): Promise<{
  db: Kysely<DatabaseSchema>;
  syncRemoteStorage: KyselySyncRemoteStorage;
  syncCursorStorage: KyselySyncCursorStorage;
}> {
  const baseDb = new Kysely<DatabaseSchema>({
    dialect: new PGliteDialect(new PGlite()),
  });

  const result = await runMigrations(baseDb, REACTOR_SCHEMA);
  if (!result.success && result.error) {
    throw new Error(`Test migration failed: ${result.error.message}`);
  }

  const db = baseDb.withSchema(REACTOR_SCHEMA);
  const syncRemoteStorage = new KyselySyncRemoteStorage(db);
  const syncCursorStorage = new KyselySyncCursorStorage(db);

  return { db, syncRemoteStorage, syncCursorStorage };
}

/**
 * Creates a mock ISigner for testing.
 */
export function createMockSigner(overrides: Partial<ISigner> = {}): ISigner {
  return {
    publicKey: vi.fn().mockResolvedValue({}),
    sign: vi.fn().mockResolvedValue(new Uint8Array(0)),
    verify: vi.fn().mockResolvedValue(undefined),
    signAction: vi
      .fn()
      .mockResolvedValue([
        "mock-signature",
        "mock-public-key",
        "mock-hash",
        "mock-prev-state-hash",
        "mock-signature-hex",
      ]),
    ...overrides,
  };
}

/**
 * Creates a mock IReactorSubscriptionManager for testing.
 */
export function createMockSubscriptionManager(
  overrides: Partial<IReactorSubscriptionManager> = {},
): IReactorSubscriptionManager {
  return {
    onDocumentCreated: vi.fn(),
    onDocumentDeleted: vi.fn(),
    onDocumentStateUpdated: vi.fn(),
    onRelationshipChanged: vi.fn(),
    ...overrides,
  };
}

/**
 * Creates a mock IJobAwaiter for testing.
 */
export function createMockJobAwaiter(
  overrides: Partial<IJobAwaiter> = {},
): IJobAwaiter {
  return {
    waitForJob: vi.fn().mockResolvedValue({
      id: "job-1",
      status: JobStatus.READ_MODELS_READY,
      createdAtUtcIso: new Date().toISOString(),
      consistencyToken: createEmptyConsistencyToken(),
    }),
    shutdown: vi.fn(),
    ...overrides,
  };
}

/**
 * Creates an IChannelFactory for testing that creates TestChannel instances.
 * TestChannels are wired together by storing them in a shared registry and
 * passing a send function that delivers envelopes to the peer's receive method.
 *
 * @param channels - Optional map to store created channels for cross-wiring
 * @param sentEnvelopes - Optional array to track sent envelopes for assertions
 * @returns IChannelFactory implementation for testing
 */
export function createTestChannelFactory(
  channels?: Map<string, TestChannel>,
  sentEnvelopes?: SyncEnvelope[],
): IChannelFactory {
  const channelRegistry = channels || new Map<string, TestChannel>();

  return {
    instance(
      remoteId: string,
      remoteName: string,
      config: ChannelConfig,
      cursorStorage: ISyncCursorStorage,
    ): IChannel {
      const send = (envelope: SyncEnvelope): void => {
        if (sentEnvelopes) {
          sentEnvelopes.push(envelope);
        }
        const peerChannel = channelRegistry.get(remoteId);
        if (peerChannel) {
          peerChannel.receive(envelope);
        }
      };

      const channel = new TestChannel(
        remoteId,
        remoteName,
        cursorStorage,
        send,
      );

      channelRegistry.set(remoteId, channel);

      return channel;
    },
  };
}

/**
 * Creates a signed test operation using the SimpleSigner.
 *
 * @param signer - The SimpleSigner instance to sign with
 * @param overrides - Optional operation overrides
 * @returns Promise resolving to a signed operation
 */
export async function createSignedTestOperation(
  signer: any,
  documentId: string,
  overrides: Partial<Operation> = {},
): Promise<Operation> {
  const operation = createTestOperation(documentId, overrides);
  const publicKey = signer.getPublicKey();

  const signerData: any = {
    user: { address: "0x123", chainId: 1, networkId: "1" },
    app: { name: "test", key: publicKey },
    signatures: [],
  };

  const dataToSign = JSON.stringify({
    action: operation.action,
    index: operation.index,
    timestamp: operation.timestampUtcMs,
  });

  const signatureHex = await signer.sign(new TextEncoder().encode(dataToSign));

  const signature: any = [
    operation.timestampUtcMs,
    publicKey,
    operation.action.id,
    "",
    `0x${signatureHex}`,
  ];

  signerData.signatures = [signature];

  return {
    ...operation,
    action: {
      ...operation.action,
      context: {
        ...operation.action.context,
        signer: signerData,
      },
    },
  };
}

/**
 * Creates a signed test action using the SimpleSigner.
 *
 * @param signer - The SimpleSigner instance to sign with
 * @param overrides - Optional action overrides
 * @returns Promise resolving to a signed action
 */
export async function createSignedTestAction(
  signer: any,
  overrides: Partial<Action> = {},
): Promise<Action> {
  const action = createTestAction(overrides);
  const publicKey = signer.getPublicKey();

  const signerData: any = {
    user: { address: "0x123", chainId: 1, networkId: "1" },
    app: { name: "test", key: publicKey },
    signatures: [],
  };

  const dataToSign = JSON.stringify({
    action: action,
    index: 0,
    timestamp: action.timestampUtcMs,
  });

  const signatureHex = await signer.sign(new TextEncoder().encode(dataToSign));

  const signature: any = [
    action.timestampUtcMs,
    publicKey,
    action.id,
    "",
    `0x${signatureHex}`,
  ];

  signerData.signatures = [signature];

  return {
    ...action,
    context: {
      ...action.context,
      signer: signerData,
    },
  };
}
