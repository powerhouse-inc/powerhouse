import { isFileNode, isFolderNode } from "@powerhousedao/shared/document-drive";
import { useSelectedDriveSafe } from "../hooks/selected-drive.js";
import { useSelectedDocumentId } from "../hooks/selected-document.js";
import { useSelectedNode } from "../hooks/selected-node.js";
import type { ChatContext } from "./types.js";

/**
 * Snapshot of the current selection in the drive explorer, used to make the
 * chat context-aware: "create a budget here" targets the selected drive,
 * "summarize this document" targets the selected document.
 */
export function useChatContext(): ChatContext {
  const [drive] = useSelectedDriveSafe();
  const node = useSelectedNode();
  const documentId = useSelectedDocumentId();

  const context: ChatContext = {
    driveId: drive?.header.id,
    driveName: drive?.header.name,
  };

  if (node) {
    context.nodeId = node.id;
    context.nodeName = node.name;
    if (isFolderNode(node)) {
      context.nodeKind = "folder";
    } else if (isFileNode(node)) {
      context.nodeKind = "file";
    }
  }

  if (documentId && node && isFileNode(node)) {
    // The selected file node is a document; the node itself carries the
    // name and document model type.
    context.documentName = node.name;
    context.documentType = node.documentType;
  }
  return context;
}
