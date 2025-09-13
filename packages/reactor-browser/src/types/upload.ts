export interface FileUploadProgress {
  stage: "loading" | "initializing" | "uploading" | "complete" | "failed";
  progress: number; // 0-100
  totalOperations?: number;
  uploadedOperations?: number;
  message?: string;
  error?: string;
}

export type FileUploadProgressCallback = (progress: FileUploadProgress) => void;
