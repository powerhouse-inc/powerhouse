import { fetchFile, getFile, hash, readFile, writeFile } from "#utils/env";
import JSZip from "jszip";
import mime from "mime/lite";
import {
  Attachment,
  AttachmentInput,
  BaseDocument,
  CustomAction,
  DefaultAction,
  DocumentHeader,
  DocumentOperations,
  ExtendedState,
  Operation,
  Reducer,
} from "../types.js";
import { replayDocument, ReplayDocumentOptions } from "./base.js";
import {
  filterDocumentOperationsResultingState,
  garbageCollectDocumentOperations,
} from "./document-helpers.js";
import { validateOperations } from "./validation.js";

export type FileInput = string | number[] | Uint8Array | ArrayBuffer | Blob;

export function createZip<TGlobalState, TLocalState>(
  document: BaseDocument<TGlobalState, TLocalState>,
) {
  // create zip file
  const zip = new JSZip();

  const { name, revision, documentType, created, lastModified } = document;
  const header: DocumentHeader = {
    name,
    revision,
    documentType,
    created,
    lastModified,
  };
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

/**
 * Saves a document to a ZIP file.
 *
 * @remarks
 * This function creates a ZIP file containing the document's state, operations,
 * and file attachments. The file is saved to the specified path.
 *
 * @param document - The document to save to the file.
 * @param path - The path to save the file to.
 * @param extension - The extension to use for the file.
 * @returns A promise that resolves to the path of the saved file.
 */
export async function baseSaveToFile(
  document: BaseDocument<unknown, unknown>,
  path: string,
  extension: string,
  name?: string,
) {
  // create zip file
  const zip = createZip(document);
  const file = await zip.generateAsync({
    type: "uint8array",
    streamFiles: true,
  });
  const fileName = name ?? document.name;
  const fileExtension = `.${extension}.zip`;

  return writeFile(
    path,
    fileName.endsWith(fileExtension) ? fileName : `${fileName}${fileExtension}`,
    file,
  );
}

export async function baseSaveToFileHandle(
  document: BaseDocument<unknown, unknown>,
  input: FileSystemFileHandle,
) {
  const zip = createZip(document);
  const blob = await zip.generateAsync({ type: "blob" });
  const writable = await input.createWritable();
  await writable.write(blob);
  await writable.close();
}

/**
 * Loads a document from a ZIP file.
 *
 * @remarks
 * This function reads a ZIP file and returns the document state after
 * applying all the operations. The reducer is used to apply the operations.
 *
 * @typeParam S - The type of the state object.
 * @typeParam A - The type of the actions that can be applied to the state object.
 *
 * @param path - The path to the ZIP file.
 * @param reducer - The reducer to apply the operations to the state object.
 * @returns A promise that resolves to the document state after applying all the operations.
 * @throws An error if the initial state or the operations history is not found in the ZIP file.
 */
export async function baseLoadFromFile<
  TGlobalState,
  TLocalState,
  TCustomAction extends CustomAction = never,
>(
  path: string,
  reducer: Reducer<
    TGlobalState,
    TLocalState,
    TCustomAction | DefaultAction | Operation
  >,
  options?: ReplayDocumentOptions,
) {
  const file = readFile(path);
  return baseLoadFromInput(file, reducer, options);
}

export async function baseLoadFromInput<
  TGlobalState,
  TLocalState,
  TCustomAction extends CustomAction = never,
>(
  input: FileInput,
  reducer: Reducer<
    TGlobalState,
    TLocalState,
    TCustomAction | DefaultAction | Operation
  >,
  options?: ReplayDocumentOptions,
) {
  const zip = new JSZip();
  await zip.loadAsync(input);
  return loadFromZip(zip, reducer, options);
}

async function loadFromZip<
  TGlobalState,
  TLocalState,
  TCustomAction extends CustomAction = never,
>(
  zip: JSZip,
  reducer: Reducer<
    TGlobalState,
    TLocalState,
    TCustomAction | DefaultAction | Operation
  >,
  options?: ReplayDocumentOptions,
): Promise<BaseDocument<TGlobalState, TLocalState>> {
  const initialStateZip = zip.file("state.json");
  if (!initialStateZip) {
    throw new Error("Initial state not found");
  }
  const initialStateStr = await initialStateZip.async("string");
  const initialState = JSON.parse(initialStateStr) as ExtendedState<
    TGlobalState,
    TLocalState
  >;

  const headerZip = zip.file("header.json");
  let header: DocumentHeader | undefined = undefined;
  if (headerZip) {
    header = JSON.parse(await headerZip.async("string")) as DocumentHeader;
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
      ...header,
    };
  }
  return result;
}

function getFileAttributes(
  file: string,
): Omit<Attachment, "data" | "mimeType"> {
  const extension = file.replace(/^.*\./, "") || undefined;
  const fileName = file.replace(/^.*[/\\]/, "") || undefined;
  return { extension, fileName };
}

/**
 * Fetches an attachment from a URL and returns its base64-encoded data and MIME type.
 * @param url - The URL of the attachment to fetch.
 * @returns A Promise that resolves to an object containing the base64-encoded data and MIME type of the attachment.
 */
export async function getRemoteFile(url: string): Promise<AttachmentInput> {
  const { buffer, mimeType = "application/octet-stream" } =
    await fetchFile(url);
  const attributes = getFileAttributes(url);
  const data = buffer.toString("base64");
  return {
    data,
    hash: hash(data),
    mimeType,
    ...attributes,
  };
}

/**
 * Reads an attachment from a file and returns its base64-encoded data and MIME type.
 * @param path - The path of the attachment file to read.
 * @returns A Promise that resolves to an object containing the base64-encoded data and MIME type of the attachment.
 */
export async function getLocalFile(path: string): Promise<AttachmentInput> {
  const buffer = await getFile(path);
  const mimeType = mime.getType(path) || "application/octet-stream";
  const attributes = getFileAttributes(path);
  const data = buffer.toString("base64");
  return { data, hash: hash(data), mimeType, ...attributes };
}
