import type { IDocumentStorage } from "document-drive";
import type { PHDocument } from "document-model";
import type { IEventBus } from "../events/interfaces.js";
import { OperationEventTypes } from "../events/types.js";
import type { OperationWrittenEvent } from "../events/types.js";
import type { IConsistencyTracker } from "../shared/consistency-tracker.js";
import type { ConsistencyToken } from "../shared/types.js";
import type { IConsistencyAwareStorage } from "./interfaces.js";

/**
 * A wrapper around IDocumentStorage that provides read-after-write consistency
 * by waiting for the consistency tracker to be updated before delegating reads
 * to the inner storage.
 *
 * This is used when legacy storage mode is enabled with async persistence
 * (e.g., BrowserStorage with IndexedDB) to ensure documents are available
 * for reading after being written.
 */
export class ConsistencyAwareLegacyStorage implements IConsistencyAwareStorage {
  constructor(
    private inner: IDocumentStorage,
    private consistencyTracker: IConsistencyTracker,
    eventBus: IEventBus,
  ) {
    eventBus.subscribe<OperationWrittenEvent>(
      OperationEventTypes.OPERATION_WRITTEN,
      (_type, event) => {
        const coordinates = event.operations.map((op) => ({
          documentId: op.context.documentId,
          scope: op.context.scope,
          branch: op.context.branch,
          operationIndex: op.operation.index,
        }));
        this.consistencyTracker.update(coordinates);
      },
    );
  }

  private async waitForConsistency(
    consistencyToken: ConsistencyToken | undefined,
    signal?: AbortSignal,
  ): Promise<void> {
    if (consistencyToken && consistencyToken.coordinates.length > 0) {
      await this.consistencyTracker.waitFor(
        consistencyToken.coordinates,
        undefined,
        signal,
      );
    }
  }

  async get<TDocument extends PHDocument>(
    id: string,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    await this.waitForConsistency(consistencyToken, signal);
    return this.inner.get<TDocument>(id);
  }

  async getBySlug<TDocument extends PHDocument>(
    slug: string,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    await this.waitForConsistency(consistencyToken, signal);
    return this.inner.getBySlug<TDocument>(slug);
  }

  async exists(
    id: string,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<boolean> {
    await this.waitForConsistency(consistencyToken, signal);
    return this.inner.exists(id);
  }

  async findByType(
    type: string,
    limit?: number,
    cursor?: string,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<{ documents: string[]; nextCursor: string | undefined }> {
    await this.waitForConsistency(consistencyToken, signal);
    return this.inner.findByType(type, limit, cursor);
  }

  async getChildren(
    id: string,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<string[]> {
    await this.waitForConsistency(consistencyToken, signal);
    return this.inner.getChildren(id);
  }

  async resolveIds(
    slugs: string[],
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<string[]> {
    await this.waitForConsistency(consistencyToken, signal);
    return this.inner.resolveIds(slugs, signal);
  }

  async resolveSlugs(
    ids: string[],
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<string[]> {
    await this.waitForConsistency(consistencyToken, signal);
    return this.inner.resolveSlugs(ids, signal);
  }

  async getParents(
    childId: string,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<string[]> {
    await this.waitForConsistency(consistencyToken, signal);
    return this.inner.getParents(childId);
  }
}
