import { type FileNode } from "document-drive";
import type React from 'react';
import { DataIntegrationsColumn } from './DataIntegrationsColumn.js';
import { DocumentModelsColumn } from './DocumentModelsColumn.js';
import { SectionAccordion } from './SectionAccordion.js';
import { UserExperiencesColumn } from './UserExperiencesColumn.js';

interface ModuleSpecificationsSectionProps {
  documentModels: FileNode[];
  editors: FileNode[];
  apps: FileNode[];
  subgraphs: FileNode[];
  processors: FileNode[];
  codegenProcessors: FileNode[];
  onAddDocumentModel?: () => void;
  onAddEditor?: () => void;
  onAddApp?: () => void;
  onAddSubgraph?: () => void;
  onAddProcessor?: () => void;
  onAddCodegenProcessor?: () => void;
  onOpenDocument?: (node: FileNode) => void;
}

export const ModuleSpecificationsSection: React.FC<ModuleSpecificationsSectionProps> = (props) => {
  return (
    <SectionAccordion title="Module Specifications" defaultOpen={true}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-4">
        <DocumentModelsColumn
          documentModels={props.documentModels}
          onAddDocumentModel={props.onAddDocumentModel}
          onOpenDocument={props.onOpenDocument}
        />
        <UserExperiencesColumn
          editors={props.editors}
          apps={props.apps}
          onAddEditor={props.onAddEditor}
          onAddApp={props.onAddApp}
          onOpenDocument={props.onOpenDocument}
        />
        <DataIntegrationsColumn
          subgraphs={props.subgraphs}
          processors={props.processors}
          codegenProcessors={props.codegenProcessors}
          onAddSubgraph={props.onAddSubgraph}
          onAddProcessor={props.onAddProcessor}
          onAddCodegenProcessor={props.onAddCodegenProcessor}
          onOpenDocument={props.onOpenDocument}
        />
      </div>
    </SectionAccordion>
  );
};