import {
  ErrorDetails,
  Header,
  ProgressBar,
  StatusRow,
} from "@powerhousedao/design-system";
import type { DocumentTypeIcon } from "@powerhousedao/reactor-browser";
import { type ComponentPropsWithoutRef, forwardRef } from "react";
import { twMerge } from "tailwind-merge";

export type UploadFileItemStatus =
  | "success"
  | "failed"
  | "pending"
  | "uploading"
  | "conflict"
  | "unsupported-document-type";

export type UploadFileItemProps = ComponentPropsWithoutRef<"div"> & {
  readonly fileName: string;
  readonly fileSize: string;
  readonly status: UploadFileItemStatus;
  readonly documentType?: DocumentTypeIcon;
  readonly progress?: number;
  readonly errorDetails?: string;
  readonly onClose?: () => void;
  readonly onOpenDocument?: () => void;
  readonly onFindResolution?: () => void;
};

export const UploadFileItem = forwardRef<HTMLDivElement, UploadFileItemProps>(
  function UploadFileItem(props, ref) {
    const {
      fileName,
      fileSize,
      status,
      documentType,
      progress = 0,
      errorDetails,
      onClose,
      onOpenDocument,
      onFindResolution,
      className,
      ...delegatedProps
    } = props;

    return (
      <div
        ref={ref}
        className={twMerge(
          "flex w-full flex-col gap-0.5 rounded-md border border-gray-100 bg-white p-2 shadow-[0_2px_12px_rgba(37,42,52,0.1)]",
          className,
        )}
        {...delegatedProps}
      >
        <Header
          fileName={fileName}
          fileSize={fileSize}
          documentType={documentType}
          onClose={onClose}
        />

        <div className="flex flex-col gap-1">
          <StatusRow
            status={status}
            progress={progress}
            onOpenDocument={onOpenDocument}
            onFindResolution={onFindResolution}
          />
          <ProgressBar status={status} progress={progress} />
          <ErrorDetails status={status} errorDetails={errorDetails} />
        </div>
      </div>
    );
  },
);
