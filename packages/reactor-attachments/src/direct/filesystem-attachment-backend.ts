import type { AttachmentHash } from "@powerhousedao/reactor";
import type { IAttachmentBackend, IAttachmentStore } from "../interfaces.js";
import {
  parseAttachmentDownloadTarget,
  parseAttachmentUploadTarget,
} from "../targets.js";
import type {
  AttachmentBackendHealth,
  AttachmentDownloadTarget,
  AttachmentUploadTarget,
  Reservation,
} from "../types.js";

export type FilesystemAttachmentBackendConfig = {
  uploadTarget: (reservation: Reservation) => unknown;
  downloadTarget: (hash: AttachmentHash) => unknown;
  readiness?: () => boolean | Promise<boolean>;
};

/**
 * Filesystem keeps byte transfer behind Switchboard. URL construction stays
 * at the server edge, while this adapter validates that a filesystem backend
 * can never accidentally return a direct-provider target.
 */
export class FilesystemAttachmentBackend implements IAttachmentBackend {
  readonly kind = "filesystem" as const;

  constructor(
    private readonly store: Pick<IAttachmentStore, "has">,
    private readonly config: FilesystemAttachmentBackendConfig,
  ) {}

  async prepareUploadTarget(
    reservation: Reservation,
  ): Promise<AttachmentUploadTarget> {
    const target = parseAttachmentUploadTarget(
      await this.config.uploadTarget(reservation),
    );
    if (target.kind !== "switchboard") {
      throw new Error("Filesystem upload target must use Switchboard");
    }
    return target;
  }

  async prepareDownloadTarget(
    hash: AttachmentHash,
  ): Promise<AttachmentDownloadTarget> {
    const target = parseAttachmentDownloadTarget(
      await this.config.downloadTarget(hash),
    );
    if (target.kind !== "switchboard") {
      throw new Error("Filesystem download target must use Switchboard");
    }
    return target;
  }

  exists(hash: AttachmentHash): Promise<boolean> {
    return this.store.has(hash);
  }

  async health(): Promise<AttachmentBackendHealth> {
    return {
      kind: this.kind,
      ready: await (this.config.readiness?.() ?? true),
    };
  }
}
