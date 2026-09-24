import type { AttachmentHash, AttachmentRef } from "@powerhousedao/reactor";
import { createRef, parseRef } from "@powerhousedao/reactor-attachments";
import type { IAttachmentReferenceReader } from "@powerhousedao/reactor-attachments";
import type {
  CanonicalDocumentId,
  IAuthorizationService,
} from "./authorization.service.js";
import type { CanonicalDocumentIdResolver } from "./canonical-document-id.js";

/**
 * Whether the active Reactor composition hosts the attachment-reference
 * projection. Reported by the client initializer: the built-in stack always
 * registers it, while a caller-provided Reactor may lack the live
 * registration capability. Consumers of reference evidence must fail closed
 * when it is unavailable.
 */
export type AttachmentReferenceProjectionCapability =
  | { status: "available" }
  | {
      status: "unavailable";
      reason:
        | "live-read-model-registration-unsupported"
        | "in-process-reactor-module-unavailable"
        | "initializer-did-not-report";
    };

/**
 * Outcome of an attachment read authorization. `denied` intentionally covers
 * both an unreadable document and an absent document/ref relationship so the
 * route layer cannot leak which check failed. `projection-unavailable` means
 * the reference index is not being maintained in this composition; it is
 * returned before any document-authorization or reference lookup runs.
 */
export type AttachmentAccessResult =
  | { kind: "allowed"; documentId: CanonicalDocumentId; ref: AttachmentRef }
  | { kind: "denied" }
  | { kind: "projection-unavailable" };

export interface AttachmentAccessRequest {
  documentId: string;
  attachmentRef: string;
  userAddress?: string;
  /**
   * The `did:key` of the app instance whose token authenticated the caller.
   * A policy subject is an address AND a key — a grant can name either, and a
   * document's creator is recorded by key — so a decision made from the address
   * alone answers a narrower question than the one being asked.
   */
  appKey?: string;
}

/**
 * Which scopes of a document a subject may read, asked by document id.
 *
 * Structural on purpose: the composition that has a policy model to enforce
 * supplies `SyncScopeGate`, and one that does not supplies nothing at all.
 */
export interface IDocumentScopeGate {
  scopePredicateById(
    documentId: string,
    subject: { address?: string; key?: string },
    branch: string,
    signal?: AbortSignal,
  ): Promise<(scope: string) => boolean>;
}

/** The scope an attachment's bytes belong to: the document's own domain state. */
const ATTACHMENT_SCOPE = "global";

/** The branch an attachment reference is resolved against. */
const ATTACHMENT_BRANCH = "main";

export interface IAttachmentAccessService {
  canReadAttachment(
    request: AttachmentAccessRequest,
  ): Promise<AttachmentAccessResult>;
}

const HASH_PATTERN = /^[a-f0-9]{64}$/;

/**
 * Composes document authorization with the projected document/ref
 * relationship. Order is fixed: validate ref, resolve the canonical document
 * id, decide the read, then check the reference index. A denied document
 * never reaches the reference reader, and the facade never touches
 * attachment metadata, storage backends, or presigners.
 *
 * The read is decided by the document's own policy when this composition has a
 * model to enforce it with, and by the host's permission tables when it does
 * not. That is not a preference between two equivalent answers: a host running
 * document policies keeps no rows in the permission tables, so asking them
 * about such a document returns whatever the host-wide policy says — under
 * `OPEN`, `true`, for everyone. Serving bytes on that answer hands the file to
 * anyone who learns its hash, which the document's own state may well have told
 * them. Both are kept because they are the two halves of one rule: an
 * attachment is readable by whoever may read the document that references it,
 * and each composition can only express that in its own terms.
 */
export class AttachmentAccessService implements IAttachmentAccessService {
  constructor(
    private readonly resolveCanonicalId: CanonicalDocumentIdResolver,
    private readonly authorization: IAuthorizationService,
    private readonly references: IAttachmentReferenceReader,
    private readonly projection: AttachmentReferenceProjectionCapability,
    /**
     * Absent below auth enforcement, where there is no policy model to
     * evaluate; the host's permission tables decide alone, exactly as before.
     */
    private readonly scopeGate?: IDocumentScopeGate,
  ) {}

  async canReadAttachment(
    request: AttachmentAccessRequest,
  ): Promise<AttachmentAccessResult> {
    if (this.projection.status !== "available") {
      return { kind: "projection-unavailable" };
    }

    const ref = normalizeAttachmentRef(request.attachmentRef);
    if (ref === null) {
      return { kind: "denied" };
    }

    let documentId: CanonicalDocumentId;
    try {
      documentId = await this.resolveCanonicalId(request.documentId);
    } catch {
      return { kind: "denied" };
    }

    if (!(await this.canReadDocument(documentId, request))) {
      return { kind: "denied" };
    }

    const referenced = await this.references.hasReference(documentId, ref);
    if (!referenced) {
      return { kind: "denied" };
    }

    return { kind: "allowed", documentId, ref };
  }

  /**
   * Whether the caller may read the state the reference lives in.
   *
   * A failure here is rethrown rather than turned into a denial. A read side
   * that is down must not read as a policy: a denial nobody can distinguish
   * from a refusal is one nobody investigates, and the route answers 500 for a
   * reason.
   */
  private async canReadDocument(
    documentId: CanonicalDocumentId,
    request: AttachmentAccessRequest,
  ): Promise<boolean> {
    if (!this.scopeGate) {
      return this.authorization.canRead(documentId, request.userAddress);
    }
    const readable = await this.scopeGate.scopePredicateById(
      documentId,
      { address: request.userAddress, key: request.appKey },
      ATTACHMENT_BRANCH,
    );
    return readable(ATTACHMENT_SCOPE);
  }
}

/**
 * Parses and canonicalizes a caller-supplied ref through the shared parser.
 * Returns null for anything that is not a v1 ref over a 64-char SHA-256 hex
 * hash; hex case is normalized so index lookups use the canonical form.
 */
function normalizeAttachmentRef(value: string): AttachmentRef | null {
  let hash: string;
  let version: number;
  try {
    const parsed = parseRef(value as AttachmentRef);
    hash = parsed.hash.toLowerCase();
    version = parsed.version;
  } catch {
    return null;
  }
  if (version !== 1 || !HASH_PATTERN.test(hash)) {
    return null;
  }
  return createRef(hash as AttachmentHash, version);
}
