import type { NodeOption } from "@powerhousedao/design-system";
import {
  cn,
  ConnectDropdownMenu,
  Icon,
  nodeOptionsMap,
} from "@powerhousedao/design-system";
import type { FileNode } from "document-drive";
import React, { useState } from "react";
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
  onDelete?: (file: FileNode) => void;
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
  onDelete,
  className = "",
}) => {
  const IconComponent = getIconForDocumentType(fileNode.documentType);
  const [isDropdownMenuOpen, setIsDropdownMenuOpen] = useState(false);

  // Only show DELETE option
  const dropdownMenuOptions = [
    {
      ...nodeOptionsMap.DELETE,
      id: "DELETE" as NodeOption,
    },
  ];

  const dropdownMenuHandlers = {
    DELETE: () => onDelete?.(fileNode),
  } as const;

  function onDropdownMenuOptionClick(itemId: NodeOption) {
    const handler =
      dropdownMenuHandlers[itemId as keyof typeof dropdownMenuHandlers];

    handler();
    setIsDropdownMenuOpen(false);
  }

  return (
    <div
      onClick={() => onClick(fileNode)}
      className={cn(
        "group flex w-full cursor-pointer items-center gap-3 rounded-md bg-zinc-100 p-1 text-left transition-colors hover:bg-zinc-200",
        className,
      )}
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
      {onDelete ? (
        <ConnectDropdownMenu
          items={dropdownMenuOptions}
          onItemClick={onDropdownMenuOptionClick}
          onOpenChange={setIsDropdownMenuOpen}
          open={isDropdownMenuOpen}
          menuClassName="border-zinc-200"
        >
          <button
            className={cn(
              "hidden group-hover:block",
              isDropdownMenuOpen && "block",
            )}
            onClick={(e) => {
              e.stopPropagation();
              setIsDropdownMenuOpen(true);
            }}
          >
            <Icon className="text-gray-600" name="VerticalDots" />
          </button>
        </ConnectDropdownMenu>
      ) : null}
    </div>
  );
};
