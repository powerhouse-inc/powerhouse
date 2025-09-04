import type {
  Attachment,
  AttachmentInput,
  PHDocument,
  Reducer,
  ReplayDocumentOptions,
} from "document-model";
import { baseLoadFromInput, createZip } from "document-model";
import type { BinaryLike, RandomUUIDOptions } from "node:crypto";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import https from "node:https";
import { join } from "node:path";
import mime from "mime/lite";

function getFileAttributes(
  file: string,
): Omit<Attachment, "data" | "mimeType"> {
  const extension = file.replace(/^.*\./, "") || undefined;
  const fileName = file.replace(/^.*[/\\]/, "") || undefined;
  return { extension, fileName };
}

/**
 * Reads an attachment from a file and returns its base64-encoded data and MIME type.
 * @param path - The path of the attachment file to read.
 * @returns A Promise that resolves to an object containing the base64-encoded data and MIME type of the attachment.
 */
export async function getLocalFile(path: string): Promise<AttachmentInput> {
  const buffer = await getFileNode(path);
  const mimeType = mime.getType(path) || "application/octet-stream";
  const attributes = getFileAttributes(path);
  const data = buffer.toString("base64");
  return { data, hash: hashNode(data), mimeType, ...attributes };
}

/**
 * Fetches an attachment from a URL and returns its base64-encoded data and MIME type.
 * @param url - The URL of the attachment to fetch.
 * @returns A Promise that resolves to an object containing the base64-encoded data and MIME type of the attachment.
 */
export async function getRemoteFile(url: string): Promise<AttachmentInput> {
  const { buffer, mimeType = "application/octet-stream" } =
    await fetchFileNode(url);
  const attributes = getFileAttributes(url);
  const data = buffer.toString("base64");
  return {
    data,
    hash: hashNode(data),
    mimeType,
    ...attributes,
  };
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
export async function baseLoadFromFile<TDocument extends PHDocument>(
  path: string,
  reducer: Reducer<TDocument>,
  options?: ReplayDocumentOptions,
): Promise<TDocument> {
  const file = readFileNode(path);
  return baseLoadFromInput(file, reducer, options);
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
  document: PHDocument,
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
  const fileName = name ?? document.header.name;
  const fileExtension = `.${extension}.zip`;

  return writeFileNode(
    path,
    fileName.endsWith(fileExtension) ? fileName : `${fileName}${fileExtension}`,
    file,
  );
}
/**
 * This should never be linked to directly. Instead, use the `#utils/misc`
 * module. This will automatically pick the correct implementation for the
 * current environment. See package.json for the mapping.
 *
 * Generates a secure UUID.
 */
export function generateUUIDNode(options?: RandomUUIDOptions) {
  return randomUUID(options);
}

export function writeFileNode(
  path: string,
  name: string,
  data: Uint8Array,
): Promise<string> {
  const filePath = join(path, name);
  fs.mkdirSync(path, { recursive: true });

  return new Promise((resolve, reject) => {
    try {
      fs.writeFile(filePath, data, {}, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve(filePath);
        }
      });
    } catch (error: unknown) {
      if (error instanceof Error) {
        reject(error);
      } else {
        reject(new Error(String(error)));
      }
    }
  });
}

export function readFileNode(path: string) {
  return fs.readFileSync(path);
}

export function fetchFileNode(
  url: string,
): Promise<{ buffer: Buffer; mimeType?: string }> {
  return new Promise((resolve, reject) => {
    https
      .get(url, (resp) => {
        const data: Uint8Array[] = [];
        const mimeType = resp.headers["content-type"];
        resp.on("data", (chunk: Uint8Array) => {
          data.push(chunk);
        });

        resp.on("end", () => {
          resolve({ buffer: Buffer.concat(data), mimeType });
        });
      })
      .on("error", (err) => {
        reject(err);
      });
  });
}

export const getFileNode = async (file: string) => {
  return readFileNode(file);
};

export const hashNode = (data: BinaryLike, algorithm = "sha1") => {
  return createHash(algorithm).update(data).digest("base64");
};
