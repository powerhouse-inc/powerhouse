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

    throw new Error(
      `Cache miss: document ${documentId} not found in cache (scope: ${scope}, branch: ${branch}, targetRevision: ${targetRevision})`,
    );
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
      for (const [key, stream] of this.streams.entries()) {
        if (key.startsWith(`${documentId}:`)) {
          this.streams.delete(key);
          this.lruTracker.remove(key);
          evicted++;
        }
      }
    } else if (scope !== undefined && branch === undefined) {
      for (const [key, stream] of this.streams.entries()) {
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
