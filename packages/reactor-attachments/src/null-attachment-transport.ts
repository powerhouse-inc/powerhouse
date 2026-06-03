import type { IAttachmentTransport } from "./interfaces.js";
import type { TransportFetchResult } from "./types.js";

/**
 * No-op transport for deployments without remote sync.
 * fetch() always returns not-found, announce() and push() are no-ops.
 */
export class NullAttachmentTransport implements IAttachmentTransport {
  fetch(): Promise<TransportFetchResult> {
    return Promise.resolve({ kind: "not-found" });
  }

  announce(): Promise<void> {
    return Promise.resolve();
  }

  push(): Promise<void> {
    return Promise.resolve();
  }
}
