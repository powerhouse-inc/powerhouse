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
import { createWriteStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  assertWithinLimit,
  byteCap,
  FileTooLargeError,
  maxFileBytes,
} from "./limits.js";

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

// What a piece may hand ctx.files.write: upstream takes a Buffer or a Readable.
export type ApFileData = Buffer | Uint8Array | Readable;

// The framework's FilesService for both actions and triggers, with fileName
// optional.
export interface ApFilesService {
  write(file: { fileName?: string; data: ApFileData }): Promise<string>;
}

// A Readable drained into memory under the cap, for the inline fallback.
async function drain(data: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of data.pipe(byteCap())) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

// Default for both actions and triggers when the host injects nothing: inline
// the bytes as a data URI so the payload stays self-contained. Bounded by the
// shared cap, since a data URI lands in the run journal.
export class DataUriFilesService implements ApFilesService {
  async write(file: { fileName?: string; data: ApFileData }): Promise<string> {
    const data =
      file.data instanceof Readable
        ? await drain(file.data)
        : Buffer.isBuffer(file.data)
          ? file.data
          : Buffer.from(file.data);
    if (data.byteLength > maxFileBytes()) {
      throw new FileTooLargeError(data.byteLength);
    }
    return `data:application/octet-stream;base64,${data.toString("base64")}`;
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
export class StagedFilesService implements ApFilesService {
  private readonly files: StagedFile[] = [];

  constructor(private readonly stagingDir: string) {}

  staged(): StagedFile[] {
    return [...this.files];
  }

  async write(file: { fileName?: string; data: ApFileData }): Promise<string> {
    const token = randomUUID();
    const fileName =
      file.fileName && file.fileName !== "" ? file.fileName : token;
    const target = path.join(this.stagingDir, token);
    let size: number;
    if (file.data instanceof Readable) {
      // Capped while it streams to disk: a piece cannot fill the disk with a
      // file the host would refuse anyway.
      await mkdir(this.stagingDir, { recursive: true });
      try {
        await pipeline(file.data, byteCap(), createWriteStream(target));
      } catch (error) {
        await rm(target, { force: true });
        throw error;
      }
      size = (await stat(target)).size;
    } else {
      const data = Buffer.isBuffer(file.data)
        ? file.data
        : Buffer.from(file.data);
      // Checked before anything touches the disk, for the same reason.
      assertWithinLimit(data.byteLength);
      await mkdir(this.stagingDir, { recursive: true });
      await writeFile(target, data);
      size = data.byteLength;
    }
    this.files.push({
      token: `${APFILE_SCHEME}${token}`,
      path: target,
      fileName,
      size,
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
