export type JsonSerializable =
  | string
  | number
  | boolean
  | null
  | undefined
  | JsonSerializable[]
  | { [key: string]: JsonSerializable };

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

export type PHDocumentState = {};

export type PHBaseState<TDocumentState = JsonSerializable> = {
  // todo: will not be optional in the future
  document?: TDocumentState;
};

export type PHDocumentHistory = {};
