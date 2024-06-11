import {
    ConnectDropdownMenu,
    ConnectDropdownMenuProps,
    TreeItem,
    defaultDropdownMenuOptions,
} from '@/connect';
import {
    DivProps,
    Icon,
    UseDraggableTargetProps,
    useDraggableTarget,
} from '@/powerhouse';
import {
    TreeViewInput,
    TreeViewInputProps,
} from '@/powerhouse/components/tree-view-input';
import React, { useRef, useState } from 'react';
import { twMerge } from 'tailwind-merge';
import { SyncStatusIcon } from '../status-icon';

type FolderItem = object;

export interface FolderItemProps
    extends Omit<DivProps, 'onDragEnd' | 'onDragStart' | 'onDropEvent'> {
    title: string;
    itemOptions?: ConnectDropdownMenuProps['items'];
    onOptionsClick: ConnectDropdownMenuProps['onItemClick'];
    mode?: 'write' | 'read';
    onSubmitInput: TreeViewInputProps['onSubmitInput'];
    onCancelInput: TreeViewInputProps['onCancelInput'];
    item: TreeItem;
    onDragStart?: UseDraggableTargetProps<TreeItem>['onDragStart'];
    onDragEnd?: UseDraggableTargetProps<TreeItem>['onDragEnd'];
    onDropEvent?: UseDraggableTargetProps<TreeItem>['onDropEvent'];
    isAllowedToCreateDocuments?: boolean;
    displaySyncIcon?: boolean;
}

export const FolderItem: React.FC<FolderItemProps> = ({
    title,
    itemOptions,
    mode = 'read',
    onSubmitInput,
    onCancelInput,
    onOptionsClick,
    item,
    onDragEnd,
    onDragStart,
    onDropEvent,
    isAllowedToCreateDocuments = true,
    displaySyncIcon = false,
    ...divProps
}) => {
    const containerRef = useRef(null);
    const [isDropdownMenuOpen, setIsDropdownMenuOpen] = useState(false);
    const { dropProps, dragProps, isDropTarget } = useDraggableTarget({
        data: item,
        onDragEnd,
        onDragStart,
        onDropEvent,
    });

    const isReadMode = mode === 'read';
    const textStyles = isReadMode
        ? 'text-gray-600 hover:text-gray-800'
        : 'text-gray-800';

    const containerStyles = twMerge(
        'group flex h-12 cursor-pointer select-none items-center rounded-lg bg-gray-200 px-2',
        textStyles,
        divProps.className,
        isDropTarget && 'bg-blue-100',
    );

    const content =
        isReadMode || !isAllowedToCreateDocuments ? (
            <>
                <div className="ml-3 max-h-6 truncate font-medium text-slate-200">
                    {title}
                </div>
            </>
        ) : (
            <TreeViewInput
                className="ml-3 flex-1 font-medium"
                defaultValue={title}
                onCancelInput={onCancelInput}
                onSubmitInput={onSubmitInput}
            />
        );

    return (
        <div className="relative" ref={containerRef}>
            <div
                {...dropProps}
                {...dragProps}
                {...divProps}
                className={containerStyles}
            >
                <div className="relative flex flex-1 flex-row items-center overflow-hidden">
                    <div className="p-1">
                        <div className="relative">
                            <Icon name="folder-close" size={24} />
                            {isReadMode &&
                                displaySyncIcon &&
                                item.syncStatus && (
                                    <div className="absolute bottom-[-3px] right-[-2px] size-3 rounded-full bg-white">
                                        <div className="absolute left-[-2px] top-[-2px]">
                                            <SyncStatusIcon
                                                syncStatus={item.syncStatus}
                                                overrideSyncIcons={{
                                                    SUCCESS:
                                                        'check-circle-fill',
                                                }}
                                            />
                                        </div>
                                    </div>
                                )}
                        </div>
                    </div>
                    {content}
                </div>
                {isReadMode && isAllowedToCreateDocuments && (
                    <div
                        onClick={e => {
                            e.stopPropagation();
                            setIsDropdownMenuOpen(true);
                        }}
                    >
                        <Icon
                            name="vertical-dots"
                            className="hidden group-hover:inline-block"
                            size={24}
                        />
                    </div>
                )}
            </div>
            {isAllowedToCreateDocuments && (
                <ConnectDropdownMenu
                    isOpen={isDropdownMenuOpen}
                    onOpenChange={() =>
                        setIsDropdownMenuOpen(!isDropdownMenuOpen)
                    }
                    items={itemOptions || [...defaultDropdownMenuOptions]}
                    menuClassName="bg-white cursor-pointer"
                    menuItemClassName="hover:bg-slate-50 px-2"
                    onItemClick={onOptionsClick}
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
