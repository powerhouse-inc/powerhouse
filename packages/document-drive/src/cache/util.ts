import { PHDocument } from "document-model";

// Deletes the resulting state on all operations in a document.
// NOTE: THE RESULT IS THE CACHES MUTATE DOCUMENTS
export const trimResultingState = <TDocument extends PHDocument>(
  document: TDocument,
): TDocument => {
  const global = document.operations.global.map((e) => {
    delete e.resultingState;
    return e;
  });

  const local = document.operations.local.map((e) => {
    delete e.resultingState;
    return e;
  });

  return { ...document, operations: { global, local } };
};
