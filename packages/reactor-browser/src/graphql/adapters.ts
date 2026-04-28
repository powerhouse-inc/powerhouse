import type {
  DocumentOperations,
  PHBaseState,
  PHDocument,
  PHDocumentHeader,
} from "document-model";
import { isDefined } from "remeda";
import type { z } from "zod";
import { createClient } from "./client.js";
import type { GetDocumentWithOperationsQuery } from "./gen/schema.js";
const SWITCHBOARD_URL =
  process.env.PH_SWITCHBOARD_URL || "http://localhost:4001/graphql";

const client = createClient(SWITCHBOARD_URL);

type QueryDocumentResult = NonNullable<
  GetDocumentWithOperationsQuery["document"]
>["document"];

export function phDocumentFromGetDocumentWithOperationsQuery<
  TDocumentSchema extends z.ZodObject,
>(
  getDocumentQuery: GetDocumentWithOperationsQuery,
  documentSchema?: TDocumentSchema,
) {
  const document = getDocumentQuery.document?.document;
  if (!isDefined(document)) return undefined;
  const phDocument: PHDocument = {
    header: phDocumentHeaderFromGetDocumentWithOperationsQuery(document),
    state: phDocumentStateFromGetDocumentWithOperationsQuery(document),
    initialState:
      phDocumentInitialStateFromGetDocumentWithOperationsQuery(document),
    operations:
      phDocumentOperationsFromGetDocumentWithOperationsQuery(document),
    clipboard: [],
  };
  if (isDefined(documentSchema)) return documentSchema.parse(phDocument);
  return phDocument;
}

function phDocumentHeaderFromGetDocumentWithOperationsQuery(
  queryDocument: QueryDocumentResult,
): PHDocumentHeader {
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
  } as PHDocumentHeader;
  return phDocumentHeader;
}

function phDocumentStateFromGetDocumentWithOperationsQuery(
  queryDocument: QueryDocumentResult,
): PHBaseState {
  return queryDocument.state as PHBaseState;
}
function phDocumentInitialStateFromGetDocumentWithOperationsQuery(
  queryDocument: QueryDocumentResult,
): PHBaseState {
  return queryDocument.state as PHBaseState;
}

function phDocumentOperationsFromGetDocumentWithOperationsQuery(
  queryDocument: QueryDocumentResult,
): DocumentOperations {
  if (
    queryDocument.operations === null ||
    queryDocument.operations === undefined
  )
    return {
      global: [],
    };

  const documentOperations: DocumentOperations = {
    global: [...queryDocument.operations.items],
  } as DocumentOperations;
  return documentOperations;
}
