/**
 * Test factory methods for creating DocumentDriveDocument instances with custom state
 */

import {
  driveCreateDocument,
  type DocumentDriveDocument,
  type Node,
} from "document-drive";

/**
 * Creates a DocumentDriveDocument with custom nodes in the global state
 */
export function createDocumentWithNodes(
  nodes: Partial<Node>[],
): DocumentDriveDocument {
  return driveCreateDocument({
    global: {
      nodes: nodes as Node[],
      icon: null,
      name: "",
    },
  });
}
