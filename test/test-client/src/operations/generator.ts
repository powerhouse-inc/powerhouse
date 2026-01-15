import type { Action } from "document-model";
import type { TestDocument } from "../types.js";
import {
  DOCUMENT_DRIVE_TYPE,
  DOCUMENT_MODEL_TYPE,
  MAX_OPS_PER_CALL,
  MIN_OPS_PER_CALL,
} from "../types.js";
import { generateDocumentDriveOperation } from "./document-drive-ops.js";
import { generateDocumentModelOperation } from "./document-model-ops.js";

export function generateOperations(doc: TestDocument): Action[] {
  const count =
    Math.floor(Math.random() * (MAX_OPS_PER_CALL - MIN_OPS_PER_CALL + 1)) +
    MIN_OPS_PER_CALL;

  const operations: Action[] = [];

  for (let i = 0; i < count; i++) {
    const operation = generateOperation(doc);
    operations.push(operation);
  }

  return operations;
}

function generateOperation(doc: TestDocument): Action {
  switch (doc.type) {
    case DOCUMENT_MODEL_TYPE:
      return generateDocumentModelOperation(doc);
    case DOCUMENT_DRIVE_TYPE:
      return generateDocumentDriveOperation(doc);
    default:
      // Default to document-model operations
      return generateDocumentModelOperation(doc);
  }
}

export function createTestDocument(
  id: string,
  type: string,
  parentId?: string,
): TestDocument {
  return {
    id,
    type,
    parentId,
    createdAt: Date.now(),
    operationCount: 0,
    moduleIds: [],
    folderIds: [],
    fileIds: [],
  };
}
