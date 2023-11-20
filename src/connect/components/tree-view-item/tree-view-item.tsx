import {
    ConnectDropdownMenu,
    ConnectDropdownMenuItem,
} from '@/connect/components/dropdown-menu';
import {
    Icon,
    TreeViewItem,
    TreeViewItemProps,
    UseDraggableTargetProps,
    useDraggableTarget,
} from '@/powerhouse';
import { useRef } from 'react';
import { twMerge } from 'tailwind-merge';
import { StatusIndicator } from '../status-indicator';

export enum ItemType {
    Folder = 'folder',
    File = 'file',
    LocalDrive = 'local-drive',
    CloudDrive = 'cloud-drive',
    PublicDrive = 'public-drive',
}

export enum ActionType {
    Update = 'update',
    New = 'new',
    UpdateAndMove = 'update-and-move',
    UpdateAndCopy = 'update-and-copy',
}

export enum ItemStatus {
    Available = 'available',
    AvailableOffline = 'available-offline',
    Syncing = 'syncing',
    Offline = 'offline',
}

export interface BaseTreeItem {
    id: string;
    path: string;
    label: string;
    type: ItemType;
    error?: Error;
    status?: ItemStatus;
    isConnected?: boolean;
    options?: ConnectDropdownMenuItem[];
    syncStatus?: 'not-synced-yet' | 'syncing' | 'synced';
    expanded?: boolean;
}

export interface UITreeItem {
    action?: ActionType;
    expanded?: boolean;
    isSelected?: boolean;
}

export type TreeItem = BaseTreeItem & UITreeItem;

export const DefaultOptions = [
    {
        id: 'duplicate',
        label: 'Duplicate',
        icon: <Icon name="files-earmark" />,
    },
    {
        id: 'new-folder',
        label: 'New Folder',
        icon: <Icon name="folder-plus" />,
    },
    {
        id: 'rename',
        label: 'Rename',
        icon: <Icon name="pencil" />,
    },
    {
        id: 'delete',
        label: 'Delete',
        icon: <Icon name="trash" />,
        className: 'text-[#EA4335]',
    },
] as const;

export type DefaultOptionId = (typeof DefaultOptions)[number]['id'];

export interface ConnectTreeViewItemProps
    extends Pick<
        TreeViewItemProps,
        'children' | 'onClick' | 'buttonProps' | 'level'
    > {
    item: TreeItem;
    onDropEvent?: UseDraggableTargetProps<TreeItem>['onDropEvent'];
    onDropActivate?: (dropTargetItem: TreeItem) => void;
    defaultOptions?: ConnectDropdownMenuItem[];
    onOptionsClick?: (item: TreeItem, option: DefaultOptionId) => void;
    disableDropBetween?: boolean;
    onDragStart?: UseDraggableTargetProps<TreeItem>['onDragStart'];
    onDragEnd?: UseDraggableTargetProps<TreeItem>['onDragEnd'];
    disableHighlightStyles?: boolean;
}

const getItemIcon = (type: ItemType) => {
    switch (type) {
        case ItemType.Folder:
            return {
                icon: <Icon name="folder-close" color="#6C7275" />,
                expandedIcon: <Icon name="folder-open" color="#6C7275" />,
            };
        case ItemType.File:
            return {};
        case ItemType.LocalDrive:
            return { icon: <Icon name="hdd" /> };
        case ItemType.CloudDrive:
            return { icon: <Icon name="server" /> };
        case ItemType.PublicDrive:
            return { icon: <Icon name="m" /> };
    }
};

export function ConnectTreeViewItem(
    props: ConnectTreeViewItemProps,
) {
    const {
        item,
        onClick,
        children,
        onDragEnd,
        onDragStart,
        onDropEvent,
        onOptionsClick,
        onDropActivate,
        level = 0,
        buttonProps = {},
        disableDropBetween = false,
        disableHighlightStyles = false,
        defaultOptions = DefaultOptions,
        ...divProps
    } = props;

    const containerRef = useRef(null);

    const { dragProps, dropProps, isDropTarget, isDragging } =
        useDraggableTarget<TreeItem>({
            onDragEnd,
            onDragStart,
            data: item,
            onDropEvent,
            onDropActivate: () => onDropActivate?.(item),
        });

    const { dropProps: dropDividerProps, isDropTarget: isDropDividerTarget } =
        useDraggableTarget({
            data: item,
            onDropEvent,
            dropAfterItem: true,
        });

    const bottomIndicator = (
        <div
            {...dropDividerProps}
            className="absolute bottom-[-2px] z-[1] flex h-1 w-full flex-row items-center"
        >
            <div
                className={twMerge(
                    'h-0.5 w-full',
                    isDropDividerTarget && 'bg-[#3E90F0]',
                )}
            />
        </div>
    );

    const { className: buttonClassName, ...restButtonProps } = buttonProps;

    const optionsContent = onOptionsClick && (
        <ConnectDropdownMenu
            items={
                item.options || (defaultOptions as ConnectDropdownMenuItem[])
            }
            menuClassName="bg-white cursor-pointer"
            menuItemClassName="hover:bg-[#F1F5F9] px-2"
            onItemClick={option => onOptionsClick(item, option as DefaultOptionId)}
            popoverProps={{
                triggerRef: containerRef,
                placement: 'bottom end',
                offset: -10,
            }}
        >
            <Icon
                name="vertical-dots"
                className="pointer-events-none"
                color="#6C7275"
            />
        </ConnectDropdownMenu>
    );

    const getStatusIcon = () => {
        if (item.type === ItemType.LocalDrive) {
            return <StatusIndicator type="local-drive" error={item.error} />;
        }

        if (
            item.type === ItemType.CloudDrive ||
            item.type === ItemType.PublicDrive
        ) {
            const sharedProps = {
                type: item.type,
                error: item.error,
                isConnected: item.isConnected ?? false,
            };

            if (item.status === ItemStatus.AvailableOffline) {
                return (
                    <StatusIndicator
                        {...sharedProps}
                        availability="available-offline"
                        syncStatus={item.syncStatus ?? 'not-synced-yet'}
                    />
                );
            }

            if (item.status === ItemStatus.Available) {
                return (
                    <StatusIndicator
                        {...sharedProps}
                        availability="cloud-only"
                    />
                );
            }
        }
    };

    return (
        <TreeViewItem
            {...(onDropEvent && { ...dragProps, ...dropProps })}
            bottomIndicator={!disableDropBetween && bottomIndicator}
            level={level}
            onClick={onClick}
            label={item.label}
            open={item.expanded}
            buttonProps={{
                className: twMerge(
                    'py-3 rounded-lg',
                    !disableHighlightStyles &&
                        'hover:bg-[#F1F5F9] hover:to-[#F1F5F9]',
                    item.isSelected &&
                        !disableHighlightStyles &&
                        'bg-[#F1F5F9] to-[#F1F5F9]',
                    typeof buttonClassName === 'string' && buttonClassName,
                    isDropTarget && !isDragging && 'rounded-lg bg-[#F1F5F9]',
                ),
                ref: containerRef,
                ...restButtonProps,
            }}
            optionsContent={optionsContent}
            secondaryIcon={getStatusIcon()}
            {...getItemIcon(item.type)}
            {...divProps}
        >
            {children}
        </TreeViewItem>
    );
}
