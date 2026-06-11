import {
  baseLoadFromInput,
  baseLoadFromInputVersioned,
  createMinimalZip,
  createZip,
  type MinimalBackupData,
  type PHBaseState,
  type PHDocument,
  type Reducer,
  type ReplayDocumentOptions,
  type VersionedReplayConfig,
} from "@powerhousedao/shared/document-model";
import type { BinaryLike } from "node:crypto";
import { createHash } from "node:crypto";
import fs from "node:fs";
import https from "node:https";
import { join } from "node:path";

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

export const getFileNode = (file: string) => {
  return Promise.resolve(readFileNode(file));
};

export const hashNode = (
  data: BinaryLike,
  algorithm = "sha1",
  encoding: "base64" | "hex" = "base64",
  _params?: Record<string, unknown>,
) => {
  if (!["sha1", "sha256", "sha512"].includes(algorithm)) {
    throw new Error(
      `Hashing algorithm not supported: "${algorithm}". Available: sha1, sha256, sha512`,
    );
  }

  if (!["base64", "hex"].includes(encoding)) {
    throw new Error(
      `Hash encoding not supported: "${encoding}". Available: base64, hex`,
    );
  }

  return createHash(algorithm).update(data).digest(encoding);
};

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
  TState extends PHBaseState = PHBaseState,
>(
  path: string,
  reducer: Reducer<TState>,
  options?: ReplayDocumentOptions,
): Promise<PHDocument<TState>> {
  const file = readFileNode(path);
  return baseLoadFromInput(file, reducer, options);
}

/**
 * Loads a version-aware document from a ZIP file.
 *
 * @typeParam TState - The type of the state object.
 * @param path - The path to the ZIP file.
 * @param config - Versioned replay config with per-version reducers and optional upgrade manifest.
 * @param options - Optional replay options.
 * @returns A promise that resolves to the document state after versioned replay.
 */
export async function baseLoadFromFileVersioned<
  TState extends PHBaseState = PHBaseState,
>(
  path: string,
  config: VersionedReplayConfig,
  options?: ReplayDocumentOptions,
): Promise<PHDocument<TState>> {
  const file = readFileNode(path);
  return baseLoadFromInputVersioned<TState>(file, config, options);
}

/**
 * Saves a minimal document backup to a .phd file.
 * Used when the full document is not available (e.g., in onOperations handler).
 * Creates a file with minimal header and empty operations.
 */
export async function baseMinimalSaveToFile(
  data: MinimalBackupData,
  path: string,
  extension: string,
) {
  const file = await createMinimalZip(data);
  const fileExtension = extension ? `.${extension}.phd` : ".phd";

  return writeFileNode(
    path,
    data.name.endsWith(fileExtension)
      ? data.name
      : `${data.name}${fileExtension}`,
    file,
  );
}

/**
 * Saves a document to a ZIP file.
 *
 * @remarks
 * This function creates a ZIP file containing the document's state and
 * operations. The file is saved to the specified path.
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
  const file = await createZip(document);
  const fileName = name ?? document.header.name;
  const fileExtension = extension ? `.${extension}.phd` : ".phd";

  return writeFileNode(
    path,
    fileName.endsWith(fileExtension) ? fileName : `${fileName}${fileExtension}`,
    file,
  );
}
