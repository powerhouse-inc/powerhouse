import type { FolderNode } from "document-drive";
import { useState } from "react";

interface FolderTreeProps {
  folders: FolderNode[];
  selectedNodeId?: string;
  onSelectNode: (nodeId: string | undefined) => void;
}

/**
 * Hierarchical folder tree navigation component.
 * Displays folders in a tree structure with expand/collapse functionality.
 */
export function FolderTree({
  folders,
  selectedNodeId,
  onSelectNode,
}: FolderTreeProps) {
  // Track which folders are expanded
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(),
  );

  // Toggle folder expansion state
  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  // Recursive function to render folder tree structure
  const renderFolder = (folder: FolderNode, level = 0) => {
    const hasChildren = folders.some((f) => f.parentFolder === folder.id);
    const isExpanded = expandedFolders.has(folder.id);
    const isSelected = selectedNodeId === folder.id;

    return (
      <div key={folder.id}>
        <div
          className={`flex cursor-pointer items-center rounded px-2 py-1 text-sm hover:bg-gray-100 ${
            isSelected ? "bg-blue-100 text-blue-800" : ""
          }`}
          style={{ paddingLeft: `${level * 16 + 8}px` }} // Customize indentation here
          onClick={() => onSelectNode(folder.id)}
        >
          {/* Expand/collapse button for folders with children */}
          {hasChildren && (
            <button
              className="mr-1 flex h-4 w-4 items-center justify-center"
              onClick={(e) => {
                e.stopPropagation();
                toggleFolder(folder.id);
              }}
            >
              {isExpanded ? "▼" : "▶"} {/* Customize expand icons here */}
            </button>
          )}
          {!hasChildren && <div className="mr-1 w-5" />}
          {/* Customize folder icon and styling here */}
          <span>📁 {folder.name}</span>
        </div>
        {/* Recursively render child folders when expanded */}
        {isExpanded && hasChildren && (
          <div>
            {folders
              .filter((f) => f.parentFolder === folder.id)
              .map((child) => renderFolder(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-1">
      {/* Root Directory Option */}
      {/* Customize root folder appearance here */}
      <div
        className={`flex cursor-pointer items-center rounded px-2 py-1 text-sm hover:bg-gray-100 ${
          !selectedNodeId ? "bg-blue-100 text-blue-800" : ""
        }`}
        onClick={() => onSelectNode(undefined)}
      >
        <span>🏠 Root</span>
      </div>

      {/* Render top-level folders (no parent) */}
      {folders
        .filter((folder) => !folder.parentFolder)
        .map((folder) => renderFolder(folder))}
    </div>
  );
}
