import type { Node } from "document-drive";
import type { UploadFileItemProps } from "../upload-file-item/index.js";

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

export function mapUploadsToFileItems(
  uploadsArray: (UploadTracker | undefined)[],
  removeUpload: (uploadId: string) => void,
  setSelectedNodeFn?: (nodeOrNodeSlug: Node | string | undefined) => void,
): UploadFileItemProps[] {
  return uploadsArray
    .filter(
      (upload): upload is NonNullable<typeof upload> => upload !== undefined,
    )
    .map((upload) => ({
      fileName: upload.fileName,
      fileSize: upload.fileSize,
      status: upload.status,
      progress: upload.progress,
      errorDetails: upload.errorDetails,
      onClose: () => {
        removeUpload(upload.id);
      },
      onOpenDocument:
        upload.status === "success"
          ? () => {
              if (upload.fileNode && setSelectedNodeFn) {
                setSelectedNodeFn(upload.fileNode);
              } else {
                console.error(
                  "Opening document for upload:",
                  upload.id,
                  "- fileNode not available or setSelectedNode not provided",
                );
              }
            }
          : undefined,
      onFindResolution:
        upload.status === "failed"
          ? () => {
              console.log("Finding resolution for upload:", upload.id);
            }
          : undefined,
    }));
}
