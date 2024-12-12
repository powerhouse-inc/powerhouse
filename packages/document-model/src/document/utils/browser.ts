import type { Buffer } from "buffer";
import { createHash as createSha1Hash } from "sha1-uint8array";

const FileSystemError = new Error("File system not available.");

export function generateUUID() {
  return crypto.randomUUID();
}

export function writeFile(
  path: string,
  name: string,
  stream: Uint8Array,
): Promise<string> {
  throw FileSystemError;
}

export function readFile(path: string) {
  throw FileSystemError;
}

export function fetchFile(
  url: string,
): Promise<{ data: Buffer; mimeType?: string }> {
  throw FileSystemError;
}

export const getFile = async (file: string) => {
  return readFile(file);
};

export const hash = (
  data: string | Uint8Array | ArrayBufferView | DataView,
  algorithm = "sha1",
) => {
  if (!["sha1"].includes(algorithm)) {
    throw new Error("Hashing algorithm not supported: Available: sha1");
  }

  const hash = hashUIntArray(data);
  return uint8ArrayToBase64(hash);
};

function uint8ArrayToBase64(uint8Array: Uint8Array) {
  // Convert the Uint8Array to a binary string
  let binaryString = "";
  for (let i = 0; i < uint8Array.length; i++) {
    binaryString += String.fromCharCode(uint8Array[i]);
  }

  // Encode the binary string to base64
  const base64String = btoa(binaryString);
  return base64String;
}

function hashUIntArray(
  data: string | Uint8Array | ArrayBufferView,
  algorithm = "sha1",
) {
  if (!["sha1"].includes(algorithm)) {
    throw new Error("Hashing algorithm not supported: Available: sha1");
  }
  return createSha1Hash("sha1")
    .update(data as string)
    .digest();
}
