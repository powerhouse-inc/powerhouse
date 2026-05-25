import { Icon } from "@powerhousedao/design-system";
import React from "react";
import { EditorContainer } from "./EditorContainer.js";
import { SectionAccordion } from "./SectionAccordion.js";

interface PackageInformationSectionProps {
  className?: string;
  packageDocumentId?: string;
  onAddPackageDocument?: () => void;
  onOpenPackageDocument?: () => void;
}

export const PackageInformationSection: React.FC<
  PackageInformationSectionProps
> = ({
  className,
  packageDocumentId,
  onAddPackageDocument,
  onOpenPackageDocument,
}) => {
  const createpackageContent = (
    <button
      className="my-2 h-50 w-full rounded-md border border-dashed border-gray-200 bg-gray-50 dark:border-slate-500 dark:bg-slate-600 dark:text-slate-100"
      onClick={onAddPackageDocument}
    >
      Click to create package manifest
    </button>
  );

  const openButton =
    packageDocumentId && onOpenPackageDocument ? (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onOpenPackageDocument();
        }}
        className="flex items-center justify-center rounded-sm bg-gray-50 p-1 text-gray-600 transition-colors hover:bg-gray-200 hover:text-gray-800 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-600 dark:hover:text-slate-100"
        aria-label="Open package document"
      >
        <Icon name="Moved" size={16} />
      </button>
    ) : undefined;

  return (
    <SectionAccordion
      title="Package Information"
      defaultOpen={true}
      className={className}
      actionButton={openButton}
    >
      <div className="">
        {packageDocumentId ? (
          <EditorContainer documentId={packageDocumentId} />
        ) : (
          createpackageContent
        )}
      </div>
    </SectionAccordion>
  );
};
