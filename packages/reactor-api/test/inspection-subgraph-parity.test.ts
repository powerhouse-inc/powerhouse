import {
  ChannelErrorSource,
  DriveCollectionId,
  GqlResponseChannelFactory,
  ReactorBuilder,
  ReactorClientBuilder,
  SyncBuilder,
  type InProcessReactorClientModule,
} from "@powerhousedao/reactor";
import {
  driveDocumentModelModule,
  setDriveName,
} from "@powerhousedao/shared/document-drive";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import {
  ConsoleLogger,
  documentModelDocumentModelModule,
} from "document-model";
import type * as GraphQL from "graphql";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { describeSubgraphClass } from "../src/graphql/hosted-subgraph.js";
import { createReactorInspectionSource } from "../src/graphql/inspection/source.js";
import { InspectionSubgraph } from "../src/graphql/inspection/subgraph.js";
import type { SubgraphArgs } from "../src/graphql/types.js";
import {
  AuthorizationPolicy,
  createAuthorizationService,
} from "../src/services/authorization.service.js";
import { createSchema } from "../src/utils/create-schema.js";
import { InspectionSubgraph as SchemaGraphqlInspectionSubgraph } from "./fixtures/r5-inspection/inspection-subgraph.js";
import {
  contextFor,
  createFixture,
  HOST,
  OUTSIDER,
  police,
  READER,
} from "./utils/read-gate-fixture.js";
import { resolversOf, typeDefsOf } from "./utils/served-subgraph.js";
import { createTestSigner } from "./utils/test-signer.js";

// The CommonJS build @apollo/subgraph uses; vite would hand this file the ESM one.
const { graphql } = createRequire(import.meta.url)("graphql") as typeof GraphQL;

const OPERATOR = "0xoperator";

let module: InProcessReactorClientModule;

beforeAll(async () => {
  module = await new ReactorClientBuilder()
    .withSigner(await createTestSigner(HOST))
    .withReactorBuilder(
      new ReactorBuilder()
        .withDocumentModelSources([
          driveDocumentModelModule as unknown as DocumentModelModule,
          documentModelDocumentModelModule as unknown as DocumentModelModule,
        ])
        .withExecutorConfig({
          featureFlags: { documentDecisions: true, authEnforcement: true },
        })
        .withSync(
          new SyncBuilder().withChannelFactory(
            new GqlResponseChannelFactory(new ConsoleLogger(["parity"])),
          ),
        ),
    )
    .buildModule();
  await createFixture(module.client, "par-doc");
  await police(module.client, "par-doc");
  await createFixture(module.client, "par-open");
  await createFixture(module.client, "par-drive", {
    source: driveDocumentModelModule,
  });
  await module.client.execute("par-drive", "main", [
    setDriveName({ name: "classified" }),
  ]);
  await police(module.client, "par-drive");
  const sync = module.reactorModule!.syncModule!;
  await sync.syncManager.add("r", DriveCollectionId.forDrive("par-drive"), {
    type: "gql",
    parameters: {},
  });
  for (let i = 0; i < 3; i++) {
    await sync.deadLetterStorage.add({
      id: `dl-${i}`,
      jobId: `job-${i}`,
      jobDependencies: [],
      remoteName: "r",
      documentId: "par-doc",
      scopes: ["global"],
      branch: "main",
      operations: [],
      errorSource: ChannelErrorSource.Inbox,
      errorMessage: "failed",
      errorType: "LIBRARY_ERROR",
    });
  }
});

afterAll(() => {
  module.reactor.kill();
});

type InspectionClass =
  | typeof InspectionSubgraph
  | typeof SchemaGraphqlInspectionSubgraph;

async function run(
  subgraphClass: InspectionClass,
  source: string,
  caller: string | undefined,
) {
  const reactorModule = module.reactorModule!;
  const subgraph = new subgraphClass({
    reactorClient: module.client,
    syncManager: reactorModule.syncModule!.syncManager,
    authorizationService: createAuthorizationService({
      admins: [OPERATOR],
      defaultProtection: false,
      policy: AuthorizationPolicy.OPEN,
    }),
    inspection: createReactorInspectionSource(reactorModule, {
      throttle: { callsPerMinute: 10_000 },
    }),
  } as unknown as SubgraphArgs);
  const schema = createSchema([], resolversOf(subgraph), typeDefsOf(subgraph));
  const result = await graphql({
    schema,
    source,
    contextValue: contextFor(caller),
  });
  return JSON.parse(JSON.stringify(result)) as unknown;
}

const cursor =
  "cursorType cursorOrdinal lastSyncedAtUtcMs liveAckOrdinal liveLatestOrdinal";
const remote = `remoteName remoteId inboxCursor { ${cursor} } outboxCursor { ${cursor} }
  mailboxDepths { inbox outbox deadLetter } connection { snapshot neverSucceeded } meta`;
const deadLetters =
  "remoteName results { id jobId documentId branch scopes errorType errorMessage operationCount } nextCursor";
const integrity =
  "driveId checkedNodeCount totalFileNodeCount missingDocuments { id documentType } unsupportedTypes { id documentType }";
const validation =
  "documentId isConsistent keyframeIssues snapshotIssues streamOrderIssues";
const job =
  "id kind documentId scope branch status actionCount operationCount retryCount";

const OPERATIONS: Record<string, string> = {
  info: "info { storage { engine persistence durable selfHeal } workflows syncChannels access { admin sql } }",
  documentModels:
    "documentModels { documentType name version supportedVersions }",
  drives:
    "drives(limit: 10) { results { driveId name branch collectionId documentType nodeCount fileCount folderCount otherNodeCount unreadableNodeCount icon } nextCursor }",
  driveIntegrity: `driveIntegrity(driveId: "par-drive", branch: "main") { ${integrity} }`,
  driveIntegrityMissing: `driveIntegrity(driveId: "missing", branch: "main") { driveId }`,
  attachmentInfo:
    "attachmentInfo { present storeKind hasReplicator replicatorRunning backlogScanned refsSeen held bytesHeld queued fetching pendingFetches waiting notFound failed lastError }",
  queueState: `queueState { isPaused totalPending totalExecuting pendingJobs { ${job} } executingJobs { ${job} } }`,
  processors:
    "processors { processorId factoryId driveId processorIndex lastOrdinal status lastError lastErrorTimestampUtcMs }",
  catchUpStatus: "catchUpStatus",
  storageHealth:
    "storageHealth { tracked healthy everRecreated recreateCount }",
  validateDocument: `validateDocument(documentId: "par-doc") { ${validation} }`,
  validateOpenDocument: `validateDocument(documentId: "par-open", branch: "main") { ${validation} }`,
  remotes: `remotes { ${remote} }`,
  remote: `remote(remoteName: "r") { ${remote} }`,
  remoteMissing: `remote(remoteName: "missing") { remoteName }`,
  deadLetters: `deadLetters(remoteName: "r", limit: 2) { ${deadLetters} }`,
  deadLettersBadCursor: `deadLetters(remoteName: "r", cursor: "not-a-cursor") { remoteName }`,
};

const CALLERS = {
  operator: OPERATOR,
  reader: READER,
  outsider: OUTSIDER,
  anonymous: undefined,
};

const query = (selection: string) => `{ inspection { ${selection} } }`;

describe("the typed inspection subgraph against its schema.graphql version", () => {
  it("compares a typed class with a schema.graphql class", () => {
    const kinds = [InspectionSubgraph, SchemaGraphqlInspectionSubgraph].map(
      (subgraphClass) =>
        describeSubgraphClass(subgraphClass)?.description.definition.schemaKind,
    );
    expect(kinds).toEqual(["typed", "graphql-ast-compat"]);
  });

  for (const [callerName, caller] of Object.entries(CALLERS)) {
    describe(`as ${callerName}`, () => {
      it.each(Object.entries(OPERATIONS))(
        "answers %s with the same body",
        async (_name, selection) => {
          const source = query(selection);
          expect(await run(InspectionSubgraph, source, caller)).toEqual(
            await run(SchemaGraphqlInspectionSubgraph, source, caller),
          );
        },
      );
    });
  }

  it("serves a listed admin the dead-letter page", async () => {
    expect(
      await run(
        InspectionSubgraph,
        query('deadLetters(remoteName: "r", limit: 2) { results { id } }'),
        OPERATOR,
      ),
    ).toEqual({
      data: {
        inspection: {
          deadLetters: { results: [{ id: "dl-2" }, { id: "dl-1" }] },
        },
      },
    });
  });

  it("refuses an operational read to a caller who is not a listed admin", async () => {
    expect(
      await run(InspectionSubgraph, query("catchUpStatus"), READER),
    ).toEqual({
      data: null,
      errors: [
        {
          message:
            "Forbidden: insufficient permissions to read the reactor's operational state",
          locations: [{ line: 1, column: 16 }],
          path: ["inspection", "catchUpStatus"],
          extensions: { code: "FORBIDDEN" },
        },
      ],
    });
  });

  it("refuses a policed document to a caller the gate withholds it from", async () => {
    expect(
      await run(
        InspectionSubgraph,
        query('validateDocument(documentId: "par-doc") { documentId }'),
        OUTSIDER,
      ),
    ).toEqual({
      data: null,
      errors: [
        {
          message: "Forbidden: insufficient permissions to read this document",
          locations: [{ line: 1, column: 16 }],
          path: ["inspection", "validateDocument"],
          extensions: { code: "FORBIDDEN" },
        },
      ],
    });
  });
});
