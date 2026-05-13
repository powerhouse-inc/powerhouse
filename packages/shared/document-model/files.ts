import {
  strFromU8,
  strToU8,
  unzip,
  zip,
  type Unzipped,
  type Zippable,
} from "fflate";
import type { PHDocument, PHDocumentHeader } from "./documents.js";
import {
  filterDocumentOperationsResultingState,
  garbageCollectDocumentOperations,
  replayDocument,
} from "./documents.js";
import { FileSystemError } from "./errors.js";
import type { DocumentOperations } from "./operations.js";
import { documentModelReducer } from "./reducers.js";
import type { PHBaseState } from "./state.js";
import type {
  DocumentModelPHState,
  FileInput,
  LoadFromInput,
  MinimalBackupData,
  Reducer,
  ReplayDocumentOptions,
  SaveToFileHandle,
} from "./types.js";
import { validateOperations } from "./validation.js";

const NON_DOMAIN_SCOPES = new Set(["auth", "document"]);

function zipAsync(data: Zippable): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    zip(data, (err, out) => (err ? reject(err) : resolve(out)));
  });
}

function unzipAsync(data: Uint8Array): Promise<Unzipped> {
  return new Promise((resolve, reject) => {
    unzip(data, (err, out) => (err ? reject(err) : resolve(out)));
  });
}

async function toUint8Array(input: FileInput): Promise<Uint8Array> {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (typeof Blob !== "undefined" && input instanceof Blob) {
    return new Uint8Array(await input.arrayBuffer());
  }
  if (Array.isArray(input)) return new Uint8Array(input);
  if (typeof input === "string") {
    // jszip's default for strings was base64 decoding — preserve that behaviour
    // so callers passing base64 strings (e.g. from network APIs) keep working.
    if (typeof atob === "function") {
      const bin = atob(input);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return arr;
    }
    return new Uint8Array(
      (
        globalThis as {
          Buffer?: { from: (s: string, enc: string) => Uint8Array };
        }
      ).Buffer!.from(input, "base64"),
    );
  }
  throw new Error("Unsupported FileInput type");
}

function jsonEntry(value: unknown): Uint8Array {
  return strToU8(JSON.stringify(value, null, 2));
}

export async function createZip(document: PHDocument): Promise<Uint8Array> {
  return zipAsync({
    "header.json": jsonEntry(document.header),
    "state.json": jsonEntry(document.initialState || {}),
    "current-state.json": jsonEntry(document.state || {}),
    "operations.json": jsonEntry(
      filterDocumentOperationsResultingState(document.operations),
    ),
  });
}

/**
 * Creates a minimal ZIP backup from strand data.
 * Used when the full document is not available (e.g., in onOperations handler).
 * Creates a ZIP with minimal header and empty operations.
 */
export async function createMinimalZip(
  data: MinimalBackupData,
): Promise<Uint8Array> {
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

  return zipAsync({
    "header.json": jsonEntry(header),
    "state.json": jsonEntry(data.state),
    "current-state.json": jsonEntry(data.state),
    "operations.json": jsonEntry({}),
  });
}

export async function baseSaveToFileHandle(
  document: PHDocument,
  input: FileSystemFileHandle,
) {
  const data = await createZip(document);
  const writable = await input.createWritable();
  await writable.write(new Uint8Array(data));
  await writable.close();
}

function readEntry(files: Unzipped, name: string): string {
  const entry = files[name];
  if (!entry) {
    throw new Error(`${name} not found in document zip`);
  }
  return strFromU8(entry);
}

async function loadFromZipData<TState extends PHBaseState>(
  data: Uint8Array,
  reducer: Reducer<TState>,
  options?: ReplayDocumentOptions,
): Promise<PHDocument<TState>> {
  const files = await unzipAsync(data);

  if (!files["state.json"]) {
    throw new Error("Initial state not found");
  }
  const initialState = JSON.parse(readEntry(files, "state.json")) as TState;

  if (!files["header.json"]) {
    throw new Error("Document header not found - file format may be outdated");
  }
  const header = JSON.parse(
    readEntry(files, "header.json"),
  ) as PHDocumentHeader;

  if (!files["operations.json"]) {
    throw new Error("Operations history not found");
  }
  const operations = JSON.parse(
    readEntry(files, "operations.json"),
  ) as DocumentOperations;

  const clearedOperations = garbageCollectDocumentOperations(operations);

  const operationsError = validateOperations(clearedOperations);
  if (operationsError.length) {
    const errorMessages = operationsError.map((err) => err.message);
    throw new Error(errorMessages.join("\n"));
  }

  const domainOperations = Object.fromEntries(
    Object.entries(clearedOperations).filter(
      ([scope]) => !NON_DOMAIN_SCOPES.has(scope),
    ),
  ) as DocumentOperations;

  const result = replayDocument(
    initialState,
    domainOperations,
    reducer,
    header,
    undefined,
    {},
    options,
  );

  return { ...result, operations: clearedOperations };
}

export async function baseLoadFromInput<TState extends PHBaseState>(
  input: FileInput,
  reducer: Reducer<TState>,
  options?: ReplayDocumentOptions,
): Promise<PHDocument<TState>> {
  const data = await toUint8Array(input);
  return loadFromZipData(data, reducer, options);
}

export const documentModelLoadFromInput: LoadFromInput<DocumentModelPHState> = (
  input,
) => {
  return baseLoadFromInput(input, documentModelReducer);
};

export const documentModelSaveToFileHandle: SaveToFileHandle = (
  document,
  input,
) => {
  return baseSaveToFileHandle(document, input);
};

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
