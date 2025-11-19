import type {
  DocumentChangeEvent,
  IReactorClient,
  JobInfo as ClientJobInfo,
  PagedResults,
} from "@powerhousedao/reactor";
import { camelCase } from "change-case";
import type {
  Action,
  DocumentModelModule,
  DocumentModelPHState,
  Operation,
  PHDocument,
} from "document-model";
import { GraphQLError } from "graphql";
import type {
  DocumentChangeEvent as GqlDocumentChangeEvent,
  DocumentModelResultPage,
  DocumentModelGlobalState as GqlDocumentModelGlobalState,
  JobInfo as GqlJobInfo,
  PhDocument,
  PhDocumentResultPage,
} from "./gen/graphql.js";

/**
 * Converts a PagedResults from ReactorClient to the GraphQL DocumentModelResultPage format
 */
export function toDocumentModelResultPage(
  result: PagedResults<DocumentModelModule>,
): DocumentModelResultPage {
  const models = result.results.map((module) => module.documentModel);
  return {
    cursor: result.options.cursor || null,
    hasNextPage: false,
    hasPreviousPage: false,
    items: models.map(toGqlDocumentModelState),
    totalCount: result.results.length,
  };
}

/**
 * Gets the namespace from a DocumentModelGlobalState
 */
function getNamespace(model: DocumentModelPHState): string {
  return model.global.name.split("/")[0];
}

/**
 * Converts a DocumentModelGlobalState from ReactorClient to GraphQL format
 */
function toGqlDocumentModelState(
  model: DocumentModelPHState,
): GqlDocumentModelGlobalState {
  const global = model.global;
  const specification =
    global.specifications.length > 0 ? global.specifications[0] : null;
  const namespace = getNamespace(model);

  return {
    id: global.id,
    name: global.name,
    namespace,
    specification,
    version: null,
  };
}

/**
 * Converts a PagedResults of PHDocument to GraphQL PhDocumentResultPage format
 */
export function toPhDocumentResultPage(
  result: PagedResults<PHDocument>,
): PhDocumentResultPage {
  return {
    cursor: result.options.cursor || null,
    hasNextPage: false,
    hasPreviousPage: false,
    items: result.results.map(toGqlPhDocument),
    totalCount: result.results.length,
  };
}

/**
 * Converts a PHDocument from ReactorClient to GraphQL PhDocument format
 */
export function toGqlPhDocument(doc: PHDocument): PhDocument {
  const revisionsList = Object.entries(doc.header.revision).map(
    ([scope, revision]) => ({
      scope,
      revision,
    }),
  );

  return {
    id: doc.header.id,
    name: doc.header.name,
    documentType: doc.header.documentType,
    slug: doc.header.slug,
    createdAtUtcIso: doc.header.createdAtUtcIso,
    lastModifiedAtUtcIso: doc.header.lastModifiedAtUtcIso,
    revisionsList,
    state: doc.state,
  };
}

/**
 * Converts JobInfo from ReactorClient to GraphQL format
 */
export function toGqlJobInfo(job: ClientJobInfo): GqlJobInfo {
  return {
    id: job.id,
    status: job.status,
    createdAt: job.createdAtUtcIso,
    completedAt: job.completedAtUtcIso ?? null,
    error: job.error?.message ?? null,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    result: job.result ?? null,
  };
}

/**
 * Handles nullable/undefined conversion for GraphQL InputMaybe types
 */
export function fromInputMaybe<T>(value: T | null | undefined): T | undefined {
  return value === null ? undefined : value;
}

/**
 * Converts readonly arrays to mutable arrays for ReactorClient
 */
export function toMutableArray<T>(
  arr: readonly T[] | undefined,
): T[] | undefined {
  return arr ? [...arr] : undefined;
}

/**
 * Validates that a JSONObject represents a valid Action structure
 */
function validateActionStructure(obj: unknown): obj is Action {
  if (!obj || typeof obj !== "object") {
    return false;
  }

  const action = obj as Record<string, unknown>;

  // Required fields
  if (typeof action.type !== "string" || !action.type) {
    return false;
  }

  if (typeof action.scope !== "string" || !action.scope) {
    return false;
  }

  // input can be anything (unknown)
  if (!("input" in action)) {
    return false;
  }

  return true;
}

/**
 * Converts a JSONObject to an Action, validating basic structure
 */
export function jsonObjectToAction(obj: unknown): Action {
  if (!validateActionStructure(obj)) {
    throw new GraphQLError(
      "Invalid action structure. Actions must have: type (string), scope (string), and input (any)",
    );
  }

  return obj as Action;
}

/**
 * Validates an action against its document model
 * Based on validateDocumentModelAction from reactor-mcp
 */
export function validateDocumentModelAction(
  documentModelModule: DocumentModelModule,
  action: Action,
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  const globalState = documentModelModule.documentModel.global;

  // Get the latest specification
  if (!globalState.specifications || globalState.specifications.length === 0) {
    errors.push("Document model has no specifications");
    return { isValid: false, errors };
  }

  const latestSpec =
    globalState.specifications[globalState.specifications.length - 1];

  // Search through modules to find the operation that matches the action type (in SCREAMING_SNAKE_CASE)
  let operation: (Operation & { scope: string }) | null = null;

  for (const module of latestSpec.modules) {
    const unsafeOperationOrActionOrSomething = module.operations.find(
      (op) => op.name === action.type,
    ) as unknown as Operation & { scope: string };
    if (unsafeOperationOrActionOrSomething) {
      operation = unsafeOperationOrActionOrSomething;
      break;
    }
  }

  if (!operation) {
    errors.push(
      `Operation "${action.type}" is not defined in any module of the document model`,
    );
    return { isValid: false, errors };
  }

  // Convert action type from SCREAMING_SNAKE_CASE to camelCase to match action creators
  const camelCaseActionType = camelCase(action.type);

  // Check if action creator exists in documentModelModule.actions
  const actionCreator = documentModelModule.actions[camelCaseActionType];

  if (!actionCreator) {
    errors.push(
      `Action creator "${camelCaseActionType}" for action type "${action.type}" is not defined in document model module actions`,
    );
    return { isValid: false, errors };
  }

  // Validate the operation using the action creator
  let inputError: Error | null = null;
  try {
    actionCreator(action.input);
  } catch (e) {
    inputError = e instanceof Error ? e : new Error(JSON.stringify(e));
  }

  if (inputError) {
    errors.push(`Input validation error: ${inputError.message}`);
  }

  // Validate scope if operation defines one
  if (operation.scope && action.scope !== operation.scope) {
    errors.push(
      `Action scope "${action.scope}" does not match operation scope "${operation.scope}"`,
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validates a list of actions against a document model
 */
export async function validateActions(
  reactorClient: IReactorClient,
  documentIdentifier: string,
  actions: readonly unknown[],
): Promise<Action[]> {
  // First convert JSONObjects to Actions
  const convertedActions: Action[] = [];
  for (let i = 0; i < actions.length; i++) {
    try {
      convertedActions.push(jsonObjectToAction(actions[i]));
    } catch (error) {
      throw new GraphQLError(
        `Action at index ${i}: ${error instanceof Error ? error.message : "Invalid action structure"}`,
      );
    }
  }

  // Get the document to determine its type
  let document: PHDocument;
  try {
    const result = await reactorClient.get(documentIdentifier);
    document = result.document;
  } catch (error) {
    throw new GraphQLError(
      `Failed to fetch document for validation: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  // Get the document model module
  let documentModelModule: DocumentModelModule;
  try {
    const modelsResult = await reactorClient.getDocumentModels();
    const module = modelsResult.results.find(
      (m) => m.documentModel.global.name === document.header.documentType,
    );

    if (!module) {
      throw new GraphQLError(
        `Document model not found for type: ${document.header.documentType}`,
      );
    }

    documentModelModule = module;
  } catch (error) {
    if (error instanceof GraphQLError) {
      throw error;
    }
    throw new GraphQLError(
      `Failed to fetch document model: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  // Validate each action
  const validationErrors: string[] = [];
  for (let i = 0; i < convertedActions.length; i++) {
    const validation = validateDocumentModelAction(
      documentModelModule,
      convertedActions[i],
    );
    if (!validation.isValid) {
      validationErrors.push(
        `Action ${i} (type: ${convertedActions[i].type}): ${validation.errors.join(", ")}`,
      );
    }
  }

  if (validationErrors.length > 0) {
    throw new GraphQLError(
      `Action validation failed:\n${validationErrors.join("\n")}`,
    );
  }

  return convertedActions;
}

export function toGqlDocumentChangeEvent(
  event: DocumentChangeEvent,
): GqlDocumentChangeEvent {
  const typeMap: Record<string, string> = {
    created: "CREATED",
    deleted: "DELETED",
    updated: "UPDATED",
    parent_added: "PARENT_ADDED",
    parent_removed: "PARENT_REMOVED",
    child_added: "CHILD_ADDED",
    child_removed: "CHILD_REMOVED",
  };

  const mappedType = typeMap[event.type];
  if (!mappedType) {
    throw new GraphQLError(`Unknown document change type: ${event.type}`);
  }

  return {
    type: mappedType as GqlDocumentChangeEvent["type"],
    documents: event.documents.map(toGqlPhDocument),
    context: event.context
      ? {
          parentId: event.context.parentId ?? null,
          childId: event.context.childId ?? null,
        }
      : null,
  };
}

export function matchesSearchFilter(
  event: DocumentChangeEvent,
  search: { type?: string | null; parentId?: string | null },
): boolean {
  if (search.type) {
    const matchesType = event.documents.some(
      (doc) => doc.header.documentType === search.type,
    );
    if (!matchesType) {
      return false;
    }
  }

  if (search.parentId) {
    if (
      !event.context?.parentId ||
      event.context.parentId !== search.parentId
    ) {
      return false;
    }
  }

  return true;
}

export function matchesJobFilter(
  payload: { jobId: string },
  args: { jobId: string },
): boolean {
  return payload.jobId === args.jobId;
}
