import type { ActionSigner } from "./signatures.js";

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
 * The attributes stored for a file. Namely, attachments of a document.
 */
export type Attachment = {
  /** The binary data of the attachment in Base64 */
  data: string;

  /** The MIME type of the attachment */
  mimeType: string;

  // The extension of the attachment.
  extension?: string | null;

  // The file name of the attachment.
  fileName?: string | null;
};

export type AttachmentInput = Attachment & {
  hash: string;
};

export type ActionWithAttachment = Action & {
  attachments: AttachmentInput[];
};

/**
 * String type representing an attachment in a Document.
 *
 * @remarks
 * Attachment string is formatted as `attachment://<filename>`.
 */
export type AttachmentRef = string; // TODO `attachment://${string}`;
