import type { AttachmentHash } from "@powerhousedao/reactor";
import type { JwtHandler } from "@powerhousedao/reactor";
import { AttachmentNotFound } from "../errors.js";
import type { IAttachmentStore } from "../interfaces.js";
import type {
  AttachmentHeader,
  AttachmentMetadata,
  AttachmentResponse,
} from "../types.js";
import { buildAuthHeaders } from "./build-auth-headers.js";
import type { SwitchboardClientConfig } from "./remote-reservation-store.js";

function notSupported(method: string): Error {
  return new Error(`RemoteAttachmentStore.${method} is not supported`);
}

function parseMetadata(response: Response): AttachmentMetadata {
  const metaHeader = response.headers.get("X-Attachment-Metadata");
  if (metaHeader) {
    return JSON.parse(metaHeader) as AttachmentMetadata;
  }
  return {
    mimeType:
      response.headers.get("Content-Type") ?? "application/octet-stream",
    fileName: "unknown",
    sizeBytes: Number(response.headers.get("Content-Length") ?? 0),
    extension: null,
  };
}

export class RemoteAttachmentStore implements IAttachmentStore {
  private readonly remoteUrl: string;
  private readonly jwtHandler?: JwtHandler;
  private readonly fetchFn: typeof fetch;

  constructor(config: SwitchboardClientConfig) {
    this.remoteUrl = config.remoteUrl;
    this.jwtHandler = config.jwtHandler;
    this.fetchFn = config.fetchFn ?? globalThis.fetch;
  }

  async get(
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
    const now = new Date().toISOString();
    const header: AttachmentHeader = {
      hash,
      mimeType: metadata.mimeType,
      fileName: metadata.fileName,
      sizeBytes: metadata.sizeBytes,
      extension: metadata.extension,
      status: "available",
      source: "sync",
      createdAtUtc: now,
      lastAccessedAtUtc: now,
    };

    return { header, body: response.body };
  }

  stat(_hash: AttachmentHash): Promise<AttachmentHeader> {
    return Promise.reject(notSupported("stat"));
  }

  has(_hash: AttachmentHash): Promise<boolean> {
    return Promise.reject(notSupported("has"));
  }

  put(
    _hash: AttachmentHash,
    _metadata: AttachmentMetadata,
    _data: ReadableStream<Uint8Array>,
  ): Promise<void> {
    return Promise.reject(notSupported("put"));
  }

  evict(_hash: AttachmentHash): Promise<void> {
    return Promise.reject(notSupported("evict"));
  }

  storageUsed(): Promise<number> {
    return Promise.reject(notSupported("storageUsed"));
  }
}
