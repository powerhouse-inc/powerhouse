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
}

export interface IAttachmentAccessService {
  canReadAttachment(
    request: AttachmentAccessRequest,
  ): Promise<AttachmentAccessResult>;
}

const HASH_PATTERN = /^[a-f0-9]{64}$/;

/**
 * Composes document authorization with the projected document/ref
 * relationship. Order is fixed: validate ref, resolve the canonical document
 * id, check `canRead`, then check the reference index. A denied document
 * never reaches the reference reader, and the facade never touches
 * attachment metadata, storage backends, or presigners.
 */
export class AttachmentAccessService implements IAttachmentAccessService {
  constructor(
    private readonly resolveCanonicalId: CanonicalDocumentIdResolver,
    private readonly authorization: IAuthorizationService,
    private readonly references: IAttachmentReferenceReader,
    private readonly projection: AttachmentReferenceProjectionCapability,
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

    const readable = await this.authorization.canRead(
      documentId,
      request.userAddress,
    );
    if (!readable) {
      return { kind: "denied" };
    }

    const referenced = await this.references.hasReference(documentId, ref);
    if (!referenced) {
      return { kind: "denied" };
    }

    return { kind: "allowed", documentId, ref };
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
