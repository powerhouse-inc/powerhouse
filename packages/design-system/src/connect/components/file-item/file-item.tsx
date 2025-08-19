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
  type TNodeActions,
  useDrag,
  WRITE,
} from "#connect";
import { Icon } from "#powerhouse";
import {
  type FileNode,
  type Node,
  type SharingType,
  type SyncStatus,
} from "document-drive";
import { useState } from "react";
import { twMerge } from "tailwind-merge";
import { SyncStatusIcon } from "../status-icon/index.js";

export type FileItemProps = TNodeActions & {
  fileNode: FileNode;
  sharingType: SharingType;
  isAllowedToCreateDocuments: boolean;
  customDocumentIconSrc?: string;
  className?: string;
  getSyncStatusSync: (
    syncId: string,
    sharingType: SharingType,
  ) => SyncStatus | undefined;
  setSelectedNode: (node: Node | string | undefined) => void;
  showDeleteNodeModal: (node: Node) => void;
};

export function FileItem(props: FileItemProps) {
  const {
    fileNode,
    sharingType,
    className,
    customDocumentIconSrc,
    isAllowedToCreateDocuments,
    getSyncStatusSync,
    setSelectedNode,
    onRenameNode,
    onDuplicateNode,
    showDeleteNodeModal,
  } = props;
  const [mode, setMode] = useState<typeof READ | typeof WRITE>(READ);
  const [isDropdownMenuOpen, setIsDropdownMenuOpen] = useState(false);
  const { dragProps } = useDrag({ node: fileNode });

  const isReadMode = mode === READ;
  const syncStatus = getSyncStatusSync(fileNode.id, sharingType);

  const dropdownMenuHandlers = {
    [DUPLICATE]: () => onDuplicateNode(fileNode),
    [RENAME]: () => setMode(WRITE),
    [DELETE]: () => showDeleteNodeModal(fileNode),
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

  function onSubmit(name: string) {
    onRenameNode(name, fileNode);
    setMode(READ);
  }

  function onCancel() {
    setMode(READ);
  }

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

  const iconSrc = getDocumentIconSrc(
    fileNode.documentType,
    customDocumentIconSrc,
  );

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
          {fileNode.name}
        </div>
        <div className="max-h-6 truncate text-xs font-medium text-gray-600 group-hover:text-gray-800">
          {fileNode.documentType}
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
      defaultValue={fileNode.name}
      onCancel={onCancel}
      onSubmit={onSubmit}
    />
  );

  return (
    <div className="relative w-64" onClick={() => setSelectedNode(fileNode)}>
      <div {...dragProps} className={containerStyles}>
        <div className="flex items-center">
          <div className="mr-1.5">{iconNode}</div>
          {content}
        </div>
      </div>
    </div>
  );
}
