import type { Operation } from "@powerhousedao/shared/document-model";
import type { OutOfOrderPair } from "../decision/stream-order.js";

export type KeyframeValidationIssue = {
  scope: string;
  branch: string;
  revision: number;
  keyframeHash: string;
  replayedHash: string;
};

export type SnapshotValidationIssue = {
  scope: string;
  branch: string;
  snapshotHash: string;
  replayedHash: string;
};

/** Effective operations whose stored order contradicts their timestamps. */
export type StreamOrderIssue = {
  scope: string;
  branch: string;
  previous: Operation;
  current: Operation;
  kind: OutOfOrderPair["kind"];
};

export type ValidationResult = {
  documentId: string;
  isConsistent: boolean;
  keyframeIssues: KeyframeValidationIssue[];
  snapshotIssues: SnapshotValidationIssue[];
  streamOrderIssues: StreamOrderIssue[];
};

export type RebuildResult = {
  documentId: string;
  keyframesDeleted: number;
  scopesInvalidated: number;
};

export interface IDocumentIntegrityService {
  validateDocument(
    documentId: string,
    branch?: string,
    signal?: AbortSignal,
  ): Promise<ValidationResult>;

  rebuildKeyframes(
    documentId: string,
    branch?: string,
    signal?: AbortSignal,
  ): Promise<RebuildResult>;

  rebuildSnapshots(
    documentId: string,
    branch?: string,
    signal?: AbortSignal,
  ): Promise<RebuildResult>;
}
