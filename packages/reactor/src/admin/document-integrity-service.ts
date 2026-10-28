import { resolveFeatureFlags } from "../core/feature-flags.js";
import type {
  CreateDocumentAction,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import {
  hashDocumentStateForScope,
  localSupports,
  PEER_CAPABILITIES,
} from "@powerhousedao/shared/document-model";
import { KyselyWriteCache } from "../cache/kysely-write-cache.js";
import type { IWriteCache } from "../cache/write/interfaces.js";
import { firstOutOfOrderPair } from "../decision/stream-order.js";
import {
  createProtocolGate,
  unknownBaseReducerRefusal,
  type IProtocolGate,
} from "../protocol/gate.js";
import type { ProtocolSupport } from "../protocol/support.js";
import type { IDocumentModelRegistry } from "../registry/interfaces.js";
import { UnsupportedProtocolVersionError } from "../shared/errors.js";
import { throwIfAborted } from "../shared/utils.js";
import type {
  IDocumentView,
  IKeyframeStore,
  IOperationStore,
} from "../storage/interfaces.js";
import { passthroughKeyframeStore } from "./passthrough-keyframe-store.js";
import type {
  IDocumentIntegrityService,
  KeyframeValidationIssue,
  RebuildResult,
  SnapshotValidationIssue,
  StreamOrderIssue,
  ValidationResult,
} from "./types.js";

export class DocumentIntegrityService implements IDocumentIntegrityService {
  private readonly keyframeStore: IKeyframeStore;
  private readonly operationStore: IOperationStore;
  private readonly writeCache: IWriteCache;
  private readonly documentView: IDocumentView;
  private readonly documentModelRegistry: IDocumentModelRegistry;
  private readonly protocolSupport: ProtocolSupport;

  /** `protocolSupport` defaults to the default peer capabilities with no flags. */
  constructor(
    keyframeStore: IKeyframeStore,
    operationStore: IOperationStore,
    writeCache: IWriteCache,
    documentView: IDocumentView,
    documentModelRegistry: IDocumentModelRegistry,
    protocolSupport?: ProtocolSupport,
  ) {
    this.keyframeStore = keyframeStore;
    this.operationStore = operationStore;
    this.writeCache = writeCache;
    this.documentView = documentView;
    this.documentModelRegistry = documentModelRegistry;
    this.protocolSupport =
      protocolSupport ??
      localSupports(PEER_CAPABILITIES, resolveFeatureFlags()).protocols;
  }

  async validateDocument(
    documentId: string,
    branch = "main",
    signal?: AbortSignal,
  ): Promise<ValidationResult> {
    const keyframeIssues: KeyframeValidationIssue[] = [];
    const snapshotIssues: SnapshotValidationIssue[] = [];
    const streamOrderIssues = await this.findStreamOrderIssues(
      documentId,
      branch,
      signal,
    );

    const gate = createProtocolGate(
      this.protocolSupport,
      this.documentModelRegistry,
    );
    const replayCache = new KyselyWriteCache(
      passthroughKeyframeStore,
      this.operationStore,
      this.documentModelRegistry,
      {
        maxDocuments: 1,
        ringBufferSize: 1,
        keyframeInterval: Number.MAX_SAFE_INTEGER,
        gate,
      },
    );
    const unsupported = (
      error: UnsupportedProtocolVersionError,
    ): ValidationResult => ({
      documentId,
      isConsistent:
        keyframeIssues.length === 0 &&
        snapshotIssues.length === 0 &&
        streamOrderIssues.length === 0,
      keyframeIssues,
      snapshotIssues,
      streamOrderIssues,
      unsupported: { protocol: error.protocol, version: error.version },
    });

    // Every later read runs this check too; a document with no keyframes and
    // no snapshot would otherwise reach none of them.
    const refusal = await this.storedRefusal(documentId, branch, gate, signal);
    if (refusal) return unsupported(refusal);

    const keyframes = await this.keyframeStore.listKeyframes(
      documentId,
      undefined,
      branch,
      signal,
    );

    for (const keyframe of keyframes) {
      throwIfAborted(signal);

      replayCache.invalidate(documentId, keyframe.scope, branch);
      let replayedDoc: PHDocument;
      try {
        replayedDoc = await replayCache.getState(
          documentId,
          keyframe.scope,
          branch,
          keyframe.revision,
          signal,
        );
      } catch (error) {
        if (UnsupportedProtocolVersionError.isError(error)) {
          return unsupported(error);
        }
        throw error;
      }

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
        isConsistent:
          keyframeIssues.length === 0 && streamOrderIssues.length === 0,
        keyframeIssues,
        snapshotIssues,
        streamOrderIssues,
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
      } catch (error) {
        if (UnsupportedProtocolVersionError.isError(error)) {
          return unsupported(error);
        }
        throwIfAborted(signal);
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
      isConsistent:
        keyframeIssues.length === 0 &&
        snapshotIssues.length === 0 &&
        streamOrderIssues.length === 0,
      keyframeIssues,
      snapshotIssues,
      streamOrderIssues,
    };
  }

  /**
   * The gate's read refusal of the stored CREATE_DOCUMENT, which fixes the
   * document's protocol versions. Undefined when that read fails: the
   * validation's own reads decide.
   */
  private async storedRefusal(
    documentId: string,
    branch: string,
    gate: IProtocolGate,
    signal?: AbortSignal,
  ): Promise<UnsupportedProtocolVersionError | undefined> {
    let creation: CreateDocumentAction | undefined;
    try {
      const page = await this.operationStore.getSince(
        documentId,
        "document",
        branch,
        -1,
        undefined,
        { cursor: "0", limit: 1 },
        signal,
      );
      const action = page.results.at(0)?.action;
      if (action?.type !== "CREATE_DOCUMENT") return undefined;
      creation = action as CreateDocumentAction;
    } catch {
      return undefined;
    }
    const { protocolVersions, model } = creation.input;
    return (
      unknownBaseReducerRefusal(documentId, protocolVersions) ??
      gate.readRefusal(documentId, protocolVersions, model)
    );
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
      throwIfAborted(signal);
      this.writeCache.invalidate(documentId, scope, branch);
    }

    return {
      documentId,
      keyframesDeleted: 0,
      scopesInvalidated: scopes.length,
    };
  }

  private async findStreamOrderIssues(
    documentId: string,
    branch: string,
    signal?: AbortSignal,
  ): Promise<StreamOrderIssue[]> {
    const scopes = await this.discoverScopes(documentId, branch, signal);
    const issues: StreamOrderIssue[] = [];

    for (const scope of scopes) {
      throwIfAborted(signal);

      const stored = await this.operationStore.getSince(
        documentId,
        scope,
        branch,
        -1,
        undefined,
        undefined,
        signal,
      );

      const pair = firstOutOfOrderPair(stored.results, {
        requireStrict: scope === "auth",
      });
      if (pair !== undefined) {
        issues.push({ scope, branch, ...pair });
      }
    }

    return issues;
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
