import type { PHDocument } from "document-model";
import type { IDocumentModelRegistry } from "../registry/interfaces.js";
import type { IOperationStore } from "../storage/interfaces.js";
import { RingBuffer } from "./buffer/ring-buffer.js";
import type { IKeyValueStore } from "./kv/interfaces.js";
import { LRUTracker } from "./lru/lru-tracker.js";
import type { CachedSnapshot, WriteCacheConfig } from "./types.js";
import type { IWriteCache } from "./write/interfaces.js";

type DocumentStream = {
  key: string;
  ringBuffer: RingBuffer<CachedSnapshot>;
};

export class KyselyWriteCache implements IWriteCache {
  private streams: Map<string, DocumentStream>;
  private lruTracker: LRUTracker<string>;
  private kvStore: IKeyValueStore;
  private operationStore: IOperationStore;
  private registry: IDocumentModelRegistry;
  private config: Required<WriteCacheConfig>;

  constructor(
    kvStore: IKeyValueStore,
    operationStore: IOperationStore,
    registry: IDocumentModelRegistry,
    config: WriteCacheConfig,
  ) {
    this.kvStore = kvStore;
    this.operationStore = operationStore;
    this.registry = registry;
    this.config = {
      maxDocuments: config.maxDocuments,
      ringBufferSize: config.ringBufferSize,
      keyframeInterval: config.keyframeInterval,
    };
    this.streams = new Map();
    this.lruTracker = new LRUTracker<string>();
  }

  async startup(): Promise<void> {
    await this.kvStore.startup();
  }

  async shutdown(): Promise<void> {
    await this.kvStore.shutdown();
  }

  async getState(
    documentId: string,
    documentType: string,
    scope: string,
    branch: string,
    targetRevision?: number,
    signal?: AbortSignal,
  ): Promise<PHDocument> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    const streamKey = this.makeStreamKey(documentId, scope, branch);
    const stream = this.streams.get(streamKey);

    if (stream) {
      const snapshots = stream.ringBuffer.getAll();

      if (targetRevision === undefined) {
        if (snapshots.length > 0) {
          const newest = snapshots[snapshots.length - 1];
          this.lruTracker.touch(streamKey);
          return structuredClone(newest.document);
        }
      } else {
        const exactMatch = snapshots.find((s) => s.revision === targetRevision);
        if (exactMatch) {
          this.lruTracker.touch(streamKey);
          return structuredClone(exactMatch.document);
        }
      }
    }

    const document = await this.coldMissRebuild(
      documentId,
      documentType,
      scope,
      branch,
      targetRevision,
      signal,
    );

    let revision = targetRevision;
    if (revision === undefined) {
      revision = document.header.revision[scope] || 0;
    }

    this.putState(documentId, documentType, scope, branch, revision, document);

    return structuredClone(document);
  }

  putState(
    documentId: string,
    documentType: string,
    scope: string,
    branch: string,
    revision: number,
    document: PHDocument,
  ): void {
    const safeCopy = structuredClone(document);
    const streamKey = this.makeStreamKey(documentId, scope, branch);
    const stream = this.getOrCreateStream(streamKey);

    const snapshot: CachedSnapshot = {
      revision,
      document: safeCopy,
    };

    stream.ringBuffer.push(snapshot);

    if (this.isKeyframeRevision(revision)) {
      const keyframeKey = this.makeKeyframeKey(
        documentId,
        documentType,
        scope,
        branch,
        revision,
      );
      const data = this.serializeKeyframe(safeCopy);

      this.kvStore.put(keyframeKey, data).catch((err) => {
        console.error(`Failed to persist keyframe ${keyframeKey}:`, err);
      });
    }
  }

  invalidate(documentId: string, scope?: string, branch?: string): number {
    let evicted = 0;

    if (scope === undefined && branch === undefined) {
      for (const [key] of this.streams.entries()) {
        if (key.startsWith(`${documentId}:`)) {
          this.streams.delete(key);
          this.lruTracker.remove(key);
          evicted++;
        }
      }
    } else if (scope !== undefined && branch === undefined) {
      for (const [key] of this.streams.entries()) {
        if (key.startsWith(`${documentId}:${scope}:`)) {
          this.streams.delete(key);
          this.lruTracker.remove(key);
          evicted++;
        }
      }
    } else if (scope !== undefined && branch !== undefined) {
      const key = this.makeStreamKey(documentId, scope, branch);
      if (this.streams.has(key)) {
        this.streams.delete(key);
        this.lruTracker.remove(key);
        evicted = 1;
      }
    }

    return evicted;
  }

  clear(): void {
    this.streams.clear();
    this.lruTracker.clear();
  }

  private async findNearestKeyframe(
    documentId: string,
    documentType: string,
    scope: string,
    branch: string,
    targetRevision: number,
    signal?: AbortSignal,
  ): Promise<{ revision: number; document: PHDocument } | undefined> {
    const interval = this.config.keyframeInterval;

    if (targetRevision === Number.MAX_SAFE_INTEGER || targetRevision <= 0) {
      return undefined;
    }

    const keyframeRevisions: number[] = [];

    for (
      let rev = Math.floor(targetRevision / interval) * interval;
      rev > 0;
      rev -= interval
    ) {
      keyframeRevisions.push(rev);
      if (keyframeRevisions.length > 1000) {
        break;
      }
    }

    for (const rev of keyframeRevisions) {
      if (signal?.aborted) {
        throw new Error("Operation aborted");
      }

      const key = this.makeKeyframeKey(
        documentId,
        documentType,
        scope,
        branch,
        rev,
      );

      try {
        const data = await this.kvStore.get(key, signal);
        if (data) {
          try {
            const document = this.deserializeKeyframe(data);
            return { revision: rev, document };
          } catch (err) {
            console.warn(`Failed to deserialize keyframe ${key}:`, err);
          }
        }
      } catch (err) {
        console.warn(`Failed to load keyframe ${key}:`, err);
      }
    }

    return undefined;
  }

  private async coldMissRebuild(
    documentId: string,
    documentType: string,
    scope: string,
    branch: string,
    targetRevision: number | undefined,
    signal?: AbortSignal,
  ): Promise<PHDocument> {
    const effectiveTargetRevision = targetRevision || Number.MAX_SAFE_INTEGER;

    const keyframe = await this.findNearestKeyframe(
      documentId,
      documentType,
      scope,
      branch,
      effectiveTargetRevision,
      signal,
    );

    let document: PHDocument | undefined;
    let startRevision: number;

    if (keyframe) {
      document = structuredClone(keyframe.document);
      startRevision = keyframe.revision;
      console.log(`Cold miss: starting from keyframe@${startRevision}`);
    } else {
      document = undefined;
      startRevision = 0;
      console.log(`Cold miss: no keyframe, rebuilding from scratch`);
    }

    const module = this.registry.getModule(documentType);
    let cursor: string | undefined = undefined;
    const pageSize = 100;

    // todo: refactor
    while (true) {
      if (signal?.aborted) {
        throw new Error("Operation aborted");
      }

      const paging = cursor ? { cursor, pageSize } : { pageSize };

      try {
        const result = await this.operationStore.getSince(
          documentId,
          scope,
          branch,
          startRevision,
          paging,
          signal,
        );

        for (const operation of result.items) {
          if (
            targetRevision !== undefined &&
            operation.index > targetRevision
          ) {
            break;
          }

          if (document === undefined) {
            document = module.utils.createDocument();
          }

          document = module.reducer(document, operation.action);
        }

        if (
          !result.nextCursor ||
          (targetRevision !== undefined &&
            result.items.some((op) => op.index >= targetRevision))
        ) {
          break;
        }

        cursor = result.nextCursor;
      } catch (err) {
        throw new Error(
          `Failed to rebuild document ${documentId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (!document) {
      throw new Error(
        `Failed to rebuild document ${documentId}: no operations found`,
      );
    }

    return document;
  }

  private makeStreamKey(
    documentId: string,
    scope: string,
    branch: string,
  ): string {
    return `${documentId}:${scope}:${branch}`;
  }

  private getOrCreateStream(key: string): DocumentStream {
    let stream = this.streams.get(key);

    if (!stream) {
      if (this.streams.size >= this.config.maxDocuments) {
        const evictKey = this.lruTracker.evict();
        if (evictKey) {
          this.streams.delete(evictKey);
        }
      }

      stream = {
        key,
        ringBuffer: new RingBuffer<CachedSnapshot>(this.config.ringBufferSize),
      };
      this.streams.set(key, stream);
    }

    this.lruTracker.touch(key);
    return stream;
  }

  private makeKeyframeKey(
    documentId: string,
    documentType: string,
    scope: string,
    branch: string,
    revision: number,
  ): string {
    return `keyframe:${documentId}:${documentType}:${scope}:${branch}:${revision}`;
  }

  private isKeyframeRevision(revision: number): boolean {
    return revision > 0 && revision % this.config.keyframeInterval === 0;
  }

  private serializeKeyframe(document: PHDocument): string {
    return JSON.stringify(document);
  }

  private deserializeKeyframe(data: string): PHDocument {
    return JSON.parse(data) as PHDocument;
  }
}
