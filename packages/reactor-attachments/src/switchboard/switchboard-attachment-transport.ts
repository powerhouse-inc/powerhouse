import type { AttachmentHash } from "@powerhousedao/reactor";
import type { JwtHandler } from "@powerhousedao/reactor";
import type { IAttachmentTransport } from "../interfaces.js";
import type { AttachmentMetadata, TransportResponse } from "../types.js";
import { buildAuthHeaders } from "./build-auth-headers.js";

export type SwitchboardTransportConfig = {
  remoteUrl: string;
  jwtHandler?: JwtHandler;
  fetchFn?: typeof fetch;
};

export class SwitchboardAttachmentTransport implements IAttachmentTransport {
  private readonly remoteUrl: string;
  private readonly jwtHandler?: JwtHandler;
  private readonly fetchFn: typeof fetch;

  constructor(config: SwitchboardTransportConfig) {
    this.remoteUrl = config.remoteUrl;
    this.jwtHandler = config.jwtHandler;
    this.fetchFn = (config.fetchFn ?? globalThis.fetch).bind(globalThis);
  }

  async fetch(
    hash: AttachmentHash,
    signal?: AbortSignal,
  ): Promise<TransportResponse | null> {
    const url = `${this.remoteUrl}/attachments/${hash}`;
    const headers = await buildAuthHeaders(url, this.jwtHandler);

    const response = await this.fetchFn(url, { signal, headers });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(
        `Attachment fetch failed: ${response.status} ${response.statusText}`,
      );
    }

    const metadata = this.parseMetadataHeaders(response);
    const body = response.body;
    if (!body) {
      throw new Error("Response body is null");
    }

    return { hash, metadata, body };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async announce(_hash: AttachmentHash): Promise<void> {
    // No-op for switchboard -- data is already on the server after upload.
  }

  async push(
    hash: AttachmentHash,
    remote: string,
    data: ReadableStream<Uint8Array>,
  ): Promise<void> {
    const url = `${remote}/attachments/${hash}`;
    const headers = await buildAuthHeaders(url, this.jwtHandler);

    const response = await this.fetchFn(url, {
      method: "PUT",
      body: data,
      headers,
      // @ts-expect-error Node fetch requires duplex for streaming request bodies
      duplex: "half",
    });

    if (!response.ok) {
      throw new Error(
        `Attachment push failed: ${response.status} ${response.statusText}`,
      );
    }
  }

  private parseMetadataHeaders(response: Response): AttachmentMetadata {
    // Compute the fallback at most once; both the recovery path inside the
    // header parser and the outer "no header / parse failed" path share it.
    let fallbackCache: AttachmentMetadata | undefined;
    const fallback = (): AttachmentMetadata => {
      if (fallbackCache === undefined) {
        fallbackCache = contentTypeFallback(response);
      }
      return fallbackCache;
    };

    const metaHeader = response.headers.get("Attachment-Metadata");
    if (metaHeader) {
      try {
        const parsed: unknown = JSON.parse(metaHeader);
        if (isRecord(parsed)) {
          if (parsed.extension === undefined) {
            parsed.extension = null;
          }
          if (parsed.createdAtUtc === undefined) {
            parsed.createdAtUtc = fallback().createdAtUtc;
          }
          if (parsed.lastAccessedAtUtc === undefined) {
            parsed.lastAccessedAtUtc = fallback().lastAccessedAtUtc;
          }
        }
        if (isAttachmentMetadata(parsed)) {
          return parsed;
        }
      } catch {
        // fall through to Content-Type fallback
      }
    }
    return fallback();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAttachmentMetadata(value: unknown): value is AttachmentMetadata {
  if (!isRecord(value)) return false;
  if (typeof value.mimeType !== "string") return false;
  if (typeof value.fileName !== "string") return false;
  if (
    typeof value.sizeBytes !== "number" ||
    !Number.isFinite(value.sizeBytes) ||
    value.sizeBytes < 0
  ) {
    return false;
  }
  if (value.extension !== null && typeof value.extension !== "string") {
    return false;
  }
  if (typeof value.createdAtUtc !== "string") return false;
  if (
    value.lastAccessedAtUtc !== undefined &&
    typeof value.lastAccessedAtUtc !== "string"
  ) {
    return false;
  }
  return true;
}

function contentTypeFallback(response: Response): AttachmentMetadata {
  const contentLength = response.headers.get("Content-Length");
  if (contentLength === null) {
    throw new Error(
      "Switchboard response missing both Attachment-Metadata and Content-Length headers",
    );
  }
  const sizeBytes = Number(contentLength);
  if (!Number.isInteger(sizeBytes) || sizeBytes < 0) {
    throw new Error(
      `Switchboard response has invalid Content-Length header: ${JSON.stringify(contentLength)}`,
    );
  }
  // Last-Modified is the closest legitimate signal we have for an original
  // creation time when Attachment-Metadata is absent. If that's missing too,
  // fall back to the response Date header (still server-attributed). This is
  // imperfect — Last-Modified reflects the most recent change, not the
  // original upload — but unlike sizeBytes there is no zero-equivalent
  // sentinel for a date, and downstream consumers expect a value.
  const lastModified = response.headers.get("Last-Modified");
  const dateHeader = response.headers.get("Date");
  const createdAtUtc = lastModified
    ? new Date(lastModified).toISOString()
    : dateHeader
      ? new Date(dateHeader).toISOString()
      : new Date().toISOString();

  return {
    // application/octet-stream is the RFC 2046 sentinel for "unknown binary",
    // and "unknown" is a non-real filename sentinel; neither is a fabricated
    // semantic value the way Content-Length=0 would be.
    mimeType:
      response.headers.get("Content-Type") ?? "application/octet-stream",
    fileName: "unknown",
    sizeBytes,
    extension: null,
    createdAtUtc,
    lastAccessedAtUtc: createdAtUtc,
  };
}
