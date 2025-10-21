import type { FileNode } from "document-drive";

export type DocumentTypeIcon =
  | "analytics-processor"
  | "relational-processor"
  | "codegen-processor"
  | "app"
  | "document-model"
  | "editor"
  | "package"
  | "subgraph";

export type ConflictResolution = "replace" | "duplicate";

export interface FileUploadProgress {
  stage:
    | "loading"
    | "initializing"
    | "uploading"
    | "complete"
    | "failed"
    | "conflict"
    | "unsupported-document-type";
  progress: number; // 0-100
  totalOperations?: number;
  uploadedOperations?: number;
  message?: string;
  error?: string;
  documentType?: DocumentTypeIcon;
  duplicateType?: "id" | "name";
}

export type FileUploadProgressCallback = (progress: FileUploadProgress) => void;

export type UseOnDropFile = () => (
  file: File,
  onProgress?: FileUploadProgressCallback,
  resolveConflict?: ConflictResolution,
) => Promise<FileNode | undefined>;
