import {
    ADD_INVALID_TRIGGER,
    ADD_TRIGGER,
    CLOUD,
    CREATE,
    ConnectDropdownMenu,
    DELETE,
    DRIVE,
    DUPLICATE,
    DragAndDropProps,
    FILE,
    LOCAL,
    NEW_FOLDER,
    NodeOption,
    NodeProps,
    PUBLIC,
    READ,
    REMOVE_TRIGGER,
    RENAME,
    SETTINGS,
    TUiNodesContext,
    UiDriveNode,
    UiNode,
    WRITE,
    iconMap,
    nodeOptionsMap,
} from '@/connect';
import { Icon, useDraggableTarget } from '@/powerhouse';
import { MouseEventHandler, useRef, useState } from 'react';
import { twJoin, twMerge } from 'tailwind-merge';
import { NodeInput } from '../node-input/node-input';

export type ConnectTreeViewProps = TUiNodesContext &
    NodeProps &
    DragAndDropProps & {
        uiNode: UiNode;
        level?: number;
        showDriveSettingsModal: (uiDriveNode: UiDriveNode) => void;
        onClick?: MouseEventHandler<HTMLDivElement>;
    };

export function ConnectTreeView(props: ConnectTreeViewProps) {
    const {
        uiNode,
        nodeOptions,
        level = 0,
        disableDropBetween,
        disableHighlightStyles,
        isAllowedToCreateDocuments,
        setSelectedNode,
        getIsInSelectedNodePath,
        getIsSelected,
        onClick,
        onAddFolder,
        onRenameNode,
        onDuplicateNode,
        onDeleteNode,
        onDeleteDrive,
        onDragEnd,
        onDragStart,
        onDropEvent,
        onDropActivate,
        showDriveSettingsModal,
        onAddTrigger,
        onRemoveTrigger,
        onAddInvalidTrigger,
    } = props;

    const [mode, setMode] = useState<
        typeof READ | typeof WRITE | typeof CREATE
    >(READ);
    const [touched, setTouched] = useState(false);
    const [internalExpandedState, setInternalExpandedState] = useState(true);
    const [isDropdownMenuOpen, setIsDropdownMenuOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const { dragProps, dropProps, isDropTarget, isDragging } =
        useDraggableTarget<UiNode>({
            data: uiNode,
            onDragEnd,
            onDragStart,
            onDropEvent,
            onDropActivate: () => {
                onDropActivate(uiNode);
            },
        });

    const { dropProps: dropDividerProps, isDropTarget: isDropDividerTarget } =
        useDraggableTarget({
            data: uiNode,
            onDropEvent,
            dropAfterItem: true,
        });

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
        'text-gray-600 transition-colors group-hover/node:text-gray-900',
        isSelected && 'text-gray-900',
    );

    const dropdownMenuHandlers: Partial<Record<NodeOption, () => void>> = {
        [DUPLICATE]: () => onDuplicateNode(uiNode),
        [NEW_FOLDER]: () => {
            setSelectedNode(uiNode);
            setInternalExpandedState(true);
            setMode(CREATE);
        },
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
        .filter(option => nodeOptionsForKind.includes(option.id));
    function onDropdownMenuOpenChange() {
        setIsDropdownMenuOpen(!isDropdownMenuOpen);
    }

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

    const handleClick: MouseEventHandler<HTMLDivElement> = event => {
        event.stopPropagation();
        onClick?.(event);

        if (mode === WRITE) return;

        setSelectedNode(uiNode);

        if (!touched) {
            setTouched(true);
            return;
        }
        setInternalExpandedState(prevExpanded => !prevExpanded);
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
        if (disableHighlightStyles) return false;
        if (isDragging) return false;
        if (mode === WRITE || mode === CREATE) return true;
        if (isDropdownMenuOpen) return true;
        if (isSelected) return true;
        return false;
    }

    const folderCloseIcon = (
        <Icon name="folder-close" className={sharedIconStyles} size={20} />
    );

    const folderOpenIcon = (
        <Icon name="folder-open" className={sharedIconStyles} size={22} />
    );

    const documentTypeFileIcon =
        uiNode.kind === FILE ? (
            <img
                src={iconMap[uiNode.documentType]}
                alt="file icon"
                className="size-7 object-contain"
            />
        ) : null;

    const localDriveIcon = <Icon name="hdd" />;

    const cloudDriveIcon = <Icon name="server" />;

    const publicDriveIcon =
        'icon' in uiNode && !!uiNode.icon ? (
            <img
                src={uiNode.icon}
                className="size-6 object-contain"
                alt="drive icon"
            />
        ) : (
            <Icon name="m" />
        );

    const caretIcon = (
        <Icon
            name="caret"
            className={twMerge(
                isExpanded && 'rotate-90',
                'ease pointer-events-none transition delay-75',
            )}
        />
    );

    const nodeIcon = <div className="mr-2 w-5 flex-none">{getNodeIcon()}</div>;

    const bottomIndicator = (
        <div
            {...dropDividerProps}
            className={twJoin(
                'absolute bottom-0 z-10 flex h-0.5 w-full',
                isDropDividerTarget && 'bg-blue-800',
            )}
        />
    );

    const readModeContent = (
        <div
            ref={containerRef}
            className="group/node grid w-full grid-cols-[1fr,auto] items-center justify-between"
        >
            <p className="mr-1 truncate">{uiNode.name}</p>
            <button
                onClick={e => {
                    e.stopPropagation();
                    setIsDropdownMenuOpen(true);
                }}
                className="hidden group-hover/node:block"
            >
                <Icon name="vertical-dots" className="text-gray-600" />
            </button>
        </div>
    );

    const writeModeContent = (
        <NodeInput
            defaultValue={uiNode.name}
            onSubmit={onSubmit}
            onCancel={onCancel}
        />
    );

    const createModeContent = (
        <div
            style={{
                paddingLeft: `${(level + 1) * levelPadding + 20}px`,
            }}
            className="flex cursor-pointer items-center gap-2 px-1 py-2"
        >
            {folderOpenIcon}
            <NodeInput
                defaultValue="New Folder"
                onSubmit={onSubmit}
                onCancel={onCancel}
            />
        </div>
    );

    return (
        <>
            <div
                {...(onDropEvent && { ...dragProps, ...dropProps })}
                role="button"
                onClick={handleClick}
                className={twMerge(
                    'flex cursor-pointer items-center rounded-lg px-1 py-2 text-gray-800 transition-colors hover:bg-gray-300',
                    isHighlighted && 'bg-gray-300 text-gray-900',
                )}
                // hack to allow rounded corners on item being dragged
                // see: https://github.com/react-dnd/react-dnd/issues/788#issuecomment-367300464
                style={{
                    transform: 'translate(0, 0)',
                    position: 'relative',
                    paddingLeft: `${level * levelPadding + (hasChildren ? 0 : 20)}px`,
                }}
            >
                {hasChildren && caretIcon}
                {nodeIcon}
                {mode === READ && readModeContent}
                {mode === WRITE && writeModeContent}
                {bottomIndicator}
            </div>
            <div
                className={twMerge(
                    'max-h-0 overflow-hidden transition-[max-height] duration-300 ease-in-out',
                    isExpanded && 'max-h-screen',
                )}
            >
                {mode === CREATE && createModeContent}
                {children?.map(uiNode => (
                    <ConnectTreeView
                        {...props}
                        key={uiNode.id}
                        uiNode={uiNode}
                        level={level + 1}
                    />
                ))}
            </div>
            {isAllowedToCreateDocuments && (
                <ConnectDropdownMenu
                    isOpen={isDropdownMenuOpen}
                    onOpenChange={onDropdownMenuOpenChange}
                    onItemClick={onDropdownMenuOptionClick}
                    items={dropdownMenuOptions}
                    menuClassName="bg-white cursor-pointer"
                    menuItemClassName="hover:bg-slate-50 px-2"
                    popoverProps={{
                        triggerRef: containerRef,
                        placement: 'bottom end',
                        offset: -10,
                    }}
                />
            )}
        </>
    );
}
