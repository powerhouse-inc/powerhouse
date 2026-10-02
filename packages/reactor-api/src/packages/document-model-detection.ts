import type { DocumentModelModule } from "@powerhousedao/shared/document-model";

/**
 * The one acceptance rule for a package's `document-models` module.
 *
 * The three package loaders duck-typed this independently and disagreed on
 * one case: the http loader required `documentModel` to be non-null, while
 * the import and vite loaders accepted any object merely carrying the key,
 * so an export shaped `{ documentModel: null }` registered as a model under
 * two loaders and vanished under the third. The strict rule is the correct
 * one — a module without its documentModel cannot define a document type —
 * and this predicate is now the single rule all three share, the same way
 * extractSubgraphs unified the subgraph rule.
 */
export function isDocumentModelModule(
  candidate: unknown,
): candidate is DocumentModelModule {
  if (candidate === null || typeof candidate !== "object") return false;
  if (!("documentModel" in candidate)) return false;
  const model = (candidate as { documentModel: unknown }).documentModel;
  return model !== null && model !== undefined;
}

/** Collects the document-model modules among a namespace's exports. */
export function extractDocumentModels(
  namespace: Record<string, unknown>,
): DocumentModelModule[] {
  return Object.values(namespace).filter(isDocumentModelModule);
}
