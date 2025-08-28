import type { FileNode } from "document-drive";
import React from "react";

import { DOCUMENT_TYPES } from "../document-types.js";
import { ModuleAccordion } from "./ModuleAccordion.js";
import { ModuleList } from "./ModuleList.js";

interface DocumentModelsColumnProps {
  documentModels: FileNode[];
  onAddDocumentModel?: () => void;
  onOpenDocument?: (node: FileNode) => void;
}

export const DocumentModelsColumn: React.FC<DocumentModelsColumnProps> = ({
  documentModels,
  onAddDocumentModel,
  onOpenDocument,
}) => {
  return (
    <div>
      <h3 className="mb-4 text-sm font-normal text-gray-700">
        1. Document Models
      </h3>
      <div className="rounded-md border border-zinc-200 bg-zinc-50">
        <ModuleAccordion
          title="Document Models"
          count={documentModels.length}
          onAdd={
            onAddDocumentModel ||
            (() => console.log("Add document model clicked"))
          }
          defaultOpen={true}
          headerClassName="m-4 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 rounded-md"
        >
          <ModuleList
            items={documentModels}
            documentType={DOCUMENT_TYPES.documentModel}
            onAddNewSpec={onAddDocumentModel}
            onClickItem={onOpenDocument}
          />
        </ModuleAccordion>
      </div>
    </div>
  );
};
