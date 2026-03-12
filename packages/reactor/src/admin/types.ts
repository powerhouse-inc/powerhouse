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

export type ValidationResult = {
  documentId: string;
  isConsistent: boolean;
  keyframeIssues: KeyframeValidationIssue[];
  snapshotIssues: SnapshotValidationIssue[];
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
