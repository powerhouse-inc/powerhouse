import type { DocumentDriveDocument } from "document-drive";
import { useDrives } from "./drives.js";

/**
 * Finds the drive that contains a document with the given ID.
 * Searches through all drives to find which one has a file node matching the document ID.
 *
 * @param documentId - The ID of the document to find the parent drive for
 * @returns The drive document that contains the document, or undefined if not found
 */
export function useDriveByDocumentId(
  documentId: string | undefined,
): DocumentDriveDocument | undefined {
  const drives = useDrives();

  if (!documentId || !drives) {
    return undefined;
  }

  // Search through all drives to find which one contains this document
  return drives.find((drive) => {
    const nodes = drive.state.global.nodes;
    return nodes.some((node) => node.id === documentId);
  });
}
