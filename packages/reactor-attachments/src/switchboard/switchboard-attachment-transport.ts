import type { AttachmentHash } from "@powerhousedao/reactor";
import type { JwtHandler } from "@powerhousedao/reactor";
import type { IAttachmentTransport } from "../interfaces.js";
import type { AttachmentMetadata, TransportResponse } from "../types.js";

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
    this.fetchFn = config.fetchFn ?? globalThis.fetch;
  }

  async fetch(
    hash: AttachmentHash,
    signal?: AbortSignal,
  ): Promise<TransportResponse | null> {
    const url = `${this.remoteUrl}/attachments/${hash}`;
    const headers = await this.buildHeaders(url);

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
    const headers = await this.buildHeaders(url);

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

  private async buildHeaders(url: string): Promise<Record<string, string>> {
    const headers: Record<string, string> = {};
    if (this.jwtHandler) {
      const token = await this.jwtHandler(url);
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
    }
    return headers;
  }

  private parseMetadataHeaders(response: Response): AttachmentMetadata {
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
}
