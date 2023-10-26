import {
    TreeViewItem,
    TreeViewItemProps,
    useDraggableTarget,
    UseDraggableTargetProps,
} from '@/powerhouse';
import React from 'react';
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
}

export interface ConnectTreeViewItemProps
    extends Pick<
        TreeViewItemProps,
        | 'children'
        | 'onClick'
        | 'onOptionsClick'
        | 'buttonProps'
        | 'optionsButtonProps'
        | 'level'
    > {
    item: TreeItem;
    onDropEvent?: UseDraggableTargetProps<TreeItem>['onDropEvent'];
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
        optionsButtonProps,
        level = 0,
        buttonProps = {},
        ...divProps
    } = props;

    const { dragProps, dropProps, isDropTarget } = useDraggableTarget<TreeItem>(
        {
            data: item,
            onDropEvent,
        },
    );

    const { className: buttonClassName, ...restButtonProps } = buttonProps;

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
                ...restButtonProps,
            }}
            onOptionsClick={onOptionsClick}
            optionsButtonProps={optionsButtonProps}
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
