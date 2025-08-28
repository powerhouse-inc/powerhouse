import type {
  IDriveContext,
  VetraDocumentModelModule,
  VetraEditorModule,
} from "@powerhousedao/reactor-browser";
import React from "react";
import { DOCUMENT_TYPES } from "../document-types.js";
import { EditorContainer } from "./EditorContainer.js";
import { SectionAccordion } from "./SectionAccordion.js";

interface PackageInformationSectionProps {
  className?: string;
  context: IDriveContext;
  packageDocumentId?: string;
  onAddPackageDocument?: () => void;
  documentModelModule?: VetraDocumentModelModule;
  editorModule?: VetraEditorModule;
  driveId: string;
}

export const PackageInformationSection: React.FC<
  PackageInformationSectionProps
> = ({
  className,
  context,
  packageDocumentId,
  onAddPackageDocument,
  documentModelModule,
  editorModule,
  driveId,
}) => {
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
        {packageDocumentId && documentModelModule && editorModule ? (
          <EditorContainer
            context={context}
            documentId={packageDocumentId}
            driveId={driveId}
            documentModelModule={documentModelModule}
            editorModule={editorModule}
            documentType={DOCUMENT_TYPES.documentPackage}
          />
        ) : (
          createpackageContent
        )}
      </div>
    </SectionAccordion>
  );
};
