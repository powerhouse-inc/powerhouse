/**
 * Test factory methods for creating DocumentDriveDocument instances with custom state
 */

import { createDocumentDriveDocument } from "../../gen/index.js";
import type { Node } from "../../gen/schema/types.js";
import type { DocumentDriveDocument } from "../../gen/types.js";

/**
 * Creates a DocumentDriveDocument with custom nodes in the global state
 */
export function createDocumentWithNodes(
  nodes: Partial<Node>[],
): DocumentDriveDocument {
  return createDocumentDriveDocument({
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
  return createDocumentDriveDocument({
    global: globalState,
    local: localState,
  });
}
