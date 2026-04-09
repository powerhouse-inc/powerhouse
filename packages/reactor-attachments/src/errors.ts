/**
 * Thrown when an attachment ref or hash is not known to the store.
 */
export class AttachmentNotFound extends Error {
  constructor(identifier: string) {
    super(`Attachment not found: ${identifier}`);
    this.name = "AttachmentNotFound";
  }
}

/**
 * Thrown when a reservation ID is not found in the reservation store.
 */
export class ReservationNotFound extends Error {
  constructor(reservationId: string) {
    super(`Reservation not found: ${reservationId}`);
    this.name = "ReservationNotFound";
  }
}

/**
 * Thrown when an attachment ref string does not match the expected format.
 */
export class InvalidAttachmentRef extends Error {
  constructor(ref: string) {
    super(`Invalid attachment ref: ${ref}`);
    this.name = "InvalidAttachmentRef";
  }
}
