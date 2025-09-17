import type { FileNode } from "document-drive";
import React from "react";
import { DOCUMENT_TYPES } from "../document-types.js";
import { AddNewIcon } from "../icons/AddNewIcon.js";
import { AppIcon } from "../icons/AppIcon.js";
import { DocModelIcon } from "../icons/DocModelIcon.js";
import { EditorIcon } from "../icons/EditorIcon.js";
import { ProcessorIcon } from "../icons/ProcessorIcon.js";
import { SubgraphIcon } from "../icons/SubgraphIcon.js";
interface ModuleItemProps {
  fileNode: FileNode;
  onClick: (file: FileNode) => void;
  className?: string;
}

const getIconForDocumentType = (documentType: string) => {
  switch (documentType) {
    case DOCUMENT_TYPES.documentModel:
      return DocModelIcon;
    case DOCUMENT_TYPES.documentEditor:
      return EditorIcon;
    case DOCUMENT_TYPES.documentSubgraph:
      return SubgraphIcon;
    case DOCUMENT_TYPES.documentProcessor:
      return ProcessorIcon;
    case DOCUMENT_TYPES.documentApp:
      return AppIcon;
    case "new":
      return AddNewIcon;
    default:
      return DocModelIcon;
  }
};

export const ModuleItem: React.FC<ModuleItemProps> = ({
  fileNode,
  onClick,
  className = "",
}) => {
  const IconComponent = getIconForDocumentType(fileNode.documentType);

  return (
    <button
      onClick={() => onClick(fileNode)}
      className={`flex w-full items-center gap-3 rounded-md bg-zinc-100 p-1 text-left transition-colors hover:bg-zinc-200 ${className}`}
    >
      <div className="flex-shrink-0">
        <IconComponent />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-medium text-gray-900">
          {fileNode.name}
        </h3>
        <p className="truncate text-xs text-gray-500">
          {fileNode.documentType}
        </p>
      </div>
    </button>
  );
};
