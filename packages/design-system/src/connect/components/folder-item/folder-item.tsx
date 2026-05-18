import { Icon } from "#design-system";
import {
  setSelectedNode,
  showDeleteNodeModal,
  useDragNode,
  useDropNode,
  useNodeActions,
  useUserPermissions,
} from "@powerhousedao/reactor-browser";
import type { FolderNode } from "@powerhousedao/shared/document-drive";
import { useState } from "react";
import { addProp, entries, map, pipe } from "remeda";
import { twMerge } from "tailwind-merge";
import { folderNodeDropdownOptions } from "../../constants/options.js";
import { ConnectDropdownMenu } from "../dropdown-menu/dropdown-menu.js";
import { NodeInput } from "../node-input/node-input.js";

export function FolderItem(props: {
  folderNode: FolderNode;
  className?: string;
}) {
  const { folderNode, className } = props;
  const { isAllowedToCreateDocuments } = useUserPermissions();
  const [mode, setMode] = useState<"READ" | "WRITE">("READ");
  const [isDropdownMenuOpen, setIsDropdownMenuOpen] = useState(false);
  const { isDragging, ...dragProps } = useDragNode({
    srcId: folderNode.id,
    parentId: folderNode.parentFolder,
  });
  const { isDropTarget, ...dropProps } = useDropNode(folderNode.id);
  const { onRenameNode, onRenameDriveNodes, onDuplicateNode } =
    useNodeActions();
  const isReadMode = mode === "READ";
  function onCancel() {
    setMode("READ");
  }

  function onSubmit(name: string) {
    Promise.all([
      onRenameNode(name, folderNode),
      onRenameDriveNodes(name, folderNode.id),
    ])
      .catch((error: unknown) => {
        console.error(error);
      })
      .finally(() => {
        setMode("READ");
      });
  }

  const dropdownMenuHandlers = {
    DUPLICATE: () => onDuplicateNode(folderNode),
    RENAME: () => setMode("WRITE"),
    DELETE: () => showDeleteNodeModal(folderNode),
  } as const;

  const dropdownMenuOptions = pipe(
    folderNodeDropdownOptions,
    entries(),
    map(([id, option]) => addProp(option, "id", id)),
  );

  function onDropdownMenuOptionClick(
    itemId: keyof typeof dropdownMenuHandlers,
  ) {
    const handler = dropdownMenuHandlers[itemId];
    if (!handler) {
      console.error(`No handler found for dropdown menu item: ${itemId}`);
      return;
    }
    handler();
    setIsDropdownMenuOpen(false);
  }

  const content =
    isReadMode || !isAllowedToCreateDocuments ? (
      <div className="ml-3 max-h-6 truncate font-medium text-gray-600 group-hover:text-gray-800 dark:text-slate-100 dark:group-hover:text-slate-50">
        {folderNode.name}
      </div>
    ) : (
      <NodeInput
        className="ml-3 font-medium"
        defaultValue={folderNode.name}
        onCancel={onCancel}
        onSubmit={onSubmit}
      />
    );

  const containerStyles = twMerge(
    "group flex h-12 cursor-pointer items-center rounded-lg bg-gray-200 px-2 select-none dark:bg-slate-600",
    isDragging
      ? "opacity-60"
      : isDropTarget
        ? "bg-blue-100 dark:bg-blue-900/30"
        : "",
    className,
  );

  return (
    <div
      className="relative w-64"
      onClick={isReadMode ? () => setSelectedNode(folderNode) : undefined}
    >
      <div {...dragProps} {...dropProps} className={containerStyles}>
        <div className="flex items-center overflow-hidden">
          <div className="p-1">
            <div className="relative">
              <Icon name="FolderClose" size={24} />
            </div>
          </div>
          {content}
        </div>
        {isReadMode && isAllowedToCreateDocuments ? (
          <ConnectDropdownMenu
            items={dropdownMenuOptions}
            onItemClick={onDropdownMenuOptionClick}
            onOpenChange={setIsDropdownMenuOpen}
            open={isDropdownMenuOpen}
          >
            <button
              className={twMerge(
                "ml-auto hidden group-hover:block",
                isDropdownMenuOpen && "block",
              )}
              onClick={(e) => {
                e.stopPropagation();
                setIsDropdownMenuOpen(true);
              }}
            >
              <Icon
                className="text-gray-600 dark:text-slate-100"
                name="VerticalDots"
              />
            </button>
          </ConnectDropdownMenu>
        ) : null}
      </div>
    </div>
  );
}
