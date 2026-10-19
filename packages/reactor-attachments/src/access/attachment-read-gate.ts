import type {
  AttachmentHash,
  AttachmentRef,
  IReactorClient,
} from "@powerhousedao/reactor";
import type { AuthSubject } from "@powerhousedao/shared/document-model";
import type { IAttachmentReferenceReader } from "../read-models/attachment-reference/types.js";

/** The reactor's read gate, as an attachment read consults it. */
export type AttachmentReadGate = Pick<IReactorClient, "isServed" | "get">;

/** Scopes a subject may read, by document id; `SyncScopeGate` satisfies it. */
export interface IDocumentScopeGate {
  scopePredicateById(
    documentId: string,
    subject: { address?: string; key?: string },
    branch: string,
    signal?: AbortSignal,
  ): Promise<(scope: string) => boolean>;
}

/** The scope an attachment's bytes belong to: the document's own domain state. */
export const ATTACHMENT_READ_SCOPE = "global";

/** The branch an attachment reference is resolved against. */
export const ATTACHMENT_READ_BRANCH = "main";

const HASH_PATTERN = /^[a-f0-9]{64}$/;

/** Whether `value` is a canonical v1 hash: 64 lowercase SHA-256 hex chars. */
export function isAttachmentHash(value: unknown): value is AttachmentHash {
  return typeof value === "string" && HASH_PATTERN.test(value);
}

/** Rethrows a failure: a read side that is down must not read as a denial. */
export async function scopeGateAllowsAttachmentRead(
  scopeGate: IDocumentScopeGate,
  documentId: string,
  subject: AuthSubject,
): Promise<boolean> {
  const readable = await scopeGate.scopePredicateById(
    documentId,
    subject,
    ATTACHMENT_READ_BRANCH,
  );
  return readable(ATTACHMENT_READ_SCOPE);
}

/** Served to the subject, references `ref`, and a referencing scope is readable. */
export async function readGateAllowsAttachmentRead(
  readGate: AttachmentReadGate,
  references: Pick<IAttachmentReferenceReader, "referencingScopes">,
  documentId: string,
  ref: AttachmentRef,
  subject: AuthSubject,
): Promise<boolean> {
  let served: boolean;
  try {
    served = await readGate.isServed(documentId, { subject });
  } catch {
    return false;
  }
  if (!served) {
    return false;
  }

  const scopes = await references.referencingScopes(documentId, ref);
  if (scopes.length === 0) {
    return false;
  }

  let held: Record<string, unknown>;
  try {
    const document = await readGate.get(documentId, { subject, scopes });
    held = document.state as Record<string, unknown>;
  } catch {
    return false;
  }
  return scopes.some((scope) => scope in held);
}
