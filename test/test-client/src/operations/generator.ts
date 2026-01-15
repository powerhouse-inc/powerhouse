import type { Action } from "document-model";
import type { TestDocument } from "../types.js";
import {
  MAX_OPS_PER_CALL,
  MIN_OPS_PER_CALL,
} from "../types.js";
import { generateDocumentModelOperation } from "./document-model-ops.js";

export function generateOperations(doc: TestDocument): Action[] {
  const count =
    Math.floor(Math.random() * (MAX_OPS_PER_CALL - MIN_OPS_PER_CALL + 1)) +
    MIN_OPS_PER_CALL;

  const operations: Action[] = [];

  for (let i = 0; i < count; i++) {
    const operation = generateDocumentModelOperation(doc);
    operations.push(operation);
  }

  return operations;
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
