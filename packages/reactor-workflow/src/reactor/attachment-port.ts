// Adapts the reactor's attachment client to the engine's AttachmentPort: both
// directions go through the filesystem, so a step's bytes never cross the
// worker's JSON IPC channel.
import type { AttachmentPort } from "@powerhousedao/reactor-connectors";
import { childLogger } from "document-model";
import { readFile, writeFile } from "node:fs/promises";

const logger = childLogger(["workflow", "attachments"]);

// The slice of IAttachmentClient this needs, declared structurally so the
// subgraph does not depend on the attachments package's types.
export interface AttachmentClientLike {
  upload(input: {
    file: Blob;
    fileName?: string;
    mimeType?: string;
  }): Promise<{ ref?: string } & Record<string, unknown>>;
  downloadBlob(input: {
    documentId: string;
    ref: string;
  }): Promise<{ blob: Blob } & Record<string, unknown>>;
}

function refOf(result: Record<string, unknown>): string {
  const direct = result.ref;
  if (typeof direct === "string") return direct;
  // Some client versions nest the reference under the reservation.
  const nested = (result.reservation as { ref?: unknown } | undefined)?.ref;
  if (typeof nested === "string") return nested;
  throw new Error("The attachment store returned no reference for the upload");
}

export function createAttachmentPort(
  client: AttachmentClientLike,
  // Attachment reads are authorized against a document. A step's references
  // come from its own run journal, so the workflow document is the one that
  // vouches for them.
  documentIdFor: () => string | undefined,
): AttachmentPort {
  return {
    async read(ref, destPath) {
      const documentId = documentIdFor();
      if (!documentId) {
        throw new Error(
          `Cannot resolve ${ref}: no workflow document is in scope to authorize the read`,
        );
      }
      const result = await client.downloadBlob({ documentId, ref });
      const bytes = Buffer.from(await result.blob.arrayBuffer());
      await writeFile(destPath, bytes);
      const fileName =
        typeof result.fileName === "string" ? result.fileName : undefined;
      const contentType =
        result.blob.type !== "" ? result.blob.type : undefined;
      return { fileName, contentType };
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
