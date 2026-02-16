import {
  batchOperationsByDocument,
  sortEnvelopesByFirstOperationTimestamp,
  SyncOperation,
  trimMailboxFromAckOrdinal,
  type IReactorClient,
  type ISyncManager,
  type JobInfo,
  type OperationBatch,
  type OperationFilter,
  type PagedResults,
  type PagingOptions,
  type PropagationMode,
  type RemoteFilter,
  type SearchFilter,
  type ViewFilter,
} from "@powerhousedao/reactor";
import type {
  DocumentModelModule,
  Operation,
  PHDocument,
} from "document-model";
import { GraphQLError } from "graphql";
import type { GetParentIdsFn } from "../../services/document-permission.service.js";
import {
  fromInputMaybe,
  serializeOperationForGraphQL,
  toDocumentModelResultPage,
  toGqlJobInfo,
  toGqlPhDocument,
  toMutableArray,
  toOperationResultPage,
  toPhDocumentResultPage,
  validateActions,
} from "./adapters.js";
import type {
  DocumentModelResultPage,
  JobInfo as GqlJobInfo,
  PropagationMode as GqlPropagationMode,
  PhDocumentResultPage,
  ReactorOperationResultPage,
} from "./gen/graphql.js";

export async function documentModels(
  reactorClient: IReactorClient,
  args: {
    namespace?: string | null;
    paging?: {
      cursor?: string | null;
      limit?: number | null;
    } | null;
  },
): Promise<DocumentModelResultPage> {
  const namespace = fromInputMaybe(args.namespace);

  let paging: PagingOptions | undefined;
  if (args.paging) {
    const cursor = fromInputMaybe(args.paging.cursor);
    const limit = fromInputMaybe(args.paging.limit);
    if (cursor || limit) {
      paging = {
        cursor: cursor || "",
        limit: limit || 10,
      };
    }
  }

  let result: PagedResults<DocumentModelModule>;
  try {
    result = await reactorClient.getDocumentModelModules(namespace, paging);
  } catch (error) {
    throw new GraphQLError(
      `Failed to fetch document models: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  try {
    return toDocumentModelResultPage(result);
  } catch (error) {
    throw new GraphQLError(
      `Failed to convert document models to GraphQL: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

export async function document(
  reactorClient: IReactorClient,
  args: {
    identifier: string;
    view?: {
      branch?: string | null;
      scopes?: readonly string[] | null;
    } | null;
  },
): Promise<{
  document: ReturnType<typeof toGqlPhDocument>;
  childIds: string[];
}> {
  let view: ViewFilter | undefined;
  if (args.view) {
    view = {
      branch: fromInputMaybe(args.view.branch),
      scopes: toMutableArray(fromInputMaybe(args.view.scopes)),
    };
  }

  let result: PHDocument;
  try {
    result = await reactorClient.get(args.identifier, view);
  } catch (error) {
    throw new GraphQLError(
      `Failed to fetch document: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  let children: PagedResults<PHDocument>;
  try {
    children = await reactorClient.getChildren(args.identifier, view);
  } catch (error) {
    throw new GraphQLError(
      `Failed to fetch children: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  try {
    return {
      document: toGqlPhDocument(result),
      childIds: children.results.map((child) => child.header.id),
    };
  } catch (error) {
    throw new GraphQLError(
      `Failed to convert document to GraphQL: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

export async function documentChildren(
  reactorClient: IReactorClient,
  args: {
    parentIdentifier: string;
    view?: {
      branch?: string | null;
      scopes?: readonly string[] | null;
    } | null;
    paging?: {
      cursor?: string | null;
      limit?: number | null;
    } | null;
  },
): Promise<PhDocumentResultPage> {
  let view: ViewFilter | undefined;
  if (args.view) {
    view = {
      branch: fromInputMaybe(args.view.branch),
      scopes: toMutableArray(fromInputMaybe(args.view.scopes)),
    };
  }

  let paging: PagingOptions | undefined;
  if (args.paging) {
    const cursor = fromInputMaybe(args.paging.cursor);
    const limit = fromInputMaybe(args.paging.limit);
    if (cursor || limit) {
      paging = {
        cursor: cursor || "",
        limit: limit || 10,
      };
    }
  }

  let result: PagedResults<PHDocument>;
  try {
    result = await reactorClient.getChildren(
      args.parentIdentifier,
      view,
      paging,
    );
  } catch (error) {
    throw new GraphQLError(
      `Failed to fetch document children: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  try {
    return toPhDocumentResultPage(result);
  } catch (error) {
    throw new GraphQLError(
      `Failed to convert document children to GraphQL: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

export async function documentParents(
  reactorClient: IReactorClient,
  args: {
    childIdentifier: string;
    view?: {
      branch?: string | null;
      scopes?: readonly string[] | null;
    } | null;
    paging?: {
      cursor?: string | null;
      limit?: number | null;
    } | null;
  },
): Promise<PhDocumentResultPage> {
  let view: ViewFilter | undefined;
  if (args.view) {
    view = {
      branch: fromInputMaybe(args.view.branch),
      scopes: toMutableArray(fromInputMaybe(args.view.scopes)),
    };
  }

  let paging: PagingOptions | undefined;
  if (args.paging) {
    const cursor = fromInputMaybe(args.paging.cursor);
    const limit = fromInputMaybe(args.paging.limit);
    if (cursor || limit) {
      paging = {
        cursor: cursor || "",
        limit: limit || 10,
      };
    }
  }

  let result: PagedResults<PHDocument>;
  try {
    result = await reactorClient.getParents(args.childIdentifier, view, paging);
  } catch (error) {
    throw new GraphQLError(
      `Failed to fetch document parents: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  try {
    return toPhDocumentResultPage(result);
  } catch (error) {
    throw new GraphQLError(
      `Failed to convert document parents to GraphQL: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

export async function findDocuments(
  reactorClient: IReactorClient,
  args: {
    search: {
      type?: string | null;
      parentId?: string | null;
    };
    view?: {
      branch?: string | null;
      scopes?: readonly string[] | null;
    } | null;
    paging?: {
      cursor?: string | null;
      limit?: number | null;
    } | null;
  },
): Promise<PhDocumentResultPage> {
  let view: ViewFilter | undefined;
  if (args.view) {
    view = {
      branch: fromInputMaybe(args.view.branch),
      scopes: toMutableArray(fromInputMaybe(args.view.scopes)),
    };
  }

  let paging: PagingOptions | undefined;
  if (args.paging) {
    const cursor = fromInputMaybe(args.paging.cursor);
    const limit = fromInputMaybe(args.paging.limit);
    if (cursor || limit) {
      paging = {
        cursor: cursor || "",
        limit: limit || 10,
      };
    }
  }

  const search: SearchFilter = {
    type: fromInputMaybe(args.search.type),
    parentId: fromInputMaybe(args.search.parentId),
  };

  let result: PagedResults<PHDocument>;
  try {
    result = await reactorClient.find(search, view, paging);
  } catch (error) {
    throw new GraphQLError(
      `Failed to find documents: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  try {
    return toPhDocumentResultPage(result);
  } catch (error) {
    throw new GraphQLError(
      `Failed to convert documents to GraphQL: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

export async function jobStatus(
  reactorClient: IReactorClient,
  args: {
    jobId: string;
  },
): Promise<GqlJobInfo> {
  let result: JobInfo;
  try {
    result = await reactorClient.getJobStatus(args.jobId);
  } catch (error) {
    throw new GraphQLError(
      `Failed to fetch job status: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  try {
    return toGqlJobInfo(result);
  } catch (error) {
    throw new GraphQLError(
      `Failed to convert job status to GraphQL: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

export async function documentOperations(
  reactorClient: IReactorClient,
  args: {
    filter: {
      documentId: string;
      branch?: string | null;
      scopes?: readonly string[] | null;
      actionTypes?: readonly string[] | null;
      sinceRevision?: number | null;
      timestampFrom?: string | null;
      timestampTo?: string | null;
    };
    paging?: {
      cursor?: string | null;
      limit?: number | null;
    } | null;
  },
): Promise<ReactorOperationResultPage> {
  let view: ViewFilter | undefined;
  const branch = fromInputMaybe(args.filter.branch);
  const scopes = toMutableArray(fromInputMaybe(args.filter.scopes));
  if (branch || scopes) {
    view = { branch, scopes };
  }

  const actionTypes = toMutableArray(fromInputMaybe(args.filter.actionTypes));
  const sinceRevision = fromInputMaybe(args.filter.sinceRevision);
  const timestampFrom = fromInputMaybe(args.filter.timestampFrom);
  const timestampTo = fromInputMaybe(args.filter.timestampTo);

  let operationFilter: OperationFilter | undefined;
  if (
    (actionTypes && actionTypes.length > 0) ||
    sinceRevision !== undefined ||
    timestampFrom ||
    timestampTo
  ) {
    operationFilter = {
      actionTypes:
        actionTypes && actionTypes.length > 0 ? actionTypes : undefined,
      sinceRevision,
      timestampFrom: timestampFrom || undefined,
      timestampTo: timestampTo || undefined,
    };
  }

  let paging: PagingOptions | undefined;
  if (args.paging) {
    const cursor = fromInputMaybe(args.paging.cursor);
    const limit = fromInputMaybe(args.paging.limit);
    if (cursor || limit) {
      paging = {
        cursor: cursor || "",
        limit: limit || 100,
      };
    }
  }

  let result: PagedResults<Operation>;
  try {
    result = await reactorClient.getOperations(
      args.filter.documentId,
      view,
      operationFilter,
      paging,
    );
  } catch (error) {
    throw new GraphQLError(
      `Failed to fetch document operations: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  try {
    return toOperationResultPage(result);
  } catch (error) {
    throw new GraphQLError(
      `Failed to convert operations to GraphQL: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

export async function createDocument(
  reactorClient: IReactorClient,
  args: {
    document: unknown;
    parentIdentifier?: string | null;
  },
): Promise<ReturnType<typeof toGqlPhDocument>> {
  // Validate that document is a PHDocument
  if (!args.document || typeof args.document !== "object") {
    throw new GraphQLError("Invalid document: must be an object");
  }

  const document = args.document as PHDocument;

  // Validate required fields
  if (!document.header || typeof document.header !== "object") {
    throw new GraphQLError("Invalid document: missing or invalid header");
  }

  const parentIdentifier = fromInputMaybe(args.parentIdentifier);

  let result: PHDocument;
  try {
    result = await reactorClient.create(document, parentIdentifier);
  } catch (error) {
    throw new GraphQLError(
      `Failed to create document: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  try {
    return toGqlPhDocument(result);
  } catch (error) {
    throw new GraphQLError(
      `Failed to convert created document to GraphQL: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

export async function createEmptyDocument(
  reactorClient: IReactorClient,
  args: {
    documentType: string;
    parentIdentifier?: string | null;
  },
): Promise<ReturnType<typeof toGqlPhDocument>> {
  const parentIdentifier = fromInputMaybe(args.parentIdentifier);

  let result: PHDocument;
  try {
    result = await reactorClient.createEmpty(args.documentType, {
      parentIdentifier,
    });
  } catch (error) {
    throw new GraphQLError(
      `Failed to create empty document: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  try {
    return toGqlPhDocument(result);
  } catch (error) {
    throw new GraphQLError(
      `Failed to convert created document to GraphQL: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

export async function mutateDocument(
  reactorClient: IReactorClient,
  args: {
    documentIdentifier: string;
    actions: readonly unknown[];
    view?: {
      branch?: string | null;
      scopes?: readonly string[] | null;
    } | null;
  },
): Promise<ReturnType<typeof toGqlPhDocument>> {
  // Validate actions
  let validatedActions;
  try {
    validatedActions = validateActions(args.actions);
  } catch (error) {
    if (error instanceof GraphQLError) {
      throw error;
    }
    throw new GraphQLError(
      `Action validation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  // Extract branch from view filter (default to "main")
  const branch = args.view?.branch ?? "main";

  let result: PHDocument;
  try {
    result = await reactorClient.execute(
      args.documentIdentifier,
      branch,
      validatedActions,
    );
  } catch (error) {
    throw new GraphQLError(
      `Failed to mutate document: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  try {
    return toGqlPhDocument(result);
  } catch (error) {
    throw new GraphQLError(
      `Failed to convert mutated document to GraphQL: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

export async function mutateDocumentAsync(
  reactorClient: IReactorClient,
  args: {
    documentIdentifier: string;
    actions: readonly unknown[];
    view?: {
      branch?: string | null;
      scopes?: readonly string[] | null;
    } | null;
  },
): Promise<string> {
  // Validate actions
  let validatedActions;
  try {
    validatedActions = validateActions(args.actions);
  } catch (error) {
    if (error instanceof GraphQLError) {
      throw error;
    }
    throw new GraphQLError(
      `Action validation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  // Extract branch from view filter (default to "main")
  const branch = args.view?.branch ?? "main";

  let result: JobInfo;
  try {
    result = await reactorClient.executeAsync(
      args.documentIdentifier,
      branch,
      validatedActions,
    );
  } catch (error) {
    throw new GraphQLError(
      `Failed to submit document mutation: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  return result.id;
}

export async function renameDocument(
  reactorClient: IReactorClient,
  args: {
    documentIdentifier: string;
    name: string;
    branch?: string | null;
  },
): Promise<ReturnType<typeof toGqlPhDocument>> {
  const branch = fromInputMaybe(args.branch);

  let result: PHDocument;
  try {
    result = await reactorClient.rename(
      args.documentIdentifier,
      args.name,
      branch,
    );
  } catch (error) {
    throw new GraphQLError(
      `Failed to rename document: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  try {
    return toGqlPhDocument(result);
  } catch (error) {
    throw new GraphQLError(
      `Failed to convert renamed document to GraphQL: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

export async function addChildren(
  reactorClient: IReactorClient,
  args: {
    parentIdentifier: string;
    documentIdentifiers: readonly string[];
    branch?: string | null;
  },
): Promise<ReturnType<typeof toGqlPhDocument>> {
  const branch = fromInputMaybe(args.branch);
  const documentIdentifiers = [...args.documentIdentifiers];

  let result: PHDocument;
  try {
    result = await reactorClient.addChildren(
      args.parentIdentifier,
      documentIdentifiers,
      branch,
    );
  } catch (error) {
    throw new GraphQLError(
      `Failed to add children: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  try {
    return toGqlPhDocument(result);
  } catch (error) {
    throw new GraphQLError(
      `Failed to convert document to GraphQL: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

export async function removeChildren(
  reactorClient: IReactorClient,
  args: {
    parentIdentifier: string;
    documentIdentifiers: readonly string[];
    branch?: string | null;
  },
): Promise<ReturnType<typeof toGqlPhDocument>> {
  const branch = fromInputMaybe(args.branch);
  const documentIdentifiers = [...args.documentIdentifiers];

  let result: PHDocument;
  try {
    result = await reactorClient.removeChildren(
      args.parentIdentifier,
      documentIdentifiers,
      branch,
    );
  } catch (error) {
    throw new GraphQLError(
      `Failed to remove children: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  try {
    return toGqlPhDocument(result);
  } catch (error) {
    throw new GraphQLError(
      `Failed to convert document to GraphQL: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

export async function moveChildren(
  reactorClient: IReactorClient,
  args: {
    sourceParentIdentifier: string;
    targetParentIdentifier: string;
    documentIdentifiers: readonly string[];
    branch?: string | null;
  },
): Promise<{
  source: ReturnType<typeof toGqlPhDocument>;
  target: ReturnType<typeof toGqlPhDocument>;
}> {
  const branch = fromInputMaybe(args.branch);
  const documentIdentifiers = [...args.documentIdentifiers];

  let result: { source: PHDocument; target: PHDocument };
  try {
    result = await reactorClient.moveChildren(
      args.sourceParentIdentifier,
      args.targetParentIdentifier,
      documentIdentifiers,
      branch,
    );
  } catch (error) {
    throw new GraphQLError(
      `Failed to move children: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  try {
    return {
      source: toGqlPhDocument(result.source),
      target: toGqlPhDocument(result.target),
    };
  } catch (error) {
    throw new GraphQLError(
      `Failed to convert documents to GraphQL: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

export async function deleteDocument(
  reactorClient: IReactorClient,
  args: {
    identifier: string;
    propagate?: GqlPropagationMode | null;
  },
): Promise<boolean> {
  const propagate = fromInputMaybe(args.propagate) as
    | PropagationMode
    | undefined;

  try {
    await reactorClient.deleteDocument(args.identifier, propagate);
    return true;
  } catch (error) {
    throw new GraphQLError(
      `Failed to delete document: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

export async function deleteDocuments(
  reactorClient: IReactorClient,
  args: {
    identifiers: readonly string[];
    propagate?: GqlPropagationMode | null;
  },
): Promise<boolean> {
  const propagate = fromInputMaybe(args.propagate) as
    | PropagationMode
    | undefined;
  const identifiers = [...args.identifiers];

  try {
    await reactorClient.deleteDocuments(identifiers, propagate);
    return true;
  } catch (error) {
    throw new GraphQLError(
      `Failed to delete documents: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

export async function touchChannel(
  syncManager: ISyncManager,
  args: {
    input: {
      id: string;
      name: string;
      collectionId: string;
      filter: {
        documentId: readonly string[];
        scope: readonly string[];
        branch: string;
      };
      sinceTimestampUtcMs: string;
    };
  },
): Promise<boolean> {
  try {
    syncManager.getById(args.input.id);

    return true;
  } catch {
    // getById will throw if the remote does not exist
  }

  const filter: RemoteFilter = {
    documentId: [...args.input.filter.documentId],
    scope: [...args.input.filter.scope],
    branch: args.input.filter.branch,
  };

  const options = {
    sinceTimestampUtcMs: args.input.sinceTimestampUtcMs,
  };

  try {
    await syncManager.add(
      args.input.name,
      args.input.collectionId,
      {
        type: "polling",
        parameters: {},
      },
      filter,
      options,
      args.input.id,
    );
  } catch (error) {
    throw new GraphQLError(
      `Failed to create channel: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  return true;
}

export function pollSyncEnvelopes(
  syncManager: ISyncManager,
  args: {
    channelId: string;
    outboxAck: number;
    outboxLatest: number;
  },
): {
  envelopes: any[];
  ackOrdinal: number;
} {
  let remote;
  try {
    remote = syncManager.getById(args.channelId);
  } catch (error) {
    throw new GraphQLError(
      `Channel not found: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  // trim outbox
  if (args.outboxAck > 0) {
    trimMailboxFromAckOrdinal(remote.channel.outbox, args.outboxAck);
  }

  let operations = remote.channel.outbox.items;

  // filter remaining outbox operations by outboxLatest
  operations = operations.filter((syncOp) => {
    let maxOrdinal = 0;
    for (const op of syncOp.operations) {
      maxOrdinal = Math.max(maxOrdinal, op.context.ordinal);
    }

    if (maxOrdinal > args.outboxLatest) {
      return true;
    }

    return false;
  });

  if (operations.length === 0) {
    return {
      envelopes: [],
      ackOrdinal: remote.channel.inbox.ackOrdinal,
    };
  }

  let maxOrdinal = args.outboxLatest;
  for (const syncOp of operations) {
    for (const op of syncOp.operations) {
      const opOrdinal = op.context.ordinal;
      if (opOrdinal > maxOrdinal) {
        maxOrdinal = opOrdinal;
      }
    }
  }

  const envelopes = operations.map((syncOp: SyncOperation) => ({
    type: "OPERATIONS",
    channelMeta: {
      id: args.channelId,
    },
    operations: syncOp.operations.map((op) => ({
      operation: serializeOperationForGraphQL(op.operation),
      context: op.context,
    })),
    cursor: {
      remoteName: remote.name,
      cursorOrdinal: maxOrdinal,
      lastSyncedAtUtcMs: Date.now().toString(),
    },
    key: syncOp.jobId || undefined,
    dependsOn:
      syncOp.jobDependencies.filter(Boolean).length > 0
        ? syncOp.jobDependencies.filter(Boolean)
        : undefined,
  }));

  return {
    envelopes: sortEnvelopesByFirstOperationTimestamp(envelopes),
    ackOrdinal: remote.channel.inbox.ackOrdinal,
  };
}

type SyncEnvelopeArg = {
  type: string;
  channelMeta: { id: string };
  operations?: Array<{
    operation: any;
    context: {
      documentId: string;
      documentType: string;
      scope: string;
      branch: string;
    };
  }> | null;
  cursor?: {
    remoteName: string;
    cursorOrdinal: number;
    lastSyncedAtUtcMs?: string | null;
  } | null;
  key?: string;
  dependsOn?: string[];
};

export function pushSyncEnvelopes(
  syncManager: ISyncManager,
  args: {
    envelopes: SyncEnvelopeArg[];
  },
): Promise<boolean> {
  const sortedEnvelopes = sortEnvelopesByFirstOperationTimestamp(
    args.envelopes,
  );

  type RemoteRef = ReturnType<ISyncManager["getById"]>;
  const remoteSyncOps = new Map<RemoteRef, SyncOperation[]>();

  for (const envelope of sortedEnvelopes) {
    let remote: RemoteRef;
    try {
      remote = syncManager.getById(envelope.channelMeta.id);
    } catch (error) {
      throw new GraphQLError(
        `Channel not found: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }

    if (!envelope.operations || envelope.operations.length === 0) {
      continue;
    }

    const operations = envelope.operations.map((op) => ({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      operation: op.operation,
      context: {
        documentId: op.context.documentId,
        documentType: op.context.documentType,
        scope: op.context.scope,
        branch: op.context.branch,
        ordinal: 0,
      },
    }));

    const batches: OperationBatch[] = batchOperationsByDocument(operations);

    for (const batch of batches) {
      const syncOpId = `syncop-${envelope.channelMeta.id}-${Date.now()}-${crypto.randomUUID()}`;
      const jobId = envelope.key ?? "";
      const jobDependencies = envelope.dependsOn ?? [];

      const syncOp = new SyncOperation(
        syncOpId,
        jobId,
        jobDependencies,
        remote.name,
        batch.documentId,
        [batch.scope],
        batch.branch,
        batch.operations,
      );

      if (!remoteSyncOps.has(remote)) {
        remoteSyncOps.set(remote, []);
      }
      remoteSyncOps.get(remote)!.push(syncOp);
    }
  }

  for (const [remote, syncOps] of remoteSyncOps) {
    const validKeys = new Set(syncOps.map((op) => op.jobId).filter(Boolean));
    for (const syncOp of syncOps) {
      syncOp.jobDependencies = syncOp.jobDependencies.filter((dep) =>
        validKeys.has(dep),
      );
    }

    remote.channel.inbox.add(...syncOps);
  }

  return Promise.resolve(true);
}

/**
 * Create a getParentIds function using the reactor client
 */
export function createGetParentIdsFn(
  reactorClient: IReactorClient,
): GetParentIdsFn {
  return async (documentId: string): Promise<string[]> => {
    try {
      const result = await reactorClient.getParents(documentId);
      return result.results.map((doc) => doc.header.id);
    } catch {
      // If document has no parents or error, return empty array
      return [];
    }
  };
}
