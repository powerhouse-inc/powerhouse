import type { IDocumentIndexer, IDocumentView } from "../storage/interfaces.js";

/** `getReadModel` name of the document view; see {@link ReactorReadModels}. */
export const DOCUMENT_VIEW_READ_MODEL = "document-view";
/** `getReadModel` name of the document indexer; see {@link ReactorReadModels}. */
export const DOCUMENT_INDEXER_READ_MODEL = "document-indexer";

/**
 * Read models the reactor registers on every host, keyed by the name passed to
 * `IProcessorHostModule.getReadModel`. Each entry says what the model holds
 * and when a processor should reach for it instead of the reactor client.
 */
export interface ReactorReadModels {
  /**
   * Materialized document snapshots — header plus per-scope state — kept
   * current as operations are indexed, so reads never replay operations.
   *
   * Reach for it to read a document's current state from inside a
   * processor: `get` / `getMany` by id, `getByIdOrSlug`, `findByType`,
   * `exists`, and `resolveSlug` / `resolveIdOrSlug`. Every query takes an
   * optional `ConsistencyToken` (from a job result) for read-after-write.
   * Unlike `client.get`, results are the raw snapshot — scopes are not
   * filtered to what the caller may read.
   */
  [DOCUMENT_VIEW_READ_MODEL]: IDocumentView;

  /**
   * Directed graph of document relationships, built from ADD_RELATIONSHIP /
   * REMOVE_RELATIONSHIP operations. Edges carry a `relationshipType`;
   * parent/child links (drive → document, folder → file) use `"child"`.
   *
   * Reach for it to navigate structure rather than content: `getOutgoing` /
   * `getIncoming` neighbours, `hasRelationship`, `findPath`, and
   * `findAncestors` (e.g. which drive(s) contain a document). Snapshots of
   * the documents themselves come from the document view.
   */
  [DOCUMENT_INDEXER_READ_MODEL]: IDocumentIndexer;
}
