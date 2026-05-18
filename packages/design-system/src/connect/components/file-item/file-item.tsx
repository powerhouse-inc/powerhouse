import DefaultImg from "#assets/icons/template.png";
import { Icon } from "#design-system";
import {
  getSyncStatusSync,
  setSelectedNode,
  showDeleteNodeModal,
  useDownloadDocument,
  useDragNode,
  useNodeActions,
  useSelectedDriveSafe,
  useUserPermissions,
} from "@powerhousedao/reactor-browser";
import type {
  DocumentDriveDocument,
  FileNode,
  SharingType,
} from "@powerhousedao/shared/document-drive";
import { useState } from "react";
import { addProp, entries, map, pipe } from "remeda";
import { twMerge } from "tailwind-merge";
import { fileNodeDropdownOptions } from "../../constants/options.js";
import { ConnectDropdownMenu } from "../dropdown-menu/dropdown-menu.js";
import { NodeInput } from "../node-input/node-input.js";
import { SyncStatusIcon } from "../status-icon/sync-status-icon.js";

function getDriveSharingType(drive: DocumentDriveDocument): SharingType {
  if (typeof drive !== "object") return "LOCAL";
  const isReadDrive = "readContext" in drive;
  const { sharingType: _sharingType } = !isReadDrive
    ? drive.state.local
    : { sharingType: "PUBLIC" };
  const __sharingType = _sharingType?.toUpperCase();
  const validTypes: string[] = ["LOCAL", "CLOUD", "PUBLIC"];
  return !__sharingType ||
    __sharingType === "PRIVATE" ||
    !validTypes.includes(__sharingType)
    ? "LOCAL"
    : (__sharingType as SharingType);
}

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
  const { isDragging, ...dragProps } = useDragNode({
    srcId: fileNode.id,
    parentId: fileNode.parentFolder ?? undefined,
  });
  const { isAllowedToCreateDocuments } = useUserPermissions();
  const { onRenameNode, onRenameDriveNodes, onDuplicateNode } =
    useNodeActions();
  const downloadDocument = useDownloadDocument(fileNode.id);
  const isReadMode = mode === "READ";
  const syncStatus = getSyncStatusSync(fileNode.id, sharingType);

  const dropdownMenuHandlers = {
    DOWNLOAD: downloadDocument,
    DUPLICATE: () => onDuplicateNode(fileNode),
    RENAME: () => setMode("WRITE"),
    DELETE: () => showDeleteNodeModal(fileNode),
  } as const;

  const dropdownMenuOptions = pipe(
    fileNodeDropdownOptions,
    entries(),
    map(([id, option]) => addProp(option, "id", id)),
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

  function onDropdownMenuOptionClick(itemId: string) {
    const handler =
      dropdownMenuHandlers[itemId as keyof typeof dropdownMenuHandlers];
    if (!handler) {
      console.error(`No handler found for dropdown menu item: ${itemId}`);
      return;
    }
    handler();
    setIsDropdownMenuOpen(false);
  }

  const iconSrc = customDocumentIconSrc || DefaultImg;

  const iconNode = (
    <div className="relative">
      <img
        alt="file icon"
        className="max-w-none"
        height={34}
        src={iconSrc}
        width={32}
        /* HTML img elements are draggable by default, so we
         * must disable it here so that only the container
         * can be dragged */
        draggable={false}
      />
      {isReadMode && syncStatus && (
        <div className="absolute right-0 bottom-[-2px] size-3 rounded-full bg-white dark:bg-slate-900">
          <div className="absolute top-[-2px] left-[-2px]">
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
    "group flex h-12 cursor-pointer items-center rounded-lg bg-gray-200 px-2 text-gray-600 select-none hover:text-gray-800 dark:bg-slate-600 dark:text-slate-100 dark:hover:text-slate-50",
    isDragging ? "opacity-60" : "",
    className,
  );

  const content = isReadMode ? (
    <div className="flex w-52 items-center justify-between">
      <div className="mr-2 truncate group-hover:mr-0">
        <div className="max-h-6 truncate text-sm font-medium group-hover:text-gray-800 dark:group-hover:text-slate-50">
          {fileNode.name}
        </div>
        <div className="max-h-6 truncate text-xs font-medium text-gray-600 group-hover:text-gray-800 dark:text-slate-100 dark:group-hover:text-slate-50">
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
            <Icon
              className="text-gray-600 dark:text-slate-100"
              name="VerticalDots"
            />
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
    <div
      className="relative w-64"
      onClick={isReadMode ? () => setSelectedNode(fileNode) : undefined}
      {...dragProps}
    >
      <div className={containerStyles}>
        <div className="flex items-center">
          <div className="mr-1.5">{iconNode}</div>
          {content}
        </div>
      </div>
    </div>
  );
}
