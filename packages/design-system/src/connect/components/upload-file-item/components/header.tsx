import type { IconName } from "@powerhousedao/design-system";
import { Icon } from "@powerhousedao/design-system";
import type { DocumentTypeIcon } from "@powerhousedao/reactor-browser";
import type { ComponentPropsWithoutRef } from "react";

type HeaderProps = ComponentPropsWithoutRef<"div"> & {
  readonly fileName: string;
  readonly fileSize: string;
  readonly documentType?: DocumentTypeIcon;
  readonly onClose?: () => void;
};

function getDocumentIcon(documentType?: DocumentTypeIcon): IconName {
  switch (documentType) {
    case "analytics-processor":
      return "AnalyticsProcessorModule";
    case "relational-processor":
      return "RelationalProcessorModule";
    case "codegen-processor":
      return "CodegenProcessorModule";
    case "app":
      return "AppModule";
    case "document-model":
      return "DocumentModelModule";
    case "editor":
      return "EditorModule";
    case "package":
      return "PackageModule";
    case "subgraph":
      return "SubgraphModule";
    default:
      return "PowerhouseDocumentModule";
  }
}

export function UploadFileItemHeader(props: HeaderProps) {
  const { fileName, fileSize, documentType, onClose, ...delegatedProps } =
    props;

  return (
    <div className="flex items-center gap-2" {...delegatedProps}>
      <div className="flex h-9 w-7 flex-shrink-0 items-center justify-center">
        <Icon
          name={getDocumentIcon(documentType)}
          size={48}
          className="text-gray-600"
        />
      </div>

      <div className="flex flex-1 flex-col gap-0.5">
        <div className="text-xs font-medium leading-[18px] text-gray-900">
          {fileName}
        </div>
        <div className="text-xs font-medium leading-[18px] text-gray-500">
          {fileSize}
        </div>
      </div>

      {onClose && (
        <div className="flex h-9 w-[18px] flex-shrink-0 items-start justify-center">
          <button
            type="button"
            onClick={onClose}
            className="flex h-[18px] w-[18px] items-center justify-center text-gray-600 hover:text-gray-800"
            aria-label="Close"
          >
            <Icon name="XmarkLight" size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
