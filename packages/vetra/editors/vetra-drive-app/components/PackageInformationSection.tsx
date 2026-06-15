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
      className="my-2 h-50 w-full rounded-md border border-dashed border-border bg-background"
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
        className="hover:hover-effect flex items-center justify-center rounded-sm bg-background p-1 text-foreground transition-colors"
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
