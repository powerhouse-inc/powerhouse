import type {
  AuthRequest,
  AuthSubject,
  Grant,
  OperationWithContext,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import {
  deriveOperationId,
  evaluateGrantStack,
  generateId,
  groupDocumentType,
  initializeAuth,
  MAX_AUTH_GRANTS,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import type { Kysely } from "kysely";
import type { Options as BenchOptions } from "tinybench";
import { describe } from "vitest";
import { KyselyOperationIndex } from "../src/cache/kysely-operation-index.js";
import type { OperationIndexEntry } from "../src/cache/operation-index-types.js";
import { KyselyWriteCache } from "../src/cache/kysely-write-cache.js";
import type { WriteCacheConfig } from "../src/cache/write-cache-types.js";
import { resolveFeatureFlags } from "../src/core/feature-flags.js";
import { ModelReadGate, readDecisionModel } from "../src/decision/read-gate.js";
import type { RegisteredDecisionModel } from "../src/decision/registered-model.js";
import {
  decideAtHead,
  selectDecisionModel,
} from "../src/decision/registered-model.js";
import type { DecisionTarget } from "../src/decision/types.js";
import type { ReactorFeatureFlags } from "../src/executor/types.js";
import {
  DeletedDocumentRead,
  KyselyDocumentView,
} from "../src/read-models/document-view.js";
import type { DocumentViewDatabase } from "../src/read-models/types.js";
import { DocumentModelRegistry } from "../src/registry/implementation.js";
import { ConsistencyTracker } from "../src/shared/consistency-tracker.js";
import type { IOperationStore } from "../src/storage/interfaces.js";
import type { Database as StorageDatabase } from "../src/storage/kysely/types.js";
import { createTestOperationStore } from "../test/factories.js";
import {
  BENCH_OUTSIDER_ADDRESS,
  BENCH_WRITER_ADDRESS,
  buildGrants,
  flagsFor,
  groupMembers,
  MINIMAL_SHAPE,
  type PolicyShape,
} from "./fixtures/auth-policies.js";
import { bench } from "./loud-bench.js";

// Meso tier: auth-scope.bench.ts's gates, against PGlite instead of stubs.

const DOC_TYPE = "powerhouse/document-model";
const BRANCH = "main";
const GROUP_ID = "bench-group-1";
const GATED_DOC_ID = "bench-gated-doc";

const WRITER: AuthSubject = { address: BENCH_WRITER_ADDRESS, key: "bench-app" };
const OUTSIDER: AuthSubject = {
  address: BENCH_OUTSIDER_ADDRESS,
  key: "other-app",
};
const EXECUTE_GLOBAL: AuthRequest = {
  verb: "execute",
  scope: "global",
  operation: "SET_MODEL_NAME",
};
const TARGET: DecisionTarget = { documentId: GATED_DOC_ID, branch: BRANCH };
const READ_SCOPES = ["global", "local", "auth", "document"];

/** Keyframes off and nothing evicted, so a cold read means an invalidation. */
const CACHE_CONFIG: WriteCacheConfig = {
  maxDocuments: 1000,
  ringBufferSize: 10,
  keyframeInterval: 1_000_000,
};

type ViewDatabase = StorageDatabase & DocumentViewDatabase;

type StorageFixture = {
  store: IOperationStore;
  writeCache: KyselyWriteCache;
  documentView: KyselyDocumentView;
  operationIndex: KyselyOperationIndex;
  registry: DocumentModelRegistry;
  destroy: () => Promise<void>;
};

function shape(overrides: Partial<PolicyShape>): PolicyShape {
  return { ...MINIMAL_SHAPE, ...overrides };
}

/** Chained rather than awaited: tinybench does not await a teardown. */
let pendingTeardown: Promise<void> = Promise.resolve();

async function createFixture(): Promise<StorageFixture> {
  await pendingTeardown;

  const { db, store, keyframeStore, cleanup } =
    await createTestOperationStore();

  const registry = new DocumentModelRegistry();
  registry.registerModules(documentModelDocumentModelModule as never);

  const writeCache = new KyselyWriteCache(
    keyframeStore,
    store,
    registry,
    CACHE_CONFIG,
  );
  await writeCache.startup();

  const viewDb = db as unknown as Kysely<ViewDatabase>;
  const operationIndex = new KyselyOperationIndex(
    db as unknown as Kysely<StorageDatabase>,
  );
  const documentView = new KyselyDocumentView(
    viewDb,
    store,
    operationIndex,
    writeCache,
    new ConsistencyTracker(),
    DeletedDocumentRead.NotFound,
  );

  const destroy = async (): Promise<void> => {
    try {
      await db.destroy();
    } catch (error) {
      console.error("auth meso fixture: db.destroy failed", error);
    }

    try {
      await cleanup();
    } catch (error) {
      console.error("auth meso fixture: cleanup failed", error);
    }
  };

  return { store, writeCache, documentView, operationIndex, registry, destroy };
}

/** The document-scope pair every stream rebuild needs: a type and a version. */
async function seedDocumentScope(
  store: IOperationStore,
  documentId: string,
  documentType: string,
): Promise<void> {
  const initialState = documentModelDocumentModelModule.utils.createState();
  const createActionId = generateId();
  const upgradeActionId = generateId();

  await store.apply(documentId, documentType, "document", BRANCH, 0, (txn) => {
    txn.addOperations({
      id: deriveOperationId(documentId, "document", BRANCH, createActionId),
      index: 0,
      skip: 0,
      hash: `${documentId}-hash-doc-0`,
      timestampUtcMs: new Date().toISOString(),
      action: {
        id: createActionId,
        type: "CREATE_DOCUMENT",
        scope: "document",
        timestampUtcMs: Date.now().toString(),
        input: {
          documentId,
          model: documentType,
          version: 0,
          protocolVersions: { "base-reducer": 2 },
        },
      },
    });

    txn.addOperations({
      id: deriveOperationId(documentId, "document", BRANCH, upgradeActionId),
      index: 1,
      skip: 0,
      hash: `${documentId}-hash-doc-1`,
      timestampUtcMs: new Date().toISOString(),
      action: {
        id: upgradeActionId,
        type: "UPGRADE_DOCUMENT",
        scope: "document",
        timestampUtcMs: Date.now().toString(),
        input: {
          documentId,
          model: documentType,
          fromVersion: 0,
          toVersion: 1,
          initialState,
        },
      },
    });
  });
}

/** The policy, as the one auth-scope operation that installs it. */
async function seedAuthScope(
  store: IOperationStore,
  documentId: string,
  documentType: string,
  grants: Grant[],
): Promise<void> {
  const action = initializeAuth({ version: 1, grants });

  await store.apply(documentId, documentType, "auth", BRANCH, 0, (txn) => {
    txn.addOperations({
      id: deriveOperationId(documentId, "auth", BRANCH, action.id),
      index: 0,
      skip: 0,
      hash: `${documentId}-hash-auth-0`,
      timestampUtcMs: new Date().toISOString(),
      action,
    });
  });
}

/** One domain-scope operation, so the gated scope is a stream and not a gap. */
async function seedGlobalScope(
  store: IOperationStore,
  documentId: string,
  documentType: string,
): Promise<void> {
  const actionId = generateId();

  await store.apply(documentId, documentType, "global", BRANCH, 0, (txn) => {
    txn.addOperations({
      id: deriveOperationId(documentId, "global", BRANCH, actionId),
      index: 0,
      skip: 0,
      hash: `${documentId}-hash-global-0`,
      timestampUtcMs: new Date().toISOString(),
      action: {
        id: actionId,
        type: "SET_MODEL_NAME",
        scope: "global",
        timestampUtcMs: Date.now().toString(),
        input: { name: documentId },
      },
    });
  });
}

function headerFor(documentId: string, documentType: string): unknown {
  return {
    protocolVersions: { "base-reducer": 2 },
    id: documentId,
    documentType,
    slug: documentId,
    name: documentId,
    branch: BRANCH,
    revision: { document: 2, auth: 1, global: 1 },
    createdAtUtcIso: new Date().toISOString(),
    lastModifiedAtUtcIso: new Date().toISOString(),
  };
}

/** The create seeds header, document and auth; the domain write adds global. */
function snapshotItems(
  documentId: string,
  documentType: string,
  grants: Grant[],
  globalState: unknown,
  ordinalBase: number,
): OperationWithContext[] {
  const header = headerFor(documentId, documentType);
  const createState = JSON.stringify({
    header,
    document: { isDeleted: false, version: 1 },
    auth: { version: 1, grants },
  });
  const globalStateJson = JSON.stringify({ header, global: globalState });

  return [
    {
      operation: {
        id: generateId(),
        index: 0,
        skip: 0,
        hash: `${documentId}-snap-doc`,
        timestampUtcMs: new Date().toISOString(),
        action: {
          id: generateId(),
          type: "CREATE_DOCUMENT",
          scope: "document",
          timestampUtcMs: Date.now().toString(),
          input: { documentId },
        },
      },
      context: {
        documentId,
        documentType,
        scope: "document",
        branch: BRANCH,
        resultingState: createState,
        ordinal: ordinalBase,
      },
    },
    {
      operation: {
        id: generateId(),
        index: 0,
        skip: 0,
        hash: `${documentId}-snap-global`,
        timestampUtcMs: new Date().toISOString(),
        action: {
          id: generateId(),
          type: "SET_MODEL_NAME",
          scope: "global",
          timestampUtcMs: Date.now().toString(),
          input: { name: documentId },
        },
      },
      context: {
        documentId,
        documentType,
        scope: "global",
        branch: BRANCH,
        resultingState: globalStateJson,
        ordinal: ordinalBase + 1,
      },
    },
  ] as unknown as OperationWithContext[];
}

/** The auth-scope row the reference relation hangs off, one per referencer. */
function indexEntry(
  documentId: string,
  documentType: string,
): OperationIndexEntry {
  const actionId = generateId();
  return {
    id: generateId(),
    documentId,
    documentType,
    branch: BRANCH,
    scope: "auth",
    sourceRemote: "",
    index: 0,
    skip: 0,
    hash: `${documentId}-index-auth-0`,
    timestampUtcMs: new Date().toISOString(),
    action: {
      id: actionId,
      type: "INITIALIZE_AUTH",
      scope: "auth",
      timestampUtcMs: Date.now().toString(),
      input: {},
    },
  } as unknown as OperationIndexEntry;
}

/** A group withholding its roster, and `count` documents naming it. */
async function seedGroupRoster(
  fixture: StorageFixture,
  count: number,
): Promise<PHDocument> {
  const groupGrants = buildGrants(shape({ grantCount: 4 }));
  await seedDocumentScope(fixture.store, GROUP_ID, groupDocumentType);
  await seedAuthScope(fixture.store, GROUP_ID, groupDocumentType, groupGrants);
  await seedGlobalScope(fixture.store, GROUP_ID, groupDocumentType);

  const items: OperationWithContext[] = snapshotItems(
    GROUP_ID,
    groupDocumentType,
    groupGrants,
    { members: groupMembers(50, true) },
    1,
  );

  const referencerGrants = buildGrants(
    shape({ grantCount: 10, groupIds: [GROUP_ID] }),
  );
  const referencers: string[] = [];
  for (let index = 0; index < count; index++) {
    const referencerId = `bench-referencer-${index}`;
    referencers.push(referencerId);

    await seedDocumentScope(fixture.store, referencerId, DOC_TYPE);
    await seedAuthScope(
      fixture.store,
      referencerId,
      DOC_TYPE,
      referencerGrants,
    );
    await seedGlobalScope(fixture.store, referencerId, DOC_TYPE);

    items.push(
      ...snapshotItems(
        referencerId,
        DOC_TYPE,
        referencerGrants,
        { name: referencerId },
        (index + 1) * 2 + 1,
      ),
    );
  }

  const txn = fixture.operationIndex.start();
  for (const referencerId of referencers) {
    txn.write([indexEntry(referencerId, DOC_TYPE)]);
    txn.recordGroupReferences(referencerId, [GROUP_ID]);
  }
  await fixture.operationIndex.commit(txn);

  await fixture.documentView.indexOperations(items);

  return fixture.documentView.get(GROUP_ID, { branch: BRANCH });
}

/** The document the admission gate decides against, policy and streams both. */
async function seedGatedDocument(fixture: StorageFixture): Promise<void> {
  const grants = buildGrants(shape({ grantCount: MAX_AUTH_GRANTS }));
  await seedDocumentScope(fixture.store, GATED_DOC_ID, DOC_TYPE);
  await seedAuthScope(fixture.store, GATED_DOC_ID, DOC_TYPE, grants);
  await seedGlobalScope(fixture.store, GATED_DOC_ID, DOC_TYPE);
}

function requireReadModel(
  flags: ReactorFeatureFlags,
  registry: DocumentModelRegistry,
): RegisteredDecisionModel {
  const model = readDecisionModel(flags, registry);
  if (model === undefined) {
    throw new Error("the read gate has no model below authEnforcement");
  }
  return model;
}

function exercise(predicate: (scope: string) => boolean): void {
  for (const scope of READ_SCOPES) {
    predicate(scope);
  }
}

/** Boots the PGlite fixture once per phase, so only the gate call is measured. */
function storageCase<TState>(
  name: string,
  time: number,
  prepare: (fixture: StorageFixture) => Promise<TState>,
  measure: (state: TState) => Promise<void>,
): void {
  let fixture: StorageFixture | undefined = undefined;
  let state: TState | undefined = undefined;

  const options: BenchOptions = {
    time,
    iterations: 10,
    throws: true,
    setup: async () => {
      fixture = await createFixture();
      state = await prepare(fixture);
    },
    teardown: () => {
      const finished = fixture;
      fixture = undefined;
      state = undefined;

      if (finished) {
        pendingTeardown = finished.destroy();
      }
    },
  };

  bench(
    name,
    async () => {
      await measure(state!);
    },
    options,
  );
}

type AdmissionState = {
  fixture: StorageFixture;
  model: RegisteredDecisionModel;
};

describe("admission gate against real storage (decideAtHead)", () => {
  const flags = resolveFeatureFlags(flagsFor("L2_AUTH_ENFORCEMENT"));

  const prepare = async (fixture: StorageFixture): Promise<AdmissionState> => {
    await seedGatedDocument(fixture);
    const model = selectDecisionModel(flags, fixture.registry);
    await decideAtHead(
      model,
      fixture.writeCache,
      TARGET,
      WRITER,
      EXECUTE_GLOBAL,
    );
    return { fixture, model };
  };

  // Both projections from memory: what the micro suite's stub stands in for.
  storageCase(
    "L2_AUTH_ENFORCEMENT: 100 grants, warm write cache",
    1000,
    prepare,
    async (state: AdmissionState) => {
      await decideAtHead(
        state.model,
        state.fixture.writeCache,
        TARGET,
        WRITER,
        EXECUTE_GLOBAL,
      );
    },
  );

  // Both streams evicted first: a write to a document this process has not seen.
  storageCase(
    "L2_AUTH_ENFORCEMENT: 100 grants, cold write cache",
    2000,
    prepare,
    async (state: AdmissionState) => {
      state.fixture.writeCache.invalidate(GATED_DOC_ID);
      await decideAtHead(
        state.model,
        state.fixture.writeCache,
        TARGET,
        WRITER,
        EXECUTE_GLOBAL,
      );
    },
  );
});

type ReadGateState = {
  gate: ModelReadGate;
  document: PHDocument;
};

describe("read gate against real storage (scopePredicate)", () => {
  const enforcementFlags = resolveFeatureFlags(flagsFor("L2_AUTH_ENFORCEMENT"));
  const groupFlags = resolveFeatureFlags(flagsFor("L3_AUTH_GROUPS"));

  // The gate seeds its model from the document, so the policy costs no read.
  storageCase(
    "ModelReadGate: 100 grants, document in hand",
    1000,
    async (fixture: StorageFixture): Promise<ReadGateState> => {
      const grants = buildGrants(shape({ grantCount: MAX_AUTH_GRANTS }));
      await fixture.documentView.indexOperations(
        snapshotItems(GATED_DOC_ID, DOC_TYPE, grants, { name: "bench" }, 1),
      );
      const document = await fixture.documentView.get(GATED_DOC_ID, {
        branch: BRANCH,
      });
      const gate = new ModelReadGate(
        requireReadModel(enforcementFlags, fixture.registry),
        fixture.documentView,
        false,
      );
      return { gate, document };
    },
    async (state: ReadGateState) => {
      exercise(await state.gate.scopePredicate(state.document, WRITER, BRANCH));
    },
  );

  // A probe is a document read plus a model build, against the store.
  describe("group roster serving", () => {
    for (const referencerCount of [1, 10, MAX_AUTH_GRANTS]) {
      storageCase(
        `${referencerCount} referencer(s), reader outside the audience`,
        referencerCount === MAX_AUTH_GRANTS ? 3000 : 2000,
        async (fixture: StorageFixture): Promise<ReadGateState> => {
          const document = await seedGroupRoster(fixture, referencerCount);
          const gate = new ModelReadGate(
            requireReadModel(groupFlags, fixture.registry),
            fixture.documentView,
            true,
            fixture.operationIndex,
          );
          return { gate, document };
        },
        async (state: ReadGateState) => {
          exercise(
            await state.gate.scopePredicate(state.document, OUTSIDER, BRANCH),
          );
        },
      );
    }
  });
});

// Repeated from the micro suite unchanged: the anchor for the machine itself.
describe("machine anchor (pure CPU)", () => {
  const capGrants = buildGrants(shape({ grantCount: MAX_AUTH_GRANTS }));

  bench("evaluateGrantStack: 100 grants (cap), denied", () => {
    evaluateGrantStack(capGrants, OUTSIDER, EXECUTE_GLOBAL);
  });
});
