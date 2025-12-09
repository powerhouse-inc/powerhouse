///////////////////////////////////////////////////////////////////////////////
// These are "Reactor V2" types, that have passed through the on-going reactor
// refactor.
//
// Please do not add types to this file that have not been spec'd out in the
// docs/planning folder in the reactor/ package.
///////////////////////////////////////////////////////////////////////////////

import type { AttachmentInput } from "./types.js";

/**
 * Information to verify the document creator.
 */
export type PHDocumentSignatureInfo = {
  /**
   * The public key of the document creator.
   **/
  publicKey: JsonWebKey;

  /** The nonce that was appended to the message to create the signature. */
  nonce: string;
};

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

  /** Meta information about the document. */
  meta?: PHDocumentMeta;
};

/**
 * The authentication state of the document.
 *
 * This has yet to be implemented.
 */
export type PHAuthState = {};

// Known hash algorithms (can be extended without breaking changes)
export const HASH_ALGORITHM_SHA1 = "sha1";
export const HASH_ALGORITHM_SHA256 = "sha256";
export const HASH_ALGORITHM_SHA512 = "sha512";

// Known encodings (can be extended without breaking changes)
export const HASH_ENCODING_BASE64 = "base64";
export const HASH_ENCODING_HEX = "hex";

/**
 * Configuration for hashing document state in operations.
 */
export type HashConfig = {
  /** The hashing algorithm to use (e.g., "sha1", "sha256") */
  algorithm: string;

  /** The encoding format for the hash output (e.g., "base64", "hex") */
  encoding: string;

  /** Optional algorithm-specific parameters */
  params?: Record<string, unknown>;
};

/**
 * The document state of the document.
 */
export type PHDocumentState = {
  /** The current version of the document. */
  version: string;

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
 * The base state of the document.
 */
export type PHBaseState = {
  /** Carries authentication information. */
  auth: PHAuthState;

  /** Carries information about the document. */
  document: PHDocumentState;
};

/**
 * A signature of an action.
 *
 * This will be refactored in a future release.
 */
//  [
//     signerAddress,
//     hash (docID, scope, operationID, operationName, operationInput),
//     prevStateHash,
//     signature bytes
//  ]
export type Signature = [string, string, string, string, string];

/**
 * A user action signer.
 */
export type UserActionSigner = {
  address: string;
  networkId: string; // CAIP-2
  chainId: number; // CAIP-10
};

/**
 * An app action signer.
 */
export type AppActionSigner = {
  name: string; // Connect
  key: string;
};

/**
 * An action signer.
 */
export type ActionSigner = {
  user: UserActionSigner;
  app: AppActionSigner;
  signatures: Signature[];
};

/**
 * The context of an action.
 */
export type ActionContext = {
  /** The index of the previous operation, showing intended ordering. */
  prevOpIndex?: number;

  /** The hash of the previous operation, showing intended state. */
  prevOpHash?: string;

  /** A nonce, to cover specific signing attacks and to prevent replay attacks from no-ops. */
  nonce?: string;

  /** The signer of the action. */
  signer?: ActionSigner;
};

/**
 * String type representing an attachment in a Document.
 *
 * @remarks
 * Attachment string is formatted as `attachment://<filename>`.
 */
export type AttachmentRef = string; // TODO `attachment://${string}`;

/**
 * Defines the basic structure of an action.
 */
export type Action = {
  /** The id of the action. This is distinct from the operation id. */
  id: string;

  /** The name of the action. */
  type: string;

  /** The timestamp of the action. */
  timestampUtcMs: string;

  /** The payload of the action. */
  input: unknown;

  /** The scope of the action */
  scope: string;

  /**
   * The attachments included in the action.
   *
   * This will be refactored in a future release.
   */
  attachments?: AttachmentInput[];

  /** The context of the action. */
  context?: ActionContext;
};

/**
 * An operation that was applied to a {@link BaseDocument}.
 *
 * @remarks
 * Wraps an action with an index, to be added to the operations history of a Document.
 * The `index` field is used to keep all operations in order and enable replaying the
 * document's history from the beginning.
 *
 * @typeParam A - The type of the action.
 */
export type Operation = {
  /** Position of the operation in the history */
  index: number;

  /** Timestamp of when the operation was added */
  timestampUtcMs: string;

  /** Hash of the resulting document data after the operation */
  hash: string;

  /** The number of operations skipped with this Operation */
  skip: number;

  /** Error message for a failed action */
  error?: string;

  /** The resulting state after the operation */
  resultingState?: string;

  /** Unique operation id. This is distinct from the action id and can be undefined and assigned later. */
  id?: string;

  /**
   * The action that was applied to the document to produce this operation.
   */
  action: Action;
};

/**
 * The operations history of the document by scope.
 *
 * This will be removed in a future release.
 *
 * TODO: Type should be Partial<Record<string, Operation[]>>,
 * but that is a breaking change for codegen + external doc models.
 */
export type DocumentOperations = Record<string, Operation[]>;

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

/** Upgrade reducer transforms a document from one version to another */
export type UpgradeReducer<
  TFrom extends PHBaseState,
  TTo extends PHBaseState,
> = (document: PHDocument<TFrom>, action: Action) => PHDocument<TTo>;
type ModelVersion = number;

/** Metadata about a version transition */
export type UpgradeTransition = {
  toVersion: ModelVersion;
  upgradeReducer: UpgradeReducer<any, any>;
  description?: string;
};

type TupleMember<T extends readonly unknown[]> = T[number];

/** Manifest declaring all supported versions and upgrade paths */

export type UpgradeManifest<TVersions extends readonly number[]> = {
  documentType: string;
  // union of all versions, e.g. 1 | 2 | 3 for [1, 2, 3]
  latestVersion: TupleMember<TVersions>;
  // the tuple itself, e.g. [1, 2, 3]
  supportedVersions: TVersions;
  // mapped over each version in the tuple
  upgrades: {
    // keys: "v2" | "v3" | ... (no "v1")
    [V in Exclude<TupleMember<TVersions>, 1> as `v${V}`]: UpgradeTransition;
  };
};
