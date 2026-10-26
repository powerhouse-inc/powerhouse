import type { Action } from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import { DocumentNotFoundError } from "../../shared/errors.js";
import type { ViewFilter } from "../../shared/types.js";
import type {
  DocumentRelationship,
  IDocumentIndexer,
  IDocumentView,
  IOperationStore,
  IWriteIdentityStore,
} from "../../storage/interfaces.js";
import type { WriteTargetDescription } from "../types.js";

/**
 * The write side's view of documents: identity (id, slug, type, deletion) from
 * the identity table the executor writes in its commit, and revisions from the
 * operation store. A client with these resolves write targets without the
 * document view.
 */
export type WriteSideParts = {
  identities: IWriteIdentityStore;
  revisions: IOperationStore;
};

/**
 * Resolves the documents a write names to the ids it is stored and signed
 * under.
 *
 * With {@link WriteSideParts}, resolution reads the write-side identity table:
 * id first, slug second, an identifier that is one document's id and another's
 * slug refused as ambiguous. When the table knows nothing of an identifier, the
 * document view is asked once, for documents whose identity row was never
 * backfilled (migration 028 copies only what the view held at migrate time);
 * each answer taken from it is counted in {@link viewFallbacks}. Without write
 * side parts (a client built from `withReactor`), resolution is the view's.
 */
export class WriteTargets {
  private fallbacks = 0;

  constructor(
    private readonly documentView: IDocumentView,
    private readonly documentIndexer: IDocumentIndexer,
    private readonly logger: ILogger,
    private readonly writeSide?: WriteSideParts,
  ) {}

  /** How many resolutions or descriptions the document view answered. */
  get viewFallbacks(): number {
    return this.fallbacks;
  }

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
   * The id a document reference names. An id nothing knows is taken as given,
   * so a document still in flight resolves to itself; an id that is another
   * document's slug is refused as ambiguous. A deleted document resolves to its
   * own id, as it did on the view (whose slug rows a delete removes): the
   * executor refuses the write, and a delete or purge flow still finds it.
   */
  async resolveReference(
    identifier: string,
    branch: string,
    signal?: AbortSignal,
  ): Promise<string> {
    if (this.writeSide === undefined) {
      return this.resolveOnView(identifier, branch, signal);
    }

    signal?.throwIfAborted();
    const record = await this.writeSide.identities.resolve(identifier, branch);
    if (record !== undefined) {
      return record.documentId;
    }

    return this.resolveOnViewFallback(identifier, branch, signal);
  }

  /**
   * The id of the live document an identifier names on the write side, or
   * undefined when the identity table knows no live document by it. Never
   * consults the view; undefined without write side parts.
   */
  async lookupLiveDocument(
    identifier: string,
    branch: string,
    signal?: AbortSignal,
  ): Promise<string | undefined> {
    if (this.writeSide === undefined) {
      return undefined;
    }
    signal?.throwIfAborted();
    const record = await this.writeSide.identities.resolve(identifier, branch);
    return record && !record.isDeleted ? record.documentId : undefined;
  }

  /**
   * The document a reference names, as a mutation resolves it: identity from
   * the identity table, revision from the operation store's stream heads, the
   * same read the executor's revision checks make. A deleted document is not
   * found. The table stores a slug only when it differs from the id, so a
   * document without one reports its id, as its header does. Falls back to the
   * view as {@link resolveReference} does.
   */
  async describe(
    identifier: string,
    branch: string,
    signal?: AbortSignal,
  ): Promise<WriteTargetDescription> {
    if (this.writeSide === undefined) {
      return this.describeOnView(identifier, branch, signal);
    }

    signal?.throwIfAborted();
    const record = await this.writeSide.identities.resolve(identifier, branch);
    if (record !== undefined) {
      if (record.isDeleted) {
        throw new DocumentNotFoundError(record.documentId);
      }
      const { revision } = await this.writeSide.revisions.getRevisions(
        record.documentId,
        record.branch,
        signal,
      );
      return {
        documentId: record.documentId,
        documentType: record.documentType,
        slug: record.slug ?? record.documentId,
        branch: record.branch,
        revision,
      };
    }

    const described = await this.describeOnView(identifier, branch, signal);
    this.countFallback("describe", identifier, branch);
    return described;
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

  /**
   * The view's resolution, asked when the identity table knows nothing of the
   * identifier. A view that cannot answer (it lags, or is not there) leaves
   * the identifier taken as given, which is what an unknown id resolves to.
   */
  private async resolveOnViewFallback(
    identifier: string,
    branch: string,
    signal: AbortSignal | undefined,
  ): Promise<string> {
    let bySlug: string | undefined;
    try {
      bySlug = await this.documentView.resolveSlug(
        identifier,
        { branch },
        undefined,
        signal,
      );
    } catch (error) {
      if (signal?.aborted) throw error;
      this.logger.debug(
        "Write target @identifier unknown to the identity table; the view could not answer: @error",
        identifier,
        error,
      );
      return identifier;
    }
    if (bySlug === undefined || bySlug === identifier) {
      return identifier;
    }

    const resolved = await this.documentView.resolveIdOrSlug(
      identifier,
      { branch },
      undefined,
      signal,
    );
    this.countFallback("resolve", identifier, branch);
    return resolved;
  }

  private async resolveOnView(
    identifier: string,
    branch: string,
    signal: AbortSignal | undefined,
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

  private async describeOnView(
    identifier: string,
    branch: string,
    signal: AbortSignal | undefined,
  ): Promise<WriteTargetDescription> {
    const documentId = await this.resolveOnView(identifier, branch, signal);
    const document = await this.documentView.get(
      documentId,
      { branch },
      undefined,
      signal,
    );
    return {
      documentId: document.header.id,
      documentType: document.header.documentType,
      slug: document.header.slug,
      branch: document.header.branch || branch,
      revision: { ...document.header.revision },
    };
  }

  private countFallback(
    what: "resolve" | "describe",
    identifier: string,
    branch: string,
  ): void {
    this.fallbacks += 1;
    this.logger.debug(
      "Write target @identifier on @branch has no identity row; the document view answered the @what",
      identifier,
      branch,
      what,
    );
  }
}
