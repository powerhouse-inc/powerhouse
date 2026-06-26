import {
  consolidateSyncOperations,
  DriveCollectionId,
  envelopesToSyncOperations,
  type IDriveClient,
  type IReactorClient,
  type ISyncManager,
  type JobInfo,
  type OperationFilter,
  type PagedResults,
  type PagingOptions,
  type RemoteFilter,
  type SearchFilter,
  type SyncOperation,
  type ViewFilter,
} from "@powerhousedao/reactor";
import type {
  DocumentModelModule,
  Operation,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import { GraphQLError } from "graphql";

import { isDriveContainerType } from "./constants.js";

const REACTOR_DRIVE_DOCUMENT_TYPE = "powerhouse/reactor-drive";

/**
 * Returns the drive client to use for the given drive-container parent type.
 * Throws when the parent is a reactor-drive container but no
 * `reactorDriveClient` was provided.
 */
function pickDriveClient(
  reactorClient: IReactorClient,
  driveContainerType: string,
  reactorDriveClient: IDriveClient | undefined,
): IDriveClient {
  if (driveContainerType === REACTOR_DRIVE_DOCUMENT_TYPE) {
    if (!reactorDriveClient) {
      throw new GraphQLError(
        "Reactor-drive parent encountered but no reactorDriveClient is configured on this switchboard",
      );
    }
    return reactorDriveClient;
  }
  return reactorClient.drives;
}

export const MAX_OPERATIONS_PER_ENVELOPE = 25;
export const MAX_OPERATIONS_PER_PAGE = 100;
import {
  fromInputMaybe,
  serializeOperationForGraphQL,
  toDocumentModelResultPage,
  toGqlJobInfo,
  toGqlPhDocument,
  toMutableArray,
  toOperationResultPage,
  toPhDocumentResultPage,
  toReactorPropagationMode,
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
    children = await reactorClient.getOutgoingRelationships(
      args.identifier,
      "child",
      view,
    );
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

export async function documentOutgoingRelationships(
  reactorClient: IReactorClient,
  args: {
    sourceIdentifier: string;
    relationshipType: string;
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
    result = await reactorClient.getOutgoingRelationships(
      args.sourceIdentifier,
      args.relationshipType,
      view,
      paging,
    );
  } catch (error) {
    throw new GraphQLError(
      `Failed to fetch outgoing relationships: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  try {
    return toPhDocumentResultPage(result);
  } catch (error) {
    throw new GraphQLError(
      `Failed to convert outgoing relationships to GraphQL: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

export async function documentIncomingRelationships(
  reactorClient: IReactorClient,
  args: {
    targetIdentifier: string;
    relationshipType: string;
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
    result = await reactorClient.getIncomingRelationships(
      args.targetIdentifier,
      args.relationshipType,
      view,
      paging,
    );
  } catch (error) {
    throw new GraphQLError(
      `Failed to fetch incoming relationships: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  try {
    return toPhDocumentResultPage(result);
  } catch (error) {
    throw new GraphQLError(
      `Failed to convert incoming relationships to GraphQL: ${error instanceof Error ? error.message : "Unknown error"}`,
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
  reactorDriveClient?: IDriveClient,
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
    if (parentIdentifier) {
      const parent = await reactorClient.get(parentIdentifier);
      if (isDriveContainerType(parent.header.documentType)) {
        const driveClient = pickDriveClient(
          reactorClient,
          parent.header.documentType,
          reactorDriveClient,
        );
        result = await driveClient.addFile(parentIdentifier, document);
      } else {
        result = await reactorClient.create(document, parentIdentifier);
      }
    } else {
      result = await reactorClient.create(document);
    }
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
    name?: string | null;
  },
  reactorDriveClient?: IDriveClient,
): Promise<ReturnType<typeof toGqlPhDocument>> {
  const parentIdentifier = fromInputMaybe(args.parentIdentifier);
  const name = fromInputMaybe(args.name);

  let result: PHDocument;
  try {
    if (parentIdentifier) {
      const parent = await reactorClient.get(parentIdentifier);
      if (isDriveContainerType(parent.header.documentType)) {
        const module = await reactorClient.getDocumentModelModule(
          args.documentType,
        );
        const document = module.utils.createDocument();
        if (name) {
          document.header.name = name;
        }
        const driveClient = pickDriveClient(
          reactorClient,
          parent.header.documentType,
          reactorDriveClient,
        );
        result = await driveClient.addFile(parentIdentifier, document);
      } else {
        result = await reactorClient.createEmpty(args.documentType, {
          parentIdentifier,
        });
      }
    } else {
      result = await reactorClient.createEmpty(args.documentType, {});
    }
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

export async function createDocumentWithInitialState(
  reactorClient: IReactorClient,
  args: {
    documentType: string;
    parentIdentifier?: string | null;
    name?: string | null;
    slug?: string | null;
    preferredEditor?: string | null;
    initialState: Record<string, Record<string, unknown>>;
  },
  reactorDriveClient?: IDriveClient,
): Promise<ReturnType<typeof toGqlPhDocument>> {
  const parentIdentifier = fromInputMaybe(args.parentIdentifier);
  const name = fromInputMaybe(args.name);
  const slug = fromInputMaybe(args.slug);
  const preferredEditor = fromInputMaybe(args.preferredEditor);

  let module: DocumentModelModule;
  try {
    module = await reactorClient.getDocumentModelModule(args.documentType);
  } catch (error) {
    throw new GraphQLError(
      `Document model not found for type ${args.documentType}: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  const document = module.utils.createDocument();

  // Only merge specification-defined scopes (e.g., global, local).
  // Protected scopes like "auth" and "document" are excluded.
  const allowedScopes = new Set(
    Object.keys(module.documentModel.global.specifications.at(-1)?.state ?? {}),
  );
  const state = document.state as Record<string, Record<string, unknown>>;
  for (const [scope, scopeState] of Object.entries(args.initialState)) {
    if (allowedScopes.has(scope) && scope in state) {
      state[scope] = { ...state[scope], ...scopeState };
    }
  }

  if (name) {
    document.header.name = name;
  }
  if (slug) {
    document.header.slug = slug;
  }
  if (preferredEditor) {
    document.header.meta = { ...document.header.meta, preferredEditor };
  }

  let result: PHDocument;
  if (parentIdentifier) {
    let parent: PHDocument;
    try {
      parent = await reactorClient.get(parentIdentifier);
    } catch (error) {
      throw new GraphQLError(
        `Parent document not found: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }

    if (isDriveContainerType(parent.header.documentType)) {
      const driveClient = pickDriveClient(
        reactorClient,
        parent.header.documentType,
        reactorDriveClient,
      );
      try {
        result = await driveClient.addFile(parentIdentifier, document);
      } catch (error) {
        throw new GraphQLError(
          `Failed to create document in drive: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    } else {
      try {
        result = await reactorClient.create(document, parentIdentifier);
      } catch (error) {
        throw new GraphQLError(
          `Failed to create document with parent: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    }
  } else {
    try {
      result = await reactorClient.create(document);
    } catch (error) {
      throw new GraphQLError(
        `Failed to create document: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
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
  signal?: AbortSignal,
): Promise<ReturnType<typeof toGqlPhDocument>> {
  const branch = fromInputMaybe(args.branch);

  let result: PHDocument;
  try {
    result = await reactorClient.rename(
      args.documentIdentifier,
      args.name,
      branch,
      signal,
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

export async function setPreferredEditor(
  reactorClient: IReactorClient,
  args: {
    documentIdentifier: string;
    preferredEditor?: string | null;
    branch?: string | null;
  },
  signal?: AbortSignal,
): Promise<ReturnType<typeof toGqlPhDocument>> {
  const branch = fromInputMaybe(args.branch);
  const preferredEditor = fromInputMaybe(args.preferredEditor) ?? null;

  let result: PHDocument;
  try {
    result = await reactorClient.setPreferredEditor(
      args.documentIdentifier,
      preferredEditor,
      branch,
      signal,
    );
  } catch (error) {
    throw new GraphQLError(
      `Failed to set preferred editor: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  try {
    return toGqlPhDocument(result);
  } catch (error) {
    throw new GraphQLError(
      `Failed to convert updated document to GraphQL: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

export async function addRelationship(
  reactorClient: IReactorClient,
  args: {
    sourceIdentifier: string;
    targetIdentifier: string;
    relationshipType: string;
    branch?: string | null;
  },
): Promise<ReturnType<typeof toGqlPhDocument>> {
  const branch = fromInputMaybe(args.branch);

  let result: PHDocument;
  try {
    result = await reactorClient.addRelationship(
      args.sourceIdentifier,
      args.targetIdentifier,
      args.relationshipType,
      branch,
    );
  } catch (error) {
    throw new GraphQLError(
      `Failed to add relationship: ${error instanceof Error ? error.message : "Unknown error"}`,
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

export async function removeRelationship(
  reactorClient: IReactorClient,
  args: {
    sourceIdentifier: string;
    targetIdentifier: string;
    relationshipType: string;
    branch?: string | null;
  },
): Promise<ReturnType<typeof toGqlPhDocument>> {
  const branch = fromInputMaybe(args.branch);

  let result: PHDocument;
  try {
    result = await reactorClient.removeRelationship(
      args.sourceIdentifier,
      args.targetIdentifier,
      args.relationshipType,
      branch,
    );
  } catch (error) {
    throw new GraphQLError(
      `Failed to remove relationship: ${error instanceof Error ? error.message : "Unknown error"}`,
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

export async function moveRelationship(
  reactorClient: IReactorClient,
  args: {
    sourceParentIdentifier: string;
    targetParentIdentifier: string;
    targetIdentifier: string;
    relationshipType: string;
    branch?: string | null;
  },
): Promise<{
  source: ReturnType<typeof toGqlPhDocument>;
  target: ReturnType<typeof toGqlPhDocument>;
}> {
  const branch = fromInputMaybe(args.branch);

  let result: { source: PHDocument; target: PHDocument };
  try {
    result = await reactorClient.moveRelationship(
      args.sourceParentIdentifier,
      args.targetParentIdentifier,
      args.targetIdentifier,
      args.relationshipType,
      branch,
    );
  } catch (error) {
    throw new GraphQLError(
      `Failed to move relationship: ${error instanceof Error ? error.message : "Unknown error"}`,
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
  reactorDriveClient?: IDriveClient,
): Promise<boolean> {
  const propagate = toReactorPropagationMode(args.propagate);

  try {
    const incoming = await reactorClient.getIncomingRelationships(
      args.identifier,
      "child",
    );
    const driveParent = incoming.results.find((p) =>
      isDriveContainerType(p.header.documentType),
    );
    if (driveParent) {
      const driveClient = pickDriveClient(
        reactorClient,
        driveParent.header.documentType,
        reactorDriveClient,
      );
      await driveClient.removeNode(driveParent.header.id, args.identifier);
    } else {
      await reactorClient.deleteDocument(args.identifier, propagate);
    }
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
  const propagate = toReactorPropagationMode(args.propagate);
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
): Promise<{ success: boolean; ackOrdinal: number }> {
  try {
    const remote = syncManager.getById(args.input.id);

    return {
      success: true,
      ackOrdinal: remote.channel.inbox.ackOrdinal,
    };
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
      DriveCollectionId.fromKey(args.input.collectionId),
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

  return { success: true, ackOrdinal: 0 };
}

/**
 * Polls the switchboard for new sync envelopes and acknowledges previously
 * received operations.
 *
 * Ordinal frames of reference:
 * - `outboxAck` / `outboxLatest`: switchboard's ordinals (used to trim/filter
 *   the switchboard's outbox)
 * - `ackOrdinal` in the response: the pushing client's ordinals (highest
 *   client ordinal the switchboard has successfully applied, so the client
 *   can trim its own outbox)
 */
export function pollSyncEnvelopes(
  syncManager: ISyncManager,
  args: {
    channelId: string;
    outboxAck: number;
    outboxLatest: number;
  },
  forbiddenIds: ReadonlySet<string> = new Set(),
): {
  envelopes: any[];
  ackOrdinal: number;
  deadLetters: Array<{
    documentId: string;
    error: string;
    jobId: string;
    branch: string;
    scopes: string[];
    operationCount: number;
  }>;
  hasMore: boolean;
} {
  let remote;
  try {
    remote = syncManager.getById(args.channelId);
  } catch (error) {
    throw new GraphQLError(
      `Channel not found: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  // Dead-letter items can originate from failed inbox jobs whose documentId is
  // outside this channel's collection, so they are filtered by the caller's read
  // access independently of the outbox (see the poll resolver in subgraph.ts).
  const deadLetters = remote.channel.deadLetter.items
    .filter((syncOp) => !forbiddenIds.has(syncOp.documentId))
    .map((syncOp) => ({
      documentId: syncOp.documentId,
      error: syncOp.error?.message ?? "Unknown error",
      jobId: syncOp.jobId,
      branch: syncOp.branch,
      scopes: syncOp.scopes,
      operationCount: syncOp.operations.length,
    }));

  // Trim acked outbox items, but only those we have fully emitted to this
  // client. Without the emittedCount guard, a syncOp queued behind a page cap
  // (never sent) would be dropped when ackOrdinal sweeps past its ordinals,
  // because ackOrdinal can be advanced by OTHER syncOps the client did
  // receive — same root-cause class as the resolver's per-op filter bug.
  if (args.outboxAck > 0) {
    const ackOrdinal = args.outboxAck;
    const outbox = remote.channel.outbox;
    const toRemove: SyncOperation[] = [];
    for (const syncOp of outbox.items) {
      const fullyEmitted =
        (syncOp.emittedCount ?? 0) >= syncOp.operations.length;
      if (!fullyEmitted) continue;
      let maxOrdinal = 0;
      for (const op of syncOp.operations) {
        if (op.context.ordinal > maxOrdinal) maxOrdinal = op.context.ordinal;
      }
      if (maxOrdinal <= ackOrdinal) {
        toRemove.push(syncOp);
      }
    }
    if (toRemove.length > 0) {
      for (const syncOp of toRemove) {
        syncOp.executed();
      }
      outbox.remove(...toRemove);
    }
  }

  const operations = remote.channel.outbox.items;

  // Drain forbidden operations: mark them fully delivered so the page loop's
  // `remaining.length === 0` guard skips them (never emitted to this caller) and
  // the ack trim above evicts them on a later poll. The caller proved they may
  // not read these documents, so advancing the cursor past them is correct and
  // avoids re-evaluating them every poll.
  if (forbiddenIds.size > 0) {
    for (const syncOp of operations) {
      if (forbiddenIds.has(syncOp.documentId)) {
        syncOp.deliveredCount = syncOp.operations.length;
        syncOp.emittedCount = syncOp.operations.length;
      }
    }
  }

  if (operations.length === 0) {
    return {
      envelopes: [],
      ackOrdinal: remote.channel.inbox.ackOrdinal,
      deadLetters,
      hasMore: false,
    };
  }

  // Dependencies point backward in ordinal order, so sorting by first op
  // ordinal preserves dependency ordering across the page.
  const sorted = [...operations].sort((a, b) => {
    const aOrdinal = a.operations[0]?.context.ordinal ?? 0;
    const bOrdinal = b.operations[0]?.context.ordinal ?? 0;
    return aOrdinal - bOrdinal;
  });

  const envelopes: SyncEnvelopeArg[] = [];
  let pageOps = 0;
  let hasMore = false;
  let maxOrdinal = args.outboxLatest;

  outer: for (const syncOp of sorted) {
    if (pageOps >= MAX_OPERATIONS_PER_PAGE) {
      hasMore = true;
      break;
    }

    // Advance the per-syncOp delivery cursor past leading ops the client has
    // both received (outboxLatest) and we have previously emitted
    // (emittedCount). Gating on emittedCount prevents skipping ops that were
    // never sent because an earlier syncOp filled the page cap — a syncOp
    // queued behind that cap has emittedCount = 0 and stays un-advanced even
    // when outboxLatest sweeps past its ordinals. Gating on outboxLatest
    // (rather than emittedCount alone) keeps response-loss recovery: emitted
    // but unconfirmed ops re-emit on the next poll.
    syncOp.deliveredCount ??= 0;
    syncOp.emittedCount ??= 0;
    while (
      syncOp.deliveredCount < syncOp.emittedCount &&
      syncOp.operations[syncOp.deliveredCount].context.ordinal <=
        args.outboxLatest
    ) {
      syncOp.deliveredCount += 1;
    }

    const remaining = syncOp.operations.slice(syncOp.deliveredCount);
    if (remaining.length === 0) continue;

    let prevPartKey: string | undefined;
    let partIdx = 0;
    let i = 0;
    while (i < remaining.length) {
      if (pageOps >= MAX_OPERATIONS_PER_PAGE) {
        hasMore = true;
        break outer;
      }

      const remainingPage = MAX_OPERATIONS_PER_PAGE - pageOps;
      // Always emit at least one op so an oversized single op makes progress.
      const chunkSize = Math.max(
        1,
        Math.min(
          MAX_OPERATIONS_PER_ENVELOPE,
          remainingPage,
          remaining.length - i,
        ),
      );
      const slice = remaining.slice(i, i + chunkSize);

      const isOnly =
        remaining.length <= MAX_OPERATIONS_PER_ENVELOPE &&
        remaining.length <= remainingPage;
      const baseKey = syncOp.jobId || undefined;
      const partKey = isOnly
        ? baseKey
        : baseKey
          ? `${baseKey}__p${partIdx}`
          : undefined;
      const partDeps =
        partIdx === 0
          ? syncOp.jobDependencies.filter(Boolean)
          : prevPartKey
            ? [prevPartKey]
            : [];

      for (const op of slice) {
        if (op.context.ordinal > maxOrdinal) maxOrdinal = op.context.ordinal;
      }

      envelopes.push({
        type: "OPERATIONS",
        channelMeta: { id: args.channelId },
        operations: slice.map((op) => ({
          operation: serializeOperationForGraphQL(op.operation),
          context: op.context,
        })),
        cursor: {
          remoteName: remote.meta.name,
          cursorOrdinal: 0,
          lastSyncedAtUtcMs: Date.now().toString(),
        },
        key: partKey,
        dependsOn: partDeps.length > 0 ? partDeps : undefined,
      });

      pageOps += slice.length;
      i += slice.length;
      prevPartKey = partKey;
      partIdx++;

      // Record how far through this syncOp we have emitted. The cursor advance
      // above only moves past ops counted here, so an unsent syncOp (e.g. one
      // that never reached emission because of the page cap) cannot have its
      // delivery cursor advanced by a future poll's outboxLatest.
      const emittedThrough = syncOp.deliveredCount + i;
      if (emittedThrough > syncOp.emittedCount) {
        syncOp.emittedCount = emittedThrough;
      }

      if (i < remaining.length && pageOps >= MAX_OPERATIONS_PER_PAGE) {
        hasMore = true;
        break outer;
      }
    }
  }

  for (const envelope of envelopes) {
    if (envelope.cursor) envelope.cursor.cursorOrdinal = maxOrdinal;
  }

  return {
    envelopes,
    ackOrdinal: remote.channel.inbox.ackOrdinal,
    deadLetters,
    hasMore,
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
      ordinal: number;
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

/**
 * Receives sync envelopes pushed by a client and adds them to the
 * appropriate channel inboxes.
 *
 * The `ordinal` in each operation's context is the client's local ordinal.
 * It must be preserved because the inbox mailbox tracks applied ordinals
 * and returns the highest one as `ackOrdinal` in pollSyncEnvelopes.
 */
export function pushSyncEnvelopes(
  syncManager: ISyncManager,
  args: {
    envelopes: SyncEnvelopeArg[];
  },
): Promise<boolean> {
  type RemoteRef = ReturnType<ISyncManager["getById"]>;
  const remoteSyncOps = new Map<RemoteRef, SyncOperation[]>();

  for (const envelope of args.envelopes) {
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

    const syncOps = envelopesToSyncOperations(
      envelope as Parameters<typeof envelopesToSyncOperations>[0],
      remote.meta.name,
    );

    if (!remoteSyncOps.has(remote)) {
      remoteSyncOps.set(remote, []);
    }
    remoteSyncOps.get(remote)!.push(...syncOps);
  }

  for (const [remote, syncOps] of remoteSyncOps) {
    const consolidated = consolidateSyncOperations(syncOps);

    const validKeys = new Set(
      consolidated.map((op) => op.jobId).filter(Boolean),
    );
    for (const syncOp of consolidated) {
      syncOp.jobDependencies = syncOp.jobDependencies.filter((dep) =>
        validKeys.has(dep),
      );
    }

    remote.channel.inbox.add(...consolidated);
  }

  return Promise.resolve(true);
}
