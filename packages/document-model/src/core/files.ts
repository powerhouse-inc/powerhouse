import JSZip from "jszip";
import {
  filterDocumentOperationsResultingState,
  garbageCollectDocumentOperations,
  replayDocument,
} from "./documents.js";
import { FileSystemError } from "./errors.js";
import type {
  DocumentOperations,
  PHBaseState,
  PHDocument,
  PHDocumentHeader,
} from "./ph-types.js";
import type { FileInput, Reducer, ReplayDocumentOptions } from "./types.js";
import { validateOperations } from "./validation.js";

export function writeFileBrowser(
  path: string,
  name: string,
  stream: Uint8Array,
): Promise<string> {
  throw FileSystemError;
}

export function readFileBrowser(path: string) {
  throw FileSystemError;
}

export function fetchFileBrowser(
  url: string,
): Promise<{ data: Buffer; mimeType?: string }> {
  throw FileSystemError;
}

export const getFileBrowser = async (file: string) => {
  return readFileBrowser(file);
};

export function createZip(document: PHDocument) {
  // create zip file
  const zip = new JSZip();

  const header = document.header;
  zip.file("header.json", JSON.stringify(header, null, 2));
  zip.file("state.json", JSON.stringify(document.initialState || {}, null, 2));
  zip.file("current-state.json", JSON.stringify(document.state || {}, null, 2));
  zip.file(
    "operations.json",
    JSON.stringify(
      filterDocumentOperationsResultingState(document.operations),
      null,
      2,
    ),
  );

  return zip;
}

export type MinimalBackupData = {
  documentId: string;
  documentType: string;
  branch: string;
  state: PHBaseState;
  name: string;
};

/**
 * Creates a minimal ZIP backup from strand data.
 * Used when the full document is not available (e.g., in onOperations handler).
 * Creates a ZIP with minimal header and empty operations.
 */
export function createMinimalZip(data: MinimalBackupData) {
  const now = new Date().toISOString();
  const header: PHDocumentHeader = {
    id: data.documentId,
    sig: { publicKey: {}, nonce: "" },
    documentType: data.documentType,
    createdAtUtcIso: now,
    slug: data.name,
    name: data.name,
    branch: data.branch,
    revision: {},
    lastModifiedAtUtcIso: now,
  };

  const zip = new JSZip();
  zip.file("header.json", JSON.stringify(header, null, 2));
  zip.file("state.json", JSON.stringify(data.state, null, 2));
  zip.file("current-state.json", JSON.stringify(data.state, null, 2));
  zip.file("operations.json", JSON.stringify({}, null, 2));

  return zip;
}

export async function baseSaveToFileHandle(
  document: PHDocument,
  input: FileSystemFileHandle,
) {
  const zip = createZip(document);
  const blob = await zip.generateAsync({ type: "blob" });
  const writable = await input.createWritable();
  await writable.write(blob);
  await writable.close();
}

export async function baseLoadFromInput<TState extends PHBaseState>(
  input: FileInput,
  reducer: Reducer<TState>,
  options?: ReplayDocumentOptions,
): Promise<PHDocument<TState>> {
  const zip = new JSZip();
  await zip.loadAsync(input);
  return loadFromZip(zip, reducer, options);
}

async function loadFromZip<TState extends PHBaseState>(
  zip: JSZip,
  reducer: Reducer<TState>,
  options?: ReplayDocumentOptions,
): Promise<PHDocument<TState>> {
  const initialStateZip = zip.file("state.json");
  if (!initialStateZip) {
    throw new Error("Initial state not found");
  }
  const initialStateStr = await initialStateZip.async("string");
  const initialState = JSON.parse(initialStateStr) as TState;

  const headerZip = zip.file("header.json");
  if (!headerZip) {
    throw new Error("Document header not found - file format may be outdated");
  }
  const header = JSON.parse(
    await headerZip.async("string"),
  ) as PHDocumentHeader;

  const operationsZip = zip.file("operations.json");
  if (!operationsZip) {
    throw new Error("Operations history not found");
  }
  const operations = JSON.parse(
    await operationsZip.async("string"),
  ) as DocumentOperations;

  const clearedOperations = garbageCollectDocumentOperations(operations);

  const operationsError = validateOperations(clearedOperations);
  if (operationsError.length) {
    const errorMessages = operationsError.map((err) => err.message);
    throw new Error(errorMessages.join("\n"));
  }

  const result = replayDocument(
    initialState,
    clearedOperations,
    reducer,
    header,
    undefined,
    {},
    options,
  );

  return result;
}
