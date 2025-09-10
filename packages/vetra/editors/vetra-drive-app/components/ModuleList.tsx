import type { FileNode } from "document-drive";
import type React from "react";
import { ModuleItem } from "./ModuleItem.js";
import { NewModuleItem } from "./NewModuleItem.js";

interface ModuleListProps {
  items: FileNode[];
  documentType: string;
  onAddNewSpec?: () => void;
  onClickItem?: (node: FileNode) => void;
}

export const ModuleList: React.FC<ModuleListProps> = ({
  items,
  documentType,
  onAddNewSpec = () => {},
  onClickItem = () => {},
}) => {
  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={index} className="px-2 py-1 text-sm text-gray-600">
          <ModuleItem fileNode={item} onClick={onClickItem} />
        </div>
      ))}
      <div className="px-2 py-1 text-sm text-gray-600">
        <NewModuleItem
          title="Add new specification"
          subtitle={documentType}
          onClick={onAddNewSpec}
        />
      </div>
    </div>
  );
};
