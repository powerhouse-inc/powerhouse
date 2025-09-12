import type { FileNode } from "document-drive";
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
}

export const DataIntegrationsColumn: React.FC<DataIntegrationsColumnProps> = ({
  subgraphs,
  processors,
  codegenProcessors,
  onAddSubgraph,
  onAddProcessor,
  onAddCodegenProcessor,
  onOpenDocument,
}) => {
  return (
    <div>
      <h3 className="mb-4 text-sm font-normal text-gray-700">
        3. Data Integrations
      </h3>
      <div className="rounded-md border border-zinc-200 bg-zinc-50">
        <ModuleAccordion
          title="Subgraphs"
          count={subgraphs.length}
          onAdd={onAddSubgraph || (() => console.log("Add subgraph clicked"))}
          defaultOpen={true}
          headerClassName="m-4 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 rounded-md"
        >
          <ModuleList
            items={subgraphs}
            documentType={DOCUMENT_TYPES.documentSubgraph}
            onAddNewSpec={onAddSubgraph}
            onClickItem={onOpenDocument}
          />
        </ModuleAccordion>
        <ModuleAccordion
          title="Processors"
          count={processors.length}
          onAdd={onAddProcessor || (() => console.log("Add processor clicked"))}
          defaultOpen={true}
          headerClassName="m-4 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 rounded-md"
        >
          <ModuleList
            items={processors}
            documentType={DOCUMENT_TYPES.documentProcessor}
            onAddNewSpec={onAddProcessor}
            onClickItem={onOpenDocument}
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
          headerClassName="m-4 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 rounded-md"
        >
          <ModuleList
            items={codegenProcessors}
            documentType={DOCUMENT_TYPES.documentCodegenProcessor}
            onAddNewSpec={onAddCodegenProcessor}
            onClickItem={onOpenDocument}
          />
        </ModuleAccordion>
      </div>
    </div>
  );
};
