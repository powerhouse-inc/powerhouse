import type { DocumentOperations, PHDocument } from "document-model";

// Deletes the resulting state on all operations in a document.
// NOTE: THE RESULT IS THE CACHES MUTATE DOCUMENTS
export const trimResultingState = <TDocument extends PHDocument>(
  document: TDocument,
): TDocument => {
  // Handle all scopes dynamically, not just global and local
  const trimmedOperations: DocumentOperations = {};

  for (const [scope, operations] of Object.entries(document.operations)) {
    trimmedOperations[scope] = operations.map((e) => {
      delete e.resultingState;
      return e;
    });
  }

  return { ...document, operations: trimmedOperations };
};
