import {
  ConnectDropdownMenu,
  defaultFileOptions,
  DELETE,
  DUPLICATE,
  getDocumentIconSrc,
  NodeInput,
  type NodeOption,
  nodeOptionsMap,
  READ,
  RENAME,
  type SharingType,
  type SyncStatus,
  useDrag,
  WRITE,
} from "#connect";
import { Icon } from "#powerhouse";
import {
  useDriveIdForNode,
  useNodeDocumentType,
  useNodeNameForId,
  useSetSelectedNodeId,
} from "@powerhousedao/reactor-browser";
import type { Node } from "document-drive";
import { useCallback, useState } from "react";
import { twMerge } from "tailwind-merge";
import { SyncStatusIcon } from "../status-icon/index.js";
export type FileItemProps = {
  nodeId: string;
  customDocumentIconSrc?: string;
  isAllowedToCreateDocuments: boolean;
  sharingType: SharingType;
  className?: string;
  getSyncStatusSync: (
    syncId: string,
    sharingType: SharingType,
  ) => SyncStatus | undefined;
  onRenameNode: (
    name: string,
    nodeId: string,
    driveId: string,
  ) => Promise<Node>;
  onDuplicateNode: (nodeId: string, driveId: string) => Promise<void>;
  showDeleteNodeModal: (nodeId: string) => void;
};

export function FileItem(props: FileItemProps) {
  const {
    nodeId,
    isAllowedToCreateDocuments,
    className,
    customDocumentIconSrc,
    sharingType,
    getSyncStatusSync,
    onRenameNode,
    onDuplicateNode,
    showDeleteNodeModal,
  } = props;
  const documentType = useNodeDocumentType(nodeId);
  const nodeName = useNodeNameForId(nodeId);
  const setSelectedNodeId = useSetSelectedNodeId();
  const driveId = useDriveIdForNode(nodeId);
  const syncStatus = getSyncStatusSync(nodeId, sharingType);
  const [mode, setMode] = useState<typeof READ | typeof WRITE>(READ);
  const [isDropdownMenuOpen, setIsDropdownMenuOpen] = useState(false);
  const { dragProps } = useDrag({ nodeId });

  const isReadMode = mode === READ;

  const dropdownMenuHandlers = {
    [DUPLICATE]: () => {
      if (!driveId) {
        console.error("No driveId found for nodeId", nodeId);
        return;
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
      defaultFileOptions.includes(
        option.id as (typeof defaultFileOptions)[number],
      ),
    );

  const onSubmit = useCallback(
    (name: string) => {
      if (!driveId) {
        console.error("No driveId found for nodeId", nodeId);
        return;
      }
      onRenameNode(name, nodeId, driveId);
      setMode(READ);
    },
    [onRenameNode, nodeId, driveId],
  );

  const onCancel = useCallback(() => {
    setMode(READ);
  }, []);

  const onClick = useCallback(() => {
    setSelectedNodeId(nodeId);
  }, [nodeId]);

  function onDropdownMenuOptionClick(itemId: NodeOption) {
    const handler =
      dropdownMenuHandlers[itemId as keyof typeof dropdownMenuHandlers];
    if (!handler) {
      console.error(`No handler found for dropdown menu item: ${itemId}`);
      return;
    }
    handler();
    setIsDropdownMenuOpen(false);
  }

  const iconSrc = getDocumentIconSrc(documentType, customDocumentIconSrc);

  const iconNode = (
    <div className="relative">
      <img
        alt="file icon"
        className="max-w-none"
        height={34}
        src={iconSrc}
        width={32}
      />
      {isReadMode && syncStatus && (
        <div className="absolute bottom-[-2px] right-0 size-3 rounded-full bg-white">
          <div className="absolute left-[-2px] top-[-2px]">
            <SyncStatusIcon
              overrideSyncIcons={{ SUCCESS: "CheckCircleFill" }}
              syncStatus={syncStatus}
            />
          </div>
        </div>
      )}
    </div>
  );

  const containerStyles = twMerge(
    "group flex h-12 cursor-pointer select-none items-center rounded-lg bg-gray-200 px-2 text-gray-600 hover:text-gray-800",
    className,
  );

  const content = isReadMode ? (
    <div className="flex w-52 items-center justify-between">
      <div className="mr-2 truncate group-hover:mr-0">
        <div className="max-h-6 truncate text-sm font-medium group-hover:text-gray-800">
          {nodeName}
        </div>
        <div className="max-h-6 truncate text-xs font-medium text-gray-600 group-hover:text-gray-800">
          {documentType}
        </div>
      </div>
      {isAllowedToCreateDocuments ? (
        <ConnectDropdownMenu
          items={dropdownMenuOptions}
          onItemClick={onDropdownMenuOptionClick}
          onOpenChange={setIsDropdownMenuOpen}
          open={isDropdownMenuOpen}
        >
          <button
            className={twMerge(
              "hidden group-hover:block",
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
  ) : (
    <NodeInput
      className="ml-3 flex-1 font-medium"
      defaultValue={nodeName ?? undefined}
      onCancel={onCancel}
      onSubmit={onSubmit}
    />
  );

  return (
    <div className="relative w-64" onClick={onClick}>
      <div {...dragProps} className={containerStyles}>
        <div className="flex items-center">
          <div className="mr-1.5">{iconNode}</div>
          {content}
        </div>
      </div>
    </div>
  );
}
