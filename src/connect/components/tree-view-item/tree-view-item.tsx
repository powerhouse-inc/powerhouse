import {
    ConnectDropdownMenu,
    ConnectDropdownMenuProps,
} from '@/connect/components/dropdown-menu';
import {
    TreeViewItem,
    TreeViewItemProps,
    UseDraggableTargetProps,
    useDraggableTarget,
} from '@/powerhouse';
import React, { useRef } from 'react';
import { twMerge } from 'tailwind-merge';

import CheckFilledIcon from '@/assets/icons/check-filled.svg';
import CheckIcon from '@/assets/icons/check.svg';
import CloudSlashIcon from '@/assets/icons/cloud-slash.svg';
import FolderClose from '@/assets/icons/folder-close-fill.svg';
import FolderOpen from '@/assets/icons/folder-open-fill.svg';
import HDDIcon from '@/assets/icons/hdd-fill.svg';
import MIcon from '@/assets/icons/m-fill.svg';
import ServerIcon from '@/assets/icons/server-fill.svg';
import SyncingIcon from '@/assets/icons/syncing.svg';
import DotsIcon from '@/assets/icons/vertical-dots.svg';

export enum ItemType {
    Folder = 'folder',
    File = 'file',
    LocalDrive = 'local-drive',
    NetworkDrive = 'network-drive',
    PublicDrive = 'public-drive',
}

export enum ItemStatus {
    Available = 'available',
    AvailableOffline = 'available-offline',
    Syncing = 'syncing',
    Offline = 'offline',
}

export interface TreeItem {
    id: string;
    label: string;
    type: ItemType;
    status?: ItemStatus;
    expanded?: boolean;
    children?: TreeItem[];
    isSelected?: boolean;
    options?: ConnectDropdownMenuProps['items'];
}

export interface ConnectTreeViewItemProps
    extends Pick<
        TreeViewItemProps,
        'children' | 'onClick' | 'buttonProps' | 'level'
    > {
    item: TreeItem;
    onDropEvent?: UseDraggableTargetProps<TreeItem>['onDropEvent'];
    defaultOptions?: ConnectDropdownMenuProps['items'];
    onOptionsClick?: (item: TreeItem, option: React.Key) => void;
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

export const ConnectTreeViewItem: React.FC<
    ConnectTreeViewItemProps
> = props => {
    const {
        item,
        onClick,
        children,
        onDropEvent,
        onOptionsClick,
        level = 0,
        buttonProps = {},
        defaultOptions,
        ...divProps
    } = props;

    const containerRef = useRef(null);

    const { dragProps, dropProps, isDropTarget } = useDraggableTarget<TreeItem>(
        {
            data: item,
            onDropEvent,
        },
    );

    const { className: buttonClassName, ...restButtonProps } = buttonProps;

    const optionsContent = (defaultOptions || item.options) &&
        onOptionsClick && (
            <ConnectDropdownMenu
                items={
                    (item.options ||
                        defaultOptions) as ConnectDropdownMenuProps['items']
                }
                menuClassName="bg-white cursor-pointer"
                menuItemClassName="hover:bg-[#F1F5F9] px-2"
                onItemClick={option => onOptionsClick?.(item, option)}
                popoverProps={{
                    triggerRef: containerRef,
                    placement: 'bottom end',
                }}
            >
                <img src={DotsIcon} className="w-6 h-6 pointer-events-none" />
            </ConnectDropdownMenu>
        );

    return (
        <TreeViewItem
            {...(onDropEvent && { ...dragProps, ...dropProps })}
            level={level}
            onClick={onClick}
            label={item.label}
            initialOpen={item.expanded}
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
};
