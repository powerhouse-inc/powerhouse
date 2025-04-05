---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/hooks/useSelectedFolderChildren.ts"
unless_exists: true
---
import { useMemo } from 'react';
import type { UiFileNode, UiFolderNode } from '@powerhousedao/design-system';

interface SelectedFolderChildren {
  folders: UiFolderNode[];
  files: UiFileNode[];
}

export function useSelectedFolderChildren(
  selectedNodeId: string | undefined,
  folders: UiFolderNode[],
  files: UiFileNode[]
): SelectedFolderChildren {
  return useMemo(() => {
    if (!selectedNodeId) {
      // Show root-level items when no folder is selected
      return {
        folders: folders.filter(f => !f.parentFolder),
        files: files.filter(f => !f.parentFolder)
      };
    }
    
    const selectedFolder = folders.find(f => f.id === selectedNodeId);
    if (!selectedFolder) return { folders: [], files: [] };

    return {
      folders: folders.filter(f => f.parentFolder === selectedFolder.id),
      files: files.filter(f => f.parentFolder === selectedFolder.id)
    };
  }, [selectedNodeId, folders, files]);
} 