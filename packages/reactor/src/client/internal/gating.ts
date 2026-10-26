import type {
  AuthSubject,
  ISigner,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import type { IReactor } from "../../core/types.js";
import type { IReadGate } from "../../decision/read-gate.js";
import {
  assertAbsent,
  refusesEveryDomainScope,
  unheldScopesReadOnState,
} from "../../decision/read-gate.js";
import type { PagedResults, ViewFilter } from "../../shared/types.js";
import type {
  DocumentRelationship,
  IDocumentView,
} from "../../storage/interfaces.js";
import type { EventReads } from "../event-reads.js";
import {
  authSubjectFromSigner,
  filterReadableScopes,
  narrowedScopes,
  withAllScopes,
  withAuthScope,
} from "../util.js";

/**
 * The read gate as the clients apply it: every document, listing, edge page and
 * feed event a client hands back goes through here. Stateless beyond its
 * references, so the read and write halves may each hold one.
 */
export class ReadGating {
  constructor(
    private readonly reactor: IReactor,
    private readonly documentView: IDocumentView,
    private readonly readGate: IReadGate,
    private readonly signer: ISigner,
  ) {}

  readSubject(subject?: AuthSubject): AuthSubject {
    return subject ?? authSubjectFromSigner(this.signer);
  }

  /**
   * Which scopes of one document the subject may read. Resolved once per
   * document, so the gate builds its model once however many scopes are then
   * tested, and the filtering itself stays synchronous.
   */
  readableScopes(
    document: PHDocument,
    view?: ViewFilter,
    signal?: AbortSignal,
    reads?: EventReads,
  ): Promise<(scope: string) => boolean> {
    const subject = this.readSubject(view?.subject);
    const branch = view?.branch ?? "main";
    return reads
      ? reads.scopePredicate(document, subject, branch)
      : this.readGate.scopePredicate(document, subject, branch, signal);
  }

  /**
   * One document, filtered to the scopes the subject may read. Every method
   * that hands a document back goes through here, including the ones that
   * follow a write: a document returned from a mutation is a read like any
   * other, and returning it whole served scopes the same subject would be
   * refused by `get`. Its author still sees what it wrote, because an allow on
   * execute confers read of that scope.
   */
  async gateDocument<TDocument extends PHDocument>(
    document: TDocument,
    view: ViewFilter | undefined,
    signal: AbortSignal | undefined,
  ): Promise<TDocument> {
    const readable = await this.readableScopes(document, view, signal);
    return filterReadableScopes(document, readable);
  }

  /**
   * One document as a listing or a feed serves it, or undefined when withheld.
   * The document must hold every scope, or withholding is decided on a subset;
   * a narrowing view is applied here instead.
   */
  async gateServed<TDocument extends PHDocument>(
    document: TDocument,
    view: ViewFilter | undefined,
    signal?: AbortSignal,
    reads?: EventReads,
  ): Promise<TDocument | undefined> {
    const readable = await this.readableScopes(document, view, signal, reads);
    if (refusesEveryDomainScope(document, readable)) {
      return undefined;
    }
    const narrowed = narrowedScopes(view);
    return filterReadableScopes(
      document,
      narrowed ? (scope) => readable(scope) && narrowed.has(scope) : readable,
    );
  }

  async gateServedAll(
    documents: PHDocument[],
    view: ViewFilter | undefined,
    signal?: AbortSignal,
    reads?: EventReads,
  ): Promise<PHDocument[]> {
    const served = await Promise.all(
      documents.map((document) =>
        this.gateServed(document, view, signal, reads),
      ),
    );
    return served.filter((document) => document !== undefined);
  }

  /**
   * Gates a page and every page after it. `nextCursor` is left as the stream
   * reported it.
   */
  async gateListing(
    page: PagedResults<PHDocument>,
    view: ViewFilter | undefined,
    signal: AbortSignal | undefined,
  ): Promise<PagedResults<PHDocument>> {
    const listed = await Promise.all(
      page.results.map((document) => this.gateListed(document, view, signal)),
    );
    const results = listed.filter((document) => document !== undefined);
    const next = page.next;
    return {
      ...page,
      results,
      next: next
        ? async () => this.gateListing(await next(), view, signal)
        : undefined,
    };
  }

  /**
   * One document as a listing serves it, or undefined when withheld. It holds
   * only the view's scopes; a domain scope it lacks is decided on its name, or
   * on its state read now when a condition needs that.
   */
  async gateListed(
    document: PHDocument,
    view: ViewFilter | undefined,
    signal: AbortSignal | undefined,
  ): Promise<PHDocument | undefined> {
    const readable = await this.readableScopes(document, view, signal);
    const unheld = unheldScopesReadOnState(document);
    const decided =
      unheld.length === 0
        ? readable
        : (scope: string) => !unheld.includes(scope) && readable(scope);
    if (
      refusesEveryDomainScope(document, decided) &&
      !(await this.servesUnheld(document, unheld, view, signal))
    ) {
      return undefined;
    }
    return filterReadableScopes(document, readable);
  }

  /**
   * Whether an event naming only these ids may reach the subject. An id with no
   * live document behind it has no content left to protect, so it does not
   * withhold; a deleted document is read at its deletion boundary when
   * deletion is positional, and gated like any other.
   */
  async servesEvery(
    ids: string[],
    view: ViewFilter | undefined,
    reads: EventReads,
  ): Promise<boolean> {
    const served = await Promise.all(
      ids.map((id) => this.servesId(id, view, reads)),
    );
    return served.every(Boolean);
  }

  /**
   * Drops the edges whose far-end document the subject may read no domain scope
   * of. An edge is withheld whole rather than stripped of its metadata: the
   * document-shaped relationship reads already answer with the far end stripped
   * to the scopes the gate allows, so the far end's existence is disclosed
   * either way, but an edge's metadata is content about the pair that the far
   * end's own reads would refuse. An edge to a far end stripped to nothing
   * therefore carries content past a refusal, and there is no useful shell to
   * hand back in its place.
   *
   * `nextCursor` and `options` are left as the underlying stream reported them,
   * because a caller must feed them back to resume from the right position. A
   * gated page can therefore be shorter than the limit it asked for.
   */
  async gateEdges(
    page: PagedResults<DocumentRelationship>,
    farEnd: "sourceId" | "targetId",
    view: ViewFilter | undefined,
    signal: AbortSignal | undefined,
  ): Promise<PagedResults<DocumentRelationship>> {
    const ids = [...new Set(page.results.map((edge) => edge[farEnd]))];
    if (ids.length === 0) {
      return page;
    }

    // No scopes: the gate must see every scope the document holds. Honouring a
    // caller-supplied narrowing would let `scopes: ["auth"]` leave a document
    // with no visible domain scope and switch the gate off. The explicit limit
    // keeps the tail of a large page from paging out of sight and reading as
    // absent.
    const farEndView: ViewFilter = {
      subject: view?.subject,
      branch: view?.branch,
    };
    const documents = await this.reactor.find(
      { ids },
      farEndView,
      { cursor: "0", limit: ids.length },
      undefined,
      signal,
    );

    const readable = new Map(
      await Promise.all(
        documents.results.map(async (doc) => {
          const allows = await this.readableScopes(doc, view, signal);
          return [
            doc.header.id,
            !refusesEveryDomainScope(doc, allows),
          ] as const;
        }),
      ),
    );

    // A far end `find` did not return is readable. `addRelationship` tolerates a
    // missing target, so a dangling edge is legitimate and failing closed would
    // hide it; and `find` never drops a document for authorization, so absence
    // here means genuinely absent and there is no content to protect.
    const results = page.results.filter(
      (edge) => readable.get(edge[farEnd]) !== false,
    );
    if (results.length === page.results.length) {
      return page;
    }

    const nextPage = page.next;
    return {
      ...page,
      results,
      next: nextPage
        ? async () => this.gateEdges(await nextPage(), farEnd, view, signal)
        : undefined,
    };
  }

  private async servesUnheld(
    document: PHDocument,
    scopes: string[],
    view: ViewFilter | undefined,
    signal: AbortSignal | undefined,
  ): Promise<boolean> {
    if (scopes.length === 0) {
      return false;
    }
    const id = document.header.id;
    let held: PHDocument;
    try {
      held = await this.reactor.get(
        id,
        withAuthScope({ ...view, scopes }),
        undefined,
        signal,
      );
    } catch (error) {
      await assertAbsent(this.documentView, id, error, signal);
      return false;
    }
    const readable = await this.readableScopes(held, view, signal);
    return scopes.some(readable);
  }

  private async servesId(
    id: string,
    view: ViewFilter | undefined,
    reads: EventReads,
  ): Promise<boolean> {
    let document: PHDocument;
    try {
      document = await reads.get(id, withAllScopes(view));
    } catch (error) {
      await assertAbsent(reads, id, error);
      return true;
    }
    return !refusesEveryDomainScope(
      document,
      await this.readableScopes(document, view, undefined, reads),
    );
  }
}
