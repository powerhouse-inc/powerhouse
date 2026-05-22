import type { FileNode } from "@powerhousedao/shared/document-drive";
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
      <h3 className="mb-4 text-sm font-normal text-gray-700 dark:text-slate-200">
        2. User Experiences
      </h3>
      <div className="rounded-md border border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-900">
        <ModuleAccordion
          title="Editors"
          count={editors.length}
          onAdd={onAddEditor || (() => console.log("Add editor clicked"))}
          defaultOpen={true}
          headerClassName="m-4 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-md dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-700"
        >
          <ModuleList
            items={editors}
            documentType={DOCUMENT_TYPES.documentEditor}
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
          headerClassName="m-4 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-md dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-700"
        >
          <ModuleList
            items={apps}
            documentType={DOCUMENT_TYPES.documentApp}
            onAddNewSpec={onAddApp}
            onClickItem={onOpenDocument}
            onDelete={onDelete}
          />
        </ModuleAccordion>
      </div>
    </div>
  );
};
