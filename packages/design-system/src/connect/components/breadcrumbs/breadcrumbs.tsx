import { Icon } from "#design-system";
import {
  addFolder,
  getNodeTargetIn,
  isPlainClick,
  useDragNode,
  useDropNode,
  usePHNavigation,
  usePHStore,
  useSelectedDriveId,
  useSelectedDriveSafe,
  useSelectedNodePath,
  useSetSelectedDrive,
  useSetSelectedNode,
  makeDriveSlug,
  useUserPermissions,
} from "@powerhousedao/reactor-browser";
import type { PHNavigationTarget } from "@powerhousedao/reactor-browser";
import type { KeyboardEvent, MouseEvent } from "react";
import { Fragment, useState } from "react";
import { twMerge } from "tailwind-merge";
import { NodeInput } from "../node-input/node-input.js";

export function Breadcrumbs() {
  const { isAllowedToCreateDocuments } = useUserPermissions();
  const [selectedDrive] = useSelectedDriveSafe();
  const selectedDriveId = useSelectedDriveId();
  const selectedNodePath = useSelectedNodePath();
  const [isCreating, setIsCreating] = useState(false);
  const store = usePHStore();
  const setSelectedDrive = useSetSelectedDrive();
  const setSelectedNode = useSetSelectedNode();
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

  const driveTarget = selectedDrive
    ? { driveSlug: makeDriveSlug(selectedDrive) }
    : undefined;

  const hasSelectedDrive = !!selectedDrive;
  const hasNodePath = !!selectedNodePath.length;

  return (
    <div className="flex h-9 flex-row items-center gap-2 p-6 text-muted-foreground">
      {hasSelectedDrive && (
        <>
          <button
            type="button"
            aria-label="Back to home"
            title="Back to home"
            className="flex items-center justify-center rounded-md p-1 text-foreground transition-colors hover:hover-effect"
            onClick={() => setSelectedDrive(undefined)}
          >
            <Icon name="ArrowLeft" size={14} />
          </button>
          <Breadcrumb
            id={selectedDriveId}
            parentId={undefined}
            name={selectedDrive.state.global.name || selectedDrive.header.name}
            target={driveTarget}
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
              target={getNodeTargetIn(store, node)}
              onClick={() => setSelectedNode(node)}
            />
            <span>/</span>
          </Fragment>
        ))}
      {isAllowedToCreateDocuments &&
        (isCreating ? (
          <NodeInput
            className="text-foreground"
            defaultValue="New Folder"
            onCancel={onCancel}
            onSubmit={onSubmit}
            placeholder="New Folder"
          />
        ) : (
          <button
            type="button"
            className="ml-1 flex items-center justify-center gap-2 rounded-md bg-background px-2 py-1.5 text-foreground transition-colors hover:hover-effect"
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
  /** Renders a real link; plain clicks still call `onClick`. */
  href?: string;
  /** What the crumb opens; gives it the navigation's href and current mark. */
  target?: PHNavigationTarget;
  onClick: () => void;
};

export function Breadcrumb(props: BreadcrumbProps) {
  const { name, id, parentId, target, onClick } = props;
  const navigation = usePHNavigation();
  const isCurrent = navigation.useIsCurrent?.(target) ?? false;
  const href =
    props.href ?? (target ? navigation.hrefFor?.(target) : undefined);
  const { isDragging, ...dragProps } = useDragNode({
    srcId: id,
    parentId: parentId ?? undefined,
  });
  const { isDropTarget, ...dropProps } = useDropNode(id);

  const containerStyles = twMerge(
    "cursor-pointer transition-colors last-of-type:text-foreground hover:hover-effect",
    isDragging ? "opacity-60" : isDropTarget ? "bg-info/10" : "",
  );

  if (href) {
    const onLinkClick = (event: MouseEvent) => {
      if (!isPlainClick(event)) return;
      event.preventDefault();
      onClick();
    };
    return (
      <a
        {...dragProps}
        {...dropProps}
        href={href}
        aria-current={target && isCurrent ? "page" : undefined}
        className={containerStyles}
        onClick={onLinkClick}
      >
        {name}
      </a>
    );
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onClick();
  };
  return (
    <div
      {...dragProps}
      {...dropProps}
      className={containerStyles}
      onClick={onClick}
      onKeyDown={onKeyDown}
      role="button"
      tabIndex={0}
    >
      {name}
    </div>
  );
}
