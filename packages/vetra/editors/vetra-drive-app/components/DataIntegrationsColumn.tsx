import type { FileNode } from "@powerhousedao/shared/document-drive";
import React from "react";
import { DOCUMENT_TYPES } from "../document-types.js";
import { ModuleAccordion } from "./ModuleAccordion.js";
import { ModuleList } from "./ModuleList.js";

interface DataIntegrationsColumnProps {
  subgraphs: FileNode[];
  processors: FileNode[];
  codegenProcessors: FileNode[];
  onAddSubgraph?: () => void;
  onAddProcessor?: () => void;
  onAddCodegenProcessor?: () => void;
  onOpenDocument?: (node: FileNode) => void;
  onDelete?: (node: FileNode) => void;
}

export const DataIntegrationsColumn: React.FC<DataIntegrationsColumnProps> = ({
  subgraphs,
  processors,
  codegenProcessors,
  onAddSubgraph,
  onAddProcessor,
  onAddCodegenProcessor,
  onOpenDocument,
  onDelete,
}) => {
  return (
    <div>
      <h3 className="mb-4 text-sm font-normal text-gray-700 dark:text-slate-200">
        3. Data Integrations
      </h3>
      <div className="rounded-md border border-gray-200 bg-gray-50 dark:border-slate-500 dark:bg-slate-600 dark:text-slate-100">
        <ModuleAccordion
          title="Subgraphs"
          count={subgraphs.length}
          onAdd={onAddSubgraph || (() => console.log("Add subgraph clicked"))}
          defaultOpen={true}
          headerClassName="m-4 bg-gray-100 hover:effect border border-gray-200 rounded-md dark:border-slate-500 dark:bg-slate-600 dark:text-slate-100"
        >
          <ModuleList
            items={subgraphs}
            documentType={DOCUMENT_TYPES.documentSubgraph}
            onAddNewSpec={onAddSubgraph}
            onClickItem={onOpenDocument}
            onDelete={onDelete}
          />
        </ModuleAccordion>
        <ModuleAccordion
          title="Processors"
          count={processors.length}
          onAdd={onAddProcessor || (() => console.log("Add processor clicked"))}
          defaultOpen={true}
          headerClassName="m-4 bg-gray-100 hover:effect border border-gray-200 rounded-md dark:border-slate-500 dark:bg-slate-600 dark:text-slate-100"
        >
          <ModuleList
            items={processors}
            documentType={DOCUMENT_TYPES.documentProcessor}
            onAddNewSpec={onAddProcessor}
            onClickItem={onOpenDocument}
            onDelete={onDelete}
          />
        </ModuleAccordion>
        <ModuleAccordion
          title="Codegen Processor"
          count={codegenProcessors.length}
          onAdd={
            onAddCodegenProcessor ||
            (() => console.log("Add codegen processor clicked"))
          }
          defaultOpen={true}
          headerClassName="m-4 bg-gray-100 hover:effect border border-gray-200 rounded-md dark:border-slate-500 dark:bg-slate-600 dark:text-slate-100"
        >
          <ModuleList
            items={codegenProcessors}
            documentType={DOCUMENT_TYPES.documentCodegenProcessor}
            onAddNewSpec={onAddCodegenProcessor}
            onClickItem={onOpenDocument}
            onDelete={onDelete}
          />
        </ModuleAccordion>
      </div>
    </div>
  );
};
