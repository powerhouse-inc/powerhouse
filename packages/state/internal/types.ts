import type { IDocumentDriveServer } from "document-drive";
/** The type for the reactor instance.
 * Alias for the legacy IDocumentDriveServer type.
 */
export type Reactor = IDocumentDriveServer;

export type SharingType = "LOCAL" | "CLOUD" | "PUBLIC";

export type NodeKind = "FOLDER" | "FILE";
