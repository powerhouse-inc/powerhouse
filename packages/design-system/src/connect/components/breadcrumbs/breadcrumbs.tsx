import { Icon, NodeInput } from "@powerhousedao/design-system";
import {
  addFolder,
  setSelectedDrive,
  setSelectedNode,
  useSelectedDriveId,
  useSelectedDriveSafe,
  useSelectedNodePath,
  useUserPermissions,
} from "@powerhousedao/reactor-browser";
import { Fragment, useState } from "react";

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
    <div className="flex h-9 flex-row items-center gap-2 p-6 text-gray-500">
      {hasSelectedDrive && (
        <>
          <Breadcrumb
            name={selectedDrive.state.global.name}
            onClick={() => setSelectedDrive(selectedDrive)}
          />
          <span>/</span>
        </>
      )}
      {hasNodePath &&
        selectedNodePath.map((node) => (
          <Fragment key={node.id}>
            <Breadcrumb
              name={node.name}
              onClick={() => setSelectedNode(node)}
            />
            <span>/</span>
          </Fragment>
        ))}
      {isAllowedToCreateDocuments &&
        (isCreating ? (
          <NodeInput
            className="text-gray-800"
            defaultValue="New Folder"
            onCancel={onCancel}
            onSubmit={onSubmit}
            placeholder="New Folder"
          />
        ) : (
          <button
            type="button"
            className="ml-1 flex items-center justify-center gap-2 rounded-md bg-gray-50 px-2 py-1.5 transition-colors hover:bg-gray-200 hover:text-gray-800"
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
  onClick: () => void;
};

export function Breadcrumb(props: BreadcrumbProps) {
  const { name, onClick } = props;

  return (
    <div
      className="transition-colors last-of-type:text-gray-800 hover:text-gray-800"
      onClick={onClick}
      role="button"
    >
      {name}
    </div>
  );
}
