import type { AttachmentRef } from "@powerhousedao/reactor";
import type {
  AttachmentDownloadOptions,
  AttachmentDownloadTarget,
  AttachmentDownloadTargetOptions,
  AttachmentHeader,
  AttachmentResponse,
  AttachmentStatOptions,
  IAttachmentService,
  IAttachmentUpload,
  ReserveAttachmentOptions,
} from "@powerhousedao/reactor-attachments";
import type { IAttachmentClient } from "@powerhousedao/reactor-attachments/client";
import type { AuthSubject } from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import type { IAttachmentAccessService } from "./attachment-access.service.js";

/** The reference index is not maintained in this composition. */
export class AttachmentAccessUnavailable extends Error {
  constructor() {
    super("Attachment access is unavailable");
    this.name = "AttachmentAccessUnavailable";
  }
}

/** The access decision itself failed; the cause is logged, not surfaced. */
export class AttachmentAccessFailed extends Error {
  constructor(cause: unknown) {
    super("Attachment access decision failed", { cause });
    this.name = "AttachmentAccessFailed";
  }
}

/** An `IAttachmentService` whose reads and writes are decided for one subject. */
export class AuthorizedAttachmentService implements IAttachmentService {
  constructor(
    private readonly inner: IAttachmentService,
    private readonly access: IAttachmentAccessService,
    private readonly subject: AuthSubject,
    private readonly logger: ILogger,
  ) {}

  reserve(_options: ReserveAttachmentOptions): Promise<IAttachmentUpload> {
    return Promise.reject(new Error("not implemented"));
  }

  stat(
    _ref: AttachmentRef,
    _options?: AttachmentStatOptions,
  ): Promise<AttachmentHeader> {
    return Promise.reject(new Error("not implemented"));
  }

  get(
    _ref: AttachmentRef,
    _options?: AbortSignal | AttachmentDownloadOptions,
  ): Promise<AttachmentResponse> {
    return Promise.reject(new Error("not implemented"));
  }

  getDownloadTarget(
    _ref: AttachmentRef,
    _options: AttachmentDownloadTargetOptions,
  ): Promise<AttachmentDownloadTarget> {
    return Promise.reject(new Error("not implemented"));
  }
}

export interface IAttachmentClientProvider {
  forSubject(subject: AuthSubject): IAttachmentClient;
}

export class AttachmentClientProvider implements IAttachmentClientProvider {
  constructor(
    private readonly service: IAttachmentService,
    private readonly access: IAttachmentAccessService,
    private readonly logger: ILogger,
  ) {}

  forSubject(_subject: AuthSubject): IAttachmentClient {
    throw new Error("not implemented");
  }
}
