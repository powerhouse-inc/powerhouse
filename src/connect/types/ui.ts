import {
    ConnectDropdownMenuItem,
    defaultDropdownMenuOptions,
    driveLocations,
    driveTypes,
    sharingTypes,
    syncStatuses,
    treeItemActions,
    treeItemTypes,
} from '@/connect';

export type DriveTypes = typeof driveTypes;
export type DriveType = DriveTypes[number];

export type TreeItemTypes = typeof treeItemTypes;

export type TreeItemType = TreeItemTypes[number];

export type TreeItemActions = typeof treeItemActions;

export type TreeItemAction = TreeItemActions[number];

export type SharingTypes = typeof sharingTypes;
export type SharingType = SharingTypes[number];
export type DriveLocations = typeof driveLocations;
export type DriveLocation = DriveLocations[number];

export type BaseTreeItem = {
    id: string;
    path: string;
    label: string;
    type: TreeItemType;
    availableOffline: boolean;
    syncStatus?: SyncStatus;
    error?: Error;
    options?: ConnectDropdownMenuItem[];
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
    icon?: string | null;
};

export type DefaultOptionId = (typeof defaultDropdownMenuOptions)[number]['id'];

export type SyncStatuses = typeof syncStatuses;

export type SyncStatus = SyncStatuses[number];
