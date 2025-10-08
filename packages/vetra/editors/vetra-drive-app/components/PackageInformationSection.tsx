import React from "react";
import { EditorContainer } from "./EditorContainer.js";
import { SectionAccordion } from "./SectionAccordion.js";

interface PackageInformationSectionProps {
  className?: string;
  packageDocumentId?: string;
  onAddPackageDocument?: () => void;
}

export const PackageInformationSection: React.FC<
  PackageInformationSectionProps
> = ({ className, packageDocumentId, onAddPackageDocument }) => {
  const createpackageContent = (
    <button
      className="my-2 h-[200px] w-full rounded-md border border-dashed border-zinc-200 bg-zinc-50"
      onClick={onAddPackageDocument}
    >
      Click to create package manifest
    </button>
  );

  return (
    <SectionAccordion
      title="Package Information"
      defaultOpen={true}
      className={className}
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
