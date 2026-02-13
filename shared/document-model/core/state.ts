import type { HashConfig } from "./signatures.js";

/**
 * The document state of the document.
 */
export type PHDocumentState = {
  /**
   * The current document model schema version of the document. This is used
   * with the UPGRADE_DOCUMENT operation to specify the DocumentModelModule
   * version to use for reducer execution.
   */
  version: number;

  /** Hash configuration for operation state verification */
  hash: HashConfig;

  /** True if and only if the document has been deleted */
  isDeleted?: boolean;

  /** The timestamp when the document was deleted, in UTC ISO format */
  deletedAtUtcIso?: string;

  /** Optional: who deleted the document */
  deletedBy?: string;

  /** Optional: reason for deletion */
  deletionReason?: string;
};

/**
 * The authentication state of the document.
 *
 * This has yet to be implemented.
 */
export type PHAuthState = {};

/**
 * The base state of the document.
 */
export type PHBaseState = {
  /** Carries authentication information. */
  auth: PHAuthState;

  /** Carries information about the document. */
  document: PHDocumentState;
};
