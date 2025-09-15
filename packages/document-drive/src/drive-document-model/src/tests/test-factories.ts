/**
 * Test factory methods for creating DocumentDriveDocument instances with custom state
 */

import type { DocumentDriveDocument, Node } from "document-drive";
import { driveCreateDocument } from "document-drive";

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
