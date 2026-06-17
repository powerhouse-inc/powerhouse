import type { FileNode } from "@powerhousedao/shared/document-drive";
import React from "react";

import { DOCUMENT_TYPES } from "../document-types.js";
import { ModuleAccordion } from "./ModuleAccordion.js";
import { ModuleList } from "./ModuleList.js";

interface DocumentModelsColumnProps {
  documentModels: FileNode[];
  onAddDocumentModel?: () => void;
  onOpenDocument?: (node: FileNode) => void;
  onDelete?: (node: FileNode) => void;
}

export const DocumentModelsColumn: React.FC<DocumentModelsColumnProps> = ({
  documentModels,
  onAddDocumentModel,
  onOpenDocument,
  onDelete,
}) => {
  return (
    <div>
      <h3 className="mb-4 text-sm font-normal text-foreground">
        1. Document Models
      </h3>
      <div className="rounded-md border border-border bg-background">
        <ModuleAccordion
          title="Document Models"
          count={documentModels.length}
          onAdd={
            onAddDocumentModel ||
            (() => console.log("Add document model clicked"))
          }
          defaultOpen={true}
          headerClassName="m-4 rounded-md border border-border bg-muted hover:hover-effect"
        >
          <ModuleList
            items={documentModels}
            documentType={DOCUMENT_TYPES.documentModel}
            onAddNewSpec={onAddDocumentModel}
            onClickItem={onOpenDocument}
            onDelete={onDelete}
          />
        </ModuleAccordion>
      </div>
    </div>
  );
};
