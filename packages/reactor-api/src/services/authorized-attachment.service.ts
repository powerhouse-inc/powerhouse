import type { AttachmentRef } from "@powerhousedao/reactor";
import {
  AttachmentNotFound,
  validateReserveMetadata,
  type AttachmentDownloadOptions,
  type AttachmentDownloadTarget,
  type AttachmentDownloadTargetOptions,
  type AttachmentHeader,
  type AttachmentResponse,
  type AttachmentStatOptions,
  type HashFirstReserveAttachmentOptions,
  type IAttachmentService,
  type IAttachmentUpload,
  type ReserveAttachmentOptions,
} from "@powerhousedao/reactor-attachments";
import {
  createAttachmentClient,
  type IAttachmentClient,
} from "@powerhousedao/reactor-attachments/client";
import type { AuthSubject } from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import { AuthenticationRequiredError } from "../graphql/errors.js";
import type {
  AttachmentAccessResult,
  AttachmentCallerResult,
  IAttachmentAccessService,
} from "./attachment-access.service.js";
import type { CanonicalDocumentId } from "./authorization.service.js";

/** Matches the attachment routes' `documentId` bound. */
const MAX_DOCUMENT_ID_LEN = 512;

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

type ReadDecision = { documentId: CanonicalDocumentId; ref: AttachmentRef };

/** An `IAttachmentService` whose reads and writes are decided for one subject. */
export class AuthorizedAttachmentService implements IAttachmentService {
  constructor(
    private readonly inner: IAttachmentService,
    private readonly access: IAttachmentAccessService,
    private readonly subject: AuthSubject,
    private readonly logger: ILogger,
  ) {}

  /** Hash-first only: an upload-first handle can send after it expires. */
  async reserve(options: ReserveAttachmentOptions): Promise<IAttachmentUpload> {
    // One read per field: the checks and the delegate see the same values.
    const { mimeType, fileName, extension, clientHash, sizeBytes } = options;
    if (clientHash === undefined) {
      throw new Error("Attachment reservations require a client hash");
    }
    const copy: HashFirstReserveAttachmentOptions = {
      mimeType,
      fileName,
      extension,
      clientHash,
      sizeBytes,
    };
    await this.admit("write");
    validateReserveMetadata(copy);
    return this.inner.reserve(copy);
  }

  async stat(
    ref: AttachmentRef,
    options?: AttachmentStatOptions,
  ): Promise<AttachmentHeader> {
    const decision = await this.decideRead(ref, options);
    return this.inner.stat(decision.ref, {
      ...options,
      documentId: decision.documentId,
    });
  }

  async get(
    ref: AttachmentRef,
    options?: AbortSignal | AttachmentDownloadOptions,
  ): Promise<AttachmentResponse> {
    const decision = await this.decideRead(ref, options);
    return this.inner.get(decision.ref, {
      ...(options as AttachmentDownloadOptions),
      documentId: decision.documentId,
    });
  }

  async getDownloadTarget(
    ref: AttachmentRef,
    options: AttachmentDownloadTargetOptions,
  ): Promise<AttachmentDownloadTarget> {
    const decision = await this.decideRead(ref, options);
    return this.inner.getDownloadTarget(decision.ref, {
      ...options,
      documentId: decision.documentId,
    });
  }

  private async decideRead(
    ref: AttachmentRef,
    options: unknown,
  ): Promise<ReadDecision> {
    const documentId = readDocumentId(options);
    if (documentId === null) {
      throw new AttachmentNotFound(ref);
    }

    await this.admit("read");

    let decision: AttachmentAccessResult;
    try {
      decision = await this.access.canReadAttachment({
        documentId,
        attachmentRef: ref,
        userAddress: this.subject.address,
        appKey: this.subject.key,
      });
    } catch (err) {
      throw this.accessFailed(err);
    }

    if (decision.kind === "allowed") {
      return { documentId: decision.documentId, ref: decision.ref };
    }
    if (decision.kind === "projection-unavailable") {
      throw new AttachmentAccessUnavailable();
    }
    throw new AttachmentNotFound(ref);
  }

  private async admit(intent: "read" | "write"): Promise<void> {
    let result: AttachmentCallerResult;
    try {
      result = await this.access.admitCaller({
        intent,
        userAddress: this.subject.address,
        appKey: this.subject.key,
      });
    } catch (err) {
      throw this.accessFailed(err);
    }
    if (result.kind !== "admitted") {
      throw new AuthenticationRequiredError();
    }
  }

  private accessFailed(err: unknown): AttachmentAccessFailed {
    this.logger.error("Attachment access decision failed: @error", err);
    return new AttachmentAccessFailed(err);
  }
}

/** The options' `documentId` when it is one the routes would accept, else null. */
function readDocumentId(options: unknown): string | null {
  if (typeof options !== "object" || options === null) return null;
  const proto: unknown = Object.getPrototypeOf(options);
  if (proto !== Object.prototype && proto !== null) return null;
  const value = (options as { documentId?: unknown }).documentId;
  if (typeof value !== "string") return null;
  if (value.trim().length === 0 || value.length > MAX_DOCUMENT_ID_LEN) {
    return null;
  }
  return value;
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

  forSubject(subject: AuthSubject): IAttachmentClient {
    return createAttachmentClient(
      new AuthorizedAttachmentService(
        this.service,
        this.access,
        subject,
        this.logger,
      ),
    );
  }
}
