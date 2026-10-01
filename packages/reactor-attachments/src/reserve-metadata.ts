/** The descriptive fields of a reservation, as a caller supplies them. */
export type ReserveMetadata = {
  mimeType: string;
  fileName: string;
  extension?: string | null;
};

/**
 * Validates reserve metadata with the rules the switchboard reserve route
 * applies.
 *
 * @throws InvalidAttachmentMetadata naming the first field that fails.
 */
export function validateReserveMetadata(_meta: ReserveMetadata): void {
  throw new Error("not implemented");
}
