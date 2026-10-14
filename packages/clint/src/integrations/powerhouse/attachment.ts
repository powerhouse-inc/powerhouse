// Attachment-service accessor + file helpers shared by the attachment-* commands.
import { openAsBlob } from "node:fs";
import { extname } from "node:path";
import type { CommandContext } from "../../core/types.js";
import type { AttachmentRef, IAttachmentService } from "./types.js";

export async function getAttachmentService(
  ctx: Pick<CommandContext, "folders" | "reactor">,
): Promise<IAttachmentService | undefined> {
  if (!ctx.folders) return undefined; // daemon-only; never boot a reactor for this
  const rc = await ctx.reactor?.();
  return rc?.attachments;
}

export function attachmentsUnavailableMessage(): string {
  return (
    "Attachments need a running reactor (daemon mode) with the embedded " +
    "Switchboard started; none is available in this context."
  );
}

// Type bridge; the ref format is validated server-side.
export function asRef(ref: string): AttachmentRef {
  return ref as AttachmentRef;
}

// Duck-typed: reactor-attachments duplicates this error across its `.` and `/client` bundles, so instanceof is unreliable.
export function isAttachmentAlreadyExists(
  err: unknown,
): err is { ref: string; hash: string } {
  if (!(err instanceof Error)) return false;
  if (!("ref" in err) || !("hash" in err)) return false;
  return (
    err.constructor.name === "AttachmentAlreadyExists" ||
    /already exists/i.test(err.message)
  );
}

// Extension → MIME; falls back to octet-stream, override via mimeType.
const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".json": "application/json",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".csv": "text/csv",
};

export function inferMimeType(filePath: string, override?: string): string {
  if (override) return override;
  return (
    MIME_BY_EXT[extname(filePath).toLowerCase()] ?? "application/octet-stream"
  );
}

export async function fileToBlob(
  filePath: string,
  mimeType: string,
): Promise<Blob> {
  return openAsBlob(filePath, { type: mimeType });
}
