import { twMerge } from "tailwind-merge";

import { type UploadFileItemStatus } from "../upload-file-item.js";

type StatusRowProps = {
  readonly status: UploadFileItemStatus;
  readonly progress?: number;
  readonly onOpenDocument?: () => void;
  readonly onFindResolution?: () => void;
};

function getStatusText(status: UploadFileItemStatus): string {
  switch (status) {
    case "success":
      return "Upload successful";
    case "failed":
      return "Upload failed";
    case "pending":
      return "Pending resolution";
    case "uploading":
      return "Uploading...";
    default:
      return "";
  }
}

function getStatusColor(status: UploadFileItemStatus): string {
  switch (status) {
    case "success":
      return "text-green-700";
    case "failed":
    case "pending":
      return "text-red-900";
    case "uploading":
      return "text-gray-900";
    default:
      return "text-gray-900";
  }
}

function shouldShowCTA(
  status: UploadFileItemStatus,
  onOpenDocument?: () => void,
  onFindResolution?: () => void,
): boolean {
  return (
    (status === "success" && Boolean(onOpenDocument)) ||
    (status === "pending" && Boolean(onFindResolution))
  );
}

function getCTAText(status: UploadFileItemStatus): string {
  if (status === "success") return "Open Document";
  if (status === "pending") return "Find resolution";
  return "";
}

export function StatusRow(props: StatusRowProps) {
  const { status, progress = 0, onOpenDocument, onFindResolution } = props;

  const handleCTAClick = () => {
    if (status === "success" && onOpenDocument) onOpenDocument();
    else if (status === "pending" && onFindResolution) onFindResolution();
  };

  return (
    <div className="flex items-center justify-between gap-2">
      <div
        className={twMerge("text-xs leading-[18px]", getStatusColor(status))}
      >
        {getStatusText(status)}
      </div>

      {status === "uploading" && (
        <div className="text-xs font-medium leading-[18px] text-gray-900">
          {Math.round(progress)}%
        </div>
      )}

      {shouldShowCTA(status, onOpenDocument, onFindResolution) && (
        <button
          type="button"
          onClick={handleCTAClick}
          className="text-xs leading-[18px] text-blue-900 hover:opacity-80"
        >
          {getCTAText(status)}
        </button>
      )}
    </div>
  );
}
