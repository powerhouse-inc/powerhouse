---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/hooks/useTransformedNodes.ts"
unless_exists: true
---
import { useMemo } from 'react';
import type { Node, FileNode } from 'document-drive';
import type { UiFileNode, UiFolderNode } from '@powerhousedao/design-system';

export function useTransformedNodes(nodes: Node[], driveId: string) {
  return useMemo(() => {
    return nodes.map(node => {
      const isFolder = 'kind' in node && node.kind === 'folder';
      
      if (isFolder) {
        return {
          id: node.id,
          name: node.name,
          kind: 'FOLDER' as const,
          parentFolder: node.parentFolder || '',
          driveId,
          children: nodes.filter(n => n.parentFolder === node.id).map(n => n.id)
        };
      } else {
        return {
          id: node.id,
          name: node.name,
          kind: 'FILE' as const,
          parentFolder: node.parentFolder || '',
          driveId,
          documentType: (node as FileNode).documentType
        };
      }
    }).filter(Boolean) as (UiFileNode | UiFolderNode)[];
  }, [nodes, driveId]);
} 