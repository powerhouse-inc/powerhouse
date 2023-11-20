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
}

export enum ItemStatus {
    Available = 'available',
    AvailableOffline = 'available-offline',
    Syncing = 'syncing',
    Offline = 'offline',
}

export interface TreeItem<T extends string = string> {
    id: string;
    label: string;
    type: ItemType;
    isConnected?: boolean;
    syncStatus?: 'not-synced-yet' | 'syncing' | 'synced';
    action?: ActionType;
    status?: ItemStatus;
    expanded?: boolean;
    children?: TreeItem<T>[];
    isSelected?: boolean;
    options?: ConnectDropdownMenuItem<T>[];
    error?: Error;
}

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

export interface ConnectTreeViewItemProps<T extends string = DefaultOptionId>
    extends Pick<
        TreeViewItemProps,
        'children' | 'onClick' | 'buttonProps' | 'level'
    > {
    item: TreeItem<T>;
    onDropEvent?: UseDraggableTargetProps<TreeItem<T>>['onDropEvent'];
    onDropActivate?: (dropTargetItem: TreeItem<T>) => void;
    defaultOptions?: ConnectDropdownMenuItem<T>[];
    onOptionsClick?: (item: TreeItem<T>, option: T) => void;
    disableDropBetween?: boolean;
    onDragStart?: UseDraggableTargetProps<TreeItem<T>>['onDragStart'];
    onDragEnd?: UseDraggableTargetProps<TreeItem<T>>['onDragEnd'];
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

export function ConnectTreeViewItem<T extends string = DefaultOptionId>(
    props: ConnectTreeViewItemProps<T>,
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
        useDraggableTarget<TreeItem<T>>({
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
        <ConnectDropdownMenu<T>
            items={
                item.options || (defaultOptions as ConnectDropdownMenuItem<T>[])
            }
            menuClassName="bg-white cursor-pointer"
            menuItemClassName="hover:bg-[#F1F5F9] px-2"
            onItemClick={option => onOptionsClick(item, option)}
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
