/**
 * Thrown when an attachment ref or hash is not known to the store.
 */
export class AttachmentNotFound extends Error {
  constructor(identifier: string) {
    super(`Attachment not found: ${identifier}`);
    this.name = "AttachmentNotFound";
  }
}
