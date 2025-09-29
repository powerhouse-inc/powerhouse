import JSZip from "jszip";
import {
  filterDocumentOperationsResultingState,
  garbageCollectDocumentOperations,
  replayDocument,
} from "./documents.js";
import { FileSystemError } from "./errors.js";
import type {
  DocumentOperations,
  FileInput,
  PHBaseState,
  PHDocument,
  PHDocumentHeader,
  Reducer,
  ReplayDocumentOptions,
} from "./types.js";
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

  if (document.attachments) {
    const attachments = Object.keys(document.attachments);
    attachments.forEach((key) => {
      const { data, ...attributes } = document.attachments?.[key] ?? {};
      if (data) {
        zip.file(key, data, {
          base64: true,
          createFolders: true,
          comment: JSON.stringify(attributes),
        });
      }
    });
  }

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
  let header: PHDocumentHeader | undefined = undefined;
  if (headerZip) {
    header = JSON.parse(await headerZip.async("string")) as PHDocumentHeader;
  }

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

  // TODO: There is a race condition here where operations are replayed and do not necessary
  // result in the same lastModified value. This will be fixed once the header replaces this
  // information as it is explicitly set below to the saved time.
  let result = replayDocument(
    initialState,
    clearedOperations,
    reducer,
    undefined,
    header,
    {},
    options,
  );

  if (header) {
    result = {
      ...result,
      header,
    };
  }
  return result;
}
