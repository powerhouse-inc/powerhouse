import type { AttachmentHash } from "@powerhousedao/reactor";
import type { JwtHandler } from "@powerhousedao/reactor";
import { AttachmentNotFound } from "../errors.js";
import type { IAttachmentReader } from "../interfaces.js";
import type {
  AttachmentHeader,
  AttachmentMetadata,
  AttachmentResponse,
} from "../types.js";
import { buildAuthHeaders } from "./build-auth-headers.js";
import type { SwitchboardClientConfig } from "./remote-reservation-store.js";

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
  // fall back to the response date (still server-attributed). This is
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

function parseMetadata(response: Response): AttachmentMetadata {
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
        // Older switchboards may omit these timestamps; fall back to the
        // Date/Last-Modified header so we never produce client-clock-stamped
        // values when the server has authority.
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

export class RemoteAttachmentStore implements IAttachmentReader {
  private readonly remoteUrl: string;
  private readonly jwtHandler?: JwtHandler;
  private readonly fetchFn: typeof fetch;

  constructor(config: SwitchboardClientConfig) {
    this.remoteUrl = config.remoteUrl;
    this.jwtHandler = config.jwtHandler;
    this.fetchFn = (config.fetchFn ?? globalThis.fetch).bind(globalThis);
  }

  async stat(hash: AttachmentHash): Promise<AttachmentHeader> {
    const url = `${this.remoteUrl}/attachments/${hash}`;
    const authHeaders = await buildAuthHeaders(url, this.jwtHandler);

    const response = await this.fetchFn(url, {
      method: "HEAD",
      headers: authHeaders,
    });

    if (response.status === 404) {
      throw new AttachmentNotFound(hash);
    }
    if (!response.ok) {
      throw new Error(
        `Attachment stat failed: ${response.status} ${response.statusText}`,
      );
    }

    const metadata = parseMetadata(response);
    return buildHeader(hash, metadata);
  }

  async get(
    hash: AttachmentHash,
    signal?: AbortSignal,
  ): Promise<AttachmentResponse> {
    return this.fetchAttachment(hash, signal);
  }

  private async fetchAttachment(
    hash: AttachmentHash,
    signal?: AbortSignal,
  ): Promise<AttachmentResponse> {
    const url = `${this.remoteUrl}/attachments/${hash}`;
    const headers = await buildAuthHeaders(url, this.jwtHandler);

    const response = await this.fetchFn(url, { signal, headers });

    if (response.status === 404) {
      throw new AttachmentNotFound(hash);
    }
    if (!response.ok) {
      throw new Error(
        `Attachment fetch failed: ${response.status} ${response.statusText}`,
      );
    }
    if (!response.body) {
      throw new Error("Response body is null");
    }

    const metadata = parseMetadata(response);
    return { header: buildHeader(hash, metadata), body: response.body };
  }
}

function buildHeader(
  hash: AttachmentHash,
  metadata: AttachmentMetadata,
): AttachmentHeader {
  return {
    hash,
    mimeType: metadata.mimeType,
    fileName: metadata.fileName,
    sizeBytes: metadata.sizeBytes,
    extension: metadata.extension,
    status: "available",
    source: "sync",
    createdAtUtc: metadata.createdAtUtc,
    lastAccessedAtUtc: metadata.lastAccessedAtUtc ?? metadata.createdAtUtc,
  };
}
