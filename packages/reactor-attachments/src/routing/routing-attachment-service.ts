import type { AttachmentRef } from "@powerhousedao/reactor";
import type { IAttachmentService, IAttachmentUpload } from "../interfaces.js";
import type {
  AttachmentDownloadOptions,
  AttachmentDownloadTarget,
  AttachmentDownloadTargetOptions,
  AttachmentHeader,
  AttachmentResponse,
  AttachmentStatOptions,
  ReserveAttachmentOptions,
} from "../types.js";

/** The name of the backend that serves a document, e.g. a router's `locate`. */
export type AttachmentRouteResolver = (
  documentId: string,
  signal?: AbortSignal,
) => Promise<string>;

/**
 * Sends each call to the attachment service of the backend that serves its
 * `documentId`. A call without one, a backend with no service here, or a
 * document that cannot be located goes to `fallback`.
 */
export class RoutingAttachmentService implements IAttachmentService {
  constructor(
    private readonly resolve: AttachmentRouteResolver,
    private readonly byBackend: ReadonlyMap<string, IAttachmentService>,
    private readonly fallback: IAttachmentService,
  ) {}

  async reserve(options: ReserveAttachmentOptions): Promise<IAttachmentUpload> {
    const { documentId, ...rest } = options;
    const service = await this.serviceFor(documentId);
    return service.reserve(rest as ReserveAttachmentOptions);
  }

  async stat(
    ref: AttachmentRef,
    options?: AttachmentStatOptions,
  ): Promise<AttachmentHeader> {
    const service = await this.serviceFor(options?.documentId);
    return service.stat(ref, options);
  }

  async get(
    ref: AttachmentRef,
    options?: AbortSignal | AttachmentDownloadOptions,
  ): Promise<AttachmentResponse> {
    const service =
      options === undefined || options instanceof AbortSignal
        ? this.fallback
        : await this.serviceFor(options.documentId, options.signal);
    return service.get(ref, options);
  }

  async getDownloadTarget(
    ref: AttachmentRef,
    options: AttachmentDownloadTargetOptions,
  ): Promise<AttachmentDownloadTarget> {
    const service = await this.serviceFor(options.documentId, options.signal);
    return service.getDownloadTarget(ref, options);
  }

  private async serviceFor(
    documentId: string | undefined,
    signal?: AbortSignal,
  ): Promise<IAttachmentService> {
    if (documentId === undefined) return this.fallback;
    let backend: string;
    try {
      backend = await this.resolve(documentId, signal);
    } catch (error) {
      if (signal?.aborted) throw error;
      return this.fallback;
    }
    return this.byBackend.get(backend) ?? this.fallback;
  }
}
