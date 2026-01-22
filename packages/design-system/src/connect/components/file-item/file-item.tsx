import type { NodeOption } from "@powerhousedao/design-system";
import { Icon } from "@powerhousedao/design-system";
import {
  getSyncStatusSync,
  setSelectedNode,
  showDeleteNodeModal,
  useNodeActions,
  useSelectedDriveSafe,
  useUserPermissions,
} from "@powerhousedao/reactor-browser";
import { getDriveSharingType, type FileNode } from "document-drive";
import { useState } from "react";
import { twMerge } from "tailwind-merge";
import { defaultNodeOptions, nodeOptionsMap } from "../../constants/options.js";
import { useDrag } from "../../hooks/use-drag.js";
import { getDocumentIconSrc } from "../../utils/get-document-icon-src.js";
import { ConnectDropdownMenu } from "../dropdown-menu/dropdown-menu.js";
import { NodeInput } from "../node-input/node-input.js";
import { SyncStatusIcon } from "../status-icon/sync-status-icon.js";

type Props = {
  fileNode: FileNode;
  className?: string;
  customDocumentIconSrc?: string;
};

export function FileItem(props: Props) {
  const { fileNode, className, customDocumentIconSrc } = props;
  const [mode, setMode] = useState<"READ" | "WRITE">("READ");
  const [isDropdownMenuOpen, setIsDropdownMenuOpen] = useState(false);
  const [selectedDrive] = useSelectedDriveSafe();
  const sharingType = selectedDrive
    ? getDriveSharingType(selectedDrive)
    : "LOCAL";
  const { dragProps } = useDrag({ node: fileNode });
  const { isAllowedToCreateDocuments } = useUserPermissions();
  const { onRenameNode, onRenameDriveNodes, onDuplicateNode } = useNodeActions();
  const isReadMode = mode === "READ";
  const syncStatus = getSyncStatusSync(fileNode.id, sharingType);

  const dropdownMenuHandlers = {
    DUPLICATE: () => onDuplicateNode(fileNode),
    RENAME: () => setMode("WRITE"),
    DELETE: () => showDeleteNodeModal(fileNode),
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

  function onSubmit(name: string) {
    Promise.all([
      onRenameNode(name, fileNode),
      onRenameDriveNodes(name, fileNode.id),
    ])
      .catch((error: unknown) => {
        console.error(error);
      })
      .finally(() => {
        setMode("READ");
      });
  }

  function onCancel() {
    setMode("READ");
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
