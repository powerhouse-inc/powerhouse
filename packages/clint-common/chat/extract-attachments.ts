/**
 * Extracts IMAGE and FILE content parts from chat messages and writes them
 * to {workdir}/downloads/ so the agent's tools can read them.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  Logger,
  IAttachmentService,
  AttachmentRef,
} from "@powerhousedao/clint";
import type {
  ContentPart,
  Message,
} from "@powerhousedao/clint-common/document-models/chat-session";

const TAG = "[extract-attachments]";

export interface ExtractedAttachment {
  partId: string;
  /** The original content part type ('IMAGE' | 'FILE'). */
  partType: "IMAGE" | "FILE";
  filename: string;
  localPath: string;
  mediaType: string | null;
  /** Resolved bytes — available for callers that need to pass the data onward (e.g. native image parts). */
  bytes: Buffer;
}

export interface ExtractAttachmentsOptions {
  workdir: string;
  /** The chat document: the dedup key, and the document `service.get` reads through. */
  documentId: string;
  log?: Logger;
  /** Attachment service for resolving attachment:// refs. When omitted, ref-based parts are skipped. */
  service?: IAttachmentService;
  /** Also return parts extracted by an earlier call (read back from disk), for a message sent to the agent again. */
  includeExtracted?: boolean;
}

/** Already-extracted parts (without bytes), keyed by documentId, then part id. */
const extracted = new Map<
  string,
  Map<string, Omit<ExtractedAttachment, "bytes">>
>();

/**
 * Clear the in-memory dedup cache (for testing).
 */
export function resetExtractedCache(): void {
  extracted.clear();
}

const MIME_TO_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
  "image/bmp": ".bmp",
  "image/tiff": ".tiff",
  "application/pdf": ".pdf",
  "text/plain": ".txt",
  "text/csv": ".csv",
  "text/html": ".html",
  "application/json": ".json",
  "application/xml": ".xml",
  "application/zip": ".zip",
};

export function extensionForMediaType(
  mediaType: string | null | undefined,
  contentType: "IMAGE" | "FILE",
): string {
  if (mediaType && MIME_TO_EXT[mediaType]) {
    return MIME_TO_EXT[mediaType];
  }
  return contentType === "IMAGE" ? ".png" : ".bin";
}

export function resolveFilename(
  part: ContentPart,
  mediaTypeOverride?: string | null,
): string {
  const ext = extensionForMediaType(
    mediaTypeOverride ?? part.mediaType,
    part.type as "IMAGE" | "FILE",
  );
  let basename: string;

  if (part.filename) {
    // Strip any existing extension from the user-provided filename
    const dotIdx = part.filename.lastIndexOf(".");
    basename = dotIdx > 0 ? part.filename.slice(0, dotIdx) : part.filename;
  } else {
    basename = "attachment";
  }

  const idSuffix = part.id.slice(0, 6);
  return `${basename}_${idSuffix}${ext}`;
}

export async function extractAttachments(
  message: Message,
  options: ExtractAttachmentsOptions,
): Promise<ExtractedAttachment[]> {
  const { workdir, documentId, log, service, includeExtracted } = options;

  const attachmentParts = message.content.filter(
    (p: ContentPart) => p.type === "IMAGE" || p.type === "FILE",
  );

  if (attachmentParts.length === 0) return [];

  // Dedup map for this document
  let seen = extracted.get(documentId);
  if (!seen) {
    seen = new Map();
    extracted.set(documentId, seen);
  }

  const results: ExtractedAttachment[] = [];
  const downloadsDir = join(workdir, "downloads");

  for (const part of attachmentParts) {
    const cached = seen.get(part.id);
    if (cached) {
      if (!includeExtracted) continue;
      try {
        results.push({ ...cached, bytes: await readFile(cached.localPath) });
        continue;
      } catch (err) {
        // Gone from disk: extract it again.
        log?.warn(
          `${TAG} could not read extracted part ${part.id} back, extracting it again:`,
          err,
        );
        seen.delete(part.id);
      }
    }

    try {
      let buf: Buffer | null = null;
      let resolvedMediaType: string | null = part.mediaType ?? null;

      if (part.attachment) {
        if (!service) {
          log?.warn(
            `${TAG} part ${part.id} has attachment ref but no service is wired, skipping`,
          );
          continue;
        }
        // The document authorizes the read: a switchboard serves an
        // attachment only through a document that references it.
        const resp = await service.get(part.attachment as AttachmentRef, {
          documentId,
        });
        buf = Buffer.from(await new Response(resp.body).arrayBuffer());
        // Use the authoritative mediaType from the service header.
        resolvedMediaType = resp.header.mimeType;
      } else if (part.url) {
        const resp = await fetch(part.url);
        if (!resp.ok) {
          log?.warn(`${TAG} fetch failed for ${part.url}: ${resp.status}`);
          continue;
        }
        buf = Buffer.from(await resp.arrayBuffer());
      } else {
        log?.warn(`${TAG} part ${part.id} has no attachment or url, skipping`);
        continue;
      }

      const filename = resolveFilename(part, resolvedMediaType);
      const localPath = join(downloadsDir, filename);

      await mkdir(downloadsDir, { recursive: true });
      await writeFile(localPath, buf);

      const entry = {
        partId: part.id,
        partType: part.type as "IMAGE" | "FILE",
        filename,
        localPath,
        mediaType: resolvedMediaType,
      };
      seen.set(part.id, entry);
      results.push({ ...entry, bytes: buf });
    } catch (err) {
      log?.error(`${TAG} failed to extract part ${part.id}:`, err);
    }
  }

  return results;
}
