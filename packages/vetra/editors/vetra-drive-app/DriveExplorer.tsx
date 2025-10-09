import type { FileNode } from "document-drive";
import type { EditorContext } from "document-model";
import type React from "react";
import { DriveHeader } from "./components/DriveHeader.js";
import { ModuleSpecificationsSection } from "./components/ModuleSpecificationsSection.js";
import { PackageInformationSection } from "./components/PackageInformationSection.js";

interface DriveExplorerProps {
  context?: EditorContext;
  documentModels?: FileNode[];
  editors?: FileNode[];
  apps?: FileNode[];
  subgraphs?: FileNode[];
  processors?: FileNode[];
  codegenProcessors?: FileNode[];
  onShareDrive?: () => void;
  onAddDocumentModel?: () => void;
  onAddEditor?: () => void;
  onAddApp?: () => void;
  onAddSubgraph?: () => void;
  onAddProcessor?: () => void;
  onAddCodegenProcessor?: () => void;
  packageDocumentId?: string;
  onAddPackageDocument?: () => void;
  onOpenPackageDocument?: () => void;
  onOpenDocument?: (node: FileNode) => void;
  onDelete?: (node: FileNode) => void;
}

export const DriveExplorer: React.FC<DriveExplorerProps> = ({
  documentModels = [],
  editors = [],
  apps = [],
  subgraphs = [],
  processors = [],
  codegenProcessors = [],
  onShareDrive,
  onAddDocumentModel,
  onAddEditor,
  onAddApp,
  onAddSubgraph,
  onAddProcessor,
  onAddCodegenProcessor,
  packageDocumentId,
  onAddPackageDocument,
  onOpenPackageDocument,
  onOpenDocument,
  onDelete,
}) => {
  return (
    <div className="min-h-screen bg-white">
      <DriveHeader onShareClick={onShareDrive} />

      <div className="mx-6 mt-6 bg-white">
        <PackageInformationSection
          className="mb-6"
          packageDocumentId={packageDocumentId}
          onAddPackageDocument={onAddPackageDocument}
          onOpenPackageDocument={onOpenPackageDocument}
        />
        <ModuleSpecificationsSection
          documentModels={documentModels}
          editors={editors}
          apps={apps}
          subgraphs={subgraphs}
          processors={processors}
          codegenProcessors={codegenProcessors}
          onAddDocumentModel={onAddDocumentModel}
          onAddEditor={onAddEditor}
          onAddApp={onAddApp}
          onAddSubgraph={onAddSubgraph}
          onAddProcessor={onAddProcessor}
          onAddCodegenProcessor={onAddCodegenProcessor}
          onOpenDocument={onOpenDocument}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
};
