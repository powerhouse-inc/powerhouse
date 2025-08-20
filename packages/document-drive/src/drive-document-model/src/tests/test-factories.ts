/**
 * Test factory methods for creating DocumentDriveDocument instances with custom state
 */

import { createDocument, createState } from "../../gen/utils.js";
import type { DocumentDriveDocument } from "../../gen/types.js";
import type { Node } from "../../gen/schema/types.js";

/**
 * Creates a DocumentDriveDocument with custom nodes in the global state
 */
export function createDocumentWithNodes(nodes: Partial<Node>[]): DocumentDriveDocument {
  const document = createDocument();
  // Directly modify the state after creation
  document.state.global.nodes = nodes as Node[];
  document.initialState.global.nodes = nodes as Node[];
  
  return document;
}

/**
 * Creates a DocumentDriveDocument with custom global and local state
 */
export function createDocumentWithState(
  globalState?: Partial<DocumentDriveDocument['state']['global']>,
  localState?: Partial<DocumentDriveDocument['state']['local']>
): DocumentDriveDocument {
  const document = createDocument();
  
  if (globalState) {
    Object.assign(document.state.global, globalState);
    Object.assign(document.initialState.global, globalState);
  }
  
  if (localState) {
    Object.assign(document.state.local, localState);
    Object.assign(document.initialState.local, localState);
  }
  
  return document;
}