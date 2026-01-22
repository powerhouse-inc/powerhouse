import type { NodeOption } from "@powerhousedao/design-system";
import { Icon } from "@powerhousedao/design-system";
import {
  setSelectedNode,
  showDeleteNodeModal,
  useNodeActions,
  useUserPermissions,
} from "@powerhousedao/reactor-browser";
import type { FolderNode } from "document-drive";
import { useState } from "react";
import { twMerge } from "tailwind-merge";
import { defaultNodeOptions, nodeOptionsMap } from "../../constants/options.js";
import { useDrag } from "../../hooks/use-drag.js";
import { useDrop } from "../../hooks/use-drop.js";
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
  const { dragProps } = useDrag({ node: folderNode });
  const { onRenameNode, onRenameDriveNodes, onDuplicateNode } = useNodeActions();
  const { isDropTarget, dropProps } = useDrop({
    target: folderNode,
  });
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

  const dropdownMenuHandlers: Partial<Record<NodeOption, () => void>> = {
    DUPLICATE: () => onDuplicateNode(folderNode),
    RENAME: () => setMode("WRITE"),
    DELETE: () => showDeleteNodeModal(folderNode),
  } as const;

  const dropdownMenuOptions = Object.entries(nodeOptionsMap)
    .map(([id, option]) => ({
      ...option,
      id: id as NodeOption,
    }))
    .filter((option) =>
      defaultNodeOptions.includes(
        option.id as (typeof defaultNodeOptions)[number],
      ),
    );

  function onDropdownMenuOptionClick(itemId: NodeOption) {
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
      <div className="ml-3 max-h-6 truncate font-medium text-gray-600 group-hover:text-gray-800">
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
    "group flex h-12 cursor-pointer select-none items-center rounded-lg bg-gray-200 px-2",
    className,
    isDropTarget && "bg-blue-100",
  );

  return (
    <div className="relative w-64" onClick={() => setSelectedNode(folderNode)}>
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
              <Icon className="text-gray-600" name="VerticalDots" />
            </button>
          </ConnectDropdownMenu>
        ) : null}
      </div>
    </div>
  );
}
