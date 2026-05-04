import type { IAttachmentTransport } from "./interfaces.js";
import type { TransportResponse } from "./types.js";

/**
 * No-op transport for deployments without remote sync.
 * fetch() always returns null, announce() and push() are no-ops.
 */
export class NullAttachmentTransport implements IAttachmentTransport {
  fetch(): Promise<TransportResponse | null> {
    return Promise.resolve(null);
  }

  announce(): Promise<void> {
    return Promise.resolve();
  }

  push(): Promise<void> {
    return Promise.resolve();
  }
}
