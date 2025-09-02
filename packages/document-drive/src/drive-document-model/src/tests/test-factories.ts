/**
 * Test factory methods for creating DocumentDriveDocument instances with custom state
 */

import type { DocumentDriveDocument, Node } from "document-drive";
import { phFactoryDriveCreateDocument } from "../../ph-factories.js";

/**
 * Creates a DocumentDriveDocument with custom nodes in the global state
 */
export function createDocumentWithNodes(
  nodes: Partial<Node>[],
): DocumentDriveDocument {
  return phFactoryDriveCreateDocument({
    global: {
      nodes: nodes as Node[],
    },
  });
}

/**
 * Creates a DocumentDriveDocument with custom global and local state
 */
export function createDocumentWithState(
  globalState?: Partial<DocumentDriveDocument["state"]["global"]>,
  localState?: Partial<DocumentDriveDocument["state"]["local"]>,
): DocumentDriveDocument {
  return phFactoryDriveCreateDocument({
    global: globalState,
    local: localState,
  });
}
