import { FileSystemError } from "./errors.js";

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
