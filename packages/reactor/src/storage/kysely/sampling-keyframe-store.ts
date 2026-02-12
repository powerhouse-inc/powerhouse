import { appendFile } from "node:fs/promises";
import type { PHDocument } from "document-model";
import type { IKeyframeStore } from "../interfaces.js";

export class SamplingKeyframeStore implements IKeyframeStore {
  private callCount = 0;

  constructor(
    private inner: IKeyframeStore,
    private outputPath: string,
    private sampleInterval: number = 1,
  ) {}

  async putKeyframe(
    documentId: string,
    scope: string,
    branch: string,
    revision: number,
    document: PHDocument,
    signal?: AbortSignal,
  ): Promise<void> {
    const shouldSample = this.callCount++ % this.sampleInterval === 0;

    if (shouldSample) {
      const entry = {
        timestamp: new Date().toISOString(),
        callCount: this.callCount,
        documentId,
        scope,
        branch,
        revision,
        document,
      };
      appendFile(this.outputPath, JSON.stringify(entry) + "\n").catch(() => {});
    }

    return this.inner.putKeyframe(
      documentId,
      scope,
      branch,
      revision,
      document,
      signal,
    );
  }

  findNearestKeyframe(
    documentId: string,
    scope: string,
    branch: string,
    targetRevision: number,
    signal?: AbortSignal,
  ): Promise<{ revision: number; document: PHDocument } | undefined> {
    return this.inner.findNearestKeyframe(
      documentId,
      scope,
      branch,
      targetRevision,
      signal,
    );
  }

  deleteKeyframes(
    documentId: string,
    scope?: string,
    branch?: string,
    signal?: AbortSignal,
  ): Promise<number> {
    return this.inner.deleteKeyframes(documentId, scope, branch, signal);
  }
}
