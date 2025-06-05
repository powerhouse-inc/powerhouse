import {
  ConnectDropdownMenu,
  defaultFolderOptions,
  DELETE,
  DUPLICATE,
  FOLDER,
  NodeInput,
  type NodeOption,
  nodeOptionsMap,
  READ,
  RENAME,
  type SharingType,
  SyncStatusIcon,
  useDrag,
  useDrop,
  WRITE,
} from "#connect";
import { Icon } from "#powerhouse";
import {
  type GetSyncStatusSync,
  type OnAddFile,
  type OnCopyNode,
  type OnDeleteNode,
  type OnMoveNode,
  type OnRenameNode,
  type SetSelectedNodeId,
} from "@powerhousedao/reactor-browser/uiNodes/types";
import type { FolderNode } from "document-drive";
import { useCallback, useState } from "react";
import { twMerge } from "tailwind-merge";
export type FolderItemProps = {
  node: FolderNode;
  driveId: string;
  isAllowedToCreateDocuments: boolean;
  sharingType: SharingType;
  className?: string;
  setSelectedNodeId: SetSelectedNodeId;
  getSyncStatusSync: GetSyncStatusSync;
  onRenameNode: OnRenameNode;
  onDeleteNode: OnDeleteNode;
  onAddFile: OnAddFile;
  onCopyNode: OnCopyNode;
  onMoveNode: OnMoveNode;
};

export function FolderItem(props: FolderItemProps) {
  const {
    node,
    sharingType,
    isAllowedToCreateDocuments,
    className,
    driveId,
    setSelectedNodeId,
    getSyncStatusSync,
    onRenameNode,
    onAddFile,
    onCopyNode,
    onMoveNode,
    onDeleteNode,
  } = props;
  const nodeId = node.id;
  const parentNodeId = node.parentFolder ?? null;
  const nodeName = node.name;
  const syncStatus = getSyncStatusSync(nodeId, sharingType);
  const [mode, setMode] = useState<typeof READ | typeof WRITE>(READ);
  const [isDropdownMenuOpen, setIsDropdownMenuOpen] = useState(false);
  const { dragProps } = useDrag({ nodeId });
  const { isDropTarget, dropProps } = useDrop({
    nodeId,
    driveId,
    nodeKind: FOLDER,
    onAddFile,
    onCopyNode,
    onMoveNode,
  });

  const isReadMode = mode === READ;

  const onCancel = useCallback(() => {
    setMode(READ);
  }, []);

  const onSubmit = useCallback(
    (name: string) => {
      if (!driveId) {
        throw new Error("Drive id is required");
      }
      onRenameNode(name, nodeId, driveId);
      setMode(READ);
    },
    [driveId, nodeId, onRenameNode],
  );

  const onClick = useCallback(() => {
    setSelectedNodeId(nodeId);
  }, [nodeId, setSelectedNodeId]);

  const dropdownMenuHandlers: Partial<Record<NodeOption, () => void>> = {
    [DUPLICATE]: () => {
      if (!driveId) {
        throw new Error("Drive id is required");
      }
      if (!parentNodeId) {
        throw new Error("Parent node id is required");
      }
      onCopyNode(nodeId, parentNodeId, driveId);
    },
    [RENAME]: () => setMode(WRITE),
    [DELETE]: () => onDeleteNode(nodeId, driveId),
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
        {nodeName}
      </div>
    ) : (
      <NodeInput
        className="ml-3 font-medium"
        defaultValue={nodeName ?? undefined}
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
