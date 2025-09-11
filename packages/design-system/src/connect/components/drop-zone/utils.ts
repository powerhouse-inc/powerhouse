import type { Node } from "document-drive";

// Upload tracking types
export type UploadTracker = {
  id: string;
  fileName: string;
  fileSize: string;
  status: "pending" | "uploading" | "success" | "failed";
  progress: number;
  errorDetails?: string;
  fileNode?: Node;
};

export type FileUploadProgress = {
  stage: "loading" | "initializing" | "uploading" | "complete" | "failed";
  progress: number;
  error?: string;
};

export type OnAddFileWithProgress = (
  file: File,
  parent: Node | undefined,
  onProgress?: (progress: FileUploadProgress) => void,
) => Promise<Node | undefined> | Node | undefined;

// Utility functions
export function generateId(): string {
  return `upload_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function mapProgressStageToStatus(
  stage: FileUploadProgress["stage"],
): UploadTracker["status"] {
  switch (stage) {
    case "loading":
    case "initializing":
      return "pending";
    case "uploading":
      return "uploading";
    case "complete":
      return "success";
    case "failed":
      return "failed";
    default:
      return "pending";
  }
}
