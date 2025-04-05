---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/components/FileItemsGrid.tsx"
unless_exists: true
---
import { FileItem, type UiFileNode, type BaseUiFileNode } from "@powerhousedao/design-system";

interface FileItemsGridProps {
  files: UiFileNode[];
  onSelectNode: (node: BaseUiFileNode) => void;
  onRenameNode: (nodeId: string, name: string) => void;
  onDuplicateNode: (node: BaseUiFileNode) => void;
  onDeleteNode: (nodeId: string) => void;
  isAllowedToCreateDocuments: boolean;
}

export function FileItemsGrid({
  files,
  onSelectNode,
  onRenameNode,
  onDuplicateNode,
  onDeleteNode,
  isAllowedToCreateDocuments,
}: FileItemsGridProps) {
  if (files.length === 0) return null;

  return (
    <div>
      <h3 className="text-sm font-medium text-gray-500 mb-2">Files</h3>
      <div className="flex flex-wrap gap-2">
        {files.map((file) => (
          <FileItem
            key={file.id}
            uiNode={file}
            onSelectNode={onSelectNode}
            onRenameNode={(name) => onRenameNode(file.id, name)}
            onDuplicateNode={onDuplicateNode}
            onDeleteNode={() => onDeleteNode(file.id)}
            isAllowedToCreateDocuments={isAllowedToCreateDocuments}
          />
        ))}
      </div>
    </div>
  );
} 