import {
  GetDocumentDocument,
  GetDocumentOperationsDocument,
  type OperationsFilterInput,
  type PagingInput,
  type ViewFilterInput,
} from "./gen/schema.js";

/** Get the source string from a GraphQL document (string or DocumentNode). */
function getDocumentSource(doc: unknown): string {
  return typeof doc === "string"
    ? doc
    : ((doc as { loc?: { source: { body: string } } }).loc?.source.body ?? "");
}

/**
 * Extract the inner selection set of a named field from a GraphQL document source.
 * Returns the `{ ... }` block including braces.
 */
function extractSelectionSet(
  doc: unknown,
  fieldName: string,
  fallback: string,
): string {
  const source = getDocumentSource(doc);

  const regex = new RegExp(
    `${fieldName}\\([^)]*\\)\\s*(\\{[\\s\\S]*\\})\\s*\\}`,
  );
  return regex.exec(source)?.[1] ?? fallback;
}

/**
 * Extract the query body and any fragment definitions from a GraphQL document.
 * Returns { body, fragments } where body is the content inside the query `{ ... }`
 * and fragments are any trailing fragment definitions.
 */
function extractQueryParts(
  doc: unknown,
  fallbackBody: string,
): { body: string; fragments: string } {
  const source = getDocumentSource(doc);

  // Match the query body: everything between the first `{` and its closing `}`
  // before any fragment definitions
  const queryMatch = /^[^{]*\{([\s\S]*?)\}\s*(fragment[\s\S]*)?$/.exec(source);
  const body = queryMatch?.[1]?.trim() ?? fallbackBody;
  const fragments = queryMatch?.[2]?.trim() ?? "";

  return { body, fragments };
}

const operationsSelectionSet = extractSelectionSet(
  GetDocumentOperationsDocument,
  "documentOperations",
  "{ items { index } }",
);

const documentParts = extractQueryParts(
  GetDocumentDocument,
  "document(identifier: $identifier) { document { id name documentType state revisionsList { scope revision } createdAtUtcIso lastModifiedAtUtcIso } childIds }",
);

/**
 * Build a single GraphQL query that fetches documentOperations for
 * multiple filters using aliases. Each filter gets its own alias
 * (`scope_0`, `scope_1`, …) so all scopes are fetched in one HTTP request.
 */
export function buildBatchOperationsQuery(
  filters: OperationsFilterInput[],
  pagings: (PagingInput | undefined | null)[],
) {
  const varDefs = filters
    .flatMap((_, i) => [
      `$filter_${i}: OperationsFilterInput!`,
      `$paging_${i}: PagingInput`,
    ])
    .join(", ");

  const fields = filters
    .map(
      (_, i) =>
        `scope_${i}: documentOperations(filter: $filter_${i}, paging: $paging_${i}) ${operationsSelectionSet}`,
    )
    .join("\n    ");

  const query = `query BatchGetDocumentOperations(${varDefs}) {
    ${fields}
  }`;

  const variables: Record<string, unknown> = {};
  for (let i = 0; i < filters.length; i++) {
    variables[`filter_${i}`] = filters[i];
    variables[`paging_${i}`] = pagings[i] ?? null;
  }

  return { query, variables };
}

/**
 * Build a single GraphQL query that fetches a document AND
 * documentOperations for multiple filters, all in one HTTP request.
 */
export function buildBatchDocumentWithOperationsQuery(
  identifier: string,
  view: ViewFilterInput | undefined,
  filters: OperationsFilterInput[],
  pagings: (PagingInput | undefined)[],
) {
  const docVarDefs = "$identifier: String!, $view: ViewFilterInput";
  const opsVarDefs = filters
    .flatMap((_, i) => [
      `$filter_${i}: OperationsFilterInput!`,
      `$paging_${i}: PagingInput`,
    ])
    .join(", ");

  const opsFields = filters
    .map(
      (_, i) =>
        `scope_${i}: documentOperations(filter: $filter_${i}, paging: $paging_${i}) ${operationsSelectionSet}`,
    )
    .join("\n    ");

  const query = `query BatchGetDocumentWithOperations(${docVarDefs}, ${opsVarDefs}) {
    ${documentParts.body}
    ${opsFields}
  }
  ${documentParts.fragments}`;

  const variables: Record<string, unknown> = {
    identifier,
    view: view ?? null,
  };
  for (let i = 0; i < filters.length; i++) {
    variables[`filter_${i}`] = filters[i];
    variables[`paging_${i}`] = pagings[i] ?? null;
  }

  return { query, variables };
}
