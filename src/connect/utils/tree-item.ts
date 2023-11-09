import { DriveTreeItem } from '@/connect/components/drive-view';
import { TreeItem } from '@/connect/components/tree-view-item';

export const traverseTree = (
    item: TreeItem,
    callback: (item: TreeItem) => TreeItem,
): TreeItem => {
    const treeItem = callback(item);

    if (treeItem.children) {
        treeItem.children = treeItem.children.map(child =>
            traverseTree(child, callback),
        );
    }

    return { ...treeItem };
};

export const traverseDriveById = (
    drives: DriveTreeItem[],
    driveID: string,
    callback: (item: TreeItem) => TreeItem,
): DriveTreeItem[] => {
    const newDrives = drives.map(drive => {
        if (drive.id === driveID) {
            return traverseTree(drive, callback);
        }

        return { ...drive };
    }) as DriveTreeItem[];

    return newDrives;
};
