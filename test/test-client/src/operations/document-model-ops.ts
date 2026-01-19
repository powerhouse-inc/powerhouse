import type { Action } from "document-model";
import type { TestDocument } from "../types.js";

let moduleCounter = 0;

function generateId(): string {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function randomString(length: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyz";
  return Array.from(
    { length },
    () => chars[Math.floor(Math.random() * chars.length)],
  ).join("");
}

function createAction(type: string, input: unknown, scope = "global"): Action {
  return {
    id: generateId(),
    type,
    timestampUtcMs: Date.now().toString(),
    input,
    scope,
  };
}

export function setModelName(): Action {
  return createAction("SET_MODEL_NAME", {
    name: `TestModel_${randomString(6)}`,
  });
}

export function setModelDescription(): Action {
  return createAction("SET_MODEL_DESCRIPTION", {
    description: `Test description generated at ${new Date().toISOString()}`,
  });
}

export function addModule(doc: TestDocument): Action {
  const id = generateId();
  doc.moduleIds.push(id);
  moduleCounter++;
  return createAction("ADD_MODULE", {
    id,
    name: `Module_${moduleCounter}`,
    description: `Auto-generated module ${moduleCounter}`,
  });
}

export function deleteModule(doc: TestDocument): Action | null {
  if (doc.moduleIds.length === 0) {
    return null;
  }
  const randomIndex = Math.floor(Math.random() * doc.moduleIds.length);
  const id = doc.moduleIds.splice(randomIndex, 1)[0];
  return createAction("DELETE_MODULE", { id });
}

interface WeightedOperation {
  weight: number;
  generator: (doc: TestDocument) => Action | null;
}

const DOCUMENT_MODEL_OPERATIONS: WeightedOperation[] = [
  { weight: 0.3, generator: () => setModelName() },
  { weight: 0.3, generator: () => setModelDescription() },
  { weight: 0.25, generator: (doc) => addModule(doc) },
  { weight: 0.15, generator: (doc) => deleteModule(doc) },
];

export function generateDocumentModelOperation(doc: TestDocument): Action {
  const random = Math.random();
  let cumulative = 0;

  for (const op of DOCUMENT_MODEL_OPERATIONS) {
    cumulative += op.weight;
    if (random <= cumulative) {
      const result = op.generator(doc);
      if (result) return result;
      // If operation returned null (e.g., can't delete), fall through to next
    }
  }

  // Fallback to setModelName if nothing else works
  return setModelName();
}
