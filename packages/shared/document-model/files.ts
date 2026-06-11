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
import {
  replayDocumentVersioned,
  type VersionedReplayConfig,
} from "./versioned-replay.js";

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

const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

function isLikelyBase64(s: string): boolean {
  // Base64 strings are length % 4 === 0, use only the base64 alphabet,
  // and contain no bytes >= 0x80. A raw binary string (one char per byte)
  // typically has bytes outside that alphabet.
  if (s.length === 0 || s.length % 4 !== 0) return false;
  return BASE64_RE.test(s);
}

function binaryStringToUint8Array(s: string): Uint8Array {
  const arr = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) arr[i] = s.charCodeAt(i) & 0xff;
  return arr;
}

function base64ToUint8Array(s: string): Uint8Array {
  if (typeof atob === "function") {
    const bin = atob(s);
    return binaryStringToUint8Array(bin);
  }
  const BufferCtor = (
    globalThis as {
      Buffer?: { from: (s: string, enc: string) => Uint8Array };
    }
  ).Buffer;
  if (!BufferCtor) {
    throw new Error(
      "Cannot decode base64 string: neither `atob` nor `Buffer` is available in this environment",
    );
  }
  return BufferCtor.from(s, "base64");
}

async function toUint8Array(input: FileInput): Promise<Uint8Array> {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (typeof Blob !== "undefined" && input instanceof Blob) {
    return new Uint8Array(await input.arrayBuffer());
  }
  if (Array.isArray(input)) return new Uint8Array(input);
  if (typeof input === "string") {
    // jszip's loadAsync accepted both raw binary strings and base64 strings
    // with auto-detection. Preserve that so callers passing either keep working.
    return isLikelyBase64(input)
      ? base64ToUint8Array(input)
      : binaryStringToUint8Array(input);
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

type ParsedZip<TState> = {
  initialState: TState;
  header: PHDocumentHeader;
  clearedOperations: DocumentOperations;
};

async function parseZipData<TState extends PHBaseState>(
  data: Uint8Array,
): Promise<ParsedZip<TState>> {
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

  return { initialState, header, clearedOperations };
}

async function loadFromZipData<TState extends PHBaseState>(
  data: Uint8Array,
  reducer: Reducer<TState>,
  options?: ReplayDocumentOptions,
): Promise<PHDocument<TState>> {
  const { initialState, header, clearedOperations } =
    await parseZipData<TState>(data);

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

async function loadFromZipDataVersioned<TState extends PHBaseState>(
  data: Uint8Array,
  config: VersionedReplayConfig,
  options?: ReplayDocumentOptions,
): Promise<PHDocument<TState>> {
  const { initialState, header, clearedOperations } =
    await parseZipData<TState>(data);

  const result = replayDocumentVersioned<TState>(
    initialState,
    clearedOperations,
    config,
    header,
    undefined,
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

export async function baseLoadFromInputVersioned<TState extends PHBaseState>(
  input: FileInput,
  config: VersionedReplayConfig,
  options?: ReplayDocumentOptions,
): Promise<PHDocument<TState>> {
  const data = await toUint8Array(input);
  return loadFromZipDataVersioned<TState>(data, config, options);
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

export const getFileBrowser = (file: string): Promise<void> => {
  return Promise.resolve().then(() => readFileBrowser(file));
};
