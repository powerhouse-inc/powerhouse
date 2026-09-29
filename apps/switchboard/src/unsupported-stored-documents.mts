import type {
  UnsupportedStoredDocuments,
  UnsupportedStoredProtocolError,
} from "@powerhousedao/reactor";

const MODES: readonly UnsupportedStoredDocuments[] = ["refuse", "read-only"];

/** From REACTOR_UNSUPPORTED_STORED_DOCUMENTS; `input` wins when defined. */
export function resolveUnsupportedStoredDocuments(
  input: UnsupportedStoredDocuments | undefined,
  env: NodeJS.ProcessEnv,
): UnsupportedStoredDocuments {
  if (input !== undefined) return input;
  const raw = env.REACTOR_UNSUPPORTED_STORED_DOCUMENTS?.trim();
  if (!raw) return "refuse";
  if (!(MODES as readonly string[]).includes(raw)) {
    throw new Error(
      `REACTOR_UNSUPPORTED_STORED_DOCUMENTS must be "refuse" or "read-only", got "${raw}"`,
    );
  }
  return raw as UnsupportedStoredDocuments;
}

/** The reactor refused to start over documents this build does not run. */
export class StoredDocumentsRefusedError extends Error {
  readonly versions: readonly { protocol: string; version: number }[];
  readonly documents: number;

  constructor(cause: UnsupportedStoredProtocolError) {
    const named = cause.versions
      .map(({ protocol, version }) => `${protocol} ${version}`)
      .join(", ");
    super(
      `Refusing to start: ${cause.documents} stored document(s) require ${named}, which this switchboard does not run. ` +
        `Either start a switchboard build that runs ${named}, or set REACTOR_UNSUPPORTED_STORED_DOCUMENTS=read-only to start with those documents read-only.`,
      { cause },
    );
    this.name = "StoredDocumentsRefusedError";
    this.versions = cause.versions;
    this.documents = cause.documents;
  }

  static isError(error: unknown): error is StoredDocumentsRefusedError {
    return Error.isError(error) && error.name === "StoredDocumentsRefusedError";
  }
}
