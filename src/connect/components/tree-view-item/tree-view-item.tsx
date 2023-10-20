import { TreeViewItem, TreeViewItemProps } from '@/powerhouse';
import React from 'react';
import { twMerge } from 'tailwind-merge';

import CheckFilledIcon from '../../../assets/icons/check-filled.svg';
import CheckIcon from '../../../assets/icons/check.svg';
import CloudSlashIcon from '../../../assets/icons/cloud-slash.svg';
import FolderClose from '../../../assets/icons/folder-close-fill.svg';
import FolderOpen from '../../../assets/icons/folder-open-fill.svg';
import HDDIcon from '../../../assets/icons/hdd-fill.svg';
import MIcon from '../../../assets/icons/m-fill.svg';
import ServerIcon from '../../../assets/icons/server-fill.svg';
import SyncingIcon from '../../../assets/icons/syncing.svg';

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

export interface ConnectTreeViewItemProps
    extends Omit<TreeViewItemProps, 'icon' | 'expandedIcon' | 'secondaryIcon'> {
    type: ItemType;
    status: ItemStatus;
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
        type,
        label,
        status,
        onClick,
        children,
        className,
        initialOpen,
        onOptionsClick,
        optionsButtonProps,
        level = 0,
        buttonProps = {},
        ...divProps
    } = props;

    const { className: buttonClassName, ...restButtonProps } = buttonProps;

    return (
        <TreeViewItem
            label={label}
            level={level}
            onClick={onClick}
            initialOpen={initialOpen}
            buttonProps={{
                className: twMerge(
                    'py-3',
                    typeof buttonClassName === 'string' && buttonClassName,
                ),
                ...restButtonProps,
            }}
            onOptionsClick={onOptionsClick}
            secondaryIcon={getStatusIcon(status)}
            optionsButtonProps={optionsButtonProps}
            className={twMerge('rounded-lg hover:bg-[#F1F5F9]', className)}
            {...getItemIcon(type)}
            {...divProps}
        >
            {children}
        </TreeViewItem>
    );
};
