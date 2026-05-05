import {
  AttachmentNotFound,
  InvalidAttachmentRef,
  ReservationNotFound,
  type AttachmentBuildResult,
  type ReserveAttachmentOptions,
} from "@powerhousedao/reactor-attachments";
import type { AttachmentHash } from "@powerhousedao/reactor";
import { childLogger } from "document-model";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

const logger = childLogger(["switchboard", "attachments"]);

const HASH_PATTERN = /^[a-f0-9]{64}$/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x1f\x7f]/;
// RFC 6838 token chars; allows optional `; param=value` pairs (token or quoted-string).
const MIME_TYPE_PATTERN =
  /^[!#$%&'*+\-.^_`|~\w]+\/[!#$%&'*+\-.^_`|~\w]+(?:\s*;\s*[!#$%&'*+\-.^_`|~\w]+=(?:[!#$%&'*+\-.^_`|~\w]+|"(?:[^"\\\r\n]|\\[^\r\n])*"))*$/;
const MAX_FILENAME_LEN = 255;
const MAX_MIMETYPE_LEN = 255;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function sendError(res: ServerResponse, status: number, message: string): void {
  sendJson(res, status, { error: message });
}

function statusForError(err: unknown): number {
  if (err instanceof AttachmentNotFound) return 404;
  if (err instanceof ReservationNotFound) return 404;
  if (err instanceof InvalidAttachmentRef) return 400;
  return 500;
}

function sendErrorFromException(res: ServerResponse, err: unknown): void {
  const status = statusForError(err);
  if (status >= 500) {
    logger.error("Attachment route error: @error", err);
    sendError(res, status, "Internal error");
    return;
  }
  sendError(res, status, err instanceof Error ? err.message : String(err));
}

async function readJsonBody(
  req: IncomingMessage,
  body: unknown,
): Promise<unknown> {
  // The Express body-parser may have already populated `body`. When that
  // happens we trust it; otherwise read the raw stream ourselves so this
  // module is independent of upstream middleware ordering.
  if (body !== undefined && body !== null && typeof body === "object") {
    return body;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return undefined;
  const text = Buffer.concat(chunks).toString("utf8");
  if (text.length === 0) return undefined;
  return JSON.parse(text);
}

export function parseReserveOptions(
  input: unknown,
): ReserveAttachmentOptions | null {
  if (input === null || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;
  if (
    typeof obj.mimeType !== "string" ||
    obj.mimeType.length === 0 ||
    obj.mimeType.length > MAX_MIMETYPE_LEN ||
    !MIME_TYPE_PATTERN.test(obj.mimeType)
  ) {
    return null;
  }
  if (
    typeof obj.fileName !== "string" ||
    obj.fileName.length === 0 ||
    obj.fileName.length > MAX_FILENAME_LEN ||
    CONTROL_CHARS.test(obj.fileName)
  ) {
    return null;
  }
  let extension: string | null = null;
  if (typeof obj.extension === "string") {
    if (obj.extension.length === 0 || /[\\/]/.test(obj.extension)) return null;
    extension = obj.extension;
  } else if (obj.extension !== undefined && obj.extension !== null) {
    return null;
  }
  return {
    mimeType: obj.mimeType,
    fileName: obj.fileName,
    extension,
  };
}

export function quoteFilename(name: string): string {
  // RFC 6266: quoted-string with internal " and \ escaped.
  return `"${name.replace(/[\\"]/g, "\\$&")}"`;
}

export function buildContentDisposition(fileName: string): string {
  // ASCII fallback: replace any byte outside printable ASCII (0x20-0x7e),
  // plus `"` and `\`, with `_`. Browsers fall back to this when they don't
  // grok `filename*=`; the modern parameter carries the real name.
  const ascii = fileName.replace(/[^\x20-\x21\x23-\x5b\x5d-\x7e]/g, "_");
  // RFC 5987: percent-encode UTF-8 bytes. encodeURIComponent leaves a few
  // chars that 5987 disallows in token; re-encode them.
  const encoded = encodeURIComponent(fileName).replace(
    /['()*!]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename=${quoteFilename(ascii)}; filename*=UTF-8''${encoded}`;
}

export function makeReserveHandler(attachments: AttachmentBuildResult) {
  return async (
    req: IncomingMessage,
    res: ServerResponse,
    body?: unknown,
  ): Promise<void> => {
    let parsed: unknown;
    try {
      parsed = await readJsonBody(req, body);
    } catch {
      sendError(res, 400, "Invalid JSON body");
      return;
    }
    const opts = parseReserveOptions(parsed);
    if (!opts) {
      sendError(
        res,
        400,
        "Body must be { mimeType: string (type/subtype), fileName: string (no control characters, max 255 chars), extension?: string|null }",
      );
      return;
    }
    try {
      const upload = await attachments.service.reserve(opts);
      sendJson(res, 201, { reservationId: upload.reservationId });
    } catch (err) {
      sendErrorFromException(res, err);
    }
  };
}

export function makeUploadHandler(attachments: AttachmentBuildResult) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const reservationId = extractParam(req, "reservationId");
    if (!reservationId) {
      sendError(res, 400, "Missing reservationId");
      return;
    }

    let reservation;
    try {
      reservation = await attachments.reservations.get(reservationId);
    } catch (err) {
      sendErrorFromException(res, err);
      return;
    }

    const upload = attachments.uploadFactory.createUpload(
      reservation.reservationId,
      {
        mimeType: reservation.mimeType,
        fileName: reservation.fileName,
        extension: reservation.extension,
      },
    );

    const webStream = Readable.toWeb(
      req as Readable,
    ) as ReadableStream<Uint8Array>;

    try {
      const result = await upload.send(webStream);
      sendJson(res, 200, result);
    } catch (err) {
      sendErrorFromException(res, err);
    }
  };
}

export function makeDownloadHandler(attachments: AttachmentBuildResult) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const hash = extractParam(req, "hash");
    if (!hash || !HASH_PATTERN.test(hash)) {
      sendError(res, 400, "Invalid attachment hash");
      return;
    }

    const controller = new AbortController();
    req.once("close", () => controller.abort());

    let response;
    try {
      response = await attachments.store.get(
        hash as AttachmentHash,
        controller.signal,
      );
    } catch (err) {
      sendErrorFromException(res, err);
      return;
    }

    const { header, body } = response;
    res.statusCode = 200;
    res.setHeader("Content-Type", header.mimeType);
    res.setHeader("Content-Length", String(header.sizeBytes));
    res.setHeader(
      "Content-Disposition",
      buildContentDisposition(header.fileName),
    );
    res.setHeader("X-Attachment-Metadata", buildMetadataHeader(header));

    Readable.fromWeb(body as unknown as NodeReadableStream<Uint8Array>).pipe(
      res,
    );
  };
}

function buildMetadataHeader(header: {
  mimeType: string;
  fileName: string;
  sizeBytes: number;
  extension: string | null;
  createdAtUtc: string;
  lastAccessedAtUtc: string;
}): string {
  return JSON.stringify({
    mimeType: header.mimeType,
    fileName: header.fileName,
    sizeBytes: header.sizeBytes,
    extension: header.extension,
    createdAtUtc: header.createdAtUtc,
    lastAccessedAtUtc: header.lastAccessedAtUtc,
  });
}

export function makeStatHandler(attachments: AttachmentBuildResult) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const hash = extractParam(req, "hash");
    if (!hash || !HASH_PATTERN.test(hash)) {
      sendError(res, 400, "Invalid attachment hash");
      return;
    }

    let header;
    try {
      header = await attachments.store.stat(hash as AttachmentHash);
    } catch (err) {
      sendErrorFromException(res, err);
      return;
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", header.mimeType);
    res.setHeader("Content-Length", String(header.sizeBytes));
    res.setHeader(
      "Content-Disposition",
      buildContentDisposition(header.fileName),
    );
    res.setHeader("X-Attachment-Metadata", buildMetadataHeader(header));
    res.end();
  };
}

export function makeGetReservationHandler(attachments: AttachmentBuildResult) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const reservationId = extractParam(req, "reservationId");
    if (!reservationId) {
      sendError(res, 400, "Missing reservationId");
      return;
    }
    try {
      const reservation = await attachments.reservations.get(reservationId);
      sendJson(res, 200, reservation);
    } catch (err) {
      sendErrorFromException(res, err);
    }
  };
}

export function makeDeleteReservationHandler(
  attachments: AttachmentBuildResult,
) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const reservationId = extractParam(req, "reservationId");
    if (!reservationId) {
      sendError(res, 400, "Missing reservationId");
      return;
    }
    try {
      await attachments.reservations.delete(reservationId);
      res.statusCode = 204;
      res.end();
    } catch (err) {
      sendErrorFromException(res, err);
    }
  };
}

function extractParam(req: IncomingMessage, name: string): string | undefined {
  const expressParams = (
    req as IncomingMessage & {
      params?: Record<string, string>;
    }
  ).params;
  return expressParams?.[name];
}
