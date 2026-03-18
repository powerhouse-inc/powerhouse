import type { PHDocument } from "document-model";
import { hashDocumentStateForScope } from "document-model/core";
import { KyselyWriteCache } from "../cache/kysely-write-cache.js";
import type { IWriteCache } from "../cache/write/interfaces.js";
import type { IDocumentModelRegistry } from "../registry/interfaces.js";
import type {
  IDocumentView,
  IKeyframeStore,
  IOperationStore,
} from "../storage/interfaces.js";
import type {
  IDocumentIntegrityService,
  KeyframeValidationIssue,
  RebuildResult,
  SnapshotValidationIssue,
  ValidationResult,
} from "./types.js";

const nullKeyframeStore: IKeyframeStore = {
  putKeyframe: () => Promise.resolve(),
  findNearestKeyframe: () => Promise.resolve(undefined),
  listKeyframes: () => Promise.resolve([]),
  deleteKeyframes: () => Promise.resolve(0),
};

export class DocumentIntegrityService implements IDocumentIntegrityService {
  private readonly keyframeStore: IKeyframeStore;
  private readonly operationStore: IOperationStore;
  private readonly writeCache: IWriteCache;
  private readonly documentView: IDocumentView;
  private readonly documentModelRegistry: IDocumentModelRegistry;

  constructor(
    keyframeStore: IKeyframeStore,
    operationStore: IOperationStore,
    writeCache: IWriteCache,
    documentView: IDocumentView,
    documentModelRegistry: IDocumentModelRegistry,
  ) {
    this.keyframeStore = keyframeStore;
    this.operationStore = operationStore;
    this.writeCache = writeCache;
    this.documentView = documentView;
    this.documentModelRegistry = documentModelRegistry;
  }

  async validateDocument(
    documentId: string,
    branch = "main",
    signal?: AbortSignal,
  ): Promise<ValidationResult> {
    const keyframeIssues: KeyframeValidationIssue[] = [];
    const snapshotIssues: SnapshotValidationIssue[] = [];

    const replayCache = new KyselyWriteCache(
      nullKeyframeStore,
      this.operationStore,
      this.documentModelRegistry,
      {
        maxDocuments: 1,
        ringBufferSize: 1,
        keyframeInterval: Number.MAX_SAFE_INTEGER,
      },
    );

    const keyframes = await this.keyframeStore.listKeyframes(
      documentId,
      undefined,
      branch,
      signal,
    );

    for (const keyframe of keyframes) {
      if (signal?.aborted) {
        throw new Error("Operation aborted");
      }

      replayCache.invalidate(documentId, keyframe.scope, branch);
      const replayedDoc = await replayCache.getState(
        documentId,
        keyframe.scope,
        branch,
        keyframe.revision,
        signal,
      );

      const kfHash = hashDocumentStateForScope(
        keyframe.document,
        keyframe.scope,
      );
      const replayHash = hashDocumentStateForScope(replayedDoc, keyframe.scope);

      if (kfHash !== replayHash) {
        keyframeIssues.push({
          scope: keyframe.scope,
          branch,
          revision: keyframe.revision,
          keyframeHash: kfHash,
          replayedHash: replayHash,
        });
      }
    }

    let currentDoc: PHDocument;
    try {
      currentDoc = await this.documentView.get(documentId);
    } catch {
      return {
        documentId,
        isConsistent: keyframeIssues.length === 0,
        keyframeIssues,
        snapshotIssues,
      };
    }

    const revisions = await this.operationStore.getRevisions(
      documentId,
      branch,
      signal,
    );
    const allScopes = Object.keys(revisions.revision);

    for (const scope of allScopes) {
      if (scope === "document") continue;

      replayCache.invalidate(documentId, scope, branch);

      let replayedDoc: PHDocument;
      try {
        replayedDoc = await replayCache.getState(
          documentId,
          scope,
          branch,
          undefined,
          signal,
        );
      } catch {
        if (signal?.aborted) {
          throw new Error("Operation aborted");
        }
        continue;
      }

      const snapshotHash = hashDocumentStateForScope(currentDoc, scope);
      const replayHash = hashDocumentStateForScope(replayedDoc, scope);
      if (snapshotHash !== replayHash) {
        snapshotIssues.push({
          scope,
          branch,
          snapshotHash,
          replayedHash: replayHash,
        });
      }
    }

    return {
      documentId,
      isConsistent: keyframeIssues.length === 0 && snapshotIssues.length === 0,
      keyframeIssues,
      snapshotIssues,
    };
  }

  async rebuildKeyframes(
    documentId: string,
    branch = "main",
    signal?: AbortSignal,
  ): Promise<RebuildResult> {
    const deleted = await this.keyframeStore.deleteKeyframes(
      documentId,
      undefined,
      branch,
      signal,
    );

    return {
      documentId,
      keyframesDeleted: deleted,
      scopesInvalidated: 0,
    };
  }

  async rebuildSnapshots(
    documentId: string,
    branch = "main",
    signal?: AbortSignal,
  ): Promise<RebuildResult> {
    const scopes = await this.discoverScopes(documentId, branch, signal);

    for (const scope of scopes) {
      if (signal?.aborted) {
        throw new Error("Operation aborted");
      }
      this.writeCache.invalidate(documentId, scope, branch);
    }

    return {
      documentId,
      keyframesDeleted: 0,
      scopesInvalidated: scopes.length,
    };
  }

  private async discoverScopes(
    documentId: string,
    branch: string,
    signal?: AbortSignal,
  ): Promise<string[]> {
    const revisions = await this.operationStore.getRevisions(
      documentId,
      branch,
      signal,
    );
    return Object.keys(revisions.revision);
  }
}
