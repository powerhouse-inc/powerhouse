import { type FileNode } from 'document-drive';
import type React from 'react';
import { DOCUMENT_TYPES } from '../document-types.js';
import { AddNewIcon } from '../icons/AddNewIcon.js';
import { DocModelIcon } from '../icons/DocModelIcon.js';
import { EditorIcon } from '../icons/EditorIcon.js';
import { ProcessorIcon } from '../icons/ProcessorIcon.js';
import { SubgraphIcon } from '../icons/SubgraphIcon.js';
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
    case 'new':
      return AddNewIcon;
    default:
      return DocModelIcon;
  }
};

export const ModuleItem: React.FC<ModuleItemProps> = ({
  fileNode,
  onClick,
  className = ''
}) => {
  const IconComponent = getIconForDocumentType(fileNode.documentType);

  return (
    <button
      onClick={() => onClick(fileNode)}
      className={`flex items-center gap-3 p-1 w-full text-left hover:bg-zinc-200 rounded-md transition-colors bg-zinc-100 ${className}`}
    >
      <div className="flex-shrink-0">
        <IconComponent />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-medium text-gray-900 truncate">
          {fileNode.name}
        </h3>
        <p className="text-xs text-gray-500 truncate">
          {fileNode.documentType}
        </p>
      </div>
    </button>
  );
};