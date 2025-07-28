import type { IDocumentDriveServer } from "document-drive";
import { type DocumentModelLib } from "document-model";
import { type NOT_SET } from "./constants.js";

/** The type for the reactor instance.
 * Alias for the legacy IDocumentDriveServer type.
 */
export type Reactor = IDocumentDriveServer;

/** The type for the unset atom (sentinel) value. */
export type UnsetAtomValue = typeof NOT_SET;

/** Alias for the Loadable type from Jotai. */
export { type Loadable } from "jotai/vanilla/utils/loadable";

export type SharingType = "LOCAL" | "CLOUD" | "PUBLIC";

export type NodeKind = "FOLDER" | "FILE";

export type PHPackage = Partial<DocumentModelLib> & { id: string };
