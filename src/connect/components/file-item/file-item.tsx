import {
    ADD_INVALID_TRIGGER,
    ADD_TRIGGER,
    ConnectDropdownMenu,
    DELETE,
    DragAndDropProps,
    DropdownMenuHandlers,
    DUPLICATE,
    FILE,
    iconMap,
    NodeOption,
    nodeOptionsMap,
    NodeProps,
    READ,
    REMOVE_TRIGGER,
    RENAME,
    TUiNodesContext,
    UiFileNode,
    WRITE,
} from '@/connect';
import { Icon, useDraggableTarget } from '@/powerhouse';
import React, { ReactNode, useRef, useState } from 'react';
import { twMerge } from 'tailwind-merge';
import { NodeInput } from '../node-input/node-input';
import { SyncStatusIcon } from '../status-icon';

export type FileItemProps = TUiNodesContext &
    DragAndDropProps &
    NodeProps & {
        uiFileNode: UiFileNode;
        customIcon?: ReactNode;
        className?: string;
    };

export const FileItem: React.FC<FileItemProps> = ({
    uiFileNode,
    selectedNodePath,
    nodeOptions,
    isAllowedToCreateDocuments,
    isRemoteDrive,
    customIcon,
    className,
    setSelectedNode,
    onRenameNode,
    onDuplicateNode,
    onDeleteNode,
    onDragEnd,
    onDragStart,
    onAddTrigger,
    onRemoveTrigger,
    onAddInvalidTrigger,
}) => {
    const containerRef = useRef(null);
    const [mode, setMode] = useState<typeof READ | typeof WRITE>(READ);
    const [isDropdownMenuOpen, setIsDropdownMenuOpen] = useState(false);

    const { dragProps } = useDraggableTarget({
        data: uiFileNode,
        onDragEnd,
        onDragStart,
    });

    const isReadMode = mode === READ;

    const containerStyles = twMerge(
        'group flex h-12 cursor-pointer select-none items-center rounded-lg bg-gray-200 px-2 text-gray-600 hover:text-gray-800',
        className,
    );

    const dropdownMenuHandlers: DropdownMenuHandlers = {
        [DUPLICATE]: () => onDuplicateNode(uiFileNode),
        [RENAME]: () => setMode(WRITE),
        [DELETE]: () => onDeleteNode(uiFileNode),
        [ADD_TRIGGER]: () => onAddTrigger(uiFileNode.driveId),
        [REMOVE_TRIGGER]: () => onRemoveTrigger(uiFileNode.driveId),
        [ADD_INVALID_TRIGGER]: () => onAddInvalidTrigger(uiFileNode.driveId),
    } as const;

    const nodeOptionsForKind = nodeOptions[uiFileNode.sharingType][FILE];

    const dropdownMenuOptions = Object.entries(nodeOptionsMap)
        .map(([id, option]) => ({
            ...option,
            id: id as NodeOption,
        }))
        .filter(option => nodeOptionsForKind.includes(option.id));

    function onSubmit(name: string) {
        onRenameNode(name, uiFileNode);
        setMode(READ);
    }

    function onCancel() {
        setMode(READ);
    }

    function onClick() {
        setSelectedNode(uiFileNode);
    }

    function onItemClick(itemId: NodeOption) {
        const handler = dropdownMenuHandlers[itemId];
        if (!handler) {
            console.error(`No handler found for dropdown menu item: ${itemId}`);
            return;
        }
        handler(uiFileNode);
        setIsDropdownMenuOpen(false);
    }

    const icon = iconMap[uiFileNode.documentType];

    const iconNode = customIcon || (
        <div className="relative">
            <img
                src={icon}
                alt="file icon"
                className="max-w-none"
                width={32}
                height={34}
            />
            {isReadMode && isRemoteDrive && uiFileNode.syncStatus && (
                <div className="absolute bottom-[-2px] right-0 size-3 rounded-full bg-white">
                    <div className="absolute left-[-2px] top-[-2px]">
                        <SyncStatusIcon
                            syncStatus={uiFileNode.syncStatus}
                            overrideSyncIcons={{ SUCCESS: 'check-circle-fill' }}
                        />
                    </div>
                </div>
            )}
        </div>
    );

    const content = isReadMode ? (
        <div className="flex w-52 items-center justify-between">
            <div className="mr-2 truncate group-hover:mr-0">
                <div className="max-h-6 truncate text-sm font-medium group-hover:text-gray-800">
                    {uiFileNode.name}
                </div>
                <div className="max-h-6 truncate text-xs font-medium text-gray-600 group-hover:text-gray-800">
                    {selectedNodePath.map(node => node.name).join(' / ')}
                </div>
            </div>
            {isAllowedToCreateDocuments && (
                <button
                    className="ml-auto hidden group-hover:block"
                    onClick={e => {
                        e.stopPropagation();
                        setIsDropdownMenuOpen(true);
                    }}
                >
                    <Icon name="vertical-dots" />
                </button>
            )}
        </div>
    ) : (
        <NodeInput
            className="ml-3 flex-1 font-medium"
            defaultValue={uiFileNode.name}
            onCancel={onCancel}
            onSubmit={onSubmit}
        />
    );

    return (
        <div onClick={onClick} className="relative w-64" ref={containerRef}>
            <div {...dragProps} className={containerStyles}>
                <div className="flex items-center">
                    <div className="mr-1.5">{iconNode}</div>
                    {content}
                </div>
            </div>
            {isAllowedToCreateDocuments && (
                <ConnectDropdownMenu
                    isOpen={isDropdownMenuOpen}
                    onOpenChange={() =>
                        setIsDropdownMenuOpen(!isDropdownMenuOpen)
                    }
                    items={dropdownMenuOptions}
                    menuClassName="bg-white cursor-pointer"
                    menuItemClassName="hover:bg-slate-50 px-2"
                    onItemClick={onItemClick}
                    popoverProps={{
                        triggerRef: containerRef,
                        placement: 'bottom end',
                        offset: -10,
                    }}
                />
            )}
        </div>
    );
};
