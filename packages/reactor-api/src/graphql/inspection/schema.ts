import {
  type AnyFieldDescriptor,
  type ComputedFieldDescriptor,
  ph,
  subgraphScalars,
} from "document-model";
import { compileSubgraphTypeDefs } from "document-model/tooling";
import type { DocumentNode } from "graphql";
import type { CoreSubgraphSchema } from "../subgraph-types.js";
import type { SchemaBuilder } from "../subgraph-schema.js";
import type { InspectionReadField } from "./resolvers.js";

const ReactorStorageFacts = ph.object("ReactorStorageFacts", {
  fields: {
    engine: ph.String({ required: true }),
    persistence: ph.String({ required: true }),
    durable: ph.Boolean({ required: true }),
    selfHeal: ph.Boolean({ required: true }),
  },
});

const InspectorAccess = ph.object("InspectorAccess", {
  fields: {
    admin: ph.Boolean({ required: true }),
    sql: ph.Boolean({ required: true }),
  },
});

const ReactorInfo = ph.object("ReactorInfo", {
  description:
    "What this reactor reports about itself. access is null unless the caller is\none of the host's admins.",
  fields: {
    storage: ph.ref(ReactorStorageFacts, { required: true }),
    workflows: ph.Boolean({ required: true }),
    syncChannels: ph.list(ph.String({ required: true }), { required: true }),
    access: ph.ref(InspectorAccess),
  },
});

const InspectionDocumentModel = ph.object("InspectionDocumentModel", {
  fields: {
    documentType: ph.String({ required: true }),
    name: ph.String({ required: true }),
    version: ph.Int({ required: true }),
    supportedVersions: ph.list(ph.Int({ required: true }), { required: true }),
  },
});

const InspectionDrive = ph.object("InspectionDrive", {
  fields: {
    driveId: ph.String({ required: true }),
    name: ph.String({ required: true }),
    branch: ph.String({ required: true }),
    collectionId: ph.String({ required: true }),
    documentType: ph.String({ required: true }),
    nodeCount: ph.Int({ required: true }),
    fileCount: ph.Int({ required: true }),
    folderCount: ph.Int({ required: true }),
    otherNodeCount: ph.Int({ required: true }),
    unreadableNodeCount: ph.Int({ required: true }),
    icon: ph.String(),
  },
});

const InspectionDrivePage = ph.object("InspectionDrivePage", {
  fields: {
    results: ph.list(ph.ref(InspectionDrive, { required: true }), {
      required: true,
    }),
    nextCursor: ph.String(),
  },
});

const InspectionDriveIntegrityRef = ph.object("InspectionDriveIntegrityRef", {
  fields: {
    id: ph.String({ required: true }),
    documentType: ph.String({ required: true }),
  },
});

const InspectionDriveIntegrity = ph.object("InspectionDriveIntegrity", {
  fields: {
    driveId: ph.String({ required: true }),
    checkedNodeCount: ph.Int({ required: true }),
    totalFileNodeCount: ph.Int({ required: true }),
    missingDocuments: ph.list(
      ph.ref(InspectionDriveIntegrityRef, { required: true }),
      {
        description:
          "File nodes whose document is missing or not served to you; the two are\nreported alike so a withheld document's existence does not leak.",
        required: true,
      },
    ),
    unsupportedTypes: ph.list(
      ph.ref(InspectionDriveIntegrityRef, { required: true }),
      { required: true },
    ),
  },
});

const InspectionAttachmentInfo = ph.object("InspectionAttachmentInfo", {
  fields: {
    present: ph.Boolean({ required: true }),
    storeKind: ph.String({ required: true }),
    hasReplicator: ph.Boolean({ required: true }),
    replicatorRunning: ph.Boolean({ required: true }),
    backlogScanned: ph.Boolean({ required: true }),
    refsSeen: ph.Int({ required: true }),
    held: ph.Int({ required: true }),
    bytesHeld: ph.Float({ required: true }),
    queued: ph.Int({ required: true }),
    fetching: ph.Int({ required: true }),
    pendingFetches: ph.Int({ required: true }),
    waiting: ph.Int({ required: true }),
    notFound: ph.Int({ required: true }),
    failed: ph.Int({ required: true }),
    lastError: ph.String(),
  },
});

const InspectionQueueJob = ph.object("InspectionQueueJob", {
  description: "A queued job without its actions or operations.",
  fields: {
    id: ph.String({ required: true }),
    kind: ph.String({ required: true }),
    documentId: ph.String({ required: true }),
    scope: ph.String({ required: true }),
    branch: ph.String({ required: true }),
    status: ph.String({ required: true }),
    actionCount: ph.Int({ required: true }),
    operationCount: ph.Int({ required: true }),
    retryCount: ph.Int({ required: true }),
  },
});

const InspectionQueueState = ph.object("InspectionQueueState", {
  fields: {
    isPaused: ph.Boolean({ required: true }),
    totalPending: ph.Int({ required: true }),
    totalExecuting: ph.Int({ required: true }),
    pendingJobs: ph.list(ph.ref(InspectionQueueJob, { required: true }), {
      required: true,
    }),
    executingJobs: ph.list(ph.ref(InspectionQueueJob, { required: true }), {
      required: true,
    }),
  },
});

const InspectionProcessor = ph.object("InspectionProcessor", {
  fields: {
    processorId: ph.String({ required: true }),
    factoryId: ph.String({ required: true }),
    driveId: ph.String({ required: true }),
    processorIndex: ph.Int({ required: true }),
    lastOrdinal: ph.Float({ required: true }),
    status: ph.String({ required: true }),
    lastError: ph.String(),
    lastErrorTimestampUtcMs: ph.Float(),
  },
});

const InspectionStorageHealth = ph.object("InspectionStorageHealth", {
  description:
    "healthy means something only when tracked; an untracked store reports false.",
  fields: {
    tracked: ph.Boolean({ required: true }),
    healthy: ph.Boolean({ required: true }),
    everRecreated: ph.Boolean({ required: true }),
    recreateCount: ph.Int({ required: true }),
  },
});

const InspectionValidation = ph.object("InspectionValidation", {
  description: "Issues in scopes the caller may not read are left out.",
  fields: {
    documentId: ph.String({ required: true }),
    isConsistent: ph.Boolean({ required: true }),
    keyframeIssues: ph.list(subgraphScalars.JSONObject({ required: true }), {
      required: true,
    }),
    snapshotIssues: ph.list(subgraphScalars.JSONObject({ required: true }), {
      required: true,
    }),
    streamOrderIssues: ph.list(subgraphScalars.JSONObject({ required: true }), {
      required: true,
    }),
  },
});

const InspectionCursor = ph.object("InspectionCursor", {
  fields: {
    cursorType: ph.String({ required: true }),
    cursorOrdinal: ph.Float({ required: true }),
    lastSyncedAtUtcMs: ph.Float(),
    liveAckOrdinal: ph.Float({ required: true }),
    liveLatestOrdinal: ph.Float({ required: true }),
  },
});

const InspectionMailboxDepths = ph.object("InspectionMailboxDepths", {
  fields: {
    inbox: ph.Int({ required: true }),
    outbox: ph.Int({ required: true }),
    deadLetter: ph.Int({ required: true }),
  },
});

const InspectionConnectionHealth = ph.object("InspectionConnectionHealth", {
  fields: {
    snapshot: subgraphScalars.JSONObject({ required: true }),
    neverSucceeded: ph.Boolean({ required: true }),
    stalenessMs: ph.Float(),
  },
});

const InspectionRemote = ph.object("InspectionRemote", {
  fields: {
    remoteName: ph.String({ required: true }),
    remoteId: ph.String({ required: true }),
    inboxCursor: ph.ref(InspectionCursor, { required: true }),
    outboxCursor: ph.ref(InspectionCursor, { required: true }),
    mailboxDepths: ph.ref(InspectionMailboxDepths, { required: true }),
    connection: ph.ref(InspectionConnectionHealth, { required: true }),
    meta: subgraphScalars.JSONObject({ required: true }),
  },
});

const InspectionDeadLetter = ph.object("InspectionDeadLetter", {
  description: "A dead letter without its operations.",
  fields: {
    id: ph.String({ required: true }),
    jobId: ph.String({ required: true }),
    documentId: ph.String({ required: true }),
    branch: ph.String({ required: true }),
    scopes: ph.list(ph.String({ required: true }), { required: true }),
    errorType: ph.String({ required: true }),
    errorMessage: ph.String({ required: true }),
    operationCount: ph.Int({ required: true }),
  },
});

const InspectionDeadLetterPage = ph.object("InspectionDeadLetterPage", {
  fields: {
    remoteName: ph.String({ required: true }),
    results: ph.list(ph.ref(InspectionDeadLetter, { required: true }), {
      required: true,
    }),
    nextCursor: ph.String(),
  },
});

// Exactly the read rows of both op tables; ordinals are Float.
const inspectionFields = {
  info: ph.field({ returns: ph.ref(ReactorInfo, { required: true }) }),
  documentModels: ph.field({
    returns: ph.list(ph.ref(InspectionDocumentModel, { required: true }), {
      required: true,
    }),
  }),
  drives: ph.field({
    args: { cursor: ph.String(), limit: ph.Int() },
    returns: ph.ref(InspectionDrivePage, { required: true }),
  }),
  driveIntegrity: ph.field({
    description: "Reads every file node's document. Throttled per caller.",
    args: {
      driveId: ph.String({ required: true }),
      branch: ph.String({ required: true }),
    },
    returns: ph.ref(InspectionDriveIntegrity, { required: true }),
  }),
  attachmentInfo: ph.field({
    returns: ph.ref(InspectionAttachmentInfo, { required: true }),
  }),
  queueState: ph.field({
    returns: ph.ref(InspectionQueueState, { required: true }),
  }),
  processors: ph.field({
    returns: ph.list(ph.ref(InspectionProcessor, { required: true }), {
      required: true,
    }),
  }),
  catchUpStatus: ph.field({
    returns: subgraphScalars.JSONObject({ required: true }),
  }),
  storageHealth: ph.field({
    returns: ph.ref(InspectionStorageHealth, { required: true }),
  }),
  validateDocument: ph.field({
    description: "Replays the whole document; expensive. Throttled per caller.",
    args: { documentId: ph.String({ required: true }), branch: ph.String() },
    returns: ph.ref(InspectionValidation, { required: true }),
  }),
  remotes: ph.field({
    returns: ph.list(ph.ref(InspectionRemote, { required: true }), {
      required: true,
    }),
  }),
  remote: ph.field({
    args: { remoteName: ph.String({ required: true }) },
    returns: ph.ref(InspectionRemote, { required: true }),
  }),
  deadLetters: ph.field({
    args: {
      remoteName: ph.String({ required: true }),
      cursor: ph.String(),
      limit: ph.Int(),
    },
    returns: ph.ref(InspectionDeadLetterPage, { required: true }),
  }),
} satisfies Record<InspectionReadField, ComputedFieldDescriptor>;

export const ReactorInspection = ph.object("ReactorInspection", {
  description:
    "Reads only. info and documentModels serve every caller; drive and document\nreads are made as the caller through the reactor read gate; the rest need\none of the host's admins.",
  fields: inspectionFields,
});

export const inspectionQuery = {
  returns: ph.ref(ReactorInspection, { required: true }),
} satisfies { readonly returns: AnyFieldDescriptor };

const unserved = () => {
  throw new Error("The inspection core type map serves no resolvers.");
};

export const inspectionTypeDefs = compileSubgraphTypeDefs(
  "inspection",
  (schema: SchemaBuilder<never>) => {
    const field = ReactorInspection.computedTokens;
    return [
      schema.query("inspection", { ...inspectionQuery, resolve: unserved }),
      schema.field(field.info, { resolve: unserved }),
      schema.field(field.documentModels, { resolve: unserved }),
      schema.field(field.drives, { resolve: unserved }),
      schema.field(field.driveIntegrity, { resolve: unserved }),
      schema.field(field.attachmentInfo, { resolve: unserved }),
      schema.field(field.queueState, { resolve: unserved }),
      schema.field(field.processors, { resolve: unserved }),
      schema.field(field.catchUpStatus, { resolve: unserved }),
      schema.field(field.storageHealth, { resolve: unserved }),
      schema.field(field.validateDocument, { resolve: unserved }),
      schema.field(field.remotes, { resolve: unserved }),
      schema.field(field.remote, { resolve: unserved }),
      schema.field(field.deadLetters, { resolve: unserved }),
    ];
  },
) as DocumentNode;

export const inspectionSchema = {
  subgraphName: "inspection",
  typeDefs: inspectionTypeDefs,
  resolverCoordinates: [
    { typeName: "Query", fieldName: "inspection", resolverKind: "field" },
    ...Object.keys(inspectionFields).map((fieldName) => ({
      typeName: "ReactorInspection",
      fieldName,
      resolverKind: "field" as const,
    })),
  ],
} as const satisfies CoreSubgraphSchema;
