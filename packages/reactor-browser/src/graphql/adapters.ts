import type {
  DocumentOperations,
  PHBaseState,
  PHDocument,
  PHDocumentHeader,
} from "document-model";
import { map, pipe } from "remeda";
import { z } from "zod";
import type {
  FindDocumentsQuery,
  GetDocumentWithOperationsQuery,
} from "./gen/schema.js";
import type { TStateSchemaZodObject } from "./types.js";

type QueryDocumentResult = NonNullable<
  GetDocumentWithOperationsQuery["document"]
>["document"];

type FindDocumentsItems = NonNullable<
  FindDocumentsQuery["findDocuments"]
>["items"];

export function phDocumentFromQuery<
  TDocumentSchema extends TStateSchemaZodObject,
>(document: QueryDocumentResult, documentSchema?: TDocumentSchema) {
  const phDocument = {
    header: phDocumentHeaderFromQuery(document),
    state: phDocumentStateFromQuery(document),
    initialState: phDocumentStateFromQuery(document),
    operations:
      phDocumentOperationsFromGetDocumentWithOperationsQuery(document),
    clipboard: [],
  };
  if (documentSchema !== undefined) documentSchema.parse(phDocument);
  return phDocument as PHDocument;
}

export function phDocumentsFromQuery<
  TDocumentSchema extends TStateSchemaZodObject,
>(items: FindDocumentsItems, documentSchema?: TDocumentSchema) {
  const documents = pipe(
    items,
    map((document) => phDocumentFromQuery(document, documentSchema)),
  );
  return documents;
}

function phDocumentHeaderFromQuery(queryDocument: QueryDocumentResult) {
  const phDocumentHeader = {
    branch: "main",
    id: queryDocument.id,
    name: queryDocument.name,
    documentType: queryDocument.documentType,
    createdAtUtcIso:
      queryDocument.createdAtUtcIso instanceof Date
        ? queryDocument.createdAtUtcIso.toUTCString()
        : queryDocument.createdAtUtcIso,
    lastModifiedAtUtcIso:
      queryDocument.lastModifiedAtUtcIso instanceof Date
        ? queryDocument.lastModifiedAtUtcIso.toUTCString()
        : queryDocument.lastModifiedAtUtcIso,
    slug: queryDocument.slug ?? "",
  };
  return phDocumentHeader as PHDocumentHeader;
}

function phDocumentStateFromQuery<
  TDocumentSchema extends TStateSchemaZodObject,
>(queryDocument: QueryDocumentResult, documentSchema?: TDocumentSchema) {
  if (documentSchema !== undefined)
    return documentSchema.shape.state.parse(queryDocument.state);
  return queryDocument.state as PHBaseState;
}

function phDocumentOperationsFromGetDocumentWithOperationsQuery(
  queryDocument: QueryDocumentResult,
) {
  if (
    queryDocument.operations === null ||
    queryDocument.operations === undefined
  )
    return {
      global: [],
    };

  const documentOperations = {
    global: [...queryDocument.operations.items],
  };
  return documentOperations as DocumentOperations;
}
export function identifierFromMutateDocumentOperationVariables(
  variables: unknown,
) {
  return z
    .object({
      documentIdentifier: z.string(),
    })
    .parse(variables).documentIdentifier;
}
