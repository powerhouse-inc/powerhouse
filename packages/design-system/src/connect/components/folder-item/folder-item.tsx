import {
  ConnectDropdownMenu,
  defaultFolderOptions,
  DELETE,
  DUPLICATE,
  NodeInput,
  type NodeOption,
  nodeOptionsMap,
  READ,
  RENAME,
  SyncStatusIcon,
  type UiFolderNode,
  type UiNode,
  useDrag,
  useDrop,
  WRITE,
} from "@/connect";
import { Icon } from "@/powerhouse";
import { useState } from "react";
import { twMerge } from "tailwind-merge";

export type FolderItemProps = {
  readonly uiNode: UiFolderNode;
  readonly className?: string;
  onAddFile: (file: File, parentNode: UiNode | null) => Promise<void>;
  onCopyNode: (uiNode: UiNode, targetNode: UiNode) => Promise<void>;
  onMoveNode: (uiNode: UiNode, targetNode: UiNode) => Promise<void>;
  onSelectNode: (uiNode: UiFolderNode) => void;
  onRenameNode: (name: string, uiNode: UiFolderNode) => void;
  onDuplicateNode: (uiNode: UiFolderNode) => void;
  onDeleteNode: (uiNode: UiFolderNode) => void;
  isAllowedToCreateDocuments: boolean;
};

export function FolderItem(props: FolderItemProps) {
  const {
    uiNode,
    isAllowedToCreateDocuments,
    className,
    onRenameNode,
    onDuplicateNode,
    onDeleteNode,
    onSelectNode,
    onAddFile,
    onCopyNode,
    onMoveNode,
  } = props;
  const [mode, setMode] = useState<typeof READ | typeof WRITE>(READ);
  const [isDropdownMenuOpen, setIsDropdownMenuOpen] = useState(false);
  const { dragProps } = useDrag(props);
  const { isDropTarget, dropProps } = useDrop({
    uiNode,
    onAddFile,
    onCopyNode,
    onMoveNode,
  });

  const isReadMode = mode === READ;

  function onCancel() {
    setMode(READ);
  }

  function onSubmit(name: string) {
    onRenameNode(name, uiNode);
  }

  function onClick() {
    onSelectNode(uiNode);
  }

  const dropdownMenuHandlers: Partial<Record<NodeOption, () => void>> = {
    [DUPLICATE]: () => onDuplicateNode(uiNode),
    [RENAME]: () => setMode(WRITE),
    [DELETE]: () => onDeleteNode(uiNode),
  } as const;

  const dropdownMenuOptions = Object.entries(nodeOptionsMap)
    .map(([id, option]) => ({
      ...option,
      id: id as NodeOption,
    }))
    .filter((option) =>
      defaultFolderOptions.includes(
        option.id as (typeof defaultFolderOptions)[number],
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
        {uiNode.name}
      </div>
    ) : (
      <NodeInput
        className="ml-3 font-medium"
        defaultValue={uiNode.name}
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
    <div className="relative w-64" onClick={onClick}>
      <div {...dragProps} {...dropProps} className={containerStyles}>
        <div className="flex items-center overflow-hidden">
          <div className="p-1">
            <div className="relative">
              <Icon name="FolderClose" size={24} />
              {isReadMode && uiNode.syncStatus ? (
                <div className="absolute bottom-[-3px] right-[-2px] size-3 rounded-full bg-white">
                  <div className="absolute left-[-2px] top-[-2px]">
                    <SyncStatusIcon
                      overrideSyncIcons={{
                        SUCCESS: "CheckCircleFill",
                      }}
                      syncStatus={uiNode.syncStatus}
                    />
                  </div>
                </div>
              ) : null}
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
