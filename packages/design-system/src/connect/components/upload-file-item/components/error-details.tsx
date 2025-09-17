import type { UploadFileItemStatus } from "@powerhousedao/design-system";

type ErrorDetailsProps = {
  readonly status: UploadFileItemStatus;
  readonly errorDetails?: string;
};

export function UploadFileItemErrorDetails(props: ErrorDetailsProps) {
  const { status, errorDetails } = props;

  if (!(status === "failed" && errorDetails)) return null;

  return (
    <div className="break-words text-xs leading-[18px] text-gray-500">
      {errorDetails}
    </div>
  );
}
