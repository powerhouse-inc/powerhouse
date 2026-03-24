import { PGlite } from "@electric-sql/pglite";
import type {
  Action,
  DocumentModelModule,
  ISigner,
  Operation,
  OperationContext,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import {
  deriveOperationId,
  generateId,
} from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import { documentModelDocumentModelModule } from "document-model";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { v4 as uuidv4 } from "uuid";
import { vi } from "vitest";
import type { ICollectionMembershipCache } from "../src/cache/collection-membership-cache.js";
import type {
  CachedDocumentMeta,
  IDocumentMetaCache,
} from "../src/cache/document-meta-cache-types.js";
import { KyselyOperationIndex } from "../src/cache/kysely-operation-index.js";
import type { IWriteCache } from "../src/cache/write/interfaces.js";
import type { ReactorFeatures } from "../src/core/types.js";
import { EventBus } from "../src/events/event-bus.js";
import type { IEventBus } from "../src/events/interfaces.js";
import type { IJobExecutor } from "../src/executor/interfaces.js";
import { SimpleJobExecutorManager } from "../src/executor/simple-job-executor-manager.js";
import { InMemoryJobTracker } from "../src/job-tracker/in-memory-job-tracker.js";
import type { IJobTracker } from "../src/job-tracker/interfaces.js";
import type { IQueue } from "../src/queue/interfaces.js";
import { InMemoryQueue } from "../src/queue/queue.js";
import type { Job } from "../src/queue/types.js";
import type { IReadModelCoordinator } from "../src/read-models/interfaces.js";
import { NullDocumentModelResolver } from "../src/registry/document-model-resolver.js";
import { DocumentModelRegistry } from "../src/registry/implementation.js";
import type { IDocumentModelRegistry } from "../src/registry/interfaces.js";
import type { IJobAwaiter } from "../src/shared/awaiter.js";
import { JobStatus } from "../src/shared/types.js";
import type {
  IDocumentIndexer,
  IDocumentView,
  IOperationStore,
  ISyncCursorStorage,
} from "../src/storage/interfaces.js";
import { KyselyDocumentIndexer } from "../src/storage/kysely/document-indexer.js";
import { KyselyKeyframeStore } from "../src/storage/kysely/keyframe-store.js";
import { KyselyOperationStore } from "../src/storage/kysely/store.js";
import { KyselySyncCursorStorage } from "../src/storage/kysely/sync-cursor-storage.js";
import { KyselySyncDeadLetterStorage } from "../src/storage/kysely/sync-dead-letter-storage.js";
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
 * Creates a KyselyDocumentIndexer with mock operationIndex and writeCache,
 * backed by the given Kysely db instance.
 */
export function createTestDocumentIndexer(
  db: Kysely<any>,
  consistencyTracker: any,
): KyselyDocumentIndexer {
  const operationIndex = new KyselyOperationIndex(db);
  const writeCache: IWriteCache = {
    getState: vi.fn().mockResolvedValue({}),
    putState: vi.fn(),
    invalidate: vi.fn().mockReturnValue(0),
    clear: vi.fn(),
    startup: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
  };
  return new KyselyDocumentIndexer(
    db as any,
    operationIndex,
    writeCache,
    consistencyTracker,
  );
}

/**
 * Factory for creating test Job objects
 */
export function createTestJob(overrides: Partial<Job> = {}): Job {
  const id = overrides.id || `job-${uuidv4()}`;
  const defaultJob: Job = {
    id,
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
    meta: { batchId: `test-${id}`, batchJobIds: [id] },
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
  const id = overrides.id || `job-${uuidv4()}`;
  return {
    id,
    kind: overrides.kind ?? "mutation",
    documentId: overrides.documentId || "doc-1",
    scope: overrides.scope || "global",
    branch: overrides.branch || "main",
    actions: overrides.actions || [createMinimalAction()],
    operations: overrides.operations || [],
    createdAt: overrides.createdAt || "2023-01-01T00:00:00.000Z",
    queueHint: overrides.queueHint || [],
    errorHistory: overrides.errorHistory || [],
    meta: { batchId: `test-${id}`, batchJobIds: [id] },
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
  return new InMemoryQueue(
    eventBus || createTestEventBus(),
    new NullDocumentModelResolver(),
  );
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
    getSince: vi.fn().mockResolvedValue({
      results: [],
      options: { cursor: "0", limit: 100 },
      nextCursor: undefined,
    }),
    getSinceTimestamp: vi.fn().mockResolvedValue({
      results: [],
      options: { cursor: "0", limit: 100 },
      nextCursor: undefined,
    }),
    getSinceId: vi.fn().mockResolvedValue({
      results: [],
      options: { cursor: "0", limit: 100 },
      nextCursor: undefined,
    }),
    getConflicting: vi.fn().mockResolvedValue({
      results: [],
      options: { cursor: "0", limit: 100 },
      nextCursor: undefined,
    }),
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
 * Factory for creating mock ICollectionMembershipCache
 */
export function createMockCollectionMembershipCache(
  overrides: Partial<ICollectionMembershipCache> = {},
): ICollectionMembershipCache {
  return {
    getCollectionsForDocuments: vi.fn().mockResolvedValue({}),
    invalidate: vi.fn(),
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
    new NullDocumentModelResolver(),
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
    getMany: vi.fn().mockResolvedValue([]),
    getByIdOrSlug: vi.fn().mockRejectedValue(new Error("Not implemented")),
    findByType: vi.fn().mockResolvedValue({
      results: [],
      options: { cursor: "0", limit: 100 },
    }),
    resolveSlug: vi.fn().mockResolvedValue(undefined),
    resolveSlugs: vi.fn().mockResolvedValue([]),
    resolveIdOrSlug: vi.fn().mockImplementation((identifier: string) => {
      return Promise.resolve(identifier);
    }),
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
    getOutgoing: vi
      .fn()
      .mockResolvedValue({ results: [], options: { cursor: "0", limit: 100 } }),
    getIncoming: vi
      .fn()
      .mockResolvedValue({ results: [], options: { cursor: "0", limit: 100 } }),
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
  syncDeadLetterStorage: KyselySyncDeadLetterStorage;
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
  const syncDeadLetterStorage = new KyselySyncDeadLetterStorage(db);

  return { db, syncRemoteStorage, syncCursorStorage, syncDeadLetterStorage };
}

/**
 * Creates a mock ISigner for testing.
 */
export function createMockSigner(overrides: Partial<ISigner> = {}): ISigner {
  return {
    publicKey: vi.mockObject({}) as unknown as CryptoKey,
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
      status: JobStatus.READ_READY,
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
