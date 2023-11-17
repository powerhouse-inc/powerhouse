import { TreeItem, ItemType, ItemStatus } from '@/connect/components/tree-view-item';

export const driveItem: TreeItem = {
    id: 'drive',
    path: 'drive',
    label: 'Local Drive',
    type: ItemType.LocalDrive,
    expanded: false,
    isSelected: false,
};

export const treeItems: Array<TreeItem> = [
    driveItem,
    {
        id: 'drive/folder1',
        path: 'drive/folder1',
        label: 'Folder 1',
        type: ItemType.Folder,
        status: ItemStatus.Syncing,
        expanded: false,
        isSelected: false,
    },
    {
        id: 'drive/folder1/folder1.1',
        path: 'drive/folder1/folder1.1',
        label: 'Folder 1.1',
        type: ItemType.Folder,
        status: ItemStatus.Syncing,
        expanded: false,
        isSelected: false,
    },
    {
        id: 'drive/folder1/folder1.2',
        path: 'drive/folder1/folder1.2',
        label: 'Folder 1.2',
        type: ItemType.Folder,
        status: ItemStatus.Syncing,
        expanded: false,
        isSelected: false,
    },
    {
        id: 'drive/folder1/folder1.2/folder1.2.1',
        path: 'drive/folder1/folder1.2/folder1.2.1',
        label: 'Folder 1.2.1',
        type: ItemType.Folder,
        status: ItemStatus.Syncing,
        expanded: false,
        isSelected: false,
    },
    {
        id: 'drive/folder2',
        path: 'drive/folder2',
        label: 'Folder 2',
        type: ItemType.Folder,
        status: ItemStatus.AvailableOffline,
        expanded: false,
        isSelected: false,
    },
    {
        id: 'drive/folder2/folder2.1',
        path: 'drive/folder2/folder2.1',
        label: 'Folder 2.1',
        type: ItemType.Folder,
        status: ItemStatus.AvailableOffline,
        expanded: false,
        isSelected: false,
    },
    {
        id: 'drive/folder3',
        path: 'drive/folder3',
        label: 'Folder 3',
        type: ItemType.Folder,
        status: ItemStatus.Offline,
        expanded: false,
        isSelected: false,
    }
];