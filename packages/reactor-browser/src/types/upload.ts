export type DocumentTypeIcon =
  | "analytics-processor"
  | "relational-processor"
  | "codegen-processor"
  | "app"
  | "document-model"
  | "editor"
  | "package"
  | "subgraph";

export interface FileUploadProgress {
  stage: "loading" | "initializing" | "uploading" | "complete" | "failed";
  progress: number; // 0-100
  totalOperations?: number;
  uploadedOperations?: number;
  message?: string;
  error?: string;
  documentType?: DocumentTypeIcon;
}

export type FileUploadProgressCallback = (progress: FileUploadProgress) => void;
