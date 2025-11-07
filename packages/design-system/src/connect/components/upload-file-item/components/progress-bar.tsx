import type { UploadFileItemStatus } from "../upload-file-item.js";

type ProgressBarProps = {
  readonly status: UploadFileItemStatus;
  readonly progress?: number;
};

export function UploadFileItemProgressBar(props: ProgressBarProps) {
  const { status, progress = 0 } = props;

  if (status !== "uploading") return null;

  const clamped = Math.min(100, Math.max(0, progress));

  return (
    <div className="h-2 w-full overflow-hidden rounded-sm bg-gray-200">
      <div
        className="h-full bg-blue-900 transition-all duration-300 ease-out"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
