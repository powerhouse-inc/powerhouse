import type { Action } from "@powerhousedao/shared/document-model";
import type { ViewFilter } from "../../shared/types.js";
import type {
  DocumentRelationship,
  IDocumentIndexer,
  IDocumentView,
} from "../../storage/interfaces.js";

/**
 * Resolves the documents a write names to the ids it is stored and signed
 * under. Reads the document view today; the write-side identity table replaces
 * it without changing this surface.
 */
export class WriteTargets {
  constructor(
    private readonly documentView: IDocumentView,
    private readonly documentIndexer: IDocumentIndexer,
  ) {}

  /**
   * The id a write on `identifier` is stored under, which its signatures bind.
   * A create names its own id.
   */
  async resolveWriteTarget(
    identifier: string,
    branch: string,
    actions: readonly Action[],
    signal?: AbortSignal,
  ): Promise<string> {
    if (actions.some((action) => action.type === "CREATE_DOCUMENT")) {
      return identifier;
    }
    return this.resolveReference(identifier, branch, signal);
  }

  /**
   * The id a document reference names. An id no slug maps to is taken as
   * given, so a document still in flight resolves to itself; an id that is
   * another document's slug is refused as ambiguous.
   */
  async resolveReference(
    identifier: string,
    branch: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const view = { branch };
    const bySlug = await this.documentView.resolveSlug(
      identifier,
      view,
      undefined,
      signal,
    );
    if (bySlug === undefined || bySlug === identifier) {
      return identifier;
    }
    return this.documentView.resolveIdOrSlug(
      identifier,
      view,
      undefined,
      signal,
    );
  }

  /**
   * One relationship edge, or undefined when it does not exist. A point lookup:
   * the pair is filtered in SQL rather than scanned out of the source's edge
   * list, which on a drive with thousands of children is the difference between
   * one query and dozens.
   */
  async readRelationshipEdge(
    sourceIdentifier: string,
    targetIdentifier: string,
    relationshipType: string,
    view?: ViewFilter,
    signal?: AbortSignal,
  ): Promise<DocumentRelationship | undefined> {
    const sourceId = await this.documentView.resolveIdOrSlug(
      sourceIdentifier,
      view,
      undefined,
      signal,
    );
    const targetId = await this.documentView.resolveIdOrSlug(
      targetIdentifier,
      view,
      undefined,
      signal,
    );

    const edges = await this.documentIndexer.getDirectedRelationships(
      sourceId,
      targetId,
      [relationshipType],
      { cursor: "0", limit: 1 },
      undefined,
      signal,
    );

    return edges.results[0];
  }
}
