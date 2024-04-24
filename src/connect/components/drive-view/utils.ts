import {
    CLOUD_DRIVE,
    DriveTreeItem,
    LOCAL_DRIVE,
    PUBLIC_DRIVE,
    TreeItem,
    driveTypes,
} from '@/connect';

export function getIsDrive(item: TreeItem): item is DriveTreeItem {
    return driveTypes.includes(item.type);
}

export function getIsLocalDrive(item: TreeItem): item is DriveTreeItem {
    return item.type === LOCAL_DRIVE;
}

export function getIsPublicDrive(item: TreeItem): item is DriveTreeItem {
    return item.type === PUBLIC_DRIVE;
}

export function getIsCloudDrive(item: TreeItem): item is DriveTreeItem {
    return item.type === CLOUD_DRIVE;
}
