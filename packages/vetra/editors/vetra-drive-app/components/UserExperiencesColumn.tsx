import type { FileNode } from "document-drive";
import React from "react";
import { DOCUMENT_TYPES } from "../document-types.js";
import { ModuleAccordion } from "./ModuleAccordion.js";
import { ModuleList } from "./ModuleList.js";

interface UserExperiencesColumnProps {
  editors: FileNode[];
  apps: FileNode[];
  onAddEditor?: () => void;
  onAddApp?: () => void;
  onOpenDocument?: (node: FileNode) => void;
}

export const UserExperiencesColumn: React.FC<UserExperiencesColumnProps> = ({
  editors,
  apps,
  onAddEditor,
  onAddApp,
  onOpenDocument,
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
            documentType={DOCUMENT_TYPES.documentEditor}
            onAddNewSpec={onAddEditor}
            onClickItem={onOpenDocument}
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
            documentType={DOCUMENT_TYPES.documentApp}
            onAddNewSpec={onAddApp}
            onClickItem={onOpenDocument}
          />
        </ModuleAccordion>
      </div>
    </div>
  );
};
