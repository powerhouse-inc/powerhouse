import type { NodeOption, SyncStatus, TNodeActions } from "#connect";
import {
  ConnectDropdownMenu,
  defaultFolderOptions,
  DELETE,
  DUPLICATE,
  NodeInput,
  nodeOptionsMap,
  READ,
  RENAME,
  SyncStatusIcon,
  useDrag,
  useDrop,
  WRITE,
} from "#connect";
import { Icon } from "#powerhouse";
import type { FolderNode, Node, SharingType } from "document-drive";
import { useState } from "react";
import { twMerge } from "tailwind-merge";

export type FolderItemProps = TNodeActions & {
  folderNode: FolderNode;
  sharingType: SharingType;
  isAllowedToCreateDocuments: boolean;
  className?: string;
  getSyncStatusSync: (
    syncId: string,
    sharingType: SharingType,
  ) => SyncStatus | undefined;
  setSelectedNode: (node: Node | string | undefined) => void;
  showDeleteNodeModal: (node: Node) => void;
};

export function FolderItem(props: FolderItemProps) {
  const {
    folderNode,
    sharingType,
    isAllowedToCreateDocuments,
    className,
    setSelectedNode,
    getSyncStatusSync,
    onRenameNode,
    onDuplicateNode,
    showDeleteNodeModal,
    onAddFile,
    onCopyNode,
    onMoveNode,
  } = props;
  const [mode, setMode] = useState<typeof READ | typeof WRITE>(READ);
  const [isDropdownMenuOpen, setIsDropdownMenuOpen] = useState(false);
  const { dragProps } = useDrag({ node: folderNode });
  const { isDropTarget, dropProps } = useDrop({
    node: folderNode,
    onAddFile,
    onCopyNode,
    onMoveNode,
  });

  const isReadMode = mode === READ;
  const syncStatus = getSyncStatusSync(folderNode.id, sharingType);

  function onCancel() {
    setMode(READ);
  }

  function onSubmit(name: string) {
    onRenameNode(name, folderNode);
    setMode(READ);
  }

  const dropdownMenuHandlers: Partial<Record<NodeOption, () => void>> = {
    [DUPLICATE]: () => onDuplicateNode(folderNode),
    [RENAME]: () => setMode(WRITE),
    [DELETE]: () => showDeleteNodeModal(folderNode),
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
              {isReadMode && syncStatus ? (
                <div className="absolute bottom-[-3px] right-[-2px] size-3 rounded-full bg-white">
                  <div className="absolute left-[-2px] top-[-2px]">
                    <SyncStatusIcon
                      overrideSyncIcons={{
                        SUCCESS: "CheckCircleFill",
                      }}
                      syncStatus={syncStatus}
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
