import {
  SyncOperation,
  type IReactorClient,
  type ISyncManager,
  type JobInfo,
  type PagedResults,
  type PagingOptions,
  type PropagationMode,
  type RemoteFilter,
  type SearchFilter,
  type ViewFilter,
} from "@powerhousedao/reactor";
import type { DocumentModelModule, Operation, PHDocument } from "document-model";
import { GraphQLError } from "graphql";
import {
  fromInputMaybe,
  toDocumentModelResultPage,
  toGqlJobInfo,
  toGqlPhDocument,
  toMutableArray,
  toPhDocumentResultPage,
  validateActions,
} from "./adapters.js";
import type {
  DocumentModelResultPage,
  JobInfo as GqlJobInfo,
  PropagationMode as GqlPropagationMode,
  PhDocumentResultPage,
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
    result = await reactorClient.getDocumentModels(namespace, paging);
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

  let result: {
    document: PHDocument;
    childIds: string[];
  };
  try {
    result = await reactorClient.get(args.identifier, view);
  } catch (error) {
    throw new GraphQLError(
      `Failed to fetch document: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  try {
    return {
      document: toGqlPhDocument(result.document),
      childIds: result.childIds,
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
    result = await reactorClient.createEmpty(
      args.documentType,
      parentIdentifier,
    );
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
    validatedActions = await validateActions(
      reactorClient,
      args.documentIdentifier,
      args.actions,
    );
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
    validatedActions = await validateActions(
      reactorClient,
      args.documentIdentifier,
      args.actions,
    );
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
    };
  },
): Promise<boolean> {
  try {
    const existing = syncManager.getById(args.input.id);
    if (existing) {
      return true;
    }
  } catch {
    // Ignore errors when checking for existing sync connection
  }

  const filter: RemoteFilter = {
    documentId: [...args.input.filter.documentId],
    scope: [...args.input.filter.scope],
    branch: args.input.filter.branch,
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
      {},
      args.input.id,
    );
  } catch (error) {
    throw new GraphQLError(
      `Failed to create channel: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  return true;
}

/**
 * Transforms an operation to serialize signatures from tuples to strings
 * for GraphQL compatibility.
 *
 * The Signature type is a tuple [string, string, string, string, string],
 * but GraphQL expects [String!]! (flat array of strings).
 */
function serializeOperationForGraphQL(operation: Operation) {
  const signer = operation.action.context?.signer;
  if (!signer?.signatures) {
    return operation;
  }

  return {
    ...operation,
    action: {
      ...operation.action,
      context: {
        ...operation.action.context,
        signer: {
          ...signer,
          signatures: signer.signatures.map((sig) => sig.join(", ")),
        },
      },
    },
  };
}

export async function pollSyncEnvelopes(
  syncManager: ISyncManager,
  args: {
    channelId: string;
    cursorOrdinal: number;
  },
): Promise<any[]> {
  let remote;
  try {
    remote = syncManager.getById(args.channelId);
  } catch (error) {
    throw new GraphQLError(
      `Channel not found: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  if (args.cursorOrdinal > 0) {
    await remote.channel.updateCursor(args.cursorOrdinal);
  }

  const operations = remote.channel.outbox.items;

  const envelopes = operations.map((syncOp: SyncOperation) => ({
    type: "OPERATIONS",
    channelMeta: {
      id: args.channelId,
    },
    operations: syncOp.operations.map((op) => ({
      operation: op.operation,
      context: op.context,
    })),
    cursor: {
      remoteName: remote.name,
      cursorOrdinal: args.cursorOrdinal + 1,
      lastSyncedAtUtcMs: Date.now().toString(),
    },
  }));

  return envelopes;
}

export function pushSyncEnvelope(
  syncManager: ISyncManager,
  args: {
    envelope: {
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
    };
  },
): Promise<boolean> {
  let remote;
  try {
    remote = syncManager.getById(args.envelope.channelMeta.id);
  } catch (error) {
    throw new GraphQLError(
      `Channel not found: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  if (!args.envelope.operations || args.envelope.operations.length === 0) {
    return Promise.resolve(true);
  }

  const firstOp = args.envelope.operations[0];
  const syncOpId = `syncop-${args.envelope.channelMeta.id}-${Date.now()}-${crypto.randomUUID()}`;
  const scopes = [
    ...new Set(args.envelope.operations.map((op) => op.context.scope)),
  ];
  const operations = args.envelope.operations.map((op) => ({
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

  const syncOp = new SyncOperation(
    syncOpId,
    remote.name,
    firstOp.context.documentId,
    scopes,
    firstOp.context.branch,
    operations,
  );

  try {
    remote.channel.inbox.add(syncOp);
  } catch (error) {
    throw new GraphQLError(
      `Failed to push sync envelope: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  return Promise.resolve(true);
}

import type { GetParentIdsFn } from "../../services/document-permission.service.js";

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
