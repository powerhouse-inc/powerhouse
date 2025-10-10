import type { FileNode } from "document-drive";
import React from "react";
import { ModuleAccordion } from "./ModuleAccordion.js";
import { ModuleList } from "./ModuleList.js";

interface UserExperiencesColumnProps {
  editors: FileNode[];
  apps: FileNode[];
  onAddEditor?: () => void;
  onAddApp?: () => void;
  onOpenDocument?: (node: FileNode) => void;
  onDelete?: (node: FileNode) => void;
}

export const UserExperiencesColumn: React.FC<UserExperiencesColumnProps> = ({
  editors,
  apps,
  onAddEditor,
  onAddApp,
  onOpenDocument,
  onDelete,
}) => {
  return (
    <div>
      <h3 className="mb-4 text-sm font-normal text-gray-700">
        2. User Experiences
      </h3>
      <div className="rounded-md border border-zinc-200 bg-zinc-50">
        <ModuleAccordion
          title="Editors"
          count={editors.length}
          onAdd={onAddEditor || (() => console.log("Add editor clicked"))}
          defaultOpen={true}
          headerClassName="m-4 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 rounded-md"
        >
          <ModuleList
            items={editors}
            documentType="powerhouse/document-editor"
            onAddNewSpec={onAddEditor}
            onClickItem={onOpenDocument}
            onDelete={onDelete}
          />
        </ModuleAccordion>
        <ModuleAccordion
          title="Apps"
          count={apps.length}
          onAdd={onAddApp || (() => console.log("Add app clicked"))}
          defaultOpen={true}
          headerClassName="m-4 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 rounded-md"
        >
          <ModuleList
            items={apps}
            documentType="powerhouse/app"
            onAddNewSpec={onAddApp}
            onClickItem={onOpenDocument}
            onDelete={onDelete}
          />
        </ModuleAccordion>
      </div>
    </div>
  );
};
