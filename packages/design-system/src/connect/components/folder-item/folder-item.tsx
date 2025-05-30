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
  type SharingType,
  SyncStatusIcon,
  useDrag,
  useDrop,
  WRITE,
} from "#connect";
import { Icon } from "#powerhouse";
import {
  useDriveIdForNode,
  useNodeNameForId,
  useSetSelectedNodeId,
} from "@powerhousedao/reactor-browser";
import type { Node, SyncStatus } from "document-drive";
import { useCallback, useState } from "react";
import { twMerge } from "tailwind-merge";
export type FolderItemProps = {
  nodeId: string;
  isAllowedToCreateDocuments: boolean;
  sharingType: SharingType;
  className?: string;
  getSyncStatusSync: (
    syncId: string,
    sharingType: SharingType,
  ) => SyncStatus | undefined;
  onAddFile: (
    file: File,
    parentNodeId: string | null,
    driveId: string | null,
  ) => Promise<void>;
  onMoveNode: (
    nodeId: string,
    targetNodeId: string,
    driveId: string,
  ) => Promise<void>;
  onCopyNode: (
    nodeId: string,
    targetNodeId: string,
    driveId: string,
  ) => Promise<void>;
  onRenameNode: (
    name: string,
    nodeId: string,
    driveId: string,
  ) => Promise<Node>;
  onDuplicateNode: (nodeId: string, driveId: string) => Promise<void>;
  showDeleteNodeModal: (nodeId: string) => void;
};

export function FolderItem(props: FolderItemProps) {
  const {
    nodeId,
    sharingType,
    isAllowedToCreateDocuments,
    className,
    getSyncStatusSync,
    onRenameNode,
    onDuplicateNode,
    onAddFile,
    onCopyNode,
    onMoveNode,
    showDeleteNodeModal,
  } = props;
  const driveId = useDriveIdForNode(nodeId);
  const nodeName = useNodeNameForId(nodeId);
  const syncStatus = getSyncStatusSync(nodeId, sharingType);
  const setSelectedNodeId = useSetSelectedNodeId();
  const [mode, setMode] = useState<typeof READ | typeof WRITE>(READ);
  const [isDropdownMenuOpen, setIsDropdownMenuOpen] = useState(false);
  const { dragProps } = useDrag({ nodeId });
  const { isDropTarget, dropProps } = useDrop({
    nodeId,
    driveId,
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
      onRenameNode(name, nodeId, driveId)
        .then(() => {
          setMode(READ);
        })
        .catch((error) => {
          console.error(error);
        });
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
      onDuplicateNode(nodeId, driveId);
    },
    [RENAME]: () => setMode(WRITE),
    [DELETE]: () => showDeleteNodeModal(nodeId),
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
