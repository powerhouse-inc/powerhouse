import type { DocumentOperations, Operation } from "./operations.js";
import type { PHDocumentSignatureInfo } from "./signatures.js";
import type { PHBaseState } from "./state.js";

/** Meta information about the document. */
export type PHDocumentMeta = {
  /** The preferred editor for the document. */
  preferredEditor?: string;
};

/**
 * The header of a document.
 */
export type PHDocumentHeader = {
  /**
   * The id of the document.
   *
   * This is a Ed25519 signature and is immutable.
   **/
  id: string;

  /**
   * Information to verify the document creator.
   *
   * This is immutable.
   **/
  sig: PHDocumentSignatureInfo;

  /**
   * The type of the document.
   *
   * This is used as part of the signature payload and thus, cannot be changed
   * after the document header has been created.
   **/
  documentType: string;

  /**
   * The timestamp of the creation date of the document, in UTC ISO format.
   *
   * This is used as part of the signature payload and thus, cannot be changed
   * after the document header has been created.
   **/
  createdAtUtcIso: string;

  /** The slug of the document. */
  slug: string;

  /** The name of the document. */
  name: string;

  /** The branch of this document. */
  branch: string;

  /**
   * The revision of each scope of the document. This object is updated every
   * time any _other_ scope is updated.
   */
  revision: {
    [scope: string]: number;
  };

  /**
   * The timestamp of the last change in the document, in UTC ISO format.
   **/
  lastModifiedAtUtcIso: string;

  /**
   * This is a map from protocol name to version. A protocol can be any set of
   * rules that are applied to the document.
   *
   * Examples of protocols include:
   *
   * - "base-reducer"
   */
  protocolVersions?: { [key: string]: number };

  /** Meta information about the document. */
  meta?: PHDocumentMeta;
};

/**
 * The base type of a document model.
 *
 * @remarks
 * This type is extended by all Document models.
 *
 * @typeParam TState - The type of the document state.
 */
export type PHDocument<TState extends PHBaseState = PHBaseState> = {
  /** The header of the document. */
  header: PHDocumentHeader;

  /** The document model specific state. */
  state: TState;

  /**
   * The initial state of the document, enabling replaying operations.
   *
   * This will be removed in a future release.
   */
  initialState: TState;

  /**
   * The operations history of the document.
   *
   * This will be removed in a future release.
   */
  operations: DocumentOperations;

  /**
   * A list of undone operations
   *
   * This will be removed in a future release.
   */
  clipboard: Operation[];
};
