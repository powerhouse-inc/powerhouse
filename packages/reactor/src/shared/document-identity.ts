/** A document's identity fields as its header states them. */
export type DocumentIdentity = {
  slug: string | null;
  name: string | null;
  /** Absent when the state carries no header documentType. */
  documentType?: string;
};

/** The identity known before an operation, kept where the header is silent. */
export type PreviousDocumentIdentity = {
  slug: string | null;
  name: string | null;
};

export type DocumentIdentityOptions = {
  /**
   * Keeps the previous name. Non-name operations echo a header whose `name`
   * may be stale, so only the operations that own the name may write it.
   */
  preserveName: boolean;
};

const NO_PREVIOUS_IDENTITY: PreviousDocumentIdentity = {
  slug: null,
  name: null,
};

const DEFAULT_OPTIONS: DocumentIdentityOptions = { preserveName: false };

/**
 * Derives slug, name and documentType from an operation's resulting state
 * (the full state object with its `header` key). A header field that is not
 * a string leaves the previous value in place. The document view and the
 * write-side identity table both derive identity through this function, so
 * the two cannot disagree.
 */
export function identityFromDocumentState(
  state: Record<string, unknown>,
  previous: PreviousDocumentIdentity = NO_PREVIOUS_IDENTITY,
  options: DocumentIdentityOptions = DEFAULT_OPTIONS,
): DocumentIdentity {
  const header = state.header;
  const fields =
    typeof header === "object" && header !== null
      ? (header as Record<string, unknown>)
      : {};

  const identity: DocumentIdentity = {
    slug: typeof fields.slug === "string" ? fields.slug : previous.slug,
    name:
      typeof fields.name === "string" && !options.preserveName
        ? fields.name
        : previous.name,
  };
  if (typeof fields.documentType === "string") {
    identity.documentType = fields.documentType;
  }
  return identity;
}

/**
 * The slug a document can be resolved by: none when it is empty or equals the
 * document id, since resolution by id already finds the document.
 */
export function resolvableSlug(
  slug: string | null,
  documentId: string,
): string | null {
  return slug && slug !== documentId ? slug : null;
}

/** Whether a resulting state's `document` scope says the document is deleted. */
export function isDeletedDocumentState(
  state: Record<string, unknown>,
): boolean {
  const documentScope = state.document;
  return (
    typeof documentScope === "object" &&
    documentScope !== null &&
    (documentScope as Record<string, unknown>).isDeleted === true
  );
}
