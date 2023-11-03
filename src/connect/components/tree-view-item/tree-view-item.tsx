import {
    ConnectDropdownMenu,
    ConnectDropdownMenuItem,
} from '@/connect/components/dropdown-menu';
import {
    TreeViewItem,
    TreeViewItemProps,
    UseDraggableTargetProps,
    useDraggableTarget,
} from '@/powerhouse';
import { useRef } from 'react';
import { twMerge } from 'tailwind-merge';

import CheckFilledIcon from '@/assets/icons/check-filled.svg';
import CheckIcon from '@/assets/icons/check.svg';
import CloudSlashIcon from '@/assets/icons/cloud-slash.svg';
import FilesIcon from '@/assets/icons/files-earmark-fill.svg';
import FolderClose from '@/assets/icons/folder-close-fill.svg';
import FolderOpen from '@/assets/icons/folder-open-fill.svg';
import FolderIcon from '@/assets/icons/folder-plus-fill.svg';
import HDDIcon from '@/assets/icons/hdd-fill.svg';
import MIcon from '@/assets/icons/m-fill.svg';
import PencilIcon from '@/assets/icons/pencil-fill.svg';
import ServerIcon from '@/assets/icons/server-fill.svg';
import SyncingIcon from '@/assets/icons/syncing.svg';
import TrashIcon from '@/assets/icons/trash-fill.svg';
import DotsIcon from '@/assets/icons/vertical-dots.svg';

export enum ItemType {
    Folder = 'folder',
    File = 'file',
    LocalDrive = 'local-drive',
    NetworkDrive = 'network-drive',
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
    action?: ActionType;
    status?: ItemStatus;
    expanded?: boolean;
    children?: TreeItem<T>[];
    isSelected?: boolean;
    options?: ConnectDropdownMenuItem<T>[];
}

export const DefaultOptions = [
    {
        id: 'duplicate',
        label: 'Duplicate',
        icon: FilesIcon,
    },
    {
        id: 'new-folder',
        label: 'New Folder',
        icon: FolderIcon,
    },
    {
        id: 'rename',
        label: 'Rename',
        icon: PencilIcon,
    },
    {
        id: 'delete',
        label: 'Delete',
        icon: TrashIcon,
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
    defaultOptions?: ConnectDropdownMenuItem<T>[];
    onOptionsClick?: (item: TreeItem<T>, option: T) => void;
    disableDropBetween?: boolean;
}

const getStatusIcon = (status: ItemStatus) => {
    switch (status) {
        case ItemStatus.Available:
            return CheckIcon;
        case ItemStatus.AvailableOffline:
            return CheckFilledIcon;
        case ItemStatus.Syncing:
            return SyncingIcon;
        case ItemStatus.Offline:
            return CloudSlashIcon;
    }
};

const getItemIcon = (type: ItemType) => {
    switch (type) {
        case ItemType.Folder:
            return {
                icon: FolderClose,
                expandedIcon: FolderOpen,
            };
        case ItemType.File:
            return {};
        case ItemType.LocalDrive:
            return { icon: HDDIcon };
        case ItemType.NetworkDrive:
            return { icon: ServerIcon };
        case ItemType.PublicDrive:
            return { icon: MIcon };
    }
};

export function ConnectTreeViewItem<T extends string = DefaultOptionId>(
    props: ConnectTreeViewItemProps<T>,
) {
    const {
        item,
        onClick,
        children,
        onDropEvent,
        onOptionsClick,
        level = 0,
        buttonProps = {},
        disableDropBetween = false,
        defaultOptions = DefaultOptions,
        ...divProps
    } = props;

    const containerRef = useRef(null);

    const { dragProps, dropProps, isDropTarget } = useDraggableTarget<
        TreeItem<T>
    >({
        data: item,
        onDropEvent,
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
            className="w-full bottom-[-2px] absolute h-1 flex flex-row items-center z-[1]"
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

    const optionsContent = (defaultOptions || item.options) &&
        onOptionsClick && (
            <ConnectDropdownMenu<T>
                items={
                    item.options ||
                    (defaultOptions as ConnectDropdownMenuItem<T>[])
                }
                menuClassName="bg-white cursor-pointer"
                menuItemClassName="hover:bg-[#F1F5F9] px-2"
                onItemClick={option => onOptionsClick?.(item, option)}
                popoverProps={{
                    triggerRef: containerRef,
                    placement: 'bottom end',
                    offset: -10,
                }}
            >
                <img src={DotsIcon} className="w-6 h-6 pointer-events-none" />
            </ConnectDropdownMenu>
        );

    return (
        <TreeViewItem
            {...(onDropEvent && { ...dragProps, ...dropProps })}
            bottomIndicator={!disableDropBetween && bottomIndicator}
            level={level}
            onClick={onClick}
            label={item.label}
            open={item.expanded}
            className={twMerge(isDropTarget && 'rounded-lg bg-[#F4F4F4]')}
            buttonProps={{
                className: twMerge(
                    'py-3 rounded-lg hover:bg-[#F1F5F9] hover:to-[#F1F5F9]',
                    item.isSelected && 'bg-[#F1F5F9] to-[#F1F5F9]',
                    typeof buttonClassName === 'string' && buttonClassName,
                ),
                ref: containerRef,
                ...restButtonProps,
            }}
            optionsContent={optionsContent}
            {...(item.status && {
                secondaryIcon: getStatusIcon(item.status),
            })}
            {...getItemIcon(item.type)}
            {...divProps}
        >
            {children}
        </TreeViewItem>
    );
}
