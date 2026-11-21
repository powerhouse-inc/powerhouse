import { DEFAULT_DRIVE_CONTAINER_TYPES } from "@powerhousedao/reactor";

/**
 * Returns true when the given document type represents a drive container.
 * Delegates to the reactor's `DEFAULT_DRIVE_CONTAINER_TYPES`, so both the
 * legacy `powerhouse/document-drive` and the newer `powerhouse/reactor-drive`
 * count.
 */
export function isDriveContainerType(documentType: string): boolean {
  return DEFAULT_DRIVE_CONTAINER_TYPES.has(documentType);
}
