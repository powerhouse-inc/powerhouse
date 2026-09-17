// Adapts the reactor's attachment client to the engine's AttachmentPort: both
// directions go through the filesystem, so a step's bytes never cross the
// worker's JSON IPC channel.
import type { AttachmentPort } from "../pieces/index.js";
import { FileTooLargeError, maxFileBytes } from "../pieces/index.js";
import { childLogger } from "document-model";
import { open, readFile, rm } from "node:fs/promises";

const logger = childLogger(["workflow", "attachments"]);

// The slice of IAttachmentClient this needs, declared structurally so the
// subgraph does not depend on the attachments package's types.
export interface AttachmentClientLike {
  upload(input: {
    file: Blob;
    fileName?: string;
    mimeType?: string;
  }): Promise<{ ref?: string } & Record<string, unknown>>;
  // Streamed rather than materialized: the size limit has to refuse an
  // oversized attachment before its bytes are in this process's memory.
  download(input: { documentId: string; ref: string }): Promise<{
    header: { sizeBytes?: number; mimeType?: string; fileName?: string };
    body: ReadableStream<Uint8Array>;
  }>;
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

export function createAttachmentPort(
  client: AttachmentClientLike,
  // Attachment reads are authorized against a document, and a step's refs come
  // from its own run journal: the workflow document is what vouches for them.
  documentIdFor: () => string | undefined,
  // Whether that document really references the ref. A step carries no caller,
  // so this relationship is all that stands between it and any known blob.
  canReadRef: (documentId: string, ref: string) => Promise<boolean>,
): AttachmentPort {
  return {
    async read(ref, destPath) {
      const documentId = documentIdFor();
      if (!documentId) {
        throw new Error(
          `Cannot resolve ${ref}: no workflow document is in scope to authorize the read`,
        );
      }
      if (!(await canReadRef(documentId, ref))) {
        throw new Error(
          `Cannot resolve ${ref}: workflow document "${documentId}" does not reference it`,
        );
      }
      const limit = maxFileBytes();
      const { header, body } = await client.download({ documentId, ref });
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

    async write(file) {
      const bytes = await readFile(file.path);
      const result = await client.upload({
        file: new Blob([new Uint8Array(bytes)], {
          type: file.contentType ?? "application/octet-stream",
        }),
        fileName: file.fileName,
        mimeType: file.contentType,
      });
      const ref = refOf(result);
      logger.debug(`Ingested ${file.fileName} (${file.size} bytes) as ${ref}`);
      return ref;
    },
  };
}
