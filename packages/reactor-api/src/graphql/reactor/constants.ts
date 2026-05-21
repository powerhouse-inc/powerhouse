import { DEFAULT_DRIVE_CONTAINER_TYPES } from "@powerhousedao/reactor";

/**
 * Legacy document-drive document type. Use {@link isDriveContainerType} for
 * drive-container gates; this constant is kept for places (e.g. legacy
 * default-drive bootstrap) that genuinely need the specific document-drive
 * type rather than "any drive container".
 */
export const DRIVE_DOCUMENT_TYPE = "powerhouse/document-drive";

/**
 * Returns true when the given document type represents a drive container.
 * Delegates to the reactor's `DEFAULT_DRIVE_CONTAINER_TYPES`, so both the
 * legacy `powerhouse/document-drive` and the newer `powerhouse/reactor-drive`
 * count.
 */
export function isDriveContainerType(documentType: string): boolean {
  return DEFAULT_DRIVE_CONTAINER_TYPES.has(documentType);
}
