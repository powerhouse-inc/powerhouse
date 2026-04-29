import type { DocumentOperations } from "document-model";
import { map, pipe } from "remeda";
import { type z } from "zod";
import type {
  FindDocumentsQuery,
  GetDocumentWithOperationsQuery,
} from "./gen/schema.js";

type QueryDocumentResult = NonNullable<
  GetDocumentWithOperationsQuery["document"]
>["document"];

type FindDocumentsItems = NonNullable<
  FindDocumentsQuery["findDocuments"]
>["items"];

type DocumentSchemaZodObject = z.ZodObject<{
  header: z.ZodObject;
  state: z.ZodObject;
}>;

export function phDocumentFromQuery<
  TDocumentSchema extends DocumentSchemaZodObject,
>(document: QueryDocumentResult, documentSchema: TDocumentSchema) {
  const phDocument = {
    header: phDocumentHeaderFromQuery(document, documentSchema),
    state: phDocumentStateFromQuery(document, documentSchema),
    initialState: phDocumentStateFromQuery(document, documentSchema),
    operations:
      phDocumentOperationsFromGetDocumentWithOperationsQuery(document),
    clipboard: [],
  };
  return documentSchema.parse(phDocument);
}

export function phDocumentFromFindDocumentsQueryItems<
  TDocumentSchema extends DocumentSchemaZodObject,
>(items: FindDocumentsItems, documentSchema: TDocumentSchema) {
  const documents = pipe(
    items,
    map((document) => phDocumentFromQuery(document, documentSchema)),
  );
  return documents;
}

function phDocumentHeaderFromQuery<
  TDocumentSchema extends DocumentSchemaZodObject,
>(queryDocument: QueryDocumentResult, documentSchema: TDocumentSchema) {
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
  return documentSchema.shape.header.parse(phDocumentHeader);
}

function phDocumentStateFromQuery<
  TDocumentSchema extends DocumentSchemaZodObject,
>(queryDocument: QueryDocumentResult, documentSchema: TDocumentSchema) {
  return documentSchema.shape.state.parse(queryDocument.state);
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
