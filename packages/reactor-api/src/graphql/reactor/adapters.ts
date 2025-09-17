import type {
  JobInfo as ClientJobInfo,
  PagedResults,
} from "@powerhousedao/reactor";
import type { DocumentModelGlobalState, PHDocument } from "document-model";
import type {
  DocumentModelResultPage,
  DocumentModelState as GqlDocumentModelState,
  JobInfo as GqlJobInfo,
  PhDocument,
  PhDocumentResultPage,
} from "./gen/graphql.js";

/**
 * Converts a PagedResults from ReactorClient to the GraphQL DocumentModelResultPage format
 */
export function toDocumentModelResultPage(
  result: PagedResults<DocumentModelGlobalState>,
): DocumentModelResultPage {
  return {
    cursor: result.options.cursor || null,
    hasNextPage: false,
    hasPreviousPage: false,
    items: result.results.map(toGqlDocumentModelState),
    totalCount: result.results.length,
  };
}

/**
 * Gets the namespace from a DocumentModelGlobalState
 */
function getNamespace(model: DocumentModelGlobalState): string {
  return model.name.split("/")[0];
}

/**
 * Converts a DocumentModelGlobalState from ReactorClient to GraphQL format
 */
function toGqlDocumentModelState(
  model: DocumentModelGlobalState,
): GqlDocumentModelState {
  const specification =
    model.specifications.length > 0 ? model.specifications[0] : null;
  const namespace = getNamespace(model);

  return {
    id: model.id,
    name: model.name,
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
    error: job.error ?? null,
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
