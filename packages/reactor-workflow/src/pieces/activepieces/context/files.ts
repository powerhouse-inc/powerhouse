// Two FilesService implementations plus the staged-file contract that carries
// bytes back to the host.
//
// `ctx.files.write()` is called *during* action.run(), inside the forked
// worker, and the worker protocol has no worker-to-host request channel. So
// this follows the pattern storeState already establishes — push in, return
// whole — using the one thing a fork shares with its parent: the filesystem.
// The worker writes bytes to a staging directory and returns a provisional
// `apfile://<token>`; the host ingests each staged file after the step returns
// and rewrites the tokens in the output before journalling it.
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertWithinLimit, FileTooLargeError, maxFileBytes } from "./limits.js";
import type { TriggerFilesService } from "./trigger.js";

export { FileTooLargeError, maxFileBytes };

export const APFILE_SCHEME = "apfile://";

// One file the piece wrote, as it crosses back on ResultResponse.files.
export interface StagedFile {
  // The provisional ref handed to the piece; the host rewrites it in place.
  token: string;
  path: string;
  fileName: string;
  size: number;
  contentType?: string;
}

export interface ActionFilesService {
  write(file: { fileName?: string; data: Buffer }): Promise<string>;
}

// Default for both actions and triggers when the host injects nothing: inline
// the bytes as a data URI so the payload stays self-contained. Bounded by the
// shared cap, since a data URI lands in the run journal.
export class DataUriFilesService implements TriggerFilesService {
  write(file: { fileName?: string; data: Buffer }): Promise<string> {
    const data = Buffer.isBuffer(file.data)
      ? file.data
      : Buffer.from(file.data);
    if (data.byteLength > maxFileBytes()) {
      return Promise.reject(new FileTooLargeError(data.byteLength));
    }
    return Promise.resolve(
      `data:application/octet-stream;base64,${data.toString("base64")}`,
    );
  }
}

const EXTENSION_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  tif: "image/tiff",
  tiff: "image/tiff",
  txt: "text/plain",
  json: "application/json",
  csv: "text/csv",
};

function contentTypeFor(fileName: string): string | undefined {
  const extension = fileName.split(".").pop()?.toLowerCase();
  return extension ? EXTENSION_TYPES[extension] : undefined;
}

// Worker-side service: writes into `<stagingDir>/<uuid>` and remembers what it
// wrote so the worker can report it on the response.
export class StagedFilesService implements ActionFilesService {
  private readonly files: StagedFile[] = [];

  constructor(private readonly stagingDir: string) {}

  staged(): StagedFile[] {
    return [...this.files];
  }

  async write(file: { fileName?: string; data: Buffer }): Promise<string> {
    const data = Buffer.isBuffer(file.data)
      ? file.data
      : Buffer.from(file.data);
    // Checked before the write: a piece must not be able to fill the disk by
    // handing over a file the host would refuse anyway.
    assertWithinLimit(data.byteLength);
    const token = randomUUID();
    const fileName = file.fileName && file.fileName !== "" ? file.fileName : token;
    const target = path.join(this.stagingDir, token);
    await mkdir(this.stagingDir, { recursive: true });
    await writeFile(target, data);
    this.files.push({
      token: `${APFILE_SCHEME}${token}`,
      path: target,
      fileName,
      size: data.byteLength,
      contentType: contentTypeFor(fileName),
    });
    return `${APFILE_SCHEME}${token}`;
  }
}

// Replaces every provisional token in a step output with the real ref the host
// got back from its attachment store. Walks the whole value: a piece may nest
// the ref anywhere, and a plain string replace over the serialized JSON would
// corrupt any base64 that happens to contain the token.
export function rewriteFileRefs(
  value: unknown,
  refs: Map<string, string>,
): unknown {
  if (refs.size === 0) return value;
  if (typeof value === "string") return refs.get(value) ?? value;
  if (Array.isArray(value)) {
    return value.map((entry) => rewriteFileRefs(entry, refs));
  }
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      out[key] = rewriteFileRefs(entry, refs);
    }
    return out;
  }
  return value;
}
