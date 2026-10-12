// Adapts the reactor's attachment client to the engine's AttachmentPort: both
// directions go through the filesystem, so a step's bytes never cross the
// worker's JSON IPC channel.
import type { AttachmentRef } from "@powerhousedao/reactor";
import type { AttachmentPort } from "../pieces/index.js";
import { FileTooLargeError, maxFileBytes } from "../pieces/index.js";
import { childLogger } from "document-model";
import { openAsBlob } from "node:fs";
import { open, rm } from "node:fs/promises";

const logger = childLogger(["workflow", "attachments"]);

// The slice of the attachment client the engine uses, structural so hosts need
// not install the attachments package; a type test pins it to IAttachmentClient.
export interface AttachmentClientLike {
  upload(input: {
    file: Blob;
    fileName?: string;
    mimeType?: string;
    signal?: AbortSignal;
  }): Promise<{ ref: string }>;
  // Streamed rather than materialized: the size limit has to refuse an
  // oversized attachment before its bytes are in this process's memory.
  download(input: {
    documentId: string;
    ref: AttachmentRef;
    signal?: AbortSignal;
  }): Promise<{
    header: { sizeBytes: number; mimeType: string; fileName: string };
    body: ReadableStream<Uint8Array>;
  }>;
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
        ref: ref as AttachmentRef,
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
      const contentType = header.mimeType !== "" ? header.mimeType : undefined;
      return { fileName: header.fileName, contentType };
    },

    async write(file, signal) {
      // A file-backed Blob: hashed natively and streamed, never held in memory.
      const { ref } = await client.upload({
        file: await openAsBlob(file.path),
        fileName: file.fileName,
        mimeType: file.contentType ?? "application/octet-stream",
        ...(signal ? { signal } : {}),
      });
      access.onWritten?.(ref);
      logger.debug(`Ingested ${file.fileName} (${file.size} bytes) as ${ref}`);
      return ref;
    },
  };
}
