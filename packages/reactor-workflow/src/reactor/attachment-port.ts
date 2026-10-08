// Adapts the reactor's attachment client to the engine's AttachmentPort: both
// directions go through the filesystem, so a step's bytes never cross the
// worker's JSON IPC channel.
import type { AttachmentPort } from "../pieces/index.js";
import { FileTooLargeError, maxFileBytes } from "../pieces/index.js";
import { childLogger } from "document-model";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, rm } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import type { ReadableStream as NodeWebStream } from "node:stream/web";

const logger = childLogger(["workflow", "attachments"]);

// The slice of IAttachmentClient this needs, declared structurally so the
// subgraph does not depend on the attachments package's types.
export interface AttachmentClientLike {
  upload(
    input:
      | { file: Blob; fileName?: string; mimeType?: string }
      | { preprocessed: PreprocessedUpload; signal?: AbortSignal },
  ): Promise<{ ref?: string } & Record<string, unknown>>;
  // Streamed rather than materialized: the size limit has to refuse an
  // oversized attachment before its bytes are in this process's memory.
  download(input: {
    documentId: string;
    ref: string;
    signal?: AbortSignal;
  }): Promise<{
    header: { sizeBytes?: number; mimeType?: string; fileName?: string };
    body: ReadableStream<Uint8Array>;
  }>;
}

// The client's PreprocessResult: hash, reservation options and the bytes as a
// stream, so a file on disk is uploaded without being read into memory.
export interface PreprocessedUpload {
  ref: string;
  hash: string;
  sizeBytes: number;
  options: {
    mimeType: string;
    fileName: string;
    extension?: string | null;
    clientHash: string;
    sizeBytes: number;
  };
  data: ReadableStream<Uint8Array>;
  stream: () => ReadableStream<Uint8Array>;
}

function fileStream(filePath: string): ReadableStream<Uint8Array> {
  return Readable.toWeb(
    createReadStream(filePath),
  ) as NodeWebStream<Uint8Array> as unknown as ReadableStream<Uint8Array>;
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk as Buffer);
  }
  return hash.digest("hex");
}

function refOf(result: Record<string, unknown>): string {
  const direct = result.ref;
  if (typeof direct === "string") return direct;
  // Some client versions nest the reference under the reservation.
  const nested = (result.reservation as { ref?: unknown } | undefined)?.ref;
  if (typeof nested === "string") return nested;
  throw new Error("The attachment store returned no reference for the upload");
}

// Writes the body out while counting it, so a stream that outgrows the limit
// is cancelled mid-flight and its partial file removed.
async function writeCapped(
  body: ReadableStream<Uint8Array>,
  destPath: string,
  limit: number,
): Promise<void> {
  const reader = body.getReader();
  const handle = await open(destPath, "w");
  let written = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      written += value.byteLength;
      if (written > limit) {
        await reader.cancel();
        throw new FileTooLargeError(written, limit);
      }
      await handle.write(value);
    }
  } catch (error) {
    await handle.close();
    await rm(destPath, { force: true });
    throw error;
  }
  await handle.close();
}

export interface AttachmentPortAccess {
  // The workflow document a download is made under.
  documentIdFor: () => string | undefined;
  // Whether the running workflow may read the ref.
  canReadRef: (ref: string) => Promise<boolean>;
  // Told about every ref a step wrote, so the run may read it back.
  onWritten?: (ref: string) => void;
}

export function createAttachmentPort(
  client: AttachmentClientLike,
  access: AttachmentPortAccess,
): AttachmentPort {
  const authorize = async (ref: string): Promise<string> => {
    const documentId = access.documentIdFor();
    if (!documentId) {
      throw new Error(
        `Cannot resolve ${ref}: no workflow document is in scope to authorize the read`,
      );
    }
    if (!(await access.canReadRef(ref))) {
      throw new Error(
        `Cannot resolve ${ref}: workflow "${documentId}" may not read it`,
      );
    }
    return documentId;
  };
  return {
    async authorize(ref) {
      await authorize(ref);
    },

    async read(ref, destPath, signal) {
      const documentId = await authorize(ref);
      const limit = maxFileBytes();
      const { header, body } = await client.download({
        documentId,
        ref,
        ...(signal ? { signal } : {}),
      });
      // The declared size refuses before a byte is read; writeCapped's own
      // count is what catches a header that understated the body.
      if (
        typeof header.sizeBytes === "number" &&
        Number.isFinite(header.sizeBytes) &&
        header.sizeBytes > limit
      ) {
        await body.cancel().catch(() => undefined);
        throw new FileTooLargeError(header.sizeBytes, limit);
      }
      await writeCapped(body, destPath, limit);
      const contentType =
        header.mimeType !== undefined && header.mimeType !== ""
          ? header.mimeType
          : undefined;
      return { fileName: header.fileName, contentType };
    },

    async write(file, signal) {
      // Hashed and uploaded straight from disk: the host never holds the file.
      const hash = await sha256File(file.path);
      const mimeType = file.contentType ?? "application/octet-stream";
      const extension = path.extname(file.fileName).slice(1);
      const preprocessed: PreprocessedUpload = {
        ref: `attachment://v1:${hash}`,
        hash,
        sizeBytes: file.size,
        options: {
          mimeType,
          fileName: file.fileName,
          ...(extension ? { extension } : {}),
          clientHash: hash,
          sizeBytes: file.size,
        },
        data: fileStream(file.path),
        stream: () => fileStream(file.path),
      };
      const result = await client.upload({
        preprocessed,
        ...(signal ? { signal } : {}),
      });
      const ref = refOf(result);
      access.onWritten?.(ref);
      logger.debug(`Ingested ${file.fileName} (${file.size} bytes) as ${ref}`);
      return ref;
    },
  };
}
