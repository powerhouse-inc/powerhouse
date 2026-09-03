// Default TriggerFilesService: inlines the file as a data: URI so payloads
// stay self-contained; hosts inject a real storage-backed service instead.
import type { TriggerFilesService } from "./trigger.js";

const MAX_INLINE_FILE_BYTES = 8 * 1024 * 1024;

export class FileTooLargeError extends Error {
  constructor(size: number) {
    super(`File of ${size} bytes exceeds the ${MAX_INLINE_FILE_BYTES} inline cap`);
    this.name = "FileTooLargeError";
  }
}

export class DataUriFilesService implements TriggerFilesService {
  write(file: { fileName?: string; data: Buffer }): Promise<string> {
    const data = Buffer.isBuffer(file.data)
      ? file.data
      : Buffer.from(file.data);
    if (data.byteLength > MAX_INLINE_FILE_BYTES) {
      return Promise.reject(new FileTooLargeError(data.byteLength));
    }
    return Promise.resolve(
      `data:application/octet-stream;base64,${data.toString("base64")}`,
    );
  }
}
