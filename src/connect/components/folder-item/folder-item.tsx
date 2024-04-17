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

const submitIcon = <Icon name="check" className="text-gray-600" />;
const cancelIcon = <Icon name="xmark" className="text-gray-600" />;

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
                <div className="ml-3 max-h-6 overflow-hidden whitespace-nowrap font-medium text-slate-200 group-hover:text-gray-800">
                    {title}
                </div>
                <div
                    className={twMerge(
                        'absolute right-0 h-full w-12 bg-gradient-to-r from-transparent to-gray-200',
                        isDropTarget && 'to-blue-100',
                    )}
                />
            </>
        ) : (
            <TreeViewInput
                className="ml-3 flex-1 font-medium"
                defaultValue={title}
                cancelIcon={cancelIcon}
                submitIcon={submitIcon}
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
                        <Icon name="folder-close" size={24} />
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
