---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/components/FolderTree.tsx"
unless_exists: true
---
import { useState } from 'react';
import type { UiFolderNode } from "@powerhousedao/design-system";

interface FolderTreeProps {
  folders: UiFolderNode[];
  selectedNodeId?: string;
  onSelectNode: (node: UiFolderNode) => void;
}

export function FolderTree({ folders, selectedNodeId, onSelectNode }: FolderTreeProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const renderFolder = (folder: UiFolderNode, level: number = 0) => {
    const hasChildren = folders.some(f => f.parentFolder === folder.id);
    const isExpanded = expandedFolders.has(folder.id);
    const isSelected = selectedNodeId === folder.id;

    return (
      <div key={folder.id}>
        <div
          className={`flex items-center py-1 px-2 cursor-pointer hover:bg-gray-100 rounded ${
            isSelected ? 'bg-gray-100' : ''
          }`}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          onClick={() => onSelectNode(folder)}
        >
          {hasChildren && (
            <button
              className="w-4 h-4 mr-1 flex items-center justify-center"
              onClick={(e) => {
                e.stopPropagation();
                toggleFolder(folder.id);
              }}
            >
              {isExpanded ? '▼' : '▶'}
            </button>
          )}
          <span className="text-sm">{folder.name}</span>
        </div>
        {isExpanded && hasChildren && (
          <div>
            {folders
              .filter(f => f.parentFolder === folder.id)
              .map(child => renderFolder(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-1">
      {/* Root Directory Option */}
      <div
        className={`flex items-center py-1 px-2 cursor-pointer hover:bg-gray-100 rounded ${
          !selectedNodeId ? 'bg-gray-100' : ''
        }`}
        onClick={() => onSelectNode({ id: '', name: 'Root', kind: 'FOLDER' } as UiFolderNode)}
      >
        <span className="text-sm font-medium">Root</span>
      </div>

      {/* Folder Tree */}
      {folders
        .filter(folder => !folder.parentFolder)
        .map(folder => renderFolder(folder))}
    </div>
  );
} 