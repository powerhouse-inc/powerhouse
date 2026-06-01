import { Icon } from "#design-system";
import {
  addFolder,
  setSelectedDrive,
  setSelectedNode,
  useDragNode,
  useDropNode,
  useSelectedDriveId,
  useSelectedDriveSafe,
  useSelectedNodePath,
  useUserPermissions,
} from "@powerhousedao/reactor-browser";
import { Fragment, useState } from "react";
import { twMerge } from "tailwind-merge";
import { NodeInput } from "../node-input/node-input.js";

export function Breadcrumbs() {
  const { isAllowedToCreateDocuments } = useUserPermissions();
  const [selectedDrive] = useSelectedDriveSafe();
  const selectedDriveId = useSelectedDriveId();
  const selectedNodePath = useSelectedNodePath();
  const [isCreating, setIsCreating] = useState(false);
  function onAddNew() {
    setIsCreating(true);
  }

  function onSubmit(name: string) {
    if (!isAllowedToCreateDocuments || !selectedDriveId) return;

    addFolder(selectedDriveId, name, selectedNodePath.at(-1)?.id)
      .then((node) => {
        setSelectedNode(node);
      })
      .catch((error) => {
        console.error(error);
      })
      .finally(() => {
        setIsCreating(false);
      });
  }

  function onCancel() {
    setIsCreating(false);
  }

  const hasSelectedDrive = !!selectedDrive;
  const hasNodePath = !!selectedNodePath.length;

  return (
    <div className="flex h-9 flex-row items-center gap-2 p-6 text-gray-500 dark:text-slate-400">
      {hasSelectedDrive && (
        <>
          <button
            type="button"
            aria-label="Back to home"
            title="Back to home"
            className="flex items-center justify-center rounded-md p-1 text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-slate-100"
            onClick={() => setSelectedDrive(undefined)}
          >
            <Icon name="ArrowLeft" size={14} />
          </button>
          <Breadcrumb
            id={selectedDriveId}
            parentId={undefined}
            name={selectedDrive.state.global.name || selectedDrive.header.name}
            onClick={() => setSelectedDrive(selectedDrive)}
          />
          <span>/</span>
        </>
      )}
      {hasNodePath &&
        selectedNodePath.map((node) => (
          <Fragment key={node.id}>
            <Breadcrumb
              id={node.id}
              parentId={node.parentFolder}
              name={node.name}
              onClick={() => setSelectedNode(node)}
            />
            <span>/</span>
          </Fragment>
        ))}
      {isAllowedToCreateDocuments &&
        (isCreating ? (
          <NodeInput
            className="text-gray-800 dark:text-slate-100"
            defaultValue="New Folder"
            onCancel={onCancel}
            onSubmit={onSubmit}
            placeholder="New Folder"
          />
        ) : (
          <button
            type="button"
            className="ml-1 flex items-center justify-center gap-2 rounded-md bg-gray-50 px-2 py-1.5 text-gray-700 transition-colors hover:bg-gray-200 hover:text-gray-800 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-600 dark:hover:text-slate-100"
            onClick={onAddNew}
          >
            <Icon name="Plus" size={14} />
            Add new
          </button>
        ))}
    </div>
  );
}

export type BreadcrumbProps = {
  name: string;
  id: string | undefined;
  parentId: string | null | undefined;
  onClick: () => void;
};

export function Breadcrumb(props: BreadcrumbProps) {
  const { name, id, parentId, onClick } = props;
  const { isDragging, ...dragProps } = useDragNode({
    srcId: id,
    parentId: parentId ?? undefined,
  });
  const { isDropTarget, ...dropProps } = useDropNode(id);

  const containerStyles = twMerge(
    "cursor-pointer transition-colors last-of-type:text-gray-800 hover:text-gray-800 dark:text-slate-200 last-of-type:dark:text-slate-100 dark:hover:text-slate-100",
    isDragging
      ? "opacity-60"
      : isDropTarget
        ? "bg-blue-100 dark:bg-blue-800"
        : "",
  );

  return (
    <div
      {...dragProps}
      {...dropProps}
      className={containerStyles}
      onClick={onClick}
      role="button"
    >
      {name}
    </div>
  );
}
