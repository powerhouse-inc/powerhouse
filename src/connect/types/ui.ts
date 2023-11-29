import { ConnectDropdownMenuItem, defaultDropdownMenuOptions } from '@/connect';

export type TreeItemType =
    | 'folder'
    | 'file'
    | 'local-drive'
    | 'cloud-drive'
    | 'public-drive';

export type TreeItemAction =
    | 'update'
    | 'new'
    | 'update-and-move'
    | 'update-and-copy';

export type TreeItemStatus =
    | 'available'
    | 'available-offline'
    | 'syncing'
    | 'offline';

export type SyncStatus = 'not-synced-yet' | 'syncing' | 'synced';

export type SharingType = 'private' | 'shared' | 'public';

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

export type DriveType = 'public-drive' | 'local-drive' | 'cloud-drive';

export type DriveTreeItem = TreeItem & {
    type: DriveType;
};

export type DefaultOptionId = (typeof defaultDropdownMenuOptions)[number]['id'];
