import {
  AttachmentNotFound,
  InvalidAttachmentRef,
  ReservationNotFound,
  type AttachmentBuildResult,
  type ReserveAttachmentOptions,
} from "@powerhousedao/reactor-attachments";
import type { AttachmentHash } from "@powerhousedao/reactor";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";

const HASH_PATTERN = /^[a-f0-9]{64}$/i;

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

function parseReserveOptions(input: unknown): ReserveAttachmentOptions | null {
  if (input === null || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;
  if (typeof obj.mimeType !== "string" || obj.mimeType.length === 0) {
    return null;
  }
  if (typeof obj.fileName !== "string" || obj.fileName.length === 0) {
    return null;
  }
  let extension: string | null | undefined;
  if (obj.extension === undefined || obj.extension === null) {
    extension = obj.extension as null | undefined;
  } else if (typeof obj.extension === "string") {
    extension = obj.extension;
  } else {
    return null;
  }
  return {
    mimeType: obj.mimeType,
    fileName: obj.fileName,
    extension,
  };
}

function quoteFilename(name: string): string {
  // RFC 6266: quoted-string with internal " and \ escaped.
  return `"${name.replace(/[\\"]/g, "\\$&")}"`;
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
        "Body must be { mimeType: string, fileName: string, extension?: string|null }",
      );
      return;
    }
    try {
      const upload = await attachments.service.reserve(opts);
      sendJson(res, 201, { reservationId: upload.reservationId });
    } catch (err) {
      sendError(res, statusForError(err), (err as Error).message);
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
      sendError(res, statusForError(err), (err as Error).message);
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
      sendError(res, statusForError(err), (err as Error).message);
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
      sendError(res, statusForError(err), (err as Error).message);
      return;
    }

    const { header, body } = response;
    res.statusCode = 200;
    res.setHeader("Content-Type", header.mimeType);
    res.setHeader("Content-Length", String(header.sizeBytes));
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${quoteFilename(header.fileName)}`,
    );
    res.setHeader(
      "X-Attachment-Metadata",
      JSON.stringify({
        mimeType: header.mimeType,
        fileName: header.fileName,
        sizeBytes: header.sizeBytes,
        extension: header.extension,
      }),
    );

    Readable.fromWeb(
      body as unknown as import("node:stream/web").ReadableStream<Uint8Array>,
    ).pipe(res);
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
