---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/components/FolderItemsGrid.tsx"
unless_exists: true
---
import {
  FolderItem,
  type UiFolderNode,
  type UiNode,
  type BaseUiFolderNode,
  type BaseUiNode,
} from "@powerhousedao/design-system";
import { useState } from "react";

interface FolderItemsGridProps {
  folders: UiFolderNode[];
  onSelectNode: (node: BaseUiFolderNode) => void;
  onRenameNode: (nodeId: string, name: string) => void;
  onDuplicateNode: (node: BaseUiFolderNode) => void;
  onDeleteNode: (nodeId: string) => void;
  onAddFile: (file: File, parentNode: BaseUiNode | null) => Promise<void>;
  onCopyNode: (uiNode: BaseUiNode, targetNode: BaseUiNode) => Promise<void>;
  onMoveNode: (uiNode: BaseUiNode, targetNode: BaseUiNode) => Promise<void>;
  isAllowedToCreateDocuments: boolean;
  onAddFolder: (name: string, parentFolder?: string) => void;
  parentFolderId?: string;
}

export function FolderItemsGrid({
  folders,
  onSelectNode,
  onRenameNode,
  onDuplicateNode,
  onDeleteNode,
  onAddFile,
  onCopyNode,
  onMoveNode,
  isAllowedToCreateDocuments,
  onAddFolder,
  parentFolderId,
}: FolderItemsGridProps) {
  const [newFolderName, setNewFolderName] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newFolderName.trim()) {
      onAddFolder(newFolderName.trim(), parentFolderId);
      setNewFolderName("");
    }
  };

  return (
    <div className="mb-6">
      <div className="flex items-center gap-4 mb-2">
        <h3 className="text-sm font-medium text-gray-500">Folders</h3>
        
        {/* New Folder Input */}
        <form onSubmit={handleSubmit} className="w-48">
          <div className="relative">
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Create new folder..."
              className="w-full px-3 py-1.5 pr-8 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              type="submit"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none text-sm"
            >
              +
            </button>
          </div>
        </form>
      </div>

      {folders.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {folders.map((folder) => (
            <FolderItem
              key={folder.id}
              uiNode={folder}
              onSelectNode={onSelectNode}
              onRenameNode={(name) => onRenameNode(folder.id, name)}
              onDuplicateNode={onDuplicateNode}
              onDeleteNode={() => onDeleteNode(folder.id)}
              onAddFile={onAddFile}
              onCopyNode={onCopyNode}
              onMoveNode={onMoveNode}
              isAllowedToCreateDocuments={isAllowedToCreateDocuments}
            />
          ))}
        </div>
      )}
    </div>
  );
} 