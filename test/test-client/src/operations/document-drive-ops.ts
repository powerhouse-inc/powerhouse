import type { Action } from "document-model";
import type { TestDocument } from "../types.js";

let folderCounter = 0;
let fileCounter = 0;

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

export function setDriveName(): Action {
  return createAction("SET_DRIVE_NAME", {
    name: `TestDrive_${randomString(6)}`,
  });
}

export function addFolder(doc: TestDocument): Action {
  const id = generateId();
  doc.folderIds.push(id);
  folderCounter++;

  // Optionally nest in existing folder
  const parentFolder =
    doc.folderIds.length > 1 && Math.random() > 0.5
      ? doc.folderIds[Math.floor(Math.random() * (doc.folderIds.length - 1))]
      : undefined;

  return createAction("ADD_FOLDER", {
    id,
    name: `Folder_${folderCounter}`,
    parentFolder,
  });
}

export function addFile(doc: TestDocument): Action {
  const id = generateId();
  doc.fileIds.push(id);
  fileCounter++;

  // Optionally place in existing folder
  const parentFolder =
    doc.folderIds.length > 0 && Math.random() > 0.3
      ? doc.folderIds[Math.floor(Math.random() * doc.folderIds.length)]
      : undefined;

  return createAction("ADD_FILE", {
    id,
    name: `File_${fileCounter}`,
    documentType: "powerhouse/document-model",
    parentFolder,
  });
}

export function deleteNode(doc: TestDocument): Action | null {
  // Combine files and folders for deletion candidates
  const allNodes = [...doc.fileIds, ...doc.folderIds];

  if (allNodes.length === 0) {
    return null;
  }

  const randomIndex = Math.floor(Math.random() * allNodes.length);
  const id = allNodes[randomIndex];

  // Remove from the appropriate array
  const fileIndex = doc.fileIds.indexOf(id);
  if (fileIndex !== -1) {
    doc.fileIds.splice(fileIndex, 1);
  } else {
    const folderIndex = doc.folderIds.indexOf(id);
    if (folderIndex !== -1) {
      doc.folderIds.splice(folderIndex, 1);
    }
  }

  return createAction("DELETE_NODE", { id });
}

interface WeightedOperation {
  weight: number;
  generator: (doc: TestDocument) => Action | null;
}

const DOCUMENT_DRIVE_OPERATIONS: WeightedOperation[] = [
  { weight: 0.25, generator: () => setDriveName() },
  { weight: 0.3, generator: (doc) => addFolder(doc) },
  { weight: 0.3, generator: (doc) => addFile(doc) },
  { weight: 0.15, generator: (doc) => deleteNode(doc) },
];

export function generateDocumentDriveOperation(doc: TestDocument): Action {
  const random = Math.random();
  let cumulative = 0;

  for (const op of DOCUMENT_DRIVE_OPERATIONS) {
    cumulative += op.weight;
    if (random <= cumulative) {
      const result = op.generator(doc);
      if (result) return result;
    }
  }

  // Fallback to setDriveName if nothing else works
  return setDriveName();
}
