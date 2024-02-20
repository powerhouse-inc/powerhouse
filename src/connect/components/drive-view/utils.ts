import { LOCAL_DRIVE, TreeItemType, driveTypes } from '@/connect';

export function getIsDrive(type: TreeItemType) {
    return driveTypes.includes(type);
}

export function getIsLocalDrive(type: TreeItemType) {
    return type === LOCAL_DRIVE;
}
