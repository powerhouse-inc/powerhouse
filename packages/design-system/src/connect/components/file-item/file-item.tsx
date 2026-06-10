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
    void handler();
    setIsDropdownMenuOpen(false);
  }

  const icon = customDocumentIconSrc ? (
    <img
      alt="file icon"
      className="max-w-none"
      height={34}
      src={customDocumentIconSrc}
      width={32}
      /* HTML img elements are draggable by default, so we
       * must disable it here so that only the container
       * can be dragged */
      draggable={false}
    />
  ) : (
    <DefaultFileIcon />
  );

  const iconNode = (
    <div className="relative">
      {icon}
      {isReadMode && syncStatus && (
        <div className="absolute right-0 bottom-[-2px] size-3 rounded-full bg-gray-50 dark:bg-slate-800">
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
    "group flex h-12 cursor-pointer items-center rounded-lg bg-gray-200 px-2 text-gray-700 select-none hover-hover dark:bg-slate-600 dark:text-slate-100",
    isDragging ? "opacity-60" : "",
    className,
  );

  const content = isReadMode ? (
    <div className="flex w-52 items-center justify-between">
      <div className="mr-2 truncate group-hover:mr-0">
        <div className="max-h-6 truncate text-sm font-medium text-gray-700 group-hover:text-gray-800 dark:text-slate-200 dark:group-hover:text-slate-100">
          {fileNode.name}
        </div>
        <div className="max-h-6 truncate text-xs font-medium text-gray-700 group-hover:text-gray-800 dark:text-slate-200 dark:group-hover:text-slate-100">
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
              className="text-gray-700 dark:text-slate-200"
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

function DefaultFileIcon() {
  return (
    <div className="text-white dark:text-slate-800">
      <svg
        width="32"
        height="40"
        viewBox="0 0 32 40"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g clipPath="url(#clip0_3725_503)">
          <g filter="url(#filter0_di_3725_503)">
            <path
              d="M0 6C0 2.68629 2.68629 0 6 0L24 0L32 8V34C32 37.3137 29.3137 40 26 40H6C2.68629 40 0 37.3137 0 34V6Z"
              fill="#F3F5F7"
            />
            <path
              d="M6 0.5H23.793L31.5 8.20703V34C31.5 37.0376 29.0376 39.5 26 39.5H6C2.96243 39.5 0.5 37.0376 0.5 34V6C0.5 2.96243 2.96243 0.5 6 0.5Z"
              stroke="#FF6A55"
            />
          </g>
          <path
            d="M18 12.583C18.1987 12.5831 18.3897 12.6623 18.5303 12.8027L21.8643 16.1357C22.0048 16.2762 22.0838 16.4673 22.084 16.666V25.333C22.084 25.8852 21.8639 26.415 21.4736 26.8057C21.083 27.1963 20.5524 27.4159 20 27.416H12C11.4476 27.4159 10.918 27.1963 10.5273 26.8057C10.1367 26.415 9.91699 25.8855 9.91699 25.333V14.666C9.91716 14.1137 10.1368 13.5839 10.5273 13.1934C10.9179 12.8029 11.4477 12.5831 12 12.583H18ZM12 14.083C11.8456 14.0831 11.6972 14.1448 11.5879 14.2539C11.4786 14.3631 11.4172 14.5115 11.417 14.666V25.333C11.417 25.4876 11.4786 25.6357 11.5879 25.7451C11.6972 25.8544 11.8454 25.9159 12 25.916H20C20.1546 25.9159 20.3038 25.8544 20.4131 25.7451C20.5221 25.6358 20.584 25.4874 20.584 25.333V18.084H18.666C18.1137 18.0838 17.5839 17.8642 17.1934 17.4736C16.8028 17.0831 16.5832 16.5533 16.583 16.001V14.083H12ZM16.8643 19.748C17.1877 19.4893 17.6602 19.5418 17.9189 19.8652L19.252 21.5322C19.471 21.8061 19.4709 22.1949 19.252 22.4688L17.9189 24.1357C17.6601 24.4589 17.1876 24.5116 16.8643 24.2529C16.5412 23.9943 16.489 23.5226 16.7471 23.1992L17.7061 22L16.7471 20.8027C16.4884 20.4794 16.5411 20.0069 16.8643 19.748ZM14.0811 19.8652C14.3398 19.5421 14.8114 19.4896 15.1348 19.748C15.4582 20.0068 15.5107 20.4793 15.252 20.8027L14.293 22L15.252 23.1992C15.5105 23.5227 15.4581 23.9942 15.1348 24.2529C14.8114 24.5113 14.3397 24.4589 14.0811 24.1357L12.7471 22.4688C12.5284 22.195 12.5284 21.806 12.7471 21.5322L14.0811 19.8652ZM18.083 16.001C18.0832 16.1555 18.1447 16.3038 18.2539 16.4131C18.3632 16.5223 18.5115 16.5838 18.666 16.584H20.1914L18.083 14.4756V16.001Z"
            fill="#FF6A55"
          />
          <path d="M23 0L32 9H27C24.7909 9 23 7.20914 23 5V0Z" fill="#FF6A55" />
        </g>
        <defs>
          <filter
            id="filter0_di_3725_503"
            x="-4"
            y="-1"
            width="40"
            height="49"
            filterUnits="userSpaceOnUse"
            colorInterpolationFilters="sRGB"
          >
            <feFlood floodOpacity="0" result="BackgroundImageFix" />
            <feColorMatrix
              in="SourceAlpha"
              type="matrix"
              values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
              result="hardAlpha"
            />
            <feMorphology
              radius="4"
              operator="erode"
              in="SourceAlpha"
              result="effect1_dropShadow_3725_503"
            />
            <feOffset dy="4" />
            <feGaussianBlur stdDeviation="4" />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.02 0"
            />
            <feBlend
              mode="multiply"
              in2="BackgroundImageFix"
              result="effect1_dropShadow_3725_503"
            />
            <feBlend
              mode="normal"
              in="SourceGraphic"
              in2="effect1_dropShadow_3725_503"
              result="shape"
            />
            <feColorMatrix
              in="SourceAlpha"
              type="matrix"
              values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
              result="hardAlpha"
            />
            <feOffset dy="-1" />
            <feGaussianBlur stdDeviation="0.5" />
            <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.04 0"
            />
            <feBlend
              mode="multiply"
              in2="shape"
              result="effect2_innerShadow_3725_503"
            />
          </filter>
          <clipPath id="clip0_3725_503">
            <rect width="32" height="40" fill="currentColor" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}
