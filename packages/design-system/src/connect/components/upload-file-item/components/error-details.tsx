import { type UploadFileItemStatus } from "../upload-file-item.js";

type ErrorDetailsProps = {
  readonly status: UploadFileItemStatus;
  readonly errorDetails?: string;
};

export function ErrorDetails(props: ErrorDetailsProps) {
  const { status, errorDetails } = props;

  if (
    !(
      (status === "failed" || status === "unsupported-document-type") &&
      errorDetails
    )
  )
    return null;

  return (
    <div className="break-words text-xs leading-[18px] text-gray-500">
      {errorDetails}
    </div>
  );
}
