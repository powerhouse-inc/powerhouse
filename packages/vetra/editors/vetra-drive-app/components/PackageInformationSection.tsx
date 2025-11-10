import { Icon } from "@powerhousedao/design-system/powerhouse/components/icon/icon";
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
      className="my-2 h-[200px] w-full rounded-md border border-dashed border-zinc-200 bg-zinc-50"
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
        className="flex items-center justify-center rounded p-1 text-gray-600 transition-colors hover:bg-zinc-200 hover:text-gray-800"
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
