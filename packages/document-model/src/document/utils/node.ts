import {
  type BinaryLike,
  type RandomUUIDOptions,
  createHash,
  randomUUID,
} from "node:crypto";
import fs from "node:fs";
import https from "node:https";
import { join } from "node:path";

/**
 * This should never be linked to directly. Instead, use the `#utils/misc`
 * module. This will automatically pick the correct implementation for the
 * current environment. See package.json for the mapping.
 *
 * Generates a secure UUID.
 */
export function generateUUID(options?: RandomUUIDOptions) {
  return randomUUID(options);
}

export function writeFile(
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
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      reject(error);
    }
  });
}

export function readFile(path: string) {
  return fs.readFileSync(path);
}

export function fetchFile(
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

export const getFile = async (file: string) => {
  return readFile(file);
};

export const hash = (data: BinaryLike, algorithm = "sha1") => {
  return createHash(algorithm).update(data).digest("base64");
};
