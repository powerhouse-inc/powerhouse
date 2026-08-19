import type {
  AuthSubject,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import { DocumentNotFoundError } from "../shared/errors.js";
import type { IDocumentView } from "../storage/interfaces.js";
import type { IReadGate } from "./read-gate.js";
import { ALWAYS_READABLE_SCOPES } from "./read-gate.js";

/** What a subject may read of a document that is not there to be read. */
const META_ONLY = (scope: string): boolean => ALWAYS_READABLE_SCOPES.has(scope);

/**
 * A read gate asked by document id rather than by document.
 *
 * Serving works from an id: an outbox entry names a document, a branch and a
 * scope, and carries no state. Fetching the document is therefore the serving
 * path's own job, and it is the only thing this adds to the gate it wraps.
 */
export class SyncScopeGate {
  constructor(
    private readonly gate: IReadGate,
    private readonly documentView: IDocumentView,
    private readonly logger?: ILogger,
  ) {}

  /**
   * Which scopes of one document the subject may be served.
   *
   * A document this replica cannot produce yields the metadata scopes and
   * nothing else. That is the fail-closed direction, and it is safe to fail
   * closed here precisely because serving withholds rather than consumes: the
   * entry stays in the outbox and the next poll asks again, so a document that
   * is merely not indexed yet is delayed rather than lost.
   *
   * Any other failure is rethrown. A read side that is down must not read as a
   * silent, universal denial, because a denial that looks like a policy is one
   * nobody investigates.
   */
  async scopePredicateById(
    documentId: string,
    subject: AuthSubject,
    branch: string,
    signal?: AbortSignal,
  ): Promise<(scope: string) => boolean> {
    let document: PHDocument;
    try {
      document = await this.documentView.get(
        documentId,
        { branch },
        undefined,
        signal,
      );
    } catch (error) {
      if (!DocumentNotFoundError.isError(error)) {
        throw error;
      }
      this.logger?.verbose(
        `Withholding ${documentId} on branch ${branch}: the read side does not hold it`,
      );
      return META_ONLY;
    }

    return this.gate.scopePredicate(document, subject, branch, signal);
  }
}
