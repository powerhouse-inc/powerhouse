import { ConnectDropdownMenuItem, defaultDropdownMenuOptions } from '@/connect';

export type DriveType = 'PUBLIC_DRIVE' | 'LOCAL_DRIVE' | 'CLOUD_DRIVE';

export type TreeItemType = ('FOLDER' | 'FILE') | DriveType;

export type TreeItemAction =
    | 'UPDATE'
    | 'NEW'
    | 'UPDATE_AND_MOVE'
    | 'UPDATE_AND_COPY';

export type TreeItemStatus =
    | 'AVAILABLE'
    | 'AVAILABLE_OFFLINE'
    | 'SYNCING'
    | 'OFFLINE';

export type SyncStatus = 'NOT_SYNCED_YET' | 'SYNCING' | 'SYNCED';

export type SharingType = 'PRIVATE' | 'SHARED' | 'PUBLIC';

export type BaseTreeItem = {
    id: string;
    path: string;
    label: string;
    type: TreeItemType;
    error?: Error;
    status?: TreeItemStatus;
    isConnected?: boolean;
    options?: ConnectDropdownMenuItem[];
    syncStatus?: SyncStatus;
    sharingType?: SharingType;
    expanded?: boolean;
};

export type UITreeItem = {
    action?: TreeItemAction;
    expanded?: boolean;
    isSelected?: boolean;
};

export type TreeItem = BaseTreeItem & UITreeItem;

export type DriveTreeItem = TreeItem & {
    type: DriveType;
};

export type DefaultOptionId = (typeof defaultDropdownMenuOptions)[number]['id'];
