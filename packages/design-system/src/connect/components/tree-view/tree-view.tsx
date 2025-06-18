import {
  ADD_INVALID_TRIGGER,
  ADD_TRIGGER,
  CLOUD,
  CREATE,
  ConnectDropdownMenu,
  DEFAULT,
  DELETE,
  DRIVE,
  DUPLICATE,
  FILE,
  LOCAL,
  NodeInput,
  type NodeOption,
  type NodeProps,
  PUBLIC,
  READ,
  REMOVE_TRIGGER,
  RENAME,
  SETTINGS,
  type TNodeOptions,
  type UiDriveNode,
  type UiNode,
  WRITE,
  getDocumentIconSrc,
  nodeOptionsMap,
  useDrag,
  useDrop,
} from "#connect";
import { Icon } from "#powerhouse";
import { useUiNodesContext } from "@powerhousedao/reactor-browser";
import { type MouseEventHandler, useState } from "react";
import { twMerge } from "tailwind-merge";
import { DropIndicator } from "./drop-indicator.js";

export type ConnectTreeViewProps = NodeProps & {
  uiNode: UiNode;
  nodeOptions: TNodeOptions;
  isAllowedToCreateDocuments: boolean;
  level?: number;
  customDocumentIconSrc?: string;
  onClick?: MouseEventHandler<HTMLDivElement>;
  showDriveSettingsModal: (uiDriveNode: UiDriveNode) => void;
  onAddTrigger: (uiNodeDriveId: string) => Promise<void>;
  onRemoveTrigger: (uiNodeDriveId: string) => Promise<void>;
  onAddInvalidTrigger: (uiNodeDriveId: string) => Promise<void>;
};

export function ConnectTreeView(props: ConnectTreeViewProps) {
  const {
    uiNode,
    level = 0,
    customDocumentIconSrc,
    nodeOptions,
    isAllowedToCreateDocuments,
    showDriveSettingsModal,
    onClick,
    onAddFile,
    onMoveNode,
    onCopyNode,
    onAddFolder,
    onRenameNode,
    onDuplicateNode,
    onDeleteNode,
    onDeleteDrive,
    onAddTrigger,
    onRemoveTrigger,
    onAddInvalidTrigger,
  } = props;
  const [mode, setMode] = useState<typeof READ | typeof WRITE | typeof CREATE>(
    READ,
  );
  const [touched, setTouched] = useState(false);
  const [internalExpandedState, setInternalExpandedState] = useState(true);
  const [isDropdownMenuOpen, setIsDropdownMenuOpen] = useState(false);
  const { dragProps } = useDrag(props);
  const {
    getParentNode,
    getIsSelected,
    setSelectedNode,
    getIsInSelectedNodePath,
  } = useUiNodesContext();
  const { isDropTarget, dropProps } = useDrop(props);

  const levelPadding = 10;
  const children = uiNode.kind !== FILE ? uiNode.children : null;
  const hasChildren = !!children && children.length > 0;
  const isSelected = getIsSelected(uiNode);
  const isInExpandedNodePath = getIsInSelectedNodePath(uiNode);
  const isExpanded = touched ? internalExpandedState : isInExpandedNodePath;
  const isDrive = uiNode.kind === DRIVE;
  const isLocalDrive = isDrive && uiNode.sharingType === LOCAL;
  const isCloudDrive = isDrive && uiNode.sharingType === CLOUD;
  const isPublicDrive = isDrive && uiNode.sharingType === PUBLIC;
  const isHighlighted = getIsHighlighted();
  const sharedIconStyles = twMerge(
    "text-gray-600 transition-colors group-hover/node:text-gray-900",
    isSelected && "text-gray-900",
  );

  const dropdownMenuHandlers: Partial<Record<NodeOption, () => void>> = {
    [DUPLICATE]: () => onDuplicateNode(uiNode),
    [RENAME]: () => setMode(WRITE),
    [DELETE]: () => {
      if (uiNode.kind === DRIVE) {
        onDeleteDrive(uiNode);
      } else {
        onDeleteNode(uiNode);
      }
    },
    [SETTINGS]: () => {
      if (uiNode.kind !== DRIVE) return;
      showDriveSettingsModal(uiNode);
    },
    [ADD_TRIGGER]: () => onAddTrigger(uiNode.driveId),
    [REMOVE_TRIGGER]: () => onRemoveTrigger(uiNode.driveId),
    [ADD_INVALID_TRIGGER]: () => onAddInvalidTrigger(uiNode.driveId),
  } as const;

  const nodeOptionsForKind = nodeOptions[uiNode.sharingType][uiNode.kind];

  const dropdownMenuOptions = Object.entries(nodeOptionsMap)
    .map(([id, option]) => ({
      ...option,
      id: id as NodeOption,
    }))
    .filter((option) => nodeOptionsForKind.includes(option.id));

  function onDropdownMenuOptionClick(itemId: NodeOption) {
    const handler = dropdownMenuHandlers[itemId];
    if (!handler) {
      console.error(`No handler found for dropdown menu item: ${itemId}`);
      return;
    }
    handler();
    setIsDropdownMenuOpen(false);
  }

  function onSubmit(value: string) {
    if (mode === CREATE) {
      onAddFolder(value, uiNode);
      setSelectedNode(uiNode);
    } else {
      onRenameNode(value, uiNode);
    }
    setMode(READ);
  }

  const handleClick: MouseEventHandler<HTMLDivElement> = (event) => {
    event.stopPropagation();
    onClick?.(event);

    if (mode === WRITE) return;

    setSelectedNode(uiNode);

    if (!touched) {
      setTouched(true);
      return;
    }
    setInternalExpandedState((prevExpanded) => !prevExpanded);
  };

  function onCancel() {
    setMode(READ);
  }

  function getNodeIcon() {
    if (isPublicDrive) {
      return publicDriveIcon;
    }
    if (isCloudDrive) {
      return cloudDriveIcon;
    }
    if (isLocalDrive) {
      return localDriveIcon;
    }
    if (uiNode.kind === FILE) {
      return documentTypeFileIcon;
    }

    return isExpanded ? folderOpenIcon : folderCloseIcon;
  }

  function getIsHighlighted() {
    if (isDropTarget) return true;
    if (mode === WRITE || mode === CREATE) return true;
    if (isDropdownMenuOpen) return true;
    if (isSelected) return true;
    return false;
  }

  const folderCloseIcon = (
    <Icon className={sharedIconStyles} name="FolderClose" size={20} />
  );

  const folderOpenIcon = (
    <Icon className={sharedIconStyles} name="FolderOpen" size={22} />
  );

  const documentTypeFileIcon = (
    <img
      alt="file icon"
      className="size-7 object-contain"
      src={getDocumentIconSrc(
        uiNode.kind === FILE ? uiNode.documentType : DEFAULT,
        customDocumentIconSrc,
      )}
    />
  );

  const localDriveIcon = <Icon name="Hdd" />;

  const cloudDriveIcon = <Icon name="Server" />;

  const publicDriveIcon =
    "icon" in uiNode && !!uiNode.icon ? (
      <img
        alt="drive icon"
        className="size-6 object-contain"
        src={uiNode.icon}
      />
    ) : (
      <Icon name="M" />
    );

  const caretIcon = (
    <Icon
      className={twMerge(
        isExpanded && "rotate-90",
        "ease pointer-events-none transition delay-75",
      )}
      name="Caret"
    />
  );

  const nodeIcon = <div className="mr-2 w-5 flex-none">{getNodeIcon()}</div>;

  const readModeContent = (
    <div className="group/node grid w-full grid-cols-[1fr,auto] items-center justify-between">
      <p className="mr-1 truncate">{uiNode.name}</p>
      {isAllowedToCreateDocuments ? (
        <ConnectDropdownMenu
          items={dropdownMenuOptions}
          onItemClick={onDropdownMenuOptionClick}
          onOpenChange={setIsDropdownMenuOpen}
          open={isDropdownMenuOpen}
        >
          <button
            className={twMerge(
              "hidden group-hover/node:block",
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
  );

  const writeModeContent = (
    <NodeInput
      defaultValue={uiNode.name}
      onCancel={onCancel}
      onSubmit={onSubmit}
    />
  );

  const createModeContent = (
    <div
      className="flex cursor-pointer items-center gap-2 px-1 py-2"
      style={{
        paddingLeft: `${(level + 1) * levelPadding + 20}px`,
      }}
    >
      {folderOpenIcon}
      <NodeInput
        defaultValue="New Folder"
        onCancel={onCancel}
        onSubmit={onSubmit}
      />
    </div>
  );

  return (
    <>
      <div
        {...dragProps}
        {...dropProps}
        className={twMerge(
          "flex cursor-pointer select-none items-center rounded-lg px-1 py-2 text-gray-800 transition-colors hover:bg-gray-300",
          isHighlighted && "bg-gray-300 text-gray-900",
        )}
        onClick={handleClick}
        // hack to allow rounded corners on item being dragged
        // see: https://github.com/react-dnd/react-dnd/issues/788#issuecomment-367300464
        style={{
          transform: "translate(0, 0)",
          position: "relative",
          paddingLeft: `${level * levelPadding + (hasChildren ? 0 : 20)}px`,
        }}
      >
        <DropIndicator
          uiNode={uiNode}
          getParentNode={getParentNode}
          onAddFile={onAddFile}
          onMoveNode={onMoveNode}
          onCopyNode={onCopyNode}
          position="before"
        />
        {hasChildren ? caretIcon : null}
        {nodeIcon}
        {mode === READ && readModeContent}
        {mode === WRITE && writeModeContent}
      </div>
      <div
        className={twMerge(
          "max-h-0 overflow-hidden transition-[max-height] duration-300 ease-in-out",
          isExpanded && "max-h-screen",
        )}
      >
        {mode === CREATE && createModeContent}
        {children?.map((uiNode) => (
          <ConnectTreeView
            {...props}
            key={uiNode.id}
            level={level + 1}
            uiNode={uiNode}
          />
        ))}
      </div>
    </>
  );
}
