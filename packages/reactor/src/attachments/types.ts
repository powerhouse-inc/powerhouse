/**
 * Content hash of the attachment data. This is the primary identifier.
 * Format is algorithm-dependent, e.g. SHA-256 hex.
 */
export type AttachmentHash = string;

/**
 * A reference to an attachment, used in document state and action inputs.
 * Format: `attachment://v<version>:<hash>`
 *
 * The version prefix allows changing the hash algorithm, encoding, or
 * length without leaking implementation details into the ref format.
 * Version 1 is defined as SHA-256 hex.
 *
 * Using the hash as the ref makes attachments content-addressable:
 * any peer that has the bytes for a given hash can serve the attachment.
 */
export type AttachmentRef = `attachment://v${number}:${string}`;
