import type { UploadFileItemStatus } from "../upload-file-item.js";

type ErrorDetailsProps = {
  readonly status: UploadFileItemStatus;
  readonly errorDetails?: string;
};

export function UploadFileItemErrorDetails(props: ErrorDetailsProps) {
  const { status, errorDetails } = props;

  if (
    !(
      (status === "failed" || status === "unsupported-document-type") &&
      errorDetails
    )
  )
    return null;

  return (
    <div className="text-xs leading-[18px] wrap-break-word text-muted-foreground">
      {errorDetails}
    </div>
  );
}
