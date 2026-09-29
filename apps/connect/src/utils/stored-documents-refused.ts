import { UnsupportedStoredProtocolError } from "@powerhousedao/reactor";

export const STORED_DOCUMENTS_REFUSED = "StoredDocumentsRefusedError";

// Only name and message cross the worker boundary, so the message says it all.
export class StoredDocumentsRefusedError extends Error {
  constructor(cause: UnsupportedStoredProtocolError) {
    const named = cause.versions
      .map(({ protocol, version }) => `${protocol} ${version}`)
      .join(", ");
    super(
      `This browser holds ${cause.documents} document(s) that require ${named}, which this version of Connect does not run. ` +
        `Open them with a Connect build that runs ${named}, or set connect.reactor.unsupportedStoredDocuments to "read-only" in powerhouse.config.json to open them read-only.`,
      { cause },
    );
    this.name = STORED_DOCUMENTS_REFUSED;
  }
}

/** Rewrites the reactor's refusal for the boot screen. */
export function toStoredDocumentsRefused(error: unknown): unknown {
  return UnsupportedStoredProtocolError.isError(error)
    ? new StoredDocumentsRefusedError(error)
    : error;
}

export function isStoredDocumentsRefused(error: unknown): error is Error {
  return error instanceof Error && error.name === STORED_DOCUMENTS_REFUSED;
}
